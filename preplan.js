/* BEACON — Fire preplans on the Command Board (preplan.js)
   Preplans are built and approved in ArcGIS (Survey123 crew form -> Survey123 review form -> BOCO_Preplans). Nothing runs on
   a schedule. This file only reads them.
   - Finds the approved preplan for the incident: same address, or within 200 m of the incident pin. If an older version of
     the same preplan is still marked approved, the newest one is used.
   - "Load onto map" drops every preplan feature onto the board as the matching symbol (sides A-D, FDC, riser, Knox, shutoffs,
     hydrants, solar, hazards...), draws the building outline and logs it in the incident timeline.
   - "Preplan facts" shows construction, fire protection, water, hazards, hazmat, first-due notes, contacts and photos.
   Signed in and in the Preplans group: full preplan (BOCO_Preplans_Protected). Otherwise: the Tactical view, if it is shared.
   Offline: a copy of approved preplans (no Knox, codes, contacts or photos) is kept on the tablet and refreshed every 6 hours.
   Only what a reviewer has seen is shown: a map feature, outline, hazmat row, contact or photo counts when the review form
   stamped it Approved, or when it already existed the last time the reviewer saved the approved preplan. */
(function (CP) {
  'use strict';
  var A = CP.arc, U = CP.ui, E = CP.esc, I = U.icon;
  var C = (window.CP_CONFIG || {}).preplans || {};
  var B = 'https://services6.arcgis.com/6h5xc2eGkGuRiFia/arcgis/rest/services/';
  var SRC = { protected: C.protectedUrl || B + 'BOCO_Preplans_Protected/FeatureServer', tactical: C.tacticalUrl || B + 'BOCO_Preplans_Tactical/FeatureServer' };
  var NEAR_M = 200, CACHE_HOURS = 6, GRACE_MS = 120000;
  var PP = CP.preplan = { src: null, hits: null, key: '', busy: false, detail: {}, err: '' };
  var X; // bridge into the Command Board (set by cb.js)

  // feature_type code -> [board symbol key, default label]. Codes not listed use the same key on the board.
  var MAP = { standpipe: ['fdc', 'Standpipe'], hazstore: ['haz', 'Hazmat storage'] };
  var NAMES = { side_a: 'Side A', side_b: 'Side B', side_c: 'Side C', side_d: 'Side D', entry: 'Entry / FD access', fdc: 'FDC', standpipe: 'Standpipe outlet', riser: 'Sprinkler riser', facp: 'Fire alarm panel',
    knox: 'Knox box', elev: 'Elevator', stair: 'Stairwell', roof: 'Roof access', ug: 'Gas shutoff', ue: 'Electric shutoff', uw: 'Water shutoff', solar: 'Solar PV / rapid shutdown', ess: 'Battery storage (ESS)',
    gen: 'Generator', o2: 'Oxygen / medical gas', hazstore: 'Hazmat storage', haz: 'Hazard', water: 'Hydrant / water source', dump: 'Draft site', stg: 'Staging (preplanned)', icp: 'Command post (preplanned)', lz: 'Landing zone', exp: 'Exposure', note: 'Note' };
  // the field on each related table that the review form stamps with the preplan's status
  var STAMP = { Preplan_Features: 'feat_status', Preplan_Footprints: 'fp_status', Preplan_Hazmat: 'haz_status', Preplan_Contacts: 'contact_status', Preplan_Photos: 'photo_status' };

  var ABBR = [['NORTH', 'N'], ['SOUTH', 'S'], ['EAST', 'E'], ['WEST', 'W'], ['ROAD', 'RD'], ['STREET', 'ST'], ['AVENUE', 'AVE'], ['DRIVE', 'DR'], ['LANE', 'LN'], ['COURT', 'CT'], ['CIRCLE', 'CIR'],
    ['BOULEVARD', 'BLVD'], ['HIGHWAY', 'HWY'], ['PARKWAY', 'PKWY'], ['PLACE', 'PL'], ['TERRACE', 'TER'], ['TRAIL', 'TRL'], ['MOUNTAIN', 'MTN'], ['TURNPIKE', 'TPKE'], ['EXTENSION', 'EXT'], ['SUITE', 'STE'],
    ['APARTMENT', 'APT'], ['BUILDING', 'BLDG'], ['ROUTE', 'RT'], ['RTE', 'RT'], ['US HWY', 'US'], ['U S', 'US']];
  // '123 North Roanoke Road, Daleville VA' -> '123 N ROANOKE RD', so a CAD address and a crew-typed address compare equal
  PP.norm = function (s) {
    if (!s) return '';
    var t = String(s).toUpperCase().split(',')[0].replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    ABBR.forEach(function (a) { t = t.replace(new RegExp('\\b' + a[0] + '\\b', 'g'), a[1]); });
    return t.replace(/\b(VA|VIRGINIA)\b.*$/, '').replace(/\s+/g, ' ').trim();
  };
  function meters(a, b) { if (!a || !b) return 1e12; var r = Math.PI / 180, x = (b[1] - a[1]) * r * Math.cos((a[0] + b[0]) / 2 * r), y = (b[0] - a[0]) * r; return 6371000 * Math.hypot(x, y); }
  function like(s) { return String(s).replace(/'/g, "''").replace(/[%_\[\]]/g, ' '); }
  function gkey(g) { return String(g || '').toUpperCase().replace(/[{}]/g, ''); }
  function gidq(g) { return "parentglobalid = '" + String(g).replace(/[^0-9A-Fa-f{}-]/g, '') + "'"; }
  function ll(f) { return f && f.geometry && f.geometry.y != null ? [+f.geometry.y.toFixed(6), +f.geometry.x.toFixed(6)] : null; }
  function when(ms) { return ms ? new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : ''; }
  // has a reviewer seen this child record? (see the note at the top of the file)
  function seen(f, table, site) { var a = f.attributes || f; return a[STAMP[table]] === 'Approved' || (site.EditDate != null && a.CreationDate != null && a.CreationDate <= site.EditDate + GRACE_MS); }
  // several approved records with one preplan ID: an update was approved and the old version not yet retired. Newest wins.
  function newest(list) {
    var by = {}, out = [];
    list.forEach(function (h) { var k = String(h.a.site_id || '').toUpperCase(), t = h.a.reviewed_date || h.a.EditDate || 0; if (!k) return out.push(h); if (!by[k] || t > by[k].t) by[k] = { t: t, h: h }; });
    Object.keys(by).forEach(function (k) { out.push(by[k].h); }); return out;
  }
  function reviewState(s) {
    if (!s.reviewed_date) return '';
    var d = new Date(s.reviewed_date); d.setMonth(d.getMonth() + (+s.review_months || 12));
    return Date.now() > d.getTime() ? 'review overdue since ' + when(d.getTime()) : d.getTime() - Date.now() < 60 * 86400000 ? 'review due ' + when(d.getTime()) : '';
  }

  // ---------- where preplans come from ----------
  async function ids(base) { var j = await A.req(base, {}); var o = {}; (j.layers || []).concat(j.tables || []).forEach(function (x) { o[x.name] = x.id; }); if (o.Preplan_Sites == null) throw new Error('no Preplan_Sites'); return o; }
  async function source() {
    if (PP.src && Date.now() - PP.src.t < 30 * 60000) return PP.src;
    var order = A.signedIn() ? ['protected', 'tactical'] : ['tactical'];
    for (var k of order) { try { PP.src = { kind: k, base: SRC[k], ids: await ids(SRC[k]), t: Date.now() }; return PP.src; } catch (e) { PP.err = e.message; } }
    PP.src = null; return null;
  }
  function lyr(name) { return PP.src.base + '/' + PP.src.ids[name]; }
  function has(name) { return PP.src.ids[name] != null; }

  // ---------- offline copy (approved preplans, no Knox / codes / contacts / photos) ----------
  var DBP = null;
  function db() { return DBP || (DBP = new Promise(function (ok, no) { try { var r = indexedDB.open('beacon-preplans', 2); r.onupgradeneeded = function () { if (!r.result.objectStoreNames || !r.result.objectStoreNames.contains('c')) r.result.createObjectStore('c'); }; r.onsuccess = function () { ok(r.result); }; r.onerror = function () { no(r.error); }; } catch (e) { no(e); } })); }
  function cget() { return db().then(function (d) { return new Promise(function (ok) { var q = d.transaction('c').objectStore('c').get('v2'); q.onsuccess = function () { ok(q.result || null); }; q.onerror = function () { ok(null); }; }); }).catch(function () { return null; }); }
  function cput(v) { return db().then(function (d) { return new Promise(function (ok) { var tx = d.transaction('c', 'readwrite'); tx.objectStore('c').put(v, 'v2'); tx.oncomplete = ok; tx.onerror = ok; }); }).catch(function () {}); }
  var SAFE_SITE = 'OBJECTID,GlobalID,EditDate,site_id,status,site_name,address,community,first_due,occupancy,occupancy_detail,target_hazard,restricted,construction,roof,roof_struct,stories_above,stories_below,footprint_sqft,total_sqft,fire_flow_gpm,occ_day,occ_night,hours,sprinkler,sprinkler_type,standpipe,fire_pump,alarm,facp_location,riser_location,fdc_location,water_supply,water_notes,access_notes,utility_notes,solar_pv,ess_battery,hazmat,tier2,hazard_notes,tactical_notes,reviewed_date,review_months';
  PP.refreshCache = async function (force) {
    if (!navigator.onLine) return;
    var c = await cget(); if (!force && c && Date.now() - c.t < CACHE_HOURS * 3600e3) return;
    if (!(await source())) return;
    try {
      var s = await A.query(lyr('Preplan_Sites'), "status = 'Approved'", { geom: true, fields: SAFE_SITE, n: 4000 }), site = {};
      s.forEach(function (f) { site[gkey(f.attributes.GlobalID)] = f.attributes; });
      var keep = function (table) { return function (f) { var p = site[gkey(f.attributes.parentglobalid)]; return !!p && seen(f, table, p); }; };
      var f = (await A.query(lyr('Preplan_Features'), "feat_sensitive = 'No' AND feature_type <> 'knox'", { geom: true, fields: 'OBJECTID,parentglobalid,CreationDate,feature_type,feat_label,feat_details,feat_floor,feat_status', n: 20000 })).filter(keep('Preplan_Features'));
      var fp = has('Preplan_Footprints') ? (await A.query(lyr('Preplan_Footprints'), '1=1', { geom: true, fields: 'OBJECTID,parentglobalid,CreationDate,fp_label,fp_status', n: 4000 })).filter(keep('Preplan_Footprints')) : [];
      var hz = has('Preplan_Hazmat') ? (await A.query(lyr('Preplan_Hazmat'), '1=1', { fields: 'OBJECTID,parentglobalid,CreationDate,material,un_number,erg_guide,quantity,haz_location,nfpa_h,nfpa_f,nfpa_i,nfpa_s,haz_notes,haz_status', n: 10000 })).filter(keep('Preplan_Hazmat')) : [];
      await cput({ t: Date.now(), sites: s, feats: f, foot: fp, haz: hz });
    } catch (e) { console.warn('preplan cache', e); }
  };

  // ---------- find the preplan for this incident ----------
  function incKey() { var i = X.inc(); if (!i) return ''; var c = X.incLL(); return i.id + '|' + (c ? c.join() : '') + '|' + PP.norm(i.location.desc); }
  PP.check = function () {
    if (!X || !X.inc() || PP.busy) return;
    var k = incKey(); if (k === PP.key) return; PP.key = k; PP.busy = true;
    find().then(function (h) { PP.hits = h; }).catch(function (e) { PP.hits = []; PP.err = e.message; }).then(function () { PP.busy = false; if (incKey() !== PP.key) return PP.check(); X.render(); });
  };
  async function find() {
    var i = X.inc(), c = X.incLL(), a = PP.norm(i.location.desc), out = {};
    var add = function (f, off) { var at = f.attributes, p = ll(f), d = c && p ? meters(c, p) : null, same = !!a && PP.norm(at.address) === a; if (at.status !== 'Approved' || (!same && (d == null || d > NEAR_M))) return; out[at.GlobalID] = { a: at, ll: p, m: d, same: same, off: !!off }; };
    var online = navigator.onLine && await source();
    if (online) {
      try {
        var qs = [], num = /^(\d+[A-Z]?)\s/.exec(a), start = num ? num[1] + ' ' : String(i.location.desc || '').toUpperCase().trim().split(/[\s,]+/)[0];
        if (c) qs.push(A.query(lyr('Preplan_Sites'), "status = 'Approved'", { geom: true, n: 25, extra: { geometry: JSON.stringify({ x: c[1], y: c[0], spatialReference: { wkid: 4326 } }), geometryType: 'esriGeometryPoint', inSR: 4326, distance: NEAR_M, units: 'esriSRUnit_Meter', spatialRel: 'esriSpatialRelIntersects' } }));
        // same street number (or the same opening letters) is enough to fetch candidates; the exact comparison is done here
        if (a && start.length > 1) qs.push(A.query(lyr('Preplan_Sites'), "status = 'Approved' AND UPPER(address) LIKE '" + like(start) + "%'", { geom: true, n: 100 }));
        (await Promise.all(qs)).forEach(function (fs) { fs.forEach(function (f) { add(f); }); });
      } catch (e) { online = false; PP.err = e.message; }
    }
    if (!online) { var cc = await cget(); if (cc) cc.sites.forEach(function (f) { add(f, true); }); }
    PP.refreshCache();
    return newest(Object.keys(out).map(function (k) { return out[k]; })).sort(function (x, y) { return (y.same - x.same) || ((x.m == null ? 1e9 : x.m) - (y.m == null ? 1e9 : y.m)); });
  }

  // ---------- full detail for one preplan ----------
  async function detail(h) {
    var g = h.a.GlobalID; if (PP.detail[g] && Date.now() - PP.detail[g].t < 10 * 60000) return PP.detail[g];
    var d = { t: Date.now(), site: h.a, ll: h.ll, feats: [], foot: [], haz: [], contacts: [], photos: [], off: false };
    if (navigator.onLine && await source()) {
      try {
        var w = gidq(g), s = await A.query(lyr('Preplan_Sites'), "GlobalID = '" + g.replace(/[^0-9A-Fa-f{}-]/g, '') + "'", { geom: true, n: 1 });
        if (s[0]) { d.site = s[0].attributes; d.ll = ll(s[0]) || d.ll; }
        var get = function (t, geom) { return has(t) ? A.query(lyr(t), w, { geom: !!geom, n: 500 }).then(function (r) { return r.filter(function (f) { return seen(f, t, d.site); }); }) : Promise.resolve([]); };
        var R = await Promise.all([get('Preplan_Features', 1), get('Preplan_Footprints', 1), get('Preplan_Hazmat'), get('Preplan_Contacts'), get('Preplan_Photos')]);
        d.feats = R[0]; d.foot = R[1]; d.haz = R[2].map(function (f) { return f.attributes; }); d.contacts = R[3].map(function (f) { return f.attributes; });
        if (R[4].length) {
          var pl = lyr('Preplan_Photos'), oids = R[4].map(function (f) { return f.attributes.OBJECTID; });
          var qa = await A.req(pl + '/queryAttachments', { objectIds: oids.join(','), returnUrl: true }).catch(function () { return { attachmentGroups: [] }; });
          var tok = await A.token(); var by = {}; R[4].forEach(function (f) { by[f.attributes.OBJECTID] = f.attributes; });
          (qa.attachmentGroups || []).forEach(function (gp) { (gp.attachmentInfos || []).forEach(function (ai) { var p = by[gp.parentObjectId] || {}; d.photos.push({ view: p.photo_view, caption: p.photo_caption, url: pl + '/' + gp.parentObjectId + '/attachments/' + ai.id + (tok ? '?token=' + encodeURIComponent(tok) : '') }); }); });
        }
        PP.detail[g] = d; return d;
      } catch (e) { console.warn('preplan detail', e); }
    }
    var c = await cget(); d.off = true;
    if (c) { var m = function (f) { return gkey(f.attributes.parentglobalid) === gkey(g); }; var cs = c.sites.find(function (f) { return gkey(f.attributes.GlobalID) === gkey(g); }); if (cs) { d.site = cs.attributes; d.ll = ll(cs) || d.ll; }
      d.feats = c.feats.filter(m); d.foot = (c.foot || []).filter(m); d.haz = (c.haz || []).filter(m).map(function (f) { return f.attributes; }); }
    return d;
  }

  // ---------- put it on the board ----------
  function loaded() { var p = X.kv('preplan', null); return p && p.gid ? p : null; }
  async function load(h, replace) {
    var d = await detail(h), i = X.inc(), n = 0, sd = Object.assign({}, X.sides()), sidesSet = [], miss = 0;
    if (replace) { (i.cbSym || []).forEach(function (o) { if (o.pp && !o.del) { o.del = true; o.u = CP.now(); } }); }
    d.feats.forEach(function (f) {
      var a = f.attributes, p = ll(f); if (!p) { miss++; return; }
      var code = a.feature_type || 'note';
      if (/^side_[abcd]$/.test(code)) { var s = code.slice(5).toUpperCase(); sd[s] = { ll: p, t: CP.now(), by: (CP.me.name || '') + ' (preplan)' }; sidesSet.push(s); return; }
      var m = MAP[code] || [code, ''], key = X.symDef(m[0]).code === '?' ? 'note' : m[0];
      var lbl = (a.feat_label || m[1] || (key === 'note' ? NAMES[code] || code : '') || '').slice(0, 40);
      X.addSym(key, p, lbl); n++;
    });
    if (sidesSet.length) X.setKV('sides', sd);
    if (!X.incLL() && d.ll) { i.location.lat = d.ll[0]; i.location.lng = d.ll[1]; CP.touch(i, 'location'); }
    var s = d.site;
    X.setKV('preplan', { gid: s.GlobalID, id: s.site_id, appr: s.reviewed_date || null, name: s.site_name, addr: s.address, at: CP.now(), by: CP.me.name || '', n: n, src: d.off ? 'offline copy' : PP.src && PP.src.kind });
    CP.touch(i, 'cbSym');
    var hz = [], yes = function (v) { return v === 'Yes'; };
    if (yes(s.solar_pv)) hz.push('solar PV'); if (yes(s.ess_battery)) hz.push('battery storage'); if (yes(s.hazmat) || d.haz.length) hz.push('hazmat on site' + (d.haz.length ? ' (' + d.haz.map(function (x) { return x.material; }).slice(0, 4).join(', ') + ')' : ''));
    if (/truss|I-joist|bar joist/i.test(s.roof_struct || '')) hz.push(s.roof_struct.toLowerCase());
    X.commit('Preplan ' + (s.site_id || '') + ' loaded (' + (s.site_name || '') + (s.reviewed_date ? ', approved ' + when(s.reviewed_date) : '') + '): ' + n + ' map symbol' + (n === 1 ? '' : 's') + (sidesSet.length ? ', sides ' + sidesSet.sort().join('') : '') + (d.off ? ' · from the offline copy' : ''), 'Event');
    if (hz.length || s.tactical_notes) X.commit('Preplan hazards: ' + (hz.join('; ') || 'none listed') + (s.tactical_notes ? ' · First due: ' + String(s.tactical_notes).slice(0, 300) : ''), 'Safety', true);
    U.toast('Preplan loaded: ' + n + ' symbols' + (sidesSet.length ? ' and sides ' + sidesSet.join('') : '') + (miss ? ' (' + miss + ' without a location skipped)' : ''), 'ok', 6000);
    PP.cur = d; PP.fitPending = true; X.render();
  }
  function removeSyms() {
    var i = X.inc(), n = 0; (i.cbSym || []).forEach(function (o) { if (o.pp && !o.del) { o.del = true; o.u = CP.now(); n++; } });
    var p = loaded(); X.setKV('preplan', null); CP.touch(i, 'cbSym');
    X.commit('Preplan ' + (p ? p.id : '') + ' removed from the map (' + n + ' symbols). Sides A–D left as placed.', 'Event');
  }

  // ---------- facts ----------
  function row(l, v) { return v == null || v === '' ? '' : '<tr><th>' + E(l) + '</th><td>' + E(v) + '</td></tr>'; }
  function factsHtml(d) {
    var s = d.site, sp = [s.sprinkler, s.sprinkler_type].filter(Boolean).join(' · '), rs = reviewState(s);
    var h = '<div class="ppfacts">' + (d.off ? '<div class="warnbox">Offline copy: Knox box, codes, contacts and photos are not stored on the tablet.</div>' : '') +
      '<div class="pphead"><b>' + E(s.site_name || '') + '</b><span>' + E(s.address || '') + '</span><em>' + E(s.site_id || '') + (s.target_hazard === 'Yes' ? ' · TARGET HAZARD' : '') + '</em></div>' +
      (s.tactical_notes ? '<div class="ppnote"><b>First-due considerations</b>' + E(s.tactical_notes) + '</div>' : '') +
      (s.hazard_notes ? '<div class="ppnote red"><b>Special hazards</b>' + E(s.hazard_notes) + '</div>' : '') +
      '<table class="pptab">' + row('Occupancy', [s.occupancy, s.occupancy_detail].filter(Boolean).join(' · ')) + row('Construction', s.construction) + row('Roof', [s.roof, s.roof_struct].filter(Boolean).join(' · ')) +
      row('Stories', s.stories_above != null ? s.stories_above + ' above' + (s.stories_below ? ' · ' + s.stories_below + ' below' : '') : '') + row('Area', s.footprint_sqft ? s.footprint_sqft + ' sq ft largest floor' + (s.total_sqft ? ' · ' + s.total_sqft + ' total' : '') : '') +
      row('Fire flow', s.fire_flow_gpm ? s.fire_flow_gpm + ' gpm at 100% of one floor · ' + Math.round(s.fire_flow_gpm / 4) + ' gpm at 25%' : '') + row('Occupants', s.occ_day != null || s.occ_night != null ? 'day ' + (s.occ_day == null ? '?' : s.occ_day) + ' · night ' + (s.occ_night == null ? '?' : s.occ_night) : '') +
      row('Needs help to leave', s.occupant_notes) + row('Sprinklers', sp) + row('Standpipe', s.standpipe) + row('Fire pump', s.fire_pump) + row('Fire alarm', s.alarm) + row('Alarm panel', s.facp_location) + row('Riser', s.riser_location) + row('FDC', s.fdc_location) +
      row('Water supply', s.water_supply) + row('Water notes', s.water_notes) + row('Access', s.access_notes) + row('Knox box', s.knox_location) + row('Gate / door code', s.gate_code) + row('Utilities', s.utility_notes) +
      row('Solar / battery', [s.solar_pv === 'Yes' ? 'Solar PV' : '', s.ess_battery === 'Yes' ? 'Battery storage' : ''].filter(Boolean).join(' · ')) + row('First due', s.first_due) + row('Hours', s.hours) + '</table>';
    if (d.haz.length) h += '<h4>Hazardous materials</h4><table class="pptab">' + d.haz.map(function (x) { return '<tr><th>' + E(x.material) + '</th><td>' + E([x.un_number ? 'UN ' + x.un_number : '', x.erg_guide ? 'ERG ' + x.erg_guide : '', x.quantity, x.haz_location, (x.nfpa_h || x.nfpa_f || x.nfpa_i) ? '704: ' + [x.nfpa_h, x.nfpa_f, x.nfpa_i].map(function (v) { return v == null ? '-' : v; }).join('-') + (x.nfpa_s && x.nfpa_s !== 'None' ? ' ' + x.nfpa_s : '') : '', x.haz_notes].filter(Boolean).join(' · ')) + '</td></tr>'; }).join('') + '</table>';
    if (d.contacts.length) h += '<h4>Contacts and key holders</h4><table class="pptab">' + d.contacts.map(function (x) { var tel = function (n) { return n ? '<a href="tel:' + E(String(n).replace(/[^\d+]/g, '')) + '">' + E(n) + '</a>' : ''; }; return '<tr><th>' + E(x.contact_role || '') + '</th><td><b>' + E(x.contact_name || '') + '</b> ' + tel(x.contact_phone) + (x.contact_phone2 ? ' · ' + tel(x.contact_phone2) : '') + (x.available_24h === 'Yes' ? ' · 24/7' : '') + (x.contact_notes ? '<br><span class="dim">' + E(x.contact_notes) + '</span>' : '') + '</td></tr>'; }).join('') + '</table>';
    var feats = d.feats.map(function (f) { return f.attributes; }).filter(function (a) { return !/^side_/.test(a.feature_type); });
    if (feats.length) h += '<h4>Map features</h4><table class="pptab">' + feats.map(function (a) { return '<tr><th>' + E(NAMES[a.feature_type] || a.feature_type) + '</th><td>' + E([a.feat_label, a.feat_details, a.feat_floor ? 'floor ' + a.feat_floor : ''].filter(Boolean).join(' · ')) + '</td></tr>'; }).join('') + '</table>';
    if (d.photos.length) h += '<h4>Photos</h4><div class="ppphotos">' + d.photos.map(function (p) { return '<a href="' + E(p.url) + '" target="_blank" rel="noopener"><img loading="lazy" src="' + E(p.url) + '" alt=""><span>' + E([p.view, p.caption].filter(Boolean).join(' · ')) + '</span></a>'; }).join('') + '</div>';
    h += '<p class="dim" style="font-size:12px;margin-top:10px">' + (s.reviewed_date ? 'Approved ' + E(when(s.reviewed_date)) : 'Approved') + (rs ? ' · ' + E(rs) : '') + ' · Source: ' + E(d.off ? 'offline copy' : PP.src ? (PP.src.kind === 'protected' ? 'full preplan' : 'field view (no Knox, codes, contacts or photos)') : '') + '</p></div>';
    return h;
  }
  async function facts(h) {
    var d = await detail(h);
    U.modal('Preplan · ' + (d.site.site_name || ''), factsHtml(d), [{ label: 'Close', cls: 'ghost' }].concat(X.ro() || loaded() ? [] : [{ label: I('pin') + 'Load onto map', cls: 'pri', fn: function () { load(h); } }]));
  }

  // ---------- what the board shows ----------
  function hitFor(gid) { return (PP.hits || []).find(function (h) { return h.a.GlobalID === gid; }) || (PP.cur && PP.cur.site.GlobalID === gid ? { a: PP.cur.site, ll: PP.cur.ll } : null); }
  function dist(h) { return h.same ? 'same address' : h.m != null ? Math.round(h.m * 3.281) + ' ft away' : ''; }
  // compact bar for the board's center column
  PP.banner = function () {
    if (!X || !X.inc()) return ''; PP.check();
    var p = loaded();
    if (p) return '<div class="ppbar on"><span>' + I('brief') + '<b>Preplan ' + E(p.id || '') + '</b> ' + E(p.name || '') + '</span><button class="btn sm" data-cb="pp" data-a="facts:' + E(p.gid) + '">Facts</button></div>';
    var h = (PP.hits || [])[0]; if (!h) return '';
    return '<div class="ppbar"><span>' + I('brief') + '<b>Preplan on file</b> ' + E(h.a.site_name || '') + ' · ' + E(dist(h)) + (h.off ? ' · offline copy' : '') + '</span><span class="ppb"><button class="btn sm ghost" data-cb="pp" data-a="facts:' + E(h.a.GlobalID) + '">Facts</button>' + (X.ro() ? '' : '<button class="btn sm pri" data-cb="pp" data-a="load:' + E(h.a.GlobalID) + '">Load onto map</button>') + '</span></div>';
  };
  // section for the map tab's side panel
  PP.panel = function () {
    if (!X || !X.inc()) return ''; PP.check();
    var p = loaded(), h = '<div class="cbh sm">Preplan</div>';
    if (p) return h + '<div class="pprow on"><b>' + E(p.id || '') + '</b><span>' + E(p.name || '') + ' · ' + (p.n || 0) + ' symbols</span></div><div class="cbbtns"><button data-cb="pp" data-a="facts:' + E(p.gid) + '">' + I('brief') + 'Preplan facts</button><button data-cb="pp" data-a="remove">' + I('trash') + 'Remove its symbols</button></div>';
    if (PP.busy && PP.hits == null) return h + '<div class="dim cbempty">Looking for a preplan…</div>';
    if (!(PP.hits || []).length) return h + '<div class="dim cbempty">' + (X.incLL() || X.inc().location.desc ? 'No approved preplan at this address or within ' + Math.round(NEAR_M * 3.281) + ' ft.' : 'Set the incident location to look for a preplan.') + (!PP.src && navigator.onLine && !A.signedIn() ? ' Sign in to see preplans.' : '') + '</div>';
    return h + PP.hits.slice(0, 3).map(function (x) { return '<div class="pprow"><b>' + E(x.a.site_name || '') + '</b><span>' + E(x.a.address || '') + ' · ' + E(dist(x)) + '</span><div class="cbbtns"><button data-cb="pp" data-a="facts:' + E(x.a.GlobalID) + '">' + I('brief') + 'Facts</button><button class="on" data-cb="pp" data-a="load:' + E(x.a.GlobalID) + '">' + I('pin') + 'Load onto map</button></div></div>'; }).join('');
  };
  // building outlines on the board map (drawn, not saved into the incident)
  PP.draw = function (layer) {
    var p = loaded(); if (!p || !window.L) return;
    if (PP.fitPending && X.fit) { PP.fitPending = false; setTimeout(X.fit, 200); } // first look at the map after a load: show the whole building
    var d = PP.detail[p.gid] || (PP.cur && PP.cur.site.GlobalID === p.gid ? PP.cur : null);
    if (!d) { if (!PP._drawWait) { PP._drawWait = 1; detail({ a: { GlobalID: p.gid }, ll: null }).then(function () { PP._drawWait = 0; X.render(); }).catch(function () { PP._drawWait = 0; }); } return; }
    d.foot.forEach(function (f) { var r = f.geometry && f.geometry.rings; if (!r) return; layer.addLayer(window.L.polygon(r.map(function (ring) { return ring.map(function (c) { return [c[1], c[0]]; }); }), { color: '#FDB833', weight: 3, fillColor: '#FDB833', fillOpacity: 0.08, interactive: false, dashArray: '8 5' })); });
  };
  PP.act = function (a) {
    var m = String(a || '').split(':'), op = m[0], g = m.slice(1).join(':');
    if (op === 'remove') return U.confirm('Remove preplan symbols?', 'Takes the symbols this preplan placed off the map. Symbols placed by hand and sides A–D stay.', 'Remove', removeSyms);
    var h = hitFor(g) || { a: { GlobalID: g }, ll: null };
    if (op === 'facts') return facts(h);
    if (op === 'load') {
      var cur = loaded();
      if (cur && cur.gid === g) return U.confirm('Load the preplan again?', 'Replaces the symbols this preplan placed earlier with a fresh copy.', 'Reload', function () { load(h, true); });
      if (cur) return U.confirm('Another preplan is loaded', 'Remove ' + (cur.name || 'it') + ' from the map and load this one?', 'Swap', function () { load(h, true); });
      return load(h);
    }
  };
  PP.connect = function (bridge) { X = bridge; if (navigator.onLine) setTimeout(function () { PP.refreshCache(); }, 8000); window.addEventListener('online', function () { PP.src = null; PP.key = ''; PP.refreshCache(); }); };
})(window.CP);
