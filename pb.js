/* BEACON — Preplan Builder (preplan.html)
   The fire preplan app, built for an iPad. Its own home-screen app; its data is the county ArcGIS layer BOCO_Preplans,
   which the Command Board, the Preplan Program dashboard and any ArcGIS map read.
   It is the second way in. The backbone is the pair of Survey123 forms (crew form, review form), which work without this app.
   Both write the same records, so a preplan submitted in one can be reviewed in the other; a reviewer signed in here also gets
   a check that finishes what a Survey123 review cannot do by itself (retire the older version of an updated preplan).
   - No sign-in needed to build: a crew walks the building, taps the aerial photo to place the same symbols the Command Board
     uses, traces the outline, fills in the building facts, takes photos and submits. Work is saved on the iPad as it is typed
     and stays there, offline too, until it is submitted. Submitting adds the preplan through the add-only Intake view.
   - Signed in as a reviewer: the review queue, with flags. Approve, send back or retire in one save that also releases every
     map feature, outline, hazmat row, contact and photo, and retires the older version when the preplan is an update.
   - Signed in with read access: open any approved preplan and start an update from it, with nothing to retype.
   Fields, pick lists and symbols come from pb.data.js (generated from the preplan schema). */
(function (CP) {
  'use strict';
  var A = CP.arc, U = CP.ui, E = CP.esc, I = U.icon, S = window.PB_SCHEMA, C = (window.CP_CONFIG || {}).preplans || {};
  var PB = CP.pb = { view: 'home', d: null, tab: 'map', ro: false, placing: null, ring: null, can: {}, lists: null, ltab: 'wait', drafts: [], q: '' };
  var URLS = {}; Object.keys(S.names).forEach(function (k) { URLS[k] = C[k + 'Url'] || S.base + S.names[k] + '/FeatureServer'; });
  var TABLES = ['Preplan_Features', 'Preplan_Footprints', 'Preplan_Hazmat', 'Preplan_Contacts', 'Preplan_Photos'];
  var KEY = { Preplan_Features: 'feats', Preplan_Footprints: 'outline', Preplan_Hazmat: 'haz', Preplan_Contacts: 'contacts', Preplan_Photos: 'photos' };
  var FT = {}; S.features.forEach(function (f) { FT[f[0]] = { code: f[0], short: f[1], name: f[2], color: f[3], shape: f[4], group: f[5] }; });
  var QUEUE = ['Submitted', 'In Review', 'Needs Changes'], GRACE_MS = 120000;
  var PHOTO_Q = S.photoQ || 'photo'; // the Survey123 photo question: pictures saved under this keyword show in the review form
  var GEO = 'https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer', GEO_NEAR = '-79.80,37.55';

  // ---------- small helpers ----------
  function guid() { var u = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) { var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }); return '{' + u.toUpperCase() + '}'; }
  function gkey(g) { return String(g || '').toUpperCase().replace(/[{}]/g, ''); }
  function gq(g) { return String(g || '').replace(/[^0-9A-Fa-f{}-]/g, ''); }
  function sq(s) { return String(s).replace(/'/g, "''"); }
  function newId() { var d = new Date(), h = ''; for (var k = 0; k < 4; k++) h += (Math.random() * 16 | 0).toString(16); return 'PP-' + String(d.getFullYear()).slice(2) + CP.pad(d.getMonth() + 1) + '-' + h; }
  PB.idOk = function (v) { return /^PP-\d{4}-[0-9a-fA-F]{4}$/.test(String(v || '').trim()); };
  function restrictedOf(s) { return s.restricted === 'Yes' || S.restricted.indexOf(s.occupancy) >= 0 ? 'Yes' : 'No'; }
  function flow(s) { return +s.footprint_sqft > 0 ? Math.round(+s.footprint_sqft / 3) : null; }
  function when(ms) { return ms ? new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : ''; }
  function meters(a, b) { if (!a || !b) return 1e12; var r = Math.PI / 180, x = (b[1] - a[1]) * r * Math.cos((a[0] + b[0]) / 2 * r), y = (b[0] - a[0]) * r; return 6371000 * Math.hypot(x, y); }
  function addrKey(s) { return String(s || '').toUpperCase().split(',')[0].replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim(); }
  function label(dom, code) { var p = (S.domains[dom] || []).find(function (x) { return x[0] === code; }); return p ? p[1] : (code == null ? '' : code); }
  function dueState(s) { if (!s.reviewed_date) return ''; var d = new Date(s.reviewed_date); d.setMonth(d.getMonth() + (+s.review_months || 12)); return Date.now() > d.getTime() ? 'Review overdue since ' + when(d.getTime()) : d.getTime() - Date.now() < 60 * 86400000 ? 'Review due ' + when(d.getTime()) : ''; }

  // ---------- kept on the iPad (IndexedDB): drafts, and photos as text so every iPad browser stores them the same way ----------
  var DBP = null;
  function db() { return DBP || (DBP = new Promise(function (ok, no) { try { var r = indexedDB.open('beacon-preplan-builder', 1); r.onupgradeneeded = function () { r.result.createObjectStore('drafts', { keyPath: 'id' }); r.result.createObjectStore('blobs'); }; r.onsuccess = function () { ok(r.result); }; r.onerror = function () { no(r.error || new Error('storage unavailable')); }; } catch (e) { no(e); } })); }
  function tx(store, mode, fn) { return db().then(function (d) { return new Promise(function (ok, no) { var t = d.transaction(store, mode), q = fn(t.objectStore(store)); t.oncomplete = function () { ok(q ? q.result : undefined); }; t.onerror = t.onabort = function () { no(t.error || new Error('could not save on this iPad')); }; }); }); }
  PB.store = {
    all: function () { return tx('drafts', 'readonly', function (s) { return s.getAll(); }).then(function (r) { return r || []; }); },
    get: function (id) { return tx('drafts', 'readonly', function (s) { return s.get(id); }); },
    put: function (d) { return tx('drafts', 'readwrite', function (s) { return s.put(JSON.parse(JSON.stringify(d))); }); },
    del: function (id) { return tx('drafts', 'readwrite', function (s) { return s.delete(id); }); },
    blobPut: function (k, v) { return tx('blobs', 'readwrite', function (s) { return s.put(v, k); }); },
    blobGet: function (k) { return tx('blobs', 'readonly', function (s) { return s.get(k); }); },
    blobDel: function (k) { return tx('blobs', 'readwrite', function (s) { return s.delete(k); }); }
  };
  var saveT = null;
  PB.save = function (d) { d = d || PB.d; if (!d) return Promise.resolve(); d.u = CP.now(); return PB.store.put(d).then(function () { PB.saved = Date.now(); PB.saveErr = ''; paintSave(); }, function (e) { PB.saveErr = e.message || 'not saved'; paintSave(); }); };
  function touch(now) { if (!PB.d || PB.ro) return; PB.d.site.fire_flow_gpm = flow(PB.d.site); clearTimeout(saveT); if (now) return PB.save(); saveT = setTimeout(function () { PB.save(); }, 350); }

  // ---------- the preplan as the app holds it ----------
  PB.blank = function (name, address) {
    var me = CP.store.prefs().pbMe || {};
    return { id: CP.uid(), v: 1, state: 'draft', t: CP.now(), u: CP.now(), gid: guid(), ll: null,
      site: { site_id: newId(), submit_type: 'New', site_name: name || '', address: address || '', target_hazard: 'No', restricted: 'No', first_due: me.due || '', prepared_by: me.by || '', prepared_unit: me.unit || '', prepared_date: Date.now() },
      feats: [], outline: [], haz: [], contacts: [], photos: [] };
  };
  // what is still needed before it can be submitted, and what is worth a second look
  PB.check = function (d) {
    var s = d.site, miss = [], warn = [];
    Object.keys(S.site).forEach(function (k) { var f = S.site[k]; if (!f.req || k === 'replaces_site_id' || k === 'submit_type') return; if (s[k] == null || s[k] === '') miss.push(f.l); });
    if (!d.ll) miss.push('Building pin on the map');
    if (s.submit_type && s.submit_type !== 'New' && !PB.idOk(s.replaces_site_id)) miss.push('ID of the preplan being updated (like PP-2611-a3f9)');
    var sides = d.feats.filter(function (f) { return /^side_/.test(f.feature_type); }).length;
    if (sides < 4) warn.push(sides ? 'Only ' + sides + ' of 4 building sides placed' : 'No building sides (A–D) placed');
    if (d.feats.length - sides < 1) warn.push('No map features placed (FDC, shutoffs, hydrants…)');
    if (!d.photos.length) warn.push('No photos');
    if (!d.contacts.length) warn.push('No contacts or key holders');
    if (s.hazmat === 'Yes' && !d.haz.length) warn.push('Hazmat on site, but no materials listed');
    return { miss: miss, warn: warn };
  };

  // ---------- to ArcGIS ----------
  function pt(ll) { return { x: +ll[1], y: +ll[0], spatialReference: { wkid: 4326 } }; }
  function poly(ring) { // ArcGIS wants outer rings clockwise and closed
    var r = ring.map(function (p) { return [+p[1], +p[0]]; }), a = 0; for (var k = 0; k < r.length; k++) { var n = r[(k + 1) % r.length]; a += r[k][0] * n[1] - n[0] * r[k][1]; }
    if (a > 0) r.reverse(); r.push(r[0].slice()); return { rings: [r], spatialReference: { wkid: 4326 } };
  }
  function nul(v) { return v === '' || v === undefined ? null : v; }
  PB.siteAttrs = function (d, review) {
    var a = { GlobalID: d.gid };
    Object.keys(S.site).forEach(function (k) { if (!review && S.review.indexOf(k) >= 0) return; a[k] = nul(d.site[k]); });
    a.restricted = restrictedOf(d.site); a.fire_flow_gpm = flow(d.site); a.site_id = String(a.site_id || '').trim();
    if ((d.haz || []).length) a.hazmat = 'Yes'; // materials are listed, so the answer is Yes (the Survey123 review form only shows the list then)
    if (a.submit_type !== 'New' && a.replaces_site_id) a.site_id = String(a.replaces_site_id).trim(); // an update keeps the ID of the preplan it replaces
    if (a.submit_type === 'New') a.replaces_site_id = null;
    return a;
  };
  PB.childRow = function (table, d, c, stamp) {
    var sp = S.child[table], a = { GlobalID: c.gid, parentglobalid: d.gid };
    Object.keys(sp.f).forEach(function (k) { a[k] = nul(c[k]); });
    if (table === 'Preplan_Features') a.feat_sensitive = S.sensitiveTypes.indexOf(c.feature_type) >= 0 || c.feat_sensitive === 'Yes' ? 'Yes' : 'No';
    if (stamp) { a[sp.stamp[0]] = stamp.status; a[sp.stamp[1]] = stamp.restricted; }
    var f = { attributes: a }; if (sp.geom === 'point') f.geometry = pt(c.ll); if (sp.geom === 'polygon') f.geometry = poly(c.ring); return f;
  };
  var idCache = {};
  async function layerIds(url) { if (idCache[url]) return idCache[url]; var j = await A.req(url, {}), o = {}; (j.layers || []).concat(j.tables || []).forEach(function (x) { o[x.name] = x.id; }); if (o.Preplan_Sites == null) throw new Error('The preplan layer is not set up yet (EM Ops → Setup → Fire preplans).'); return (idCache[url] = o); }
  function failures(res) { var bad = []; (Array.isArray(res) ? res : []).forEach(function (l) { ['addResults', 'updateResults', 'deleteResults'].forEach(function (k) { (l[k] || []).forEach(function (x) { if (x && x.success === false) bad.push(x.error || {}); }); }); var at = l.attachments || {}; (at.addResults || []).forEach(function (x) { if (x && x.success === false) bad.push(x.error || {}); }); }); return bad; }
  function dupOnly(bad) { return bad.length && bad.every(function (e) { return /duplicate|unique|already exists|violation/i.test((e.description || '') + (e.message || '')); }); }
  async function edit(url, edits) {
    var res = await A.req(url + '/applyEdits', { edits: edits, useGlobalIds: true, rollbackOnFailure: true }, true), bad = failures(res);
    if (bad.length && !dupOnly(bad)) throw new Error(bad[0].description || bad[0].message || 'ArcGIS did not accept it');
    return res; // every failure being "already there" means an earlier try got through and only its answer was lost
  }
  // everything except photos, as one all-or-nothing save
  PB.submitEdits = function (d, ids) {
    var out = [{ id: ids.Preplan_Sites, adds: [{ attributes: PB.siteAttrs(d), geometry: pt(d.ll) }] }];
    TABLES.forEach(function (t) { if (t === 'Preplan_Photos') return; var rows = d[KEY[t]].map(function (c) { return PB.childRow(t, d, c); }); if (rows.length) out.push({ id: ids[t], adds: rows }); });
    return out;
  };
  // photos go one at a time afterwards, so a weak connection only has to carry one picture per try
  PB.sendPhotos = async function (d, url, ids, stamp) {
    var left = 0, n = 0;
    for (var p of d.photos) {
      if (p.sent || !p.blob) continue;
      try {
        var data = await PB.store.blobGet(p.blob); if (!data) { p.sent = true; continue; }
        await edit(url, [{ id: ids.Preplan_Photos, adds: [PB.childRow('Preplan_Photos', d, p, stamp)], attachments: { adds: [{ globalId: guid(), parentGlobalId: p.gid, contentType: 'image/jpeg', name: PHOTO_Q + '-' + Date.now() + '-' + (++n) + '.jpg', keywords: PHOTO_Q, data: String(data).replace(/^data:[^,]*,/, '') }] } }]);
        p.sent = true; await PB.save(d);
      } catch (e) { left++; d.sub = d.sub || {}; d.sub.err = e.message; }
    }
    d.sub = d.sub || {}; d.sub.pending = left; if (!left) delete d.sub.err; await PB.save(d); return left;
  };
  PB.submit = async function (d) {
    var c = PB.check(d); if (c.miss.length) throw new Error('Still needed: ' + c.miss.join(', '));
    var ids = await layerIds(URLS.intake);
    if (d.state !== 'submitted') { await edit(URLS.intake, PB.submitEdits(d, ids)); d.state = 'submitted'; d.sub = { t: CP.now() }; d.site.site_id = PB.siteAttrs(d).site_id; await PB.save(d); }
    var me = { by: d.site.prepared_by, unit: d.site.prepared_unit, due: d.site.first_due }; CP.store.setPref('pbMe', me);
    return PB.sendPhotos(d, URLS.intake, ids);
  };

  // ---------- from ArcGIS (signed in) ----------
  // every record, a page at a time: ArcGIS hands out a limited number per request, and the lists and the check need them all
  PB.page = 1000;
  async function queryAll(layer, where, o) {
    var out = [], off = 0;
    for (var k = 0; k < 200; k++) { var r = await A.query(layer, where, Object.assign({}, o, { n: PB.page, order: 'OBJECTID', extra: { resultOffset: off } })); out = out.concat(r); if (r.length < PB.page) break; off += r.length; }
    return out;
  }
  function seen(a, table, site) { return a[S.child[table].stamp[0]] === 'Approved' || (site.EditDate != null && a.CreationDate != null && a.CreationDate <= site.EditDate + GRACE_MS); }
  PB.loadRemote = async function (gid, kind) {
    var url = URLS[kind], ids = await layerIds(url);
    var s = (await A.query(url + '/' + ids.Preplan_Sites, "GlobalID = '" + gq(gid) + "'", { geom: true, n: 1 }))[0]; if (!s) throw new Error('That preplan was not found.');
    var at = s.attributes, d = { id: 'rv:' + gkey(at.GlobalID), v: 1, state: 'remote', kind: kind, t: CP.now(), u: CP.now(), gid: at.GlobalID, ll: s.geometry && s.geometry.y != null ? [s.geometry.y, s.geometry.x] : null,
      site: {}, feats: [], outline: [], haz: [], contacts: [], photos: [], remote: { edit: at.EditDate, status: at.status || 'Submitted', gids: {} } };
    Object.keys(S.site).forEach(function (k) { if (at[k] != null) d.site[k] = at[k]; });
    if (!d.site.status) d.site.status = 'Submitted';
    for (var t of TABLES) {
      if (ids[t] == null) continue;
      var sp = S.child[t], rows = await A.query(url + '/' + ids[t], "parentglobalid = '" + gq(at.GlobalID) + "'", { geom: !!sp.geom, n: 2000 });
      // a reader (not a reviewer) only gets what a reviewer has seen
      if (kind !== 'review') rows = rows.filter(function (f) { return seen(f.attributes, t, at); });
      d.remote.gids[t] = rows.map(function (f) { return f.attributes.GlobalID; });
      d[KEY[t]] = rows.map(function (f) {
        var a = f.attributes, c = { gid: a.GlobalID, _r: 1, _oid: a.OBJECTID }; Object.keys(sp.f).forEach(function (k) { if (a[k] != null) c[k] = a[k]; });
        if (sp.geom === 'point') c.ll = f.geometry ? [f.geometry.y, f.geometry.x] : null;
        if (sp.geom === 'polygon') c.ring = f.geometry && f.geometry.rings && f.geometry.rings[0] ? f.geometry.rings[0].slice(0, -1).map(function (p) { return [p[1], p[0]]; }) : [];
        return c;
      }).filter(function (c) { return sp.geom === 'point' ? !!c.ll : sp.geom === 'polygon' ? c.ring.length > 2 : true; });
      if (t === 'Preplan_Photos' && rows.length) {
        var pl = url + '/' + ids[t], qa = await A.req(pl + '/queryAttachments', { objectIds: rows.map(function (f) { return f.attributes.OBJECTID; }).join(','), returnUrl: true }).catch(function () { return {}; }), tok = await A.token();
        (qa.attachmentGroups || []).forEach(function (g) { var p = d.photos.find(function (x) { return x._oid === g.parentObjectId; }), ai = (g.attachmentInfos || [])[0]; if (p && ai) { p.url = pl + '/' + g.parentObjectId + '/attachments/' + ai.id + (tok ? '?token=' + encodeURIComponent(tok) : ''); p.sent = true; } });
      }
    }
    return d;
  };
  // the review queue and the approved list, with the flags a reviewer needs
  PB.fetchLists = async function () {
    var kind = PB.can.review ? 'review' : 'protected', url = URLS[kind], ids = await layerIds(url);
    var rows = await queryAll(url + '/' + ids.Preplan_Sites, PB.can.review ? '1=1' : "status = 'Approved'", { geom: true, fields: 'OBJECTID,GlobalID,site_id,site_name,address,status,submit_type,prepared_unit,prepared_by,CreationDate,EditDate,reviewed_date,review_months,occupancy,target_hazard' });
    var all = rows.map(function (f) { var a = f.attributes; a.status = a.status || 'Submitted'; a._ll = f.geometry && f.geometry.y != null ? [f.geometry.y, f.geometry.x] : null; return a; });
    var appr = all.filter(function (a) { return a.status === 'Approved'; }), best = {};
    appr.forEach(function (a) { var k = String(a.site_id || '').toUpperCase(), t = a.reviewed_date || a.EditDate || 0; if (k && (!best[k] || t > best[k])) best[k] = t; });
    appr.forEach(function (a) { var k = String(a.site_id || '').toUpperCase(); a._old = !!k && (a.reviewed_date || a.EditDate || 0) < best[k]; a._due = dueState(a); });
    var wait = all.filter(function (a) { return QUEUE.indexOf(a.status) >= 0; });
    wait.forEach(function (a) {
      var fl = [], sid = String(a.site_id || '').toUpperCase();
      if (a.submit_type && a.submit_type !== 'New') { var hit = appr.find(function (o) { return sid && String(o.site_id || '').toUpperCase() === sid; }); fl.push(hit ? 'Updates ' + a.site_id + ' (' + (hit.site_name || '') + ')' : 'Says it updates ' + (a.site_id || '(no ID)') + ', but no approved preplan has that ID'); }
      else appr.forEach(function (o) { if ((addrKey(o.address) && addrKey(o.address) === addrKey(a.address)) || meters(a._ll, o._ll) < 75) fl.push('Possible duplicate of ' + (o.site_id || '') + ' ' + (o.site_name || '')); });
      if (!a._ll) fl.push('No map location');
      a._flags = fl;
    });
    wait.sort(function (x, y) { return (x.CreationDate || 0) - (y.CreationDate || 0); }); appr.sort(function (x, y) { return String(x.site_name || '').localeCompare(String(y.site_name || '')); });
    return (PB.lists = { t: Date.now(), wait: wait, appr: appr, other: all.filter(function (a) { return a.status === 'Superseded' || a.status === 'Retired'; }) });
  };
  // a reviewer's decision: one all-or-nothing save
  PB.decide = async function (d, decision, notes) {
    var url = URLS.review, ids = await layerIds(url), status = decision === 'save' ? (d.site.status || 'Submitted') : decision, n = 0;
    d.site.status = status; if (notes != null) d.site.review_notes = notes;
    if (decision === 'Approved') { d.site.reviewer = (A.user && (A.user.name || A.user.username)) || ''; d.site.reviewed_date = Date.now(); if (!d.site.review_months) d.site.review_months = 12; }
    var stamp = { status: status, restricted: restrictedOf(d.site) }, attrs = PB.siteAttrs(d, true);
    var site = { id: ids.Preplan_Sites, updates: [d.ll ? { attributes: attrs, geometry: pt(d.ll) } : { attributes: attrs }] }, edits = [site], by = {};
    TABLES.forEach(function (t) {
      var rows = d[KEY[t]].filter(function (c) { return t !== 'Preplan_Photos' || c._r; }); // new photos follow one at a time
      var e = { id: ids[t], adds: rows.filter(function (c) { return !c._r; }).map(function (c) { return PB.childRow(t, d, c, stamp); }), updates: rows.filter(function (c) { return c._r; }).map(function (c) { return PB.childRow(t, d, c, stamp); }),
        deletes: ((d.remote && d.remote.gids[t]) || []).filter(function (g) { return !d[KEY[t]].some(function (c) { return gkey(c.gid) === gkey(g); }); }) };
      by[t] = e; edits.push(e);
    });
    // approving an update retires the older approved version of the same preplan ID, and everything that belongs to it
    if (decision === 'Approved' && attrs.site_id) {
      var olds = (await A.query(url + '/' + ids.Preplan_Sites, "status = 'Approved' AND UPPER(site_id) = '" + sq(attrs.site_id.toUpperCase()) + "'", { fields: 'OBJECTID,GlobalID', n: 50 })).filter(function (o) { return gkey(o.attributes.GlobalID) !== gkey(d.gid); });
      if (olds.length) {
        n = olds.length; olds.forEach(function (o) { site.updates.push({ attributes: { GlobalID: o.attributes.GlobalID, status: 'Superseded' } }); });
        var inq = olds.map(function (o) { return "'" + gq(o.attributes.GlobalID) + "'"; }).join(',');
        for (var t of TABLES) { var kids = await A.query(url + '/' + ids[t], 'parentglobalid IN (' + inq + ')', { fields: 'OBJECTID,GlobalID', n: 5000 }); kids.forEach(function (k) { var a = { GlobalID: k.attributes.GlobalID }; a[S.child[t].stamp[0]] = 'Superseded'; by[t].updates.push({ attributes: a }); }); }
      }
    }
    await edit(url, edits.filter(function (e) { return (e.adds || []).length || (e.updates || []).length || (e.deletes || []).length; }));
    d.site.site_id = attrs.site_id; TABLES.forEach(function (t) { d[KEY[t]].forEach(function (c) { if (t !== 'Preplan_Photos') c._r = 1; }); d.remote.gids[t] = d[KEY[t]].filter(function (c) { return c._r; }).map(function (c) { return c.gid; }); });
    var left = await PB.sendPhotos(d, url, ids, stamp); d.photos.forEach(function (p) { if (p.sent) p._r = 1; }); d.remote.gids.Preplan_Photos = d.photos.filter(function (p) { return p._r; }).map(function (p) { return p.gid; });
    d.remote.status = status; PB.lists = null; PB.aud = null;
    return { superseded: n, photosLeft: left };
  };
  // ---------- keeping the two ways in step (reviewers) ----------
  // A review saved in the Survey123 form cannot retire the older version of an updated preplan, and if its stamps did not
  // take, map features stay out of the field view. This finds both; PB.repair puts them right in one all-or-nothing save.
  // Only records a reviewer has already seen are released: anything added after the review waits for a reviewer.
  PB.audit = async function () {
    var url = URLS.review, ids = await layerIds(url), by = {}, best = {}, out = { old: [], release: 0, hide: 0, late: [], edits: [] }, siteUpd = [];
    var sites = (await queryAll(url + '/' + ids.Preplan_Sites, '1=1', { fields: 'OBJECTID,GlobalID,site_id,site_name,status,restricted,occupancy,reviewed_date,EditDate' })).map(function (f) { var a = f.attributes; a.status = a.status || 'Submitted'; return a; });
    var tm = function (a) { return a.reviewed_date || a.EditDate || 0; }, key = function (a) { return String(a.site_id || '').toUpperCase(); };
    sites.forEach(function (a) { by[gkey(a.GlobalID)] = a; a._eff = a.status; if (a.status === 'Approved' && key(a) && (best[key(a)] == null || tm(a) > best[key(a)])) best[key(a)] = tm(a); });
    sites.forEach(function (a) { if (a.status === 'Approved' && key(a) && tm(a) < best[key(a)]) { a._eff = 'Superseded'; a._old = 1; out.old.push(a); siteUpd.push({ attributes: { GlobalID: a.GlobalID, status: 'Superseded' } }); } });
    if (siteUpd.length) out.edits.push({ id: ids.Preplan_Sites, updates: siteUpd });
    for (var t of TABLES) {
      if (ids[t] == null) continue;
      var st = S.child[t].stamp, upd = [], kids = await queryAll(url + '/' + ids[t], '1=1', { fields: 'OBJECTID,GlobalID,parentglobalid,CreationDate,' + st.join(',') });
      kids.forEach(function (f) {
        var c = f.attributes, p = by[gkey(c.parentglobalid)]; if (!p) return;
        var want = restrictedOf(p), a = { GlobalID: c.GlobalID };
        if (p._eff === 'Approved') {
          if (c[st[0]] === 'Approved' && c[st[1]] === want) return;
          if (c[st[0]] !== 'Approved' && !(p.EditDate != null && c.CreationDate != null && c.CreationDate <= p.EditDate + GRACE_MS)) { if (out.late.indexOf(p) < 0) out.late.push(p); return; }
          out.release++;
        } else { if (c[st[0]] !== 'Approved') return; if (!p._old) out.hide++; } // only what is showing and should not be
        a[st[0]] = p._eff; a[st[1]] = want; upd.push({ attributes: a });
      });
      if (upd.length) out.edits.push({ id: ids[t], updates: upd });
    }
    out.n = out.old.length + out.release + out.hide; out.t = Date.now(); return (PB.aud = out);
  };
  PB.repair = async function () {
    var a = await PB.audit(); if (!a.edits.length) return a; // looked again first: someone may have fixed it since
    await edit(URLS.review, a.edits); PB.aud = null; PB.lists = null; return a;
  };
  function audLines(a) {
    var names = function (l) { return l.slice(0, 4).map(function (x) { return (x.site_id || '') + ' ' + (x.site_name || ''); }).join('; ') + (l.length > 4 ? '; and ' + (l.length - 4) + ' more' : ''); }, o = [];
    if (a.old.length) o.push(a.old.length + ' older version' + (a.old.length > 1 ? 's' : '') + ' still approved after an update was approved: ' + names(a.old));
    if (a.release) o.push(a.release + ' item' + (a.release > 1 ? 's' : '') + ' of approved preplans not released (map features, outlines, hazmat, contacts or photos)');
    if (a.hide) o.push(a.hide + ' item' + (a.hide > 1 ? 's' : '') + ' still showing for preplans that are no longer approved');
    return o;
  }
  PB.audLines = audLines;

  // a new draft that carries everything from an existing preplan, so an update starts complete
  PB.updateFrom = async function (src) {
    var d = PB.blank(), keep = { by: d.site.prepared_by, unit: d.site.prepared_unit };
    Object.keys(S.site).forEach(function (k) { if (S.review.indexOf(k) < 0 && src.site[k] != null) d.site[k] = src.site[k]; });
    d.site.submit_type = 'Update'; d.site.replaces_site_id = src.site.site_id || ''; d.site.site_id = src.site.site_id || d.site.site_id; d.site.prepared_date = Date.now();
    if (keep.by) d.site.prepared_by = keep.by; if (keep.unit) d.site.prepared_unit = keep.unit; d.ll = src.ll ? src.ll.slice() : null;
    TABLES.forEach(function (t) { d[KEY[t]] = src[KEY[t]].map(function (c) { var n = JSON.parse(JSON.stringify(c)); n.gid = guid(); delete n._r; delete n._oid; delete n.sent; return n; }); });
    for (var p of d.photos) { // bring the pictures along
      try { var data = p.blob ? await PB.store.blobGet(p.blob) : p.url ? await toDataUrl(p.url) : null; if (!data) { p._drop = 1; continue; } p.blob = CP.uid(); await PB.store.blobPut(p.blob, data); if (!p.th) p.th = await thumb(data).catch(function () { return ''; }); delete p.url; } catch (e) { p._drop = 1; }
    }
    d.photos = d.photos.filter(function (p) { return !p._drop; });
    await PB.store.put(d); return d;
  };
  function toDataUrl(url) { return fetch(url).then(function (r) { if (!r.ok) throw new Error('photo'); return r.arrayBuffer().then(function (buf) { var b = new Uint8Array(buf), t = ''; for (var k = 0; k < b.length; k += 0x8000) t += String.fromCharCode.apply(null, b.subarray(k, k + 0x8000)); return 'data:' + ((r.headers && r.headers.get('content-type')) || 'image/jpeg') + ';base64,' + btoa(t); }); }); }
  function shrink(src, max, q) { return new Promise(function (ok, no) { var u = typeof src === 'string' ? src : URL.createObjectURL(src), im = new Image(); im.onload = function () { var s = Math.min(1, max / Math.max(im.width, im.height)), c = document.createElement('canvas'); c.width = Math.round(im.width * s); c.height = Math.round(im.height * s); var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(im, 0, 0, c.width, c.height); if (typeof src !== 'string') URL.revokeObjectURL(u); ok(c.toDataURL('image/jpeg', q)); }; im.onerror = function () { no(new Error('That file is not a picture')); }; im.src = u; }); }
  function thumb(data) { return shrink(data, 260, 0.6); }
  PB.addPhoto = async function (src, view, caption) { var full = await shrink(src, 1600, 0.82), p = { gid: guid(), photo_view: view || 'Other', photo_caption: caption || '', blob: CP.uid(), th: await thumb(full) }; await PB.store.blobPut(p.blob, full); PB.d.photos.push(p); await touch(true); return p; };

  // =================== screens ===================
  var act = {}, waitEl = null;
  // a "working" note that stays until the work is done, then goes away
  function wait(msg) { done(); U.toast(E(msg), 'ok', 90000); var c = document.querySelector('.toasts'); waitEl = c && c.lastChild; }
  function done() { if (waitEl && waitEl.remove) waitEl.remove(); waitEl = null; }
  function symI(code) { var f = FT[code] || FT.note; if (f.shape === 'side') return '<div class="cbsideA s' + f.short + ' sm">' + f.short + '</div>'; if (f.shape === 'icp') return '<i class="ics icp"></i>'; return '<i class="ics ' + f.shape + '" style="--c:' + f.color + '"><b>' + E(f.short) + '</b></i>'; }
  function chip(t, cls) { return '<span class="chip ' + (cls || '') + '">' + E(t) + '</span>'; }
  function stateChip(d) {
    if (d.state === 'remote') return chip(d.site.status || 'Submitted', d.site.status === 'Approved' ? 'ok' : 'gold');
    if (d.state === 'submitted') return d.sub && d.sub.pending ? chip('Sent · ' + d.sub.pending + ' photo' + (d.sub.pending > 1 ? 's' : '') + ' still to send', 'gold') : chip('Sent for review', 'ok');
    return chip('Draft on this iPad', 'b');
  }
  function paintSave() { var el = document.getElementById('pbSave'); if (!el) return; el.className = 'pbsave' + (PB.saveErr ? ' bad' : ''); el.textContent = PB.saveErr ? 'NOT SAVED: ' + PB.saveErr : PB.d && PB.d.state === 'remote' ? (PB.ro ? 'View only' : 'Changes are kept on this iPad until you save a decision') : PB.saved ? 'Saved on this iPad ' + new Date(PB.saved).toTimeString().slice(0, 5) : ''; }

  // ----- home -----
  function draftCard(d) {
    return '<button class="pbcard" data-pb="open" data-a="' + E(d.id) + '"><b>' + E(d.site.site_name || 'Unnamed building') + '</b><span>' + E(d.site.address || 'No address yet') + '</span><em>' + stateChip(d) + ' <i>' + E(d.site.site_id || '') + ' · edited ' + E(CP.fmtDT(d.u)) + '</i></em></button>';
  }
  function remoteCard(a, sub) { return '<button class="pbcard' + (a._old ? ' warn' : '') + '" data-pb="ropen" data-a="' + E(a.GlobalID) + '"><b>' + E(a.site_name || 'Unnamed building') + '</b><span>' + E(a.address || '') + '</span><em>' + chip(a.status, a.status === 'Approved' ? 'ok' : 'gold') + ' <i>' + E([a.site_id, sub].filter(Boolean).join(' · ')) + '</i></em>' + ((a._flags || []).length ? '<u>' + a._flags.map(E).join('<br>') + '</u>' : '') + (a._old ? '<u>Older version still approved. Use Fix now above, or open it and retire it.</u>' : '') + (a._due ? '<u>' + E(a._due) + '</u>' : '') + '</button>'; }
  function home() {
    var mine = PB.drafts.filter(function (d) { return d.state !== 'remote'; }).sort(function (a, b) { return a.u < b.u ? 1 : -1; });
    var h = '<div class="pbhome"><div class="pbhero"><div><h1>Preplan Builder</h1><p>Walk the building. Tap the map to place what crews need to find. Photos, facts, done.</p></div><button class="btn pri pbbig" data-pb="new">' + I('plus') + 'New preplan</button></div>';
    h += '<section class="pbsec"><h2>On this iPad <span>' + mine.length + '</span></h2>' + (mine.length ? '<div class="pbcards">' + mine.map(draftCard).join('') + '</div>' : '<div class="empty">Nothing here yet. Tap <b>New preplan</b> to start one. It saves on this iPad as you go, with or without a connection.</div>') + '</section>';
    if (!A.signedIn()) h += '<section class="pbsec"><h2>In ArcGIS</h2><div class="empty">You can build and submit preplans without signing in.<br>Reviewers, and anyone updating an approved preplan, sign in with a county ArcGIS account.<div style="margin-top:10px"><button class="btn" data-pb="signin">' + I('shield') + 'Sign in</button></div></div></section>';
    else if (PB.can.checked && !PB.can.review && !PB.can.read) h += '<section class="pbsec"><h2>In ArcGIS</h2><div class="empty">Signed in as ' + E((A.user && A.user.name) || '') + '. This account is not in a Preplans group, so it can build and submit, but not review or open approved preplans.</div></section>';
    else if (PB.can.review || PB.can.read) {
      var L = PB.lists, q = PB.q.toUpperCase(), f = function (a) { return !q || (String(a.site_name || '') + ' ' + String(a.address || '') + ' ' + String(a.site_id || '')).toUpperCase().indexOf(q) >= 0; };
      var tabs = (PB.can.review ? [['wait', 'Waiting for review', L ? L.wait.length : '']] : []).concat([['appr', 'Approved', L ? L.appr.length : '']]); if (!tabs.some(function (t) { return t[0] === PB.ltab; })) PB.ltab = tabs[0][0];
      h += '<section class="pbsec"><h2>In ArcGIS' + (PB.can.review ? ' · reviewer' : '') + '</h2><div class="pbltabs">' + tabs.map(function (t) { return '<button class="' + (PB.ltab === t[0] ? 'on' : '') + '" data-pb="ltab" data-a="' + t[0] + '">' + E(t[1]) + (t[2] !== '' ? ' <span>' + t[2] + '</span>' : '') + '</button>'; }).join('') + '<input class="in" id="pbQ" placeholder="Search name, address or ID" value="' + E(PB.q) + '"><button class="btn ghost" data-pb="refresh">' + I('refresh') + 'Refresh</button></div>';
      var au = PB.can.review ? PB.aud : null;
      if (au && (au.n || au.late.length)) h += '<div class="pbneed pbaud"><b>Needs attention</b><ul>' + audLines(au).map(function (x) { return '<li>' + E(x) + '</li>'; }).join('') + (au.late.length ? '<li>' + au.late.length + ' approved preplan' + (au.late.length > 1 ? 's have' : ' has') + ' items added after the review. Open and approve again: ' + E(au.late.slice(0, 4).map(function (x) { return (x.site_id || '') + ' ' + (x.site_name || ''); }).join('; ')) + '</li>' : '') + '</ul>' + (au.n ? '<div class="row"><button class="btn pri" data-pb="fix">' + I('check') + 'Fix now</button><span class="dim" style="font-size:13px">One save. Nothing is deleted. This is what a review saved in Survey123 leaves to do.</span></div>' : '') + '</div>';
      if (!L) h += '<div class="empty">' + (PB.listErr ? E(PB.listErr) : 'Loading…') + '</div>';
      else { var rows = (PB.ltab === 'wait' ? L.wait : L.appr).filter(f); h += rows.length ? '<div class="pbcards">' + rows.slice(0, 200).map(function (a) { return remoteCard(a, PB.ltab === 'wait' ? 'sent ' + when(a.CreationDate) + (a.prepared_unit ? ' · ' + a.prepared_unit : '') : a.reviewed_date ? 'approved ' + when(a.reviewed_date) : ''); }).join('') + '</div>' : '<div class="empty">' + (PB.ltab === 'wait' ? 'Nothing is waiting for review.' : 'No approved preplans' + (q ? ' match that search.' : ' yet.')) + '</div>'; }
      h += '</section>';
    } else h += '<section class="pbsec"><h2>In ArcGIS</h2><div class="empty">Checking what this account can open…</div></section>';
    return h + '<p class="pbfoot">' + (navigator.onLine ? '' : 'No connection: building still works; submit when you are back in range. · ') + 'Add this app to the iPad home screen: Share → Add to Home Screen.</p></div>';
  }

  // ----- editor chrome -----
  var TABS = [['map', 'Map'], ['building', 'Building'], ['protection', 'Protection'], ['water', 'Water & access'], ['hazards', 'Hazards'], ['photos', 'Photos'], ['contacts', 'Contacts'], ['finish', 'Finish']];
  function count(k) { var d = PB.d; return k === 'map' ? d.feats.length : k === 'photos' ? d.photos.length : k === 'contacts' ? d.contacts.length : k === 'hazards' ? d.haz.length : 0; }
  function editor() {
    var d = PB.d, c = PB.check(d);
    var h = '<div class="pbx' + (PB.ro ? ' ro' : '') + '"><div class="pbtop"><div class="pbname"><b>' + E(d.site.site_name || 'Unnamed building') + '</b><span>' + E(d.site.address || 'No address yet') + ' · ' + E(d.site.site_id || '') + '</span></div>' + stateChip(d) + '<span id="pbSave" class="pbsave"></span></div>' +
      '<nav class="pbtabs">' + TABS.map(function (t) { var n = count(t[0]); return '<button class="' + (PB.tab === t[0] ? 'on' : '') + '" data-pb="tab" data-a="' + t[0] + '">' + E(t[1]) + (n ? ' <span>' + n + '</span>' : '') + (t[0] === 'finish' && !PB.ro && d.state === 'draft' && c.miss.length ? ' <span class="need">' + c.miss.length + '</span>' : '') + '</button>'; }).join('') + '</nav>';
    h += PB.tab === 'map' ? mapView() : '<div class="pbpage">' + (PB.tab === 'photos' ? photosView() : PB.tab === 'contacts' ? rowsView('Preplan_Contacts', 'Contacts and key holders', 'Add contact', 'Owner, key holder, alarm company. Tap a number on the Command Board to call it.') : PB.tab === 'finish' ? finishView() : formView(PB.tab)) + '</div>';
    return h + '</div>';
  }

  // ----- form fields, drawn from the schema -----
  function shown(f, obj) { return !f.show || f.show[1].indexOf(obj[f.show[0]]) >= 0; }
  function dateIn(ms) { if (!ms) return ''; var d = new Date(ms); return d.getFullYear() + '-' + CP.pad(d.getMonth() + 1) + '-' + CP.pad(d.getDate()); }
  function field(k, f, obj, path) {
    if (!shown(f, obj)) return '';
    var v = obj[k], id = 'f_' + k, dis = PB.ro ? ' disabled' : '', lab = '<span>' + E(f.l) + (f.req ? ' <i class="req">required</i>' : '') + '</span>', hint = f.hint ? '<small>' + E(f.hint) + '</small>' : '', inp;
    if (path === 'site' && k === 'restricted' && S.restricted.indexOf(obj.occupancy) >= 0) return '<div class="f"><span>' + E(f.l) + '</span><div class="pblock">Yes. This occupancy type is always restricted.</div></div>';
    if (path === 'site' && k === 'fire_flow_gpm') return '<div class="f"><span>' + E(f.l) + '</span><div class="pblock">' + (flow(obj) ? flow(obj) + ' gpm · ' + Math.round(flow(obj) / 4) + ' gpm at 25% involvement' : 'Enter the largest floor area') + '</div>' + hint + '</div>';
    if (f.dom) {
      var opts = S.domains[f.dom];
      if (opts.length <= 4) inp = '<div class="pbseg">' + opts.map(function (o) { return '<button type="button" class="' + (v === o[0] ? 'on' : '') + '" data-pb="seg" data-a="' + E(path + '|' + k + '|' + o[0]) + '"' + dis + '>' + E(o[1]) + '</button>'; }).join('') + '</div>';
      else inp = '<select class="in" id="' + id + '" data-f="' + path + '.' + k + '" data-re="1"' + dis + '><option value=""></option>' + opts.map(function (o) { return '<option value="' + E(o[0]) + '"' + (v === o[0] ? ' selected' : '') + '>' + E(o[1]) + '</option>'; }).join('') + '</select>';
    } else if (f.t === 'T') inp = '<input class="in" type="date" id="' + id + '" data-f="' + path + '.' + k + '" data-t="T" value="' + dateIn(v) + '"' + dis + '>';
    else if (f.t === 'I') inp = '<input class="in" inputmode="numeric" id="' + id + '" data-f="' + path + '.' + k + '" data-t="I" value="' + (v == null ? '' : E(v)) + '"' + dis + '>';
    else if (f.multi) inp = '<textarea class="in" id="' + id + '" data-f="' + path + '.' + k + '" maxlength="' + (f.n || 500) + '"' + dis + '>' + E(v || '') + '</textarea>';
    else inp = '<input class="in" id="' + id + '" data-f="' + path + '.' + k + '" maxlength="' + (f.n || 255) + '" value="' + E(v || '') + '"' + (/phone/.test(k) ? ' inputmode="tel"' : '') + dis + '>';
    return '<label class="f' + (f.multi ? ' wide' : '') + '">' + lab + inp + hint + '</label>';
  }
  function formView(key) {
    var pg = S.pages.find(function (p) { return p.k === key; }), d = PB.d;
    var h = '<h2 class="pbh">' + E(pg.t) + '</h2><div class="pbform">' + pg.f.map(function (k) { return field(k, S.site[k], d.site, 'site'); }).join('') + '</div>';
    if (key === 'hazards') h += rowsView('Preplan_Hazmat', 'Hazardous materials', 'Add material', 'One entry for each material kept in quantity. UN number and ERG guide if you know them.');
    return h;
  }
  function rowLine(t, c) {
    if (t === 'Preplan_Hazmat') return '<b>' + E(c.material || 'Material') + '</b><span>' + E([c.un_number ? 'UN ' + c.un_number : '', c.erg_guide ? 'ERG ' + c.erg_guide : '', c.quantity, c.haz_location].filter(Boolean).join(' · ')) + '</span>';
    return '<b>' + E(c.contact_name || 'Contact') + '</b><span>' + E([label('contact_role', c.contact_role), c.contact_phone, c.available_24h === 'Yes' ? '24/7' : ''].filter(Boolean).join(' · ')) + '</span>';
  }
  function rowsView(t, title, addLabel, help) {
    var rows = PB.d[KEY[t]];
    return '<h2 class="pbh">' + E(title) + ' <span>' + rows.length + '</span></h2><p class="dim pbhelp">' + E(help) + '</p><div class="pbrows">' + rows.map(function (c) { return '<button class="pbrow" data-pb="row" data-a="' + E(t + '|' + c.gid) + '">' + rowLine(t, c) + '</button>'; }).join('') + '</div>' + (PB.ro ? '' : '<button class="btn" data-pb="row" data-a="' + E(t + '|') + '">' + I('plus') + E(addLabel) + '</button>');
  }
  act.row = function (a) {
    var p = a.split('|'), t = p[0], rows = PB.d[KEY[t]], cur = rows.find(function (c) { return c.gid === p[1]; }), c = cur ? Object.assign({}, cur) : { gid: guid() }, sp = S.child[t];
    Object.keys(sp.f).forEach(function (k) { if (c[k] == null && sp.f[k].def != null) c[k] = sp.f[k].def; });
    PB.rowTmp = c;
    var body = function () { return '<div class="pbform one">' + Object.keys(sp.f).map(function (k) { return field(k, sp.f[k], c, 'row'); }).join('') + '</div>'; };
    U.modal(cur ? 'Edit' : 'Add', '<div id="pbRow">' + body() + '</div>', (cur && !PB.ro ? [{ label: I('trash') + 'Remove', cls: 'red', fn: function () { PB.d[KEY[t]] = rows.filter(function (x) { return x.gid !== c.gid; }); touch(true); render(); } }] : []).concat([{ label: PB.ro ? 'Close' : 'Cancel', cls: 'ghost' }]).concat(PB.ro ? [] : [{ label: 'Save', cls: 'pri', fn: function () {
      var need = Object.keys(sp.f).filter(function (k) { return sp.f[k].req && (c[k] == null || c[k] === ''); }); if (need.length) { U.toast('Needed: ' + need.map(function (k) { return E(sp.f[k].l); }).join(', '), 'err'); return false; }
      if (cur) Object.assign(cur, c); else rows.push(c); touch(true); render();
    } }]), { sticky: true });
    PB.rowPaint = function () { var el = document.getElementById('pbRow'); if (el) el.innerHTML = body(); };
  };

  // ----- map -----
  function sideOf(s) { return PB.d.feats.find(function (f) { return f.feature_type === 'side_' + s; }); }
  function mapView() {
    var d = PB.d, pl = PB.placing, groups = {}, order = [];
    S.features.forEach(function (f) { if (f[4] === 'side') return; if (!groups[f[5]]) { groups[f[5]] = []; order.push(f[5]); } groups[f[5]].push(f[0]); });
    var banner = pl === 'pin' ? '<div class="cbpick"><div><b>Tap the map</b> on the front door (address side)</div><button class="btn ghost" data-pb="pin">Cancel</button></div>'
      : pl === 'outline' ? '<div class="cbpick"><div><b>Tap each corner</b> of the building · ' + (PB.ring || []).length + ' so far</div><div class="pbpickb"><button class="btn ghost" data-pb="outundo">Undo</button><button class="btn pri" data-pb="outfin"' + ((PB.ring || []).length < 3 ? ' disabled' : '') + '>Finish</button></div></div>'
      : pl ? '<div class="cbpick"><div><b>Tap the map</b> to place: ' + E(FT[pl].name) + '</div><div class="pbpickb"><button class="btn ghost" data-pb="gps" title="Use the iPad\'s location">' + I('target') + 'Here</button><button class="btn pri" data-pb="place" data-a="' + E(pl) + '">Done</button></div></div>' : '';
    var others = d.feats.filter(function (f) { return !/^side_/.test(f.feature_type); });
    var side = '<section class="cbcol pbmapside"><div class="cbscroll">' + banner + (d.ll ? '' : '<div class="warnbox" style="margin-bottom:8px">No building pin yet. Tap <b>Set building pin</b>, then tap the front door on the map.</div>') +
      (PB.ro ? '' : '<div class="cbbtns"><button data-pb="pin" class="' + (pl === 'pin' ? 'on' : '') + '">' + I('pin') + (d.ll ? 'Move building pin' : 'Set building pin') + '</button><button data-pb="gpspin">' + I('target') + 'Pin where I stand</button></div>' +
      '<div class="cbh sm">Building sides</div><div class="cbbtns c4">' + ['a', 'b', 'c', 'd'].map(function (s) { return '<button class="' + (pl === 'side_' + s ? 'on' : '') + (sideOf(s) ? ' set' : '') + '" data-pb="place" data-a="side_' + s + '">' + symI('side_' + s) + (sideOf(s) ? '✓' : '') + '</button>'; }).join('') + '</div>' +
      '<div class="cbh sm">Building outline</div><div class="cbbtns"><button data-pb="outline" class="' + (pl === 'outline' ? 'on' : '') + '">' + I('map') + (d.outline.length ? 'Add another outline' : 'Trace the outline') + '</button><button data-pb="outclear"' + (d.outline.length ? '' : ' disabled') + '>' + I('trash') + 'Clear outline</button></div>' +
      order.map(function (g) { return '<div class="cbsymg">' + E(g) + '</div><div class="cbsyms">' + groups[g].map(function (k) { return '<button class="cbsymb' + (pl === k ? ' on' : '') + '" data-pb="place" data-a="' + k + '" title="' + E(FT[k].name) + '">' + symI(k) + '<span>' + E(FT[k].name) + '</span></button>'; }).join('') + '</div>'; }).join('')) +
      '<div class="cbh sm">Placed · ' + others.length + '</div>' + (others.length ? others.map(function (f) { return '<button class="pbrow sm" data-pb="fedit" data-a="' + E(f.gid) + '">' + symI(f.feature_type) + '<b>' + E(f.feat_label || FT[f.feature_type].name) + '</b>' + (f.feat_floor ? '<span>floor ' + E(f.feat_floor) + '</span>' : '') + '</button>'; }).join('') : '<div class="dim cbempty">' + (PB.ro ? 'No map features.' : 'Tap a symbol above, then tap the map where it is.') + '</div>') +
      '</div></section>';
    return '<div class="cbmapv pbmapv">' + side + '<div class="cbmaphost" id="pbMapHost"></div></div>';
  }
  function mapMount() {
    var host = document.getElementById('pbMapHost'); if (!host) return;
    if (!window.L || !CP.map) { host.innerHTML = '<div class="empty" style="margin:30px">The map needs a connection the first time it opens. Everything else works without one.</div>'; return; }
    var d = PB.d;
    if (!PB.mapEl) {
      PB.mapEl = document.createElement('div'); PB.mapEl.className = 'cbmapel'; host.appendChild(PB.mapEl);
      var m = PB.map = CP.map.create(PB.mapEl, { center: d.ll, zoom: d.ll ? 19 : null });
      try { var bm = m._cpBase; Object.keys(bm).forEach(function (k) { if (m.hasLayer(bm[k])) m.removeLayer(bm[k]); }); bm.Imagery.addTo(m); } catch (e) {}
      PB.lyr = window.L.layerGroup().addTo(m); m.on('click', function (e) { mapTap([+e.latlng.lat.toFixed(6), +e.latlng.lng.toFixed(6)]); }); PB.mapFor = d.id;
    } else host.appendChild(PB.mapEl);
    if (PB.mapFor !== d.id) { PB.mapFor = d.id; if (d.ll) PB.map.setView(d.ll, 19); PB.fit = true; }
    PB.mapEl.classList.toggle('placing', !!PB.placing);
    setTimeout(function () { PB.map.invalidateSize(); if (PB.fit) { PB.fit = false; act.fit(); } }, 60);
    mapDraw();
  }
  function mapDraw() {
    var d = PB.d, Lf = window.L, G = PB.lyr; if (!G) return; G.clearLayers();
    d.outline.forEach(function (o) { if (o.ring && o.ring.length > 2) G.addLayer(Lf.polygon(o.ring, { color: '#FDB833', weight: 3, fillColor: '#FDB833', fillOpacity: 0.1, interactive: false })); });
    if (PB.ring && PB.ring.length) { G.addLayer(Lf.polyline(PB.ring.concat(PB.ring.length > 2 ? [PB.ring[0]] : []), { color: '#fff', weight: 3, dashArray: '6 6', interactive: false })); PB.ring.forEach(function (p) { G.addLayer(Lf.circleMarker(p, { radius: 6, color: '#111', weight: 2, fillColor: '#FDB833', fillOpacity: 1, interactive: false })); }); }
    if (d.ll) { var pin = Lf.marker(d.ll, { draggable: !PB.ro, zIndexOffset: 900, icon: CP.map.pinIcon('#FDB833', '★', 30) }); pin.on('dragend', function (ev) { var p = ev.target.getLatLng(); d.ll = [+p.lat.toFixed(6), +p.lng.toFixed(6)]; touch(); }); G.addLayer(pin); }
    d.feats.forEach(function (f) {
      if (!f.ll) return; var ft = FT[f.feature_type] || FT.note, side = ft.shape === 'side';
      var mk = Lf.marker(f.ll, { draggable: !PB.ro, zIndexOffset: side ? 850 : 700, icon: Lf.divIcon({ className: '', iconSize: side ? [22, 22] : [0, 0], iconAnchor: side ? [11, 11] : [0, 0], html: side ? symI(f.feature_type) : '<div class="cbsym">' + symI(f.feature_type) + (f.feat_label ? '<b class="lbl" style="--c:' + ft.color + '">' + E(f.feat_label) + '</b>' : '') + '</div>' }) });
      mk.on('dragend', function (ev) { var p = ev.target.getLatLng(); f.ll = [+p.lat.toFixed(6), +p.lng.toFixed(6)]; touch(); });
      mk.on('click', function () { act.fedit(f.gid); });
      G.addLayer(mk);
    });
  }
  function mapTap(p) {
    var d = PB.d, pl = PB.placing; if (PB.ro || !pl) return;
    if (pl === 'pin') { d.ll = p; PB.placing = null; touch(true); return render(); }
    if (pl === 'outline') { PB.ring.push(p); return render(); }
    var one = /^side_|^(icp|stg|lz)$/.test(pl);
    if (/^side_/.test(pl)) d.feats = d.feats.filter(function (f) { return f.feature_type !== pl; });
    d.feats.push({ gid: guid(), feature_type: pl, feat_label: '', feat_details: '', feat_floor: '', feat_sensitive: S.sensitiveTypes.indexOf(pl) >= 0 ? 'Yes' : 'No', ll: p });
    if (one) { var nx = /^side_[abc]$/.test(pl) ? 'side_' + 'abcd'['abcd'.indexOf(pl.slice(5)) + 1] : null; PB.placing = nx && !sideOf(nx.slice(5)) ? nx : null; } // A, then B, C, D in one pass
    touch(true); render();
  }
  function locate() { return new Promise(function (ok, no) { if (!navigator.geolocation) return no(new Error('This iPad is not sharing its location.')); navigator.geolocation.getCurrentPosition(function (g) { ok([+g.coords.latitude.toFixed(6), +g.coords.longitude.toFixed(6), g.coords.accuracy]); }, function () { no(new Error('Location is off for this app. Allow it in Settings, or tap the map instead.')); }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 5000 }); }); }
  act.gps = function () { return locate().then(function (p) { if (PB.map) PB.map.setView(p, 19); mapTap(p.slice(0, 2)); if (p[2] > 15) U.toast('Placed from the iPad\'s location (within about ' + Math.round(p[2] * 3.281) + ' ft). Drag it if it is off.', 'ok', 5000); }); };
  act.gpspin = function () { return locate().then(function (p) { PB.d.ll = p.slice(0, 2); PB.placing = null; touch(true); render(); if (PB.map) PB.map.setView(PB.d.ll, 19); }); };
  act.pin = function () { PB.placing = PB.placing === 'pin' ? null : 'pin'; PB.ring = null; render(); };
  act.place = function (k) { PB.placing = PB.placing === k ? null : k; PB.ring = null; render(); };
  act.outline = function () { if (PB.placing === 'outline') { PB.placing = null; PB.ring = null; } else { PB.placing = 'outline'; PB.ring = []; } render(); };
  act.outundo = function () { if (PB.ring) PB.ring.pop(); render(); };
  act.outfin = function () { if (!PB.ring || PB.ring.length < 3) return; PB.d.outline.push({ gid: guid(), fp_label: '', ring: PB.ring }); PB.ring = null; PB.placing = null; touch(true); render(); };
  act.outclear = function () { if (!PB.d.outline.length) return; U.confirm('Clear the outline?', 'Removes every traced outline from this preplan.', 'Clear', function () { PB.d.outline = []; touch(true); render(); }); };
  act.fit = function () { if (!PB.map) return; var d = PB.d, pts = d.feats.filter(function (f) { return f.ll; }).map(function (f) { return f.ll; }); d.outline.forEach(function (o) { pts = pts.concat(o.ring); }); if (d.ll) pts.push(d.ll); if (pts.length > 1) PB.map.fitBounds(pts, { padding: [50, 50], maxZoom: 19 }); else if (d.ll) PB.map.setView(d.ll, 19); };
  act.fedit = function (gid) {
    var d = PB.d, f = d.feats.find(function (x) { return x.gid === gid; }); if (!f) return; if (PB.map) PB.map.closePopup();
    var c = Object.assign({}, f), sp = S.child.Preplan_Features; PB.rowTmp = c;
    var body = function () { return '<div class="pbform one">' + ['feature_type', 'feat_label', 'feat_details', 'feat_floor'].map(function (k) { return field(k, sp.f[k], c, 'row'); }).join('') + (S.sensitiveTypes.indexOf(c.feature_type) >= 0 ? '<div class="f"><span>Sensitive</span><div class="pblock">Yes. This is never shown on the open field view.</div></div>' : field('feat_sensitive', sp.f.feat_sensitive, c, 'row')) + '</div><p class="dim" style="font-size:13px">Drag it on the map to move it.</p>'; };
    U.modal(FT[f.feature_type] ? FT[f.feature_type].name : 'Map feature', '<div id="pbRow">' + body() + '</div>', (PB.ro ? [] : [{ label: I('trash') + 'Remove', cls: 'red', fn: function () { d.feats = d.feats.filter(function (x) { return x.gid !== gid; }); touch(true); render(); } }]).concat([{ label: PB.ro ? 'Close' : 'Cancel', cls: 'ghost' }]).concat(PB.ro ? [] : [{ label: 'Save', cls: 'pri', fn: function () { if (!c.feature_type) return false; Object.assign(f, c); if (/^side_/.test(f.feature_type)) d.feats = d.feats.filter(function (x) { return x === f || x.feature_type !== f.feature_type; }); touch(true); render(); } }]), { nofocus: true });
    PB.rowPaint = function () { var el = document.getElementById('pbRow'); if (el) el.innerHTML = body(); };
  };

  // ----- photos and sketches -----
  function photosView() {
    var d = PB.d;
    return '<h2 class="pbh">Photos and floor plans <span>' + d.photos.length + '</span></h2><p class="dim pbhelp">Each side, the FDC, riser, alarm panel, Knox box and utilities. Sketch a floor plan with a finger or Apple Pencil.</p>' +
      (PB.ro ? '' : '<div class="row" style="margin-bottom:12px"><button class="btn pri" data-pb="photocam">' + I('plus') + 'Take a photo</button><button class="btn" data-pb="photolib">' + I('up') + 'Choose photos</button><button class="btn" data-pb="sketch">' + I('map') + 'Sketch a floor plan</button></div>') +
      (d.photos.length ? '<div class="pbphotos">' + d.photos.map(function (p) { return '<button data-pb="photo" data-a="' + E(p.gid) + '"><img src="' + E(p.th || p.url || '') + '" alt="" loading="lazy"><b>' + E(p.photo_view || 'Photo') + '</b><span>' + E(p.photo_caption || '') + '</span></button>'; }).join('') + '</div>' : '<div class="empty">No photos yet.</div>');
  }
  function pick(capture) { var f = document.createElement('input'); f.type = 'file'; f.accept = 'image/*'; if (capture) f.setAttribute('capture', 'environment'); else f.multiple = true; f.onchange = function () { PB.addFiles(f.files); }; f.click(); }
  PB.addFiles = async function (files) { var n = 0, last; for (var k = 0; k < files.length; k++) { try { last = await PB.addPhoto(files[k]); n++; } catch (e) { U.toast(E(e.message), 'err'); } } render(); if (n === 1 && last) act.photo(last.gid); };
  act.photocam = function () { pick(true); }; act.photolib = function () { pick(false); };
  act.photo = function (gid) {
    var d = PB.d, p = d.photos.find(function (x) { return x.gid === gid; }); if (!p) return; var c = Object.assign({}, p), sp = S.child.Preplan_Photos; PB.rowTmp = c;
    var body = function () { return '<img class="pbbigimg" src="' + E(p.url || p.th || '') + '" alt=""><div class="pbform one">' + field('photo_view', sp.f.photo_view, c, 'row') + field('photo_caption', sp.f.photo_caption, c, 'row') + '</div>'; };
    U.modal('Photo', '<div id="pbRow">' + body() + '</div>', (PB.ro ? [] : [{ label: I('trash') + 'Remove', cls: 'red', fn: function () { d.photos = d.photos.filter(function (x) { return x.gid !== gid; }); if (p.blob) PB.store.blobDel(p.blob).catch(function () {}); touch(true); render(); } }]).concat([{ label: PB.ro ? 'Close' : 'Cancel', cls: 'ghost' }]).concat(PB.ro ? [] : [{ label: 'Save', cls: 'pri', fn: function () { p.photo_view = c.photo_view || 'Other'; p.photo_caption = c.photo_caption || ''; touch(true); render(); } }]), { wide: true, nofocus: true });
    PB.rowPaint = function () { var el = document.getElementById('pbRow'); if (el) el.innerHTML = body(); };
    if (p.blob && !p.url) PB.store.blobGet(p.blob).then(function (data) { var im = document.querySelector('.pbbigimg'); if (im && data) im.src = data; });
  };
  act.sketch = function () {
    var strokes = [], cur = null, color = '#111', size = 4;
    U.modal('Sketch a floor plan', '<div class="pbsk"><div class="pbskbar">' + ['#111', '#d11', '#16c', '#0a0'].map(function (c) { return '<button data-sk="c" data-a="' + c + '" style="background:' + c + '"></button>'; }).join('') + '<button data-sk="s" data-a="3">Thin</button><button data-sk="s" data-a="7">Thick</button><button data-sk="u">Undo</button><button data-sk="x">Clear</button></div><canvas id="pbSk" width="1600" height="1100"></canvas></div>',
      [{ label: 'Cancel', cls: 'ghost' }, { label: 'Save sketch', cls: 'pri', fn: function (bg) { if (!strokes.length) return false; var data = bg.querySelector('#pbSk').toDataURL('image/jpeg', 0.85); PB.addPhoto(data, 'Floor plan / sketch', '').then(function () { render(); U.toast('Sketch saved with the photos', 'ok'); }); } }],
      { wide: true, sticky: true, nofocus: true });
    var cv = document.getElementById('pbSk'), g = cv.getContext('2d');
    var draw = function () { g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); g.strokeStyle = '#e3e7ee'; g.lineWidth = 1; for (var x = 50; x < cv.width; x += 50) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, cv.height); g.stroke(); } for (var y = 50; y < cv.height; y += 50) { g.beginPath(); g.moveTo(0, y); g.lineTo(cv.width, y); g.stroke(); } g.lineCap = g.lineJoin = 'round'; strokes.forEach(function (s) { g.strokeStyle = s.c; g.lineWidth = s.w; g.beginPath(); s.p.forEach(function (p, k) { if (k) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]); }); if (s.p.length === 1) g.lineTo(s.p[0][0] + 0.1, s.p[0][1]); g.stroke(); }); };
    var at = function (e) { var r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * cv.width / r.width, (e.clientY - r.top) * cv.height / r.height]; };
    cv.addEventListener('pointerdown', function (e) { e.preventDefault(); cv.setPointerCapture && cv.setPointerCapture(e.pointerId); cur = { c: color, w: size, p: [at(e)] }; strokes.push(cur); draw(); });
    cv.addEventListener('pointermove', function (e) { if (!cur) return; e.preventDefault(); cur.p.push(at(e)); draw(); });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (n) { cv.addEventListener(n, function () { cur = null; }); });
    cv.parentNode.addEventListener('click', function (e) { var b = e.target.closest('[data-sk]'); if (!b) return; var k = b.dataset.sk; if (k === 'c') color = b.dataset.a; if (k === 's') size = +b.dataset.a; if (k === 'u') strokes.pop(); if (k === 'x') strokes.length = 0; draw(); });
    draw();
  };

  // ----- finish: submit, or a reviewer's decision -----
  function finishView() {
    var d = PB.d, s = d.site, c = PB.check(d), h = formView('finish');
    if (d.state === 'draft') {
      h += '<h2 class="pbh">New or update</h2><div class="pbform">' + field('submit_type', S.site.submit_type, s, 'site') + field('replaces_site_id', Object.assign({}, S.site.replaces_site_id, { req: 0 }), s, 'site') + '</div>';
      h += '<h2 class="pbh">Ready to submit?</h2>' + (c.miss.length ? '<div class="pbneed"><b>Still needed</b><ul>' + c.miss.map(function (m) { return '<li>' + E(m) + '</li>'; }).join('') + '</ul></div>' : '<div class="pbok">' + I('check') + ' Everything required is filled in.</div>') + (c.warn.length ? '<div class="pbwarn"><b>Worth a second look</b><ul>' + c.warn.map(function (m) { return '<li>' + E(m) + '</li>'; }).join('') + '</ul></div>' : '');
      h += '<div class="row pbact"><button class="btn pri pbbig" data-pb="submit"' + (c.miss.length ? ' disabled' : '') + '>' + I('up') + 'Submit for review</button><button class="btn" data-pb="print">' + I('print') + 'Print</button><button class="btn ghost" data-pb="del">' + I('trash') + 'Delete this draft</button></div><p class="dim pbhelp">A reviewer checks it before it shows on the Command Board. ' + (navigator.onLine ? '' : 'There is no connection right now: it stays on this iPad until you submit.') + '</p>';
    } else if (d.state === 'submitted') {
      h += '<h2 class="pbh">Sent for review</h2><div class="pbok">' + I('check') + ' Submitted ' + E(CP.fmtDT(d.sub && d.sub.t)) + ' as <b>' + E(s.site_id) + '</b>. It shows on the Command Board once a reviewer approves it.</div>' + (d.sub && d.sub.pending ? '<div class="pbwarn"><b>' + d.sub.pending + ' photo' + (d.sub.pending > 1 ? 's' : '') + ' still to send</b>' + (d.sub.err ? '<br>' + E(d.sub.err) : '') + '</div>' : '') +
        '<div class="row pbact">' + (d.sub && d.sub.pending ? '<button class="btn pri" data-pb="submit">' + I('up') + 'Send the remaining photos</button>' : '') + '<button class="btn" data-pb="again">' + I('copy') + 'Start an update from this copy</button><button class="btn" data-pb="print">' + I('print') + 'Print</button><button class="btn ghost" data-pb="del">' + I('trash') + 'Remove from this iPad</button></div>';
    } else if (PB.ro) {
      h += '<h2 class="pbh">' + E(s.status || '') + '</h2><p class="dim pbhelp">' + E([s.reviewed_date ? 'Approved ' + when(s.reviewed_date) + (s.reviewer ? ' by ' + s.reviewer : '') : '', dueState(s)].filter(Boolean).join(' · ')) + '</p><div class="row pbact"><button class="btn pri" data-pb="again">' + I('copy') + 'Start an update</button><button class="btn" data-pb="print">' + I('print') + 'Print</button></div>';
    } else {
      h += '<h2 class="pbh">Review decision</h2><p class="dim pbhelp">Now: <b>' + E(d.remote.status) + '</b>' + (s.submit_type && s.submit_type !== 'New' ? ' · ' + E(s.submit_type) + ' of ' + E(s.replaces_site_id || s.site_id || '') : '') + (s.reviewed_date ? ' · last approved ' + E(when(s.reviewed_date)) : '') + '</p>' +
        '<div class="pbform">' + field('site_id', Object.assign({}, S.site.site_id, { hint: 'Change it only to fix a wrong ID.' }), s, 'site') + field('review_months', Object.assign({}, S.site.review_months, { hint: 'Blank means every 12 months.' }), s, 'site') + '<label class="f wide"><span>Reviewer notes (what to fix, if you send it back)</span><textarea class="in" id="pbNotes" data-f="site.review_notes" maxlength="1000">' + E(s.review_notes || '') + '</textarea></label></div>' +
        (c.miss.length ? '<div class="pbneed"><b>Missing</b><ul>' + c.miss.map(function (m) { return '<li>' + E(m) + '</li>'; }).join('') + '</ul></div>' : '') +
        '<div class="row pbact"><button class="btn pri pbbig" data-pb="decide" data-a="Approved"' + (c.miss.length ? ' disabled' : '') + '>' + I('check') + 'Approve</button><button class="btn" data-pb="decide" data-a="Needs Changes">Needs changes</button><button class="btn" data-pb="decide" data-a="save">Save my edits only</button><button class="btn ghost" data-pb="decide" data-a="Retired">Retire</button><button class="btn ghost" data-pb="print">' + I('print') + 'Print</button></div>' +
        '<p class="dim pbhelp">Approve puts it on the Command Board right away and releases every map feature, outline, hazmat row, contact and photo. If it is an update, the older version is retired in the same save. The Survey123 review form opens the same record, if you would rather review there.</p>';
    }
    return h;
  }
  var busy = false;
  act.submit = async function () {
    if (busy) return; if (!navigator.onLine) return U.toast('No connection. It is saved on this iPad; submit when you are back in range.', 'err', 6000);
    busy = true; wait('Sending…');
    try { var left = await PB.submit(PB.d); done(); U.toast(left ? 'Submitted. ' + left + ' photo' + (left > 1 ? 's' : '') + ' still to send: tap Send the remaining photos.' : 'Submitted for review as ' + E(PB.d.site.site_id), left ? 'err' : 'ok', 7000); PB.ro = true; }
    catch (e) { done(); U.toast(e.offline ? 'No connection. It is saved on this iPad; try again in range.' : 'Not submitted: ' + E(e.message), 'err', 8000); }
    busy = false; PB.lists = null; render();
  };
  act.decide = function (dec) {
    var d = PB.d, go = async function () {
      if (busy) return; busy = true; wait('Saving…');
      try { var r = await PB.decide(d, dec); done(); await PB.store.del(d.id).catch(function () {}); U.toast((dec === 'save' ? 'Edits saved' : dec === 'Approved' ? 'Approved' + (r.superseded ? ' · the older version was retired' : '') : dec === 'Retired' ? 'Retired' : 'Sent back for changes') + (r.photosLeft ? ' · ' + r.photosLeft + ' photo(s) did not upload; open it and save again' : ''), r.photosLeft ? 'err' : 'ok', 7000); busy = false; if (dec !== 'save') return act.home(); }
      catch (e) { done(); U.toast('Not saved: ' + E(e.offline ? 'no connection' : e.message), 'err', 8000); }
      busy = false; render();
    };
    if (dec === 'Needs Changes' && !String(d.site.review_notes || '').trim()) { U.toast('Say what needs to change in the reviewer notes first', 'err'); var n = document.getElementById('pbNotes'); if (n) n.focus(); return; }
    if (dec === 'Retired') return U.confirm('Retire this preplan?', 'It comes off the Command Board and the field view. The record is kept.', 'Retire', go, true);
    go();
  };
  act.again = async function () { try { wait('Copying…'); var d = await PB.updateFrom(PB.d); done(); await loadDrafts(); openDraft(d); U.toast('Update started. Change what is different, then submit.', 'ok', 6000); } catch (e) { done(); U.toast(E(e.message), 'err'); } };
  act.del = function () { var d = PB.d; U.confirm(d.state === 'submitted' ? 'Remove from this iPad?' : 'Delete this draft?', d.state === 'submitted' ? 'The submitted preplan stays in ArcGIS. Only this iPad\'s copy is removed.' : 'This draft and its photos are deleted from this iPad. This cannot be undone.', d.state === 'submitted' ? 'Remove' : 'Delete', async function () { for (var p of d.photos) if (p.blob) await PB.store.blobDel(p.blob).catch(function () {}); await PB.store.del(d.id); act.home(); }, true); };

  // ----- print -----
  PB.printHtml = async function (d) {
    var s = d.site, R = 6378137, mx = function (lng) { return R * lng * Math.PI / 180; }, my = function (lat) { return R * Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)); };
    var pts = d.feats.filter(function (f) { return f.ll; }).map(function (f) { return f.ll; }); d.outline.forEach(function (o) { pts = pts.concat(o.ring); }); if (d.ll) pts.push(d.ll);
    var map = '';
    if (pts.length) {
      var xs = pts.map(function (p) { return mx(p[1]); }), ys = pts.map(function (p) { return my(p[0]); }), W = 1000, H = 560, cx = (Math.min.apply(null, xs) + Math.max.apply(null, xs)) / 2, cy = (Math.min.apply(null, ys) + Math.max.apply(null, ys)) / 2;
      var w = Math.max((Math.max.apply(null, xs) - Math.min.apply(null, xs)) * 1.5, 140), hgt = Math.max((Math.max.apply(null, ys) - Math.min.apply(null, ys)) * 1.5, 140 * H / W); if (w / hgt > W / H) hgt = w * H / W; else w = hgt * W / H;
      var x0 = cx - w / 2, y1 = cy + hgt / 2, px = function (ll) { return [((mx(ll[1]) - x0) / w * 100).toFixed(2), ((y1 - my(ll[0])) / hgt * 100).toFixed(2)]; };
      map = '<div class="map"><img src="https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?bbox=' + [x0, cy - hgt / 2, x0 + w, y1].join(',') + '&bboxSR=3857&imageSR=3857&size=' + W + ',' + H + '&format=jpg&f=image" alt="">' +
        '<svg viewBox="0 0 100 100" preserveAspectRatio="none">' + d.outline.map(function (o) { return '<polygon points="' + o.ring.map(function (p) { return px(p).join(','); }).join(' ') + '" fill="rgba(253,184,51,.15)" stroke="#FDB833" stroke-width=".4" vector-effect="non-scaling-stroke"/>'; }).join('') + '</svg>' +
        (d.ll ? '<i class="mk pin" style="left:' + px(d.ll)[0] + '%;top:' + px(d.ll)[1] + '%">★</i>' : '') + d.feats.filter(function (f) { return f.ll; }).map(function (f, k) { var p = px(f.ll), ft = FT[f.feature_type] || FT.note; return '<i class="mk" style="left:' + p[0] + '%;top:' + p[1] + '%;background:' + (ft.shape === 'side' ? '#FDB833' : ft.color) + '">' + E(ft.short) + '</i>'; }).join('') + '</div>';
    }
    var row = function (l, v) { return v == null || v === '' ? '' : '<tr><th>' + E(l) + '</th><td>' + E(v) + '</td></tr>'; }, tbl = function (keys) { return '<table>' + keys.map(function (k) { var f = S.site[k], v = s[k]; return row(f.l, f.dom ? label(f.dom, v) : f.t === 'T' ? when(v) : v); }).join('') + '</table>'; };
    var imgs = []; for (var p of d.photos) { var src = p.url || (p.blob ? await PB.store.blobGet(p.blob).catch(function () { return null; }) : null) || p.th; if (src) imgs.push('<figure><img src="' + E(src) + '" alt=""><figcaption><b>' + E(p.photo_view || '') + '</b> ' + E(p.photo_caption || '') + '</figcaption></figure>'); }
    var feats = d.feats.filter(function (f) { return !/^side_/.test(f.feature_type); });
    return '<!doctype html><html><head><meta charset="utf-8"><title>Preplan ' + E(s.site_id || '') + ' ' + E(s.site_name || '') + '</title><style>body{font:12px/1.35 Arial,sans-serif;color:#111;margin:22px}h1{font:800 22px Arial;margin:0}h2{font:700 12px Arial;margin:14px 0 5px;padding:3px 6px;background:#0B1A2B;color:#fff;text-transform:uppercase;letter-spacing:.5px}h2.red{background:#C62828}h2.gold{background:#8A5A00}.k{font:700 10px Arial;letter-spacing:1px;color:#C62828}.top{display:flex;justify-content:space-between;gap:12px;border-bottom:3px solid #FDB833;padding-bottom:6px;margin-bottom:8px}.top .id{text-align:right;font:800 18px Arial;white-space:nowrap}.top .id span{display:block;font:400 11px Arial;color:#555}table{width:100%;border-collapse:collapse}th{text-align:left;width:30%;color:#555;font-weight:600;vertical-align:top;padding:2px 8px 2px 0}td{padding:2px 0;border-bottom:1px solid #ddd;white-space:pre-wrap}.cols{display:grid;grid-template-columns:1fr 1fr;gap:0 18px}.note{background:#FFF6E0;border-left:4px solid #FDB833;padding:6px 8px;font-weight:700;white-space:pre-wrap}.map{position:relative;width:100%;aspect-ratio:1000/560;background:#ccd;overflow:hidden;margin:6px 0}.map img,.map svg{position:absolute;inset:0;width:100%;height:100%}.mk{position:absolute;transform:translate(-50%,-50%);font:800 9px Arial;font-style:normal;color:#111;border:1.5px solid #111;border-radius:4px;padding:1px 3px;min-width:10px;text-align:center}.mk.pin{background:#FDB833;border-radius:50%}figure{display:inline-block;width:48%;margin:0 1% 8px 0;vertical-align:top;break-inside:avoid}figure img{width:100%;max-height:330px;object-fit:contain;border:1px solid #ccc}figcaption{font-size:11px}.foot{margin-top:12px;font-size:10px;color:#555}@media print{h2,.note,.mk{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body>' +
      '<div class="k">BOTETOURT COUNTY FIRE &amp; EMS · BEACON FIRE PREPLAN · FOR FIRE / EMS USE ONLY</div><div class="top"><div><h1>' + E(s.site_name || '') + '</h1><div>' + E([s.address, s.community].filter(Boolean).join(' · ')) + '</div><div><b>' + E(s.occupancy || '') + '</b> ' + E(s.occupancy_detail || '') + (s.target_hazard === 'Yes' ? ' · <b style="color:#C62828">TARGET HAZARD</b>' : '') + '</div></div><div class="id">' + E(s.site_id || '') + '<span>' + E(s.status || (d.state === 'draft' ? 'Draft' : 'Submitted')) + (s.first_due ? ' · first due ' + E(s.first_due) : '') + '</span></div></div>' +
      (s.tactical_notes ? '<h2 class="gold">First-due considerations</h2><div class="note">' + E(s.tactical_notes) + '</div>' : '') + map +
      '<div class="cols"><div><h2>Building</h2>' + tbl(['construction', 'roof', 'roof_struct', 'stories_above', 'stories_below', 'footprint_sqft', 'total_sqft', 'fire_flow_gpm', 'occ_day', 'occ_night', 'hours', 'occupant_notes']) + '</div><div><h2>Fire protection</h2>' + tbl(['sprinkler', 'sprinkler_type', 'standpipe', 'fire_pump', 'alarm', 'facp_location', 'riser_location', 'fdc_location']) + '</div></div>' +
      '<div class="cols"><div><h2>Water and access</h2>' + tbl(['water_supply', 'water_notes', 'access_notes', 'knox_location', 'gate_code', 'utility_notes']) + '</div><div><h2 class="red">Hazards</h2>' + tbl(['solar_pv', 'ess_battery', 'hazmat', 'tier2', 'hazard_notes']) + '</div></div>' +
      (d.haz.length ? '<h2 class="red">Hazardous materials</h2><table>' + d.haz.map(function (x) { return row(x.material, [x.un_number ? 'UN ' + x.un_number : '', x.erg_guide ? 'ERG ' + x.erg_guide : '', x.quantity, x.haz_location, (x.nfpa_h || x.nfpa_f || x.nfpa_i) ? '704: ' + [x.nfpa_h, x.nfpa_f, x.nfpa_i].map(function (v) { return v == null ? '-' : v; }).join('-') : '', x.haz_notes].filter(Boolean).join(' · ') || ' '); }).join('') + '</table>' : '') +
      (feats.length ? '<h2>Map features</h2><table>' + feats.map(function (f) { return row((FT[f.feature_type] || FT.note).short + '  ' + (FT[f.feature_type] || FT.note).name, [f.feat_label, f.feat_details, f.feat_floor ? 'floor ' + f.feat_floor : ''].filter(Boolean).join(' · ') || ' '); }).join('') + '</table>' : '') +
      (d.contacts.length ? '<h2>Contacts and key holders</h2><table>' + d.contacts.map(function (x) { return row(label('contact_role', x.contact_role), [x.contact_name, x.contact_phone, x.contact_phone2, x.available_24h === 'Yes' ? '24/7' : '', x.contact_notes].filter(Boolean).join(' · ')); }).join('') + '</table>' : '') +
      (imgs.length ? '<h2>Photos</h2>' + imgs.join('') : '') +
      '<div class="foot">' + E(s.site_id || '') + ' · Walked ' + E(when(s.prepared_date)) + ' by ' + E([s.prepared_by, s.prepared_unit].filter(Boolean).join(', ')) + (s.reviewed_date ? ' · Approved ' + E(when(s.reviewed_date)) + (s.reviewer ? ' (' + E(s.reviewer) + ')' : '') : '') + ' · Printed ' + E(when(Date.now())) + '</div></body></html>';
  };
  act.print = async function () { var html = await PB.printHtml(PB.d), w = window.open('', '_blank'); if (w) { w.document.write(html + '<script>setTimeout(function(){print()},700)<\/script>'); w.document.close(); } else { U.download('Preplan ' + (PB.d.site.site_id || '') + '.html', html, 'text/html'); U.toast('Downloaded. Open it and print.', 'ok', 6000); } };

  // ----- moving around -----
  async function loadDrafts() { try { PB.drafts = await PB.store.all(); } catch (e) { PB.drafts = []; PB.saveErr = e.message; } }
  function openDraft(d, ro) { PB.d = d; PB.view = 'edit'; PB.ro = !!ro || d.state === 'submitted'; PB.tab = d.ll || d.state !== 'draft' ? 'map' : 'building'; PB.placing = d.ll || PB.ro ? null : 'pin'; PB.ring = null; PB.fit = true; history.replaceState(null, '', location.pathname); render(); window.scrollTo(0, 0); }
  act.open = function (id) { var d = PB.drafts.find(function (x) { return x.id === id; }); if (d) openDraft(d); };
  act.home = async function () { PB.view = 'home'; PB.d = null; PB.placing = null; PB.ring = null; history.replaceState(null, '', location.pathname); await loadDrafts(); render(); if (A.signedIn() && !PB.lists) refresh(); };
  act.tab = function (t) { PB.tab = t; PB.placing = null; PB.ring = null; render(); window.scrollTo(0, 0); };
  act.ltab = function (t) { PB.ltab = t; render(); };
  act.refresh = function () { PB.lists = null; PB.aud = null; render(); return refresh(); };
  act.signin = function () { A.signIn(); };
  act.seg = function (a) { if (PB.ro && !/^row\|/.test(a)) return; var p = a.split('|'), obj = p[0] === 'row' ? PB.rowTmp : PB.d.site; obj[p[1]] = obj[p[1]] === p[2] && !(S.site[p[1]] || {}).req ? '' : p[2]; if (p[0] === 'row') return PB.rowPaint && PB.rowPaint(); touch(true); render(); };
  act.new = function () {
    U.modal('New preplan', '<label class="f"><span>Building or business name</span><input class="in big" id="pbNewN" maxlength="120" placeholder="e.g. Daleville Hardware"></label><label class="f"><span>Street address, as dispatch would say it</span><input class="in big" id="pbNewA" maxlength="160" placeholder="e.g. 123 Roanoke Rd, Daleville"></label><p class="dim" style="font-size:13px">The app looks the address up to start the map there. You set the exact spot on the front door.</p>',
      [{ label: 'Cancel', cls: 'ghost' }, { label: 'Start', cls: 'pri', fn: function (bg) {
        var n = bg.querySelector('#pbNewN').value.trim(), a = bg.querySelector('#pbNewA').value.trim(); if (!n) { U.toast('Give the building a name', 'err'); return false; }
        var d = PB.blank(n, a); PB.store.put(d).then(function () { PB.drafts.push(d); openDraft(d); PB.tab = 'map'; render(); if (a && navigator.onLine) geocode(a).then(function (g) { if (g && PB.d === d && PB.map && !d.ll) { PB.map.setView(g, 19); U.toast('Map moved to the address. Tap the front door to set the pin.', 'ok', 6000); } }).catch(function () {}); });
      } }]);
  };
  function geocode(text) { return fetch(GEO + '/findAddressCandidates?' + new URLSearchParams({ f: 'json', countryCode: 'USA', location: GEO_NEAR, SingleLine: text, maxLocations: 1, outFields: 'Match_addr' })).then(function (r) { return r.json(); }).then(function (g) { var c = (g.candidates || [])[0]; return c && c.score >= 80 ? [+c.location.y.toFixed(6), +c.location.x.toFixed(6)] : null; }); }
  // open something that lives in ArcGIS: a reviewer edits it, anyone else with access reads it
  act.ropen = async function (gid) {
    if (!A.signedIn()) { U.toast('Sign in to open preplans from ArcGIS', 'err'); return; }
    try {
      wait('Opening…');
      var kind = PB.can.review ? 'review' : 'protected', local = await PB.store.get('rv:' + gkey(gid)).catch(function () { return null; }), d = await PB.loadRemote(gid, kind);
      done(); if (local && kind === 'review' && local.remote && local.remote.edit === d.remote.edit) { d = local; U.toast('Picked up your unsaved review edits from this iPad', 'ok', 5000); }
      openDraft(d, kind !== 'review');
    } catch (e) { done(); U.toast(E(e.offline ? 'No connection' : e.message), 'err', 6000); }
  };
  async function refresh() {
    if (!A.signedIn() || !(PB.can.review || PB.can.read)) return;
    try { PB.listErr = ''; await PB.fetchLists(); } catch (e) { PB.listErr = e.offline ? 'No connection. Lists load when you are back in range.' : e.message; }
    if (PB.view === 'home') render();
    if (PB.can.review && !PB.listErr) { try { await PB.audit(); } catch (e) { PB.aud = null; } if (PB.view === 'home') render(); }
  }
  act.fix = function () {
    var a = PB.aud; if (!a || !a.n) return;
    U.confirm('Fix these now?', E(audLines(a).join('. ')) + '. Older versions are set to Superseded and come off the Command Board and the field view; items of approved preplans are released. Nothing is deleted.', 'Fix now', async function () {
      if (busy) return; busy = true; wait('Fixing…');
      try { var r = await PB.repair(); done(); U.toast(r.n ? 'Fixed: ' + E(audLines(r).join('. ')) : 'Already in order', 'ok', 7000); } catch (e) { done(); U.toast('Not fixed: ' + E(e.offline ? 'no connection' : e.message), 'err', 8000); }
      busy = false; render(); refresh();
    });
  };
  async function access() { var ok = function (u) { return A.req(u, {}).then(function (j) { return !!(j && (j.layers || j.tables)); }, function () { return false; }); }; var r = await Promise.all([ok(URLS.review), ok(URLS.protected)]); PB.can = { review: r[0], read: r[1], checked: true }; }

  function render() {
    var m = document.getElementById('pbmain'); if (!m) return;
    try { m.innerHTML = PB.view === 'edit' && PB.d ? editor() : home(); } catch (e) { console.error(e); m.innerHTML = '<div class="pbhome"><div class="empty"><b>The app hit a display problem.</b><br>Nothing is lost: your work is saved on this iPad.<br><span class="mono dim">' + E(e && e.message) + '</span><div style="margin-top:10px"><button class="btn pri" onclick="location.reload()">Reload</button></div></div></div>'; return; }
    document.body.classList.toggle('pbfit', PB.view === 'edit' && PB.tab === 'map');
    if (PB.view === 'edit' && PB.tab === 'map') mapMount();
    paintSave();
    var hb = document.getElementById('pbHome'); if (hb) hb.style.visibility = PB.view === 'edit' ? 'visible' : 'hidden';
  }
  PB.render = render; PB.act = act;

  // ---------- events ----------
  function setF(el) {
    var p = el.dataset.f.split('.'), obj = p[0] === 'row' ? PB.rowTmp : PB.d && PB.d.site; if (!obj) return; var v = el.value;
    if (el.dataset.t === 'I') { v = v.replace(/[^\d-]/g, ''); v = v === '' ? null : parseInt(v, 10); if (isNaN(v)) v = null; }
    if (el.dataset.t === 'T') v = v ? new Date(v + 'T12:00:00').getTime() : null;
    obj[p[1]] = v; if (p[0] !== 'row') touch();
  }
  PB.wire = function () {
    document.addEventListener('click', function (e) {
      var el = e.target.closest('[data-pb]'); if (!el || el.disabled) return; var f = act[el.dataset.pb]; if (!f) return;
      e.preventDefault(); try { var r = f(el.dataset.a, el, e); if (r && r.catch) r.catch(function (er) { U.toast(E(er.message), 'err', 6000); }); } catch (er) { console.error(er); U.toast(E(er.message), 'err'); }
    });
    document.addEventListener('input', function (e) { var el = e.target; if (el.id === 'pbQ') { PB.q = el.value; clearTimeout(PB._qt); PB._qt = setTimeout(function () { render(); var q = document.getElementById('pbQ'); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }, 250); return; } if (el.dataset && el.dataset.f) setF(el); });
    document.addEventListener('change', function (e) { var el = e.target; if (!el.dataset || !el.dataset.f) return; setF(el); if (el.dataset.f.indexOf('row.') === 0) { if (el.dataset.re) PB.rowPaint && PB.rowPaint(); return; } touch(true); if (el.dataset.re || /footprint_sqft|site_name|address/.test(el.dataset.f)) render(); });
    window.addEventListener('online', function () { if (PB.view === 'home') render(); if (A.signedIn() && !PB.lists) refresh(); });
    window.addEventListener('offline', function () { if (PB.view === 'home') render(); });
    document.addEventListener('visibilitychange', function () { if (document.hidden && PB.d && !PB.ro) PB.save(); });
    window.addEventListener('pagehide', function () { if (PB.d && !PB.ro) PB.save(); });
    window.addEventListener('resize', function () { if (PB.map) setTimeout(function () { PB.map.invalidateSize(); }, 80); });
  };

  // ---------- boot ----------
  PB.boot = async function () {
    CP.me = CP.store.prefs().me || {};
    document.getElementById('app').innerHTML = '<header class="cbfire cbh2 pbhead"><div class="cbbadge"><img class="cbpatch" src="patch.png" alt="Botetourt County Fire &amp; EMS patch" onerror="this.onerror=null;this.src=\'seal.png\'"></div><div class="cblock"><div class="k">Botetourt County <i>·</i> BEACON</div><div class="t">Fire <i>&amp;</i> EMS <span>Preplan Builder</span></div></div><span class="sp" style="flex:1"></span><button class="btn cbhome" id="pbHome" data-pb="home" style="visibility:hidden">' + I('home') + '<span>All preplans</span></button></header><main id="pbmain" class="cbwrap"></main>';
    PB.wire();
    try { if (await A.handleRedirect() === 'away') return; } catch (e) {}
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}
    await loadDrafts(); render();
    var qs = new URLSearchParams(location.search), want = qs.get('review') || qs.get('open'), upd = qs.get('update');
    if (A.signedIn()) { await A.connect(); await access(); render(); refresh(); }
    if (want || upd) {
      if (!A.signedIn()) return U.confirm('Sign in to open it', 'That preplan is in ArcGIS. Sign in with your county ArcGIS account to open it.', 'Sign in', function () { A.signIn(); });
      if (upd) { try { wait('Copying the approved preplan…'); var src = await PB.loadRemote(upd, PB.can.review ? 'review' : 'protected'), d = await PB.updateFrom(src); done(); await loadDrafts(); openDraft(d); U.toast('Update started. Change what is different, then submit.', 'ok', 6000); } catch (e) { done(); U.toast(E(e.message), 'err', 6000); } }
      else await act.ropen(want);
    }
    // photos that did not get through last time go again quietly when there is a connection
    if (navigator.onLine) PB.drafts.filter(function (d) { return d.state === 'submitted' && d.sub && d.sub.pending; }).forEach(function (d) { layerIds(URLS.intake).then(function (ids) { return PB.sendPhotos(d, URLS.intake, ids); }).then(function () { if (PB.view === 'home') render(); }).catch(function () {}); });
  };
})(window.CP);
