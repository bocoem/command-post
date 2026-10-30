/* EM OPS — shared engine for the county Ops tools.
   Shell (same look as Command Post), ArcGIS services (create, upgrade, share, web map), incident context shared with Command Post,
   generic ArcGIS-backed forms and tables, map picker, geocoding, attachments, CSV and print. */
(function (CP) {
  'use strict';
  var OPS = CP.ops, A = CP.arc, U = CP.ui, E = CP.esc, I = U.icon;
  OPS.tools = {}; OPS.order = []; OPS.act = {}; OPS.chg = {};
  OPS.svc = { main: null, prot: null };
  OPS.st = { tool: 'home', ui: {}, cache: {}, solo: false, entry: window.OPS_ENTRY || {} };
  OPS.inc = null; OPS.incList = [];
  CP.me = CP.store.prefs().me || {};

  OPS.tool = function (k, d) { d.k = k; OPS.tools[k] = d; OPS.order.push(k); };
  // which layers each tool needs; a person sees a tool only if their ArcGIS groups give them those layers
  OPS.NEEDS = { resources: ['resources'], checkin: ['checkins'], pods: ['podledger'], infra: ['infra'], flood: ['watch'], mci: ['patients'], reunify: ['reunify'], afn: ['afn'], volunteers: ['volunteers'], costs: ['costs'], training: ['training'], plans: ['plans'], hotline: ['calls'] };
  OPS.isAdmin = function () { var u = A.user || {}; return u.role === 'org_admin' || (u.canPublish && (u.groups || []).some(function (g) { return /^BOCO Access 1/.test(g); })) || OPS.SVC_KEYS.some(function (k) { return OPS.svc[k] && OPS.svc[k].owner === u.username; }); };
  OPS.canUse = function (k) {
    if (!A.signedIn() || !A.user || k === 'home') return true;
    if (k === 'setup') return OPS.isAdmin();
    var need = OPS.NEEDS[k]; if (!need) return true;
    if (!OPS.SVC_KEYS.some(function (s) { return OPS.svc[s]; })) return true; // services not loaded yet
    return need.every(function (l) { return OPS.LAYERS[l] && OPS.ready(l); });
  };
  OPS.noAccess = function (t) { return '<div class="hero" style="max-width:640px"><h2>' + E(t.n) + '</h2><p>Your ArcGIS account doesn\'t have access to ' + E(t.n) + '. If you need it for your role, ask Emergency Management (BOCO Access 1) to add you to the right ArcGIS group.</p><button class="btn" data-act="go" data-a="home">' + I('home') + 'Back to your tools</button></div>'; };
  OPS.GROUPS = [['Operations', ['home', 'resources', 'checkin', 'pods', 'infra', 'flood']], ['People', ['hotline', 'mci', 'reunify', 'afn', 'volunteers']], ['Finance & Readiness', ['costs', 'training', 'plans']], ['Setup', ['setup']]];

  // ---------- small helpers ----------
  OPS.arr = function (v) { return Array.isArray(v) ? v : []; };
  OPS.num = function (v) { return v === '' || v == null || isNaN(+v) ? null : +v; };
  OPS.money = function (v) { return v == null || v === '' ? '' : '$' + (+v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  OPS.dt = function (ms) { return ms ? CP.fmtDT(new Date(ms).toISOString()) : ''; };
  OPS.d = function (ms) { return ms ? CP.fmtDate(new Date(ms).toISOString()) : ''; };
  OPS.ago = function (ms) { if (!ms) return ''; var m = Math.round((Date.now() - ms) / 60000); return m < 1 ? 'now' : m < 60 ? m + 'm' : m < 1440 ? Math.floor(m / 60) + 'h ' + (m % 60) + 'm' : Math.floor(m / 1440) + 'd'; };
  OPS.hrs = function (a, b) { return a ? Math.max(0, ((b || Date.now()) - a) / 3600e3) : 0; };
  OPS.me = function () { return CP.me.name || (A.user && A.user.name) || ''; };
  OPS.sq = function (s) { return A.sq(s); };
  OPS.id = function (p) { return (p || '') + new Date().toISOString().slice(2, 10).replace(/-/g, '') + '-' + Math.random().toString(36).slice(2, 6).toUpperCase(); };
  var GOOD = /^(Available|Operational|Open|Complete|Current|Filled|Active|Cleared|Reunited|Located - safe|Contacted - safe|Minor \(Green\)|On Scene|Arrived at hospital|Released on scene|Grid|OK|Yes|Conducted|AAR Final)$/;
  var BAD = /^(Down|Out of Service|Out|Missing|Open inquiry|Immediate \(Red\)|Diversion|Closed|Expired|Urgent|Flooded \/ closed|Damaged|Unable to Fill|No answer|Contacted - needs help|Referred to EMS|Deceased.*|Hospitalized|Not checked)$/;
  var MID = /^(Assigned|Impaired|In Progress|Delayed \(Yellow\)|Possible match|Under Review|Watch|Limited|Generator|Pending.*|Rest|Draft|Planning|AAR Draft|Partial|Reserved|Approved|Awaiting transport|Treatment area)$/;
  var BLU = /^(En Route|Ordered|Submitted|Transported|Deployed|Staged|Scheduled|Submitted to VDEM|Evacuated)$/;
  OPS.chip = function (v) { if (v == null || v === '') return '<span class="dim">—</span>'; var c = GOOD.test(v) ? 'ok' : BAD.test(v) ? 'red' : MID.test(v) ? 'gold' : BLU.test(v) ? 'blue' : ''; if (/Expectant/.test(v)) c = 'mute'; return '<span class="chip ' + c + '">' + E(v) + '</span>'; };
  OPS.triCls = function (t) { return /Red/.test(t) ? 'tri-r' : /Yellow/.test(t) ? 'tri-y' : /Green/.test(t) ? 'tri-g' : /Black/.test(t) ? 'tri-k' : 'tri-x'; };

  // ---------- services ----------
  OPS.L = function (k) { return OPS.LAYERS[k]; };
  OPS.url = function (k) {
    var l = OPS.LAYERS[k], s = OPS.svc[l.svc]; if (!s) return null;
    var id = s.ids && s.ids[l.name] != null ? s.ids[l.name] : null; if (id == null) return null;
    return s.url + '/' + id;
  };
  OPS.ready = function (k) { return !!OPS.url(k); };
  function need(k) { var u = OPS.url(k); if (u) return u; var l = OPS.LAYERS[k]; var e = new Error(OPS.svc[l.svc] ? 'The ' + l.title + ' layer is missing. Open Setup and choose Update layers.' : (l.svc === 'prot' ? 'The protected EM service is not set up or not shared with you.' : l.svc === 'ems' ? 'The EMS Patient Care service is not set up or not shared with you.' : 'The EM Operations service is not set up yet. Open Setup.')); e.setup = true; throw e; }
  OPS.findServices = async function () {
    OPS.hasExerciseField = !!(A.own && A.own.fields && A.own.fields.exercise);
    if (A.status === 'offline') { var c = CP.store.prefs().opsSvcCache; if (c && c.u === (A.user || {}).username) OPS.svc = c.svc; return; }
    for (var key of OPS.SVC_KEYS) {
      var d = OPS.SERVICES[key], fixed = (CP.store.prefs().opsSvc || {})[key];
      var r = await A.req(A.portal + '/sharing/rest/search', { q: 'title:"' + d.name + '" AND type:"Feature Service" AND orgid:' + A.user.orgId, num: 5 }).catch(function () { return { results: [] }; });
      var it = (r.results || []).find(function (x) { return x.title === d.name; }), via = null;
      if (!it && d.views) { // no access to the full service: use the least-access view this person was given
        for (var vk of d.views) {
          var vn = OPS.VIEWS[vk].name, rv = await A.req(A.portal + '/sharing/rest/search', { q: 'title:"' + vn + '" AND type:"Feature Service" AND orgid:' + A.user.orgId, num: 3 }).catch(function () { return { results: [] }; });
          it = (rv.results || []).find(function (x) { return x.title === vn; }); if (it) { via = vk; fixed = null; break; }
        }
      }
      var url = it ? it.url.replace(/\/$/, '') : fixed;
      if (!url) { OPS.svc[key] = null; continue; }
      try {
        var info = await A.req(url, {}), ids = {};
        (info.layers || []).concat(info.tables || []).forEach(function (x) { ids[x.name] = x.id; });
        OPS.svc[key] = { url: url, id: it ? it.id : null, owner: it ? it.owner : '', ids: ids, access: it ? it.access : '', view: via, readOnly: !!(via && !/Create|Update/.test(info.capabilities || '')) };
      } catch (e) { if (e.offline) { var c0 = CP.store.prefs().opsSvcCache; if (c0 && c0.svc) { OPS.svc = c0.svc; return; } } OPS.svc[key] = null; console.warn(key, e); }
    }
    CP.store.setPref('opsSvcCache', { u: (A.user || {}).username, svc: OPS.svc });
    try { var ck = OPS.url('checkins'); OPS.practiceReady = ck ? ((await A.req(ck, {})).fields || []).some(function (f) { return f.name === 'practice'; }) : false; } catch (e) { OPS.practiceReady = false; }
  };
  function fieldDef(f) {
    var t = { S: 'String', I: 'Integer', D: 'Double', T: 'Date' }[f[1]];
    var o = { name: f[0], type: 'esriFieldType' + t, alias: f[3], nullable: true, editable: true };
    if (t === 'String') o.length = f[2] || 255;
    if (f[4] && f[4].o && f[4].o.length && t === 'String' && !f[4].free) o.domain = null; // keep pick lists in the app so they can grow without schema changes
    return o;
  }
  var BASE = [{ name: 'OBJECTID', type: 'esriFieldTypeOID', alias: 'OBJECTID', nullable: false, editable: false }, { name: 'GlobalID', type: 'esriFieldTypeGlobalID', alias: 'GlobalID', length: 38, nullable: false, editable: false },
    { name: 'CreationDate', type: 'esriFieldTypeDate', alias: 'Created', nullable: true, editable: false }, { name: 'Creator', type: 'esriFieldTypeString', alias: 'Created by', length: 128, nullable: true, editable: false },
    { name: 'EditDate', type: 'esriFieldTypeDate', alias: 'Edited', nullable: true, editable: false }, { name: 'Editor', type: 'esriFieldTypeString', alias: 'Edited by', length: 128, nullable: true, editable: false }];
  var COLORS = { resources: [61, 123, 255], checkins: [253, 184, 51], watch: [61, 155, 255], afn: [199, 125, 255], reunify: [240, 68, 76], patients: [240, 68, 76], hospitals: [47, 191, 113] };
  function layerDef(l) {
    var d = { id: l.id, name: l.name, type: l.geom ? 'Feature Layer' : 'Table', displayField: l.fields[0][0], description: l.title + ' (Botetourt County EM Ops)', objectIdField: 'OBJECTID', globalIdField: 'GlobalID',
      fields: BASE.concat(l.fields.map(fieldDef)), hasAttachments: !!l.attach || !!l.geom, capabilities: 'Create,Delete,Query,Update,Editing,ChangeTracking',
      editFieldsInfo: { creationDateField: 'CreationDate', creatorField: 'Creator', editDateField: 'EditDate', editorField: 'Editor' } };
    if (l.geom) {
      var c = COLORS[l.key] || [253, 184, 51];
      d.geometryType = 'esriGeometryPoint'; d.extent = { xmin: -80.2, ymin: 37.3, xmax: -79.4, ymax: 37.85, spatialReference: { wkid: 4326 } };
      d.drawingInfo = { renderer: { type: 'simple', symbol: { type: 'esriSMS', style: 'esriSMSCircle', color: c.concat([255]), size: 11, outline: { color: [11, 26, 43, 255], width: 1.5 } } } };
    }
    return d;
  }
  function errText(e) { return (e && e.message || 'error') + (e && e.details && e.details.length ? ' (' + e.details.join('; ') + ')' : ''); }
  // add layers in one call; if ArcGIS refuses, add them one at a time so one bad layer can't block the rest, and report which failed and why
  async function addLayers(admin, ls) {
    var body = function (x) { return { addToDefinition: { layers: x.filter(function (l) { return l.type !== 'Table'; }), tables: x.filter(function (l) { return l.type === 'Table'; }) } }; };
    try { var r = await A.req(admin + '/addToDefinition', body(ls), true); if (r.success) return; } catch (e) { console.warn('bulk addToDefinition', e, e.details); }
    var bad = [];
    for (var l of ls) {
      try { var r1 = await A.req(admin + '/addToDefinition', body([l]), true); if (!r1.success) bad.push(l.name + ': not added'); }
      catch (e) { bad.push(l.name + ': ' + errText(e)); }
    }
    if (bad.length) throw new Error(bad.length + ' of ' + ls.length + ' layers failed. ' + bad.join(' | '));
  }
  OPS.errText = errText;
  OPS.layersFor = function (svc) { return Object.keys(OPS.LAYERS).map(function (k) { return OPS.LAYERS[k]; }).filter(function (l) { return l.svc === svc; }); };
  OPS.createService = async function (key) {
    var d = OPS.SERVICES[key], u = A.user.username;
    var cp = { name: d.name, serviceDescription: d.desc, hasStaticData: false, maxRecordCount: 2000, supportedQueryFormats: 'JSON', capabilities: 'Create,Delete,Query,Update,Editing,ChangeTracking',
      spatialReference: { wkid: 4326 }, initialExtent: { xmin: -80.2, ymin: 37.3, xmax: -79.4, ymax: 37.85, spatialReference: { wkid: 4326 } }, allowGeometryUpdates: true, units: 'esriDecimalDegrees',
      xssPreventionInfo: { xssPreventionEnabled: true, xssPreventionRule: 'InputOnly', xssInputRule: 'rejectInvalid' },
      editorTrackingInfo: { enableEditorTracking: true, enableOwnershipAccessControl: false, allowOthersToUpdate: true, allowOthersToDelete: !OPS.SVC_PRIVATE[key] } };
    var r = await A.req(A.portal + '/sharing/rest/content/users/' + u + '/createService', { createParameters: cp, outputType: 'featureService', tags: d.tags, snippet: d.desc }, true);
    if (!r.success) throw new Error('ArcGIS could not create ' + d.name);
    var ls = OPS.layersFor(key).map(layerDef);
    var admin = r.encodedServiceURL.replace('/rest/services/', '/rest/admin/services/');
    var p0 = CP.store.prefs().opsSvc || {}; p0[key] = r.encodedServiceURL.replace(/\/$/, ''); CP.store.setPref('opsSvc', p0);
    await addLayers(admin, ls);
    await A.req(A.portal + '/sharing/rest/content/users/' + u + '/items/' + r.itemId + '/update', { title: d.name, description: d.desc + '<br><br>Created by the Botetourt County EM Ops tools. Do not rename layers or fields; the apps find them by name.' }, true).catch(function () {});
    var p = CP.store.prefs().opsSvc || {}; p[key] = r.encodedServiceURL.replace(/\/$/, ''); CP.store.setPref('opsSvc', p);
    await OPS.findServices();
  };
  // add layers or fields that newer versions of the tools need
  OPS.schemaGaps = async function (key) {
    var s = OPS.svc[key]; if (!s) return null;
    var out = { layers: [], fields: [] };
    for (var l of OPS.layersFor(key)) {
      if (s.ids[l.name] == null) { out.layers.push(l); continue; }
      var info = await A.req(s.url + '/' + s.ids[l.name], {}).catch(function () { return null; }); if (!info) continue;
      var have = {}; (info.fields || []).forEach(function (f) { have[f.name.toLowerCase()] = 1; });
      var miss = l.fields.filter(function (f) { return !have[f[0].toLowerCase()]; });
      if (miss.length) out.fields.push({ l: l, f: miss });
    }
    return out;
  };
  OPS.upgrade = async function (key) {
    var s = OPS.svc[key], g = await OPS.schemaGaps(key), admin = s.url.replace('/rest/services/', '/rest/admin/services/');
    if (g.layers.length) {
      var used = Object.keys(s.ids).map(function (n) { return s.ids[n]; });
      var ls = g.layers.map(function (l) { var d = layerDef(l); if (used.indexOf(d.id) >= 0) d.id = Math.max.apply(null, used.concat([0])) + 1; used.push(d.id); return d; });
      await addLayers(admin, ls);
    }
    for (var x of g.fields) { var r2 = await A.req(admin + '/' + s.ids[x.l.name] + '/addToDefinition', { addToDefinition: { fields: x.f.map(fieldDef) } }, true).catch(function (e) { throw new Error('Could not add fields to ' + x.l.name + ': ' + errText(e)); }); if (!r2.success) throw new Error('Could not add fields to ' + x.l.name); }
    await OPS.findServices();
    return g.layers.length + ' layers, ' + g.fields.reduce(function (n, x) { return n + x.f.length; }, 0) + ' fields added';
  };
  OPS.share = async function (key, groups, org) {
    var s = OPS.svc[key]; if (!s || !s.id) throw new Error('Service not found');
    var r = await A.req(A.portal + '/sharing/rest/content/users/' + s.owner + '/items/' + s.id + '/share', { everyone: false, org: !!org, groups: groups.join(',') }, true);
    if (r.notSharedWith && r.notSharedWith.length) throw new Error('Could not share with ' + r.notSharedWith.length + ' group(s)');
    await OPS.findServices(); return true;
  };
  OPS.makeWebMap = async function () {
    var ops = [];
    OPS.SVC_KEYS.forEach(function (k) { var s = OPS.svc[k]; if (!s) return; OPS.layersFor(k).forEach(function (l) { if (s.ids[l.name] == null) return; var it = { id: l.name, title: l.title, url: s.url + '/' + s.ids[l.name], itemId: s.id, layerType: 'ArcGISFeatureLayer', visibility: !!l.geom && k === 'main', opacity: 1, _tbl: !l.geom }; ops.push(it); }); });
    [['Command Post incidents', A.own && A.own.url + '/0'], ['Shelters', A.L.shelters], ['PODs (public)', A.L.pods], ['Critical infrastructure', A.L.critInfra], ['Road closures', A.L.closures], ['Evacuation notices', A.L.notices], ['CAD calls', A.L.cad]].forEach(function (x) { if (x[1]) ops.push({ id: x[0].replace(/\W/g, ''), title: x[0], url: x[1], layerType: 'ArcGISFeatureLayer', visibility: true, opacity: 1 }); });
    var clean = function (o) { var c = Object.assign({}, o); delete c._tbl; delete c.visibility; delete c.opacity; c.layerType = undefined; delete c.layerType; return c; };
    var tables = ops.filter(function (o) { return o._tbl; }).map(clean);
    var wm = { operationalLayers: ops.filter(function (o) { return !o._tbl; }).map(function (o) { var c = Object.assign({}, o); delete c._tbl; return c; }), tables: tables, baseMap: { baseMapLayers: [{ id: 'dark', layerType: 'ArcGISTiledMapServiceLayer', url: 'https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer', visibility: true, opacity: 1, title: 'Dark Gray Base' }], title: 'Dark Gray Canvas' },
      spatialReference: { wkid: 102100, latestWkid: 3857 }, authoringApp: 'Botetourt EM Ops', authoringAppVersion: '1', version: '2.31', initialState: { viewpoint: { targetGeometry: { xmin: -8925000, ymin: 4495000, xmax: -8850000, ymax: 4540000, spatialReference: { wkid: 102100 } } } } };
    var r = await A.req(A.portal + '/sharing/rest/content/users/' + A.user.username + '/addItem', { type: 'Web Map', title: 'EM Operations Map', tags: 'Emergency Management,EM Ops', snippet: 'Every EM Ops layer with the county EM layers. Use it in Dashboards, Experience Builder or Field Maps.', extent: '-80.2,37.3,-79.4,37.85', text: JSON.stringify(wm) }, true);
    if (!r.success) throw new Error('Could not create the web map');
    var p = CP.store.prefs().opsSvc || {}; p.webmap = r.id; CP.store.setPref('opsSvc', p);
    return r.id;
  };

  // ---------- data ----------
  OPS.q = function (k, where, o) {
    o = o || {}; where = where || '1=1';
    if (!OPS.inc && !o.withPractice && OPS.LAYERS[k].fields.some(function (f) { return f[0] === 'incident_key'; })) {
      var pk = OPS.practiceKeys(); if (pk.length) where = '(' + where + ') AND (incident_key IS NULL OR incident_key NOT IN (' + pk.map(A.sq).join(',') + '))';
    }
    return A.query(need(k), where, o);
  };
  OPS.rows = function (k, where, o) { o = Object.assign({ geom: !!OPS.LAYERS[k].geom }, o || {}); var url = need(k); return OPS.q(k, where, o).then(function (fs) { var rows = fs.map(function (f) { var a = f.attributes; if (f.geometry && f.geometry.y != null) a._ll = [f.geometry.y, f.geometry.x]; return a; }); return CP.sync && !o.raw ? CP.sync.overlay(url, rows) : rows; }); };
  OPS.count = function (k, where) { where = where || '1=1'; if (!OPS.inc && OPS.LAYERS[k].fields.some(function (f) { return f[0] === 'incident_key'; })) { var pk = OPS.practiceKeys(); if (pk.length) where = '(' + where + ') AND (incident_key IS NULL OR incident_key NOT IN (' + pk.map(A.sq).join(',') + '))'; } return A.count(need(k), where); };
  OPS.save = async function (k, attrs, ll) {
    var url = need(k), f = { attributes: Object.assign({}, attrs) };
    delete f.attributes._ll; Object.keys(f.attributes).forEach(function (x) { if (/^(CreationDate|Creator|EditDate|Editor|GlobalID)$/.test(x)) delete f.attributes[x]; });
    if (ll && ll[0] != null && OPS.LAYERS[k].geom) f.geometry = await A.toLayerSR(url, { x: +ll[1], y: +ll[0], spatialReference: { wkid: 4326 } });
    if (f.attributes.OBJECTID) { await A.update(url, [f]); OPS.bust(k); return f.attributes.OBJECTID; }
    delete f.attributes.OBJECTID;
    var r = await A.add(url, [f]); OPS.bust(k); return r[0].objectId;
  };
  OPS.saveMany = async function (k, list) { if (!list.length) return []; var url = need(k); var adds = list.filter(function (a) { return !a.OBJECTID; }).map(function (a) { return { attributes: a }; }), ups = list.filter(function (a) { return a.OBJECTID; }).map(function (a) { return { attributes: a }; }); var r = []; for (var i = 0; i < adds.length; i += 200) r = r.concat(await A.add(url, adds.slice(i, i + 200))); for (var j = 0; j < ups.length; j += 200) await A.update(url, ups.slice(j, j + 200)); OPS.bust(k); return r; };
  OPS.upd = function (k, oid, attrs) { return OPS.save(k, Object.assign({ OBJECTID: oid }, attrs)); };
  OPS.del = async function (k, oid) { await A.del(need(k), [oid]); OPS.bust(k); };
  OPS.attachments = function (k, oid) { return A.req(need(k) + '/' + oid + '/attachments', {}).then(function (r) { return r.attachmentInfos || []; }); };
  OPS.attachUrl = async function (k, oid, aid) { var t = await A.token(); return need(k) + '/' + oid + '/attachments/' + aid + (t ? '?token=' + encodeURIComponent(t) : ''); };
  OPS.attach = async function (k, oid, file) {
    var t = await A.token(), fd = new FormData(); fd.append('attachment', file, file.name); fd.append('f', 'json'); if (t) fd.append('token', t);
    var r = await fetch(need(k) + '/' + oid + '/addAttachment', { method: 'POST', body: fd }).then(function (x) { return x.json(); });
    if (r.error || !(r.addAttachmentResult && r.addAttachmentResult.success)) throw new Error((r.error && r.error.message) || 'Upload failed');
    return r.addAttachmentResult.objectId;
  };
  OPS.delAttach = function (k, oid, aid) { return A.req(need(k) + '/' + oid + '/deleteAttachments', { attachmentIds: aid }, true); };

  // cache: returns data or undefined; repaints when it arrives
  OPS.load = function (key, fn, maxAge) {
    var c = OPS.st.cache, x = c[key];
    if (x && x.data !== undefined && (!maxAge || Date.now() - x.t < maxAge)) return x.data;
    if (!x || !x.loading) {
      c[key] = { loading: true, data: x && x.data, t: x && x.t };
      Promise.resolve().then(fn).then(function (d) { c[key] = { data: d, t: Date.now() }; OPS.repaint(); }).catch(function (e) { c[key] = { data: { _err: e.message, _setup: e.setup }, t: Date.now() }; OPS.repaint(); });
    }
    return x ? x.data : undefined;
  };
  OPS.bust = function (prefix) { Object.keys(OPS.st.cache).forEach(function (k) { if (!prefix || k === prefix || k.indexOf(prefix + ':') === 0 || k.indexOf(':' + prefix) >= 0) delete OPS.st.cache[k]; }); };
  OPS.wait = function (d, what) {
    if (d === undefined) return '<div class="empty">' + I('refresh') + ' Loading ' + E(what || '') + '…</div>';
    if (d && d._err) return '<div class="warnbox">' + E(CP.friendly(d._err)) + (d._setup ? ' <a href="#setup" data-act="go" data-a="setup">Open Setup</a>' : '') + '</div>';
    return '';
  };
  OPS.bad = function (d) { return d === undefined || (d && d._err); };

  // ---------- incidents (shared with Command Post) ----------
  OPS.loadIncidents = async function () {
    if (!A.own) { OPS.incList = []; return; }
    var f = await A.query(A.own.url + '/0', '1=1', { fields: 'OBJECTID,incident_key,incident_number,incident_name,incident_type,complexity,status,start_time,closed_time,op_period,ic_name,location_desc,EditDate' + (OPS.hasExerciseField ? ',exercise' : ''), order: 'start_time DESC', n: 300, geom: true }).catch(function (e) { return e.offline ? null : []; });
    if (f) { OPS.incList = f.map(function (x) { var a = x.attributes; if (x.geometry) a._ll = [x.geometry.y, x.geometry.x]; return a; }); CP.store.setPref('opsIncCache', OPS.incList); }
    else OPS.incList = CP.store.prefs().opsIncCache || [];
    var cur = CP.store.prefs().curInc, want = OPS.st.wantInc || (cur && cur.key !== undefined ? cur.key : CP.store.prefs().opsInc);
    var hit = OPS.incList.find(function (a) { return a.incident_key === want; });
    OPS.inc = hit ? OPS.toInc(hit) : null;
  };
  OPS.toInc = function (a) { return { key: a.incident_key, name: a.incident_name, number: a.incident_number, type: a.incident_type, status: a.status, start: a.start_time, ll: a._ll, ic: a.ic_name, loc: a.location_desc, exercise: a.exercise === 'Yes' }; };
  OPS.setInc = function (key, quiet) { var a = OPS.incList.find(function (x) { return x.incident_key === key; }); OPS.inc = a ? OPS.toInc(a) : null; CP.store.setPref('opsInc', OPS.inc ? OPS.inc.key : ''); if (!quiet) CP.store.setPref('curInc', { key: OPS.inc ? OPS.inc.key : '', t: Date.now() }); OPS.bust(); OPS.render(); };
  OPS.incFix = function () { if (!OPS.inc) return {}; var o = { incident_key: OPS.inc.key, incident_name: OPS.inc.name }; if (OPS.inc.exercise && OPS.practiceReady) o.practice = 'Yes'; return o; };
  OPS.practiceKeys = function () { return OPS.incList.filter(function (a) { return a.exercise === 'Yes'; }).map(function (a) { return a.incident_key; }); };
  OPS.incWhere = function (extra) { var w = OPS.inc ? 'incident_key=' + A.sq(OPS.inc.key) : '1=1'; return extra ? '(' + w + ') AND (' + extra + ')' : w; };
  OPS.needInc = function (what) { return OPS.inc ? '' : '<div class="hint">' + I('flag') + ' Pick the incident at the top to ' + E(what || 'work on it') + '. Incidents come from Command Post' + (OPS.incList.length ? '' : ' (none open yet: <a href="index.html" target="_blank">start one in Command Post</a>)') + '.</div>'; };
  // edit the Command Post incident record itself (same merge-safe save Command Post uses)
  OPS.cpEdit = async function (key, fn, logText, cat) {
    var inc = null, offline = A.status === 'offline' || (CP.net && !CP.net.ok);
    if (!offline) {
      if (A.status !== 'on') throw new Error('Command Post service is not connected');
      try { inc = await A.loadRemote(key); } catch (e) { if (!e.offline) throw e; offline = true; }
    }
    if (offline) inc = CP.store.get(key);
    if (!inc) throw new Error(offline ? 'No connection, and this incident has not been opened on this device yet. Connect once to load it.' : 'Command Post incident not found');
    var out = fn(inc);
    if (logText) { var op = CP.curOP(inc); CP.addItem(inc, 'log', { ts: CP.now(), author: OPS.me(), pos: CP.me.pos || '', cat: cat || 'Resource', text: logText, op: op ? op.n : 1 }); }
    inc.updatedBy = OPS.me(); inc.updated = CP.now();
    if (offline) { CP.store.put(inc); CP.sync.markIncident(key); return out; }
    var saved;
    try { saved = await A.save(inc); } catch (e) { if (!e.offline) throw e; CP.store.put(inc); CP.sync.markIncident(key); return out; }
    CP.store.put(saved); // keep a copy on this device so the tools keep working if the connection drops
    return out;
  };
  OPS.cpLink = function (view) { return 'index.html' + (OPS.inc ? '?incident=' + encodeURIComponent(OPS.inc.key) + (view ? '&view=' + view : '') : ''); };
  OPS.toolLink = function (k, extra) { return 'ops.html?tool=' + k + (OPS.inc ? '&incident=' + encodeURIComponent(OPS.inc.key) : '') + (extra || ''); };

  // ---------- geocode (Esri World Geocoder, county extent) ----------
  OPS.geocode = async function (text) {
    var b = CP.COUNTY.bbox;
    var r = await A.req('https://geocode-api.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates', { singleLine: text + (/va|virginia/i.test(text) ? '' : ', Botetourt County, VA'), maxLocations: 6, outFields: 'Match_addr,Score', searchExtent: JSON.stringify({ xmin: b.xmin - 0.3, ymin: b.ymin - 0.3, xmax: b.xmax + 0.3, ymax: b.ymax + 0.3, spatialReference: { wkid: 4326 } }), outSR: 4326, forStorage: true });
    return (r.candidates || []).filter(function (c) { return c.score >= 75; }).map(function (c) { return { addr: c.address, lat: c.location.y, lng: c.location.x, score: c.score }; });
  };
  OPS.reverse = async function (lat, lng) { var r = await A.req('https://geocode-api.arcgis.com/arcgis/rest/services/World/GeocodeServer/reverseGeocode', { location: lng + ',' + lat, outSR: 4326, forStorage: true }).catch(function () { return {}; }); return r.address ? r.address.Match_addr || r.address.LongLabel : ''; };

  // ---------- generic form ----------
  function inputFor(f, v) {
    var n = f[0], t = f[1], ui = f[4] || {}, val = v == null ? '' : v;
    if (ui.ro) return '<div class="ro">' + (t === 'T' ? E(OPS.dt(val)) : /\(\$/.test(f[3]) ? E(OPS.money(val)) : E(val)) || '<span class="dim">—</span>' + '</div>';
    if (ui.multi) { var have = String(val).split(/;\s*/); return '<div class="multi" data-multi="' + n + '">' + ui.multi.map(function (o) { return '<label class="chk"><input type="checkbox" value="' + E(o) + '"' + (have.indexOf(o) >= 0 ? ' checked' : '') + '> ' + E(o) + '</label>'; }).join('') + '</div>'; }
    if (ui.o) { var opts = ui.o.slice(); if (val && opts.indexOf(val) < 0) opts.push(val); return '<select class="in" name="' + n + '">' + (opts[0] === '' ? '' : '<option value=""></option>') + opts.map(function (o) { return '<option' + (String(o) === String(val) ? ' selected' : '') + '>' + E(o) + '</option>'; }).join('') + '</select>'; }
    if (ui.area) return '<textarea class="in" name="' + n + '" style="min-height:' + (ui.h || 70) + 'px">' + E(val) + '</textarea>';
    if (t === 'T') return '<input class="in" type="datetime-local" name="' + n + '" value="' + (val ? CP.localInput(new Date(val).toISOString()) : '') + '">';
    if (t === 'I' || t === 'D') return '<input class="in" type="number" step="' + (t === 'I' ? '1' : 'any') + '" name="' + n + '" value="' + E(val) + '">';
    return '<input class="in" name="' + n + '" value="' + E(val) + '"' + (ui.dl ? ' list="' + ui.dl + '"' : '') + '>';
  }
  OPS.fieldsHtml = function (k, rec, o) {
    o = o || {}; var l = OPS.LAYERS[k], groups = {}, order = [];
    l.fields.forEach(function (f) {
      var ui = f[4] || {}; if (ui.hide || (o.skip && o.skip.indexOf(f[0]) >= 0)) return; if (ui.ro && (rec[f[0]] == null || rec[f[0]] === '')) return;
      var g = ui.g || ''; if (!groups[g]) { groups[g] = []; order.push(g); }
      var wide = ui.area || ui.multi;
      groups[g].push('<label class="f' + (wide ? ' spanall' : '') + '"><span>' + E(f[3]) + (ui.req ? ' <b style="color:var(--gold)">*</b>' : '') + (ui.hint ? ' <i class="dim" style="text-transform:none;letter-spacing:0;font-weight:500">' + E(ui.hint) + '</i>' : '') + '</span>' + inputFor(f, rec[f[0]]) + '</label>');
    });
    return order.map(function (g) { return (g ? '<div class="fgrp">' + E(g) + '</div>' : '') + '<div class="grid g3 fgrid">' + groups[g].join('') + '</div>'; }).join('');
  };
  OPS.collect = function (root, k) {
    var l = OPS.LAYERS[k], out = {}, miss = [];
    l.fields.forEach(function (f) {
      var ui = f[4] || {}, n = f[0];
      if (ui.multi) { var box = root.querySelector('[data-multi="' + n + '"]'); if (box) out[n] = Array.prototype.map.call(box.querySelectorAll('input:checked'), function (x) { return x.value; }).join('; ') || null; return; }
      var el = root.querySelector('[name="' + n + '"]'); if (!el) return;
      var v = el.value.trim();
      if (f[1] === 'T') out[n] = v ? new Date(v).getTime() : null;
      else if (f[1] === 'I') out[n] = v === '' ? null : Math.round(+v);
      else if (f[1] === 'D') out[n] = v === '' ? null : +v;
      else out[n] = v === '' ? null : v.slice(0, f[2] || 255);
      if (ui.req && (out[n] == null || out[n] === '')) miss.push(f[3]);
    });
    return { attrs: out, miss: miss };
  };
  // map picker inside a form
  OPS.pickerHtml = function () { return '<div class="fgrp">Location</div><div class="row" style="margin-bottom:8px"><input class="in grow" id="pkAddr" placeholder="Search an address or place, or click the map"><button class="btn sm" data-pk="find">' + I('pin') + 'Find</button><button class="btn sm ghost" data-pk="me">' + I('target') + 'My location</button><span class="dim mono" id="pkLL" style="font-size:12px"></span></div><div id="pkResults"></div><div class="map sm" id="pkMap" style="height:240px"></div>'; };
  OPS.picker = function (root, ll, addrField) {
    var st = { ll: ll && ll[0] != null ? ll.slice() : null }, map = CP.map.create(root.querySelector('#pkMap'), st.ll ? { center: st.ll, zoom: 15 } : {}), mk = null;
    function put(p, pan) { st.ll = p; if (mk) mk.setLatLng(p); else { mk = L.marker(p, { draggable: true, icon: CP.map.pinIcon('#FDB833', '', 28) }).addTo(map); mk.on('dragend', function () { var q = mk.getLatLng(); put([q.lat, q.lng]); fill(); }); } if (pan) map.setView(p, Math.max(map.getZoom(), 15)); root.querySelector('#pkLL').textContent = p[0].toFixed(5) + ', ' + p[1].toFixed(5); }
    async function fill() { var a = addrField && root.querySelector('[name="' + addrField + '"]'); if (a && !a.value && st.ll) a.value = await OPS.reverse(st.ll[0], st.ll[1]); }
    if (st.ll) put(st.ll);
    map.on('click', function (e) { put([e.latlng.lat, e.latlng.lng]); fill(); });
    setTimeout(function () { map.invalidateSize(); }, 120);
    root.addEventListener('click', async function (e) {
      var b = e.target.closest('[data-pk]'); if (!b) return; e.preventDefault();
      if (b.dataset.pk === 'me') { navigator.geolocation.getCurrentPosition(function (p) { put([p.coords.latitude, p.coords.longitude], true); fill(); }, function () { U.toast('Location not available', 'err'); }, { enableHighAccuracy: true, timeout: 10000 }); return; }
      if (b.dataset.pk === 'use') { put([+b.dataset.lat, +b.dataset.lng], true); var a = addrField && root.querySelector('[name="' + addrField + '"]'); if (a) a.value = b.dataset.addr; root.querySelector('#pkResults').innerHTML = ''; return; }
      var q = root.querySelector('#pkAddr').value.trim() || (addrField && (root.querySelector('[name="' + addrField + '"]') || {}).value); if (!q) return;
      try { var c = await OPS.geocode(q); root.querySelector('#pkResults').innerHTML = c.length ? '<div class="pkres">' + c.map(function (x) { return '<button class="btn xs ghost" data-pk="use" data-lat="' + x.lat + '" data-lng="' + x.lng + '" data-addr="' + E(x.addr) + '">' + E(x.addr) + '</button>'; }).join('') + '</div>' : '<div class="dim" style="font-size:13px;margin-bottom:6px">No match. Click the map instead.</div>'; if (c[0]) put([c[0].lat, c[0].lng], true); } catch (er) { U.toast('Address search failed: ' + E(er.message), 'err'); }
    });
    return st;
  };
  // full edit dialog for any layer
  OPS.edit = function (k, rec, o) {
    o = o || {}; rec = rec || {}; var l = OPS.LAYERS[k], isNew = !rec.OBJECTID, pk = null;
    var body = (o.top || '') + OPS.fieldsHtml(k, Object.assign({}, o.defaults || {}, rec), o) + (l.geom && !o.noMap ? OPS.pickerHtml() : '') + (o.bottom || '') + (rec.OBJECTID && (l.attach) ? '<div class="fgrp">Files</div><div id="attBox" class="dim">Loading files…</div><input type="file" id="attFile" style="margin-top:6px">' : '');
    var btns = [];
    if (!isNew && !o.noDelete) btns.push({ label: I('trash') + 'Delete', cls: 'ghost', fn: function () { setTimeout(function () { U.confirm('Delete this record?', 'This removes it from ArcGIS for everyone.', 'Delete', async function () { try { await OPS.del(k, rec.OBJECTID); U.toast('Deleted', 'ok'); if (o.after) o.after(null); OPS.repaint(); } catch (e) { U.toast(E(e.message), 'err'); } }, true); }, 20); } });
    (o.buttons || []).forEach(function (b) { btns.push(b); });
    btns.push({ label: 'Cancel', cls: 'ghost' });
    btns.push({ label: I('check') + (o.saveLabel || 'Save'), cls: 'pri', fn: function (bg) {
      var c = OPS.collect(bg, k); if (c.miss.length) { U.toast('Fill in: ' + c.miss.map(E).join(', '), 'err'); return false; }
      var at = Object.assign({}, isNew ? (o.fixed || OPS.incFixFor(k)) : {}, o.defaults && isNew ? pick(o.defaults) : {}, c.attrs, o.force || {});
      if (rec.OBJECTID) at.OBJECTID = rec.OBJECTID;
      Promise.resolve(o.before ? o.before(at, rec, bg) : at).then(function (at2) { if (at2 === false) throw new Error('cancelled'); return OPS.save(k, at2 || at, pk ? pk.ll : rec._ll).then(function (oid) { return [oid, at2 || at]; }); })
        .then(function (r) { U.toast(l.title + (isNew ? ' added' : ' saved'), 'ok'); U.closeModal(); if (o.after) return o.after(r[0], r[1], rec); })
        .then(function () { OPS.repaint(); })
        .catch(function (e) { if (e.message !== 'cancelled') U.toast('Save failed: ' + E(e.message), 'err', 7000); });
      return false;
    } });
    var bg = U.modal(o.title || ((isNew ? 'New ' : '') + l.title), body, btns, { wide: true, nofocus: !isNew, sticky: true });
    if (l.geom && !o.noMap) pk = OPS.picker(bg, rec._ll || (o.ll) || null, o.addrField || (l.fields.find(function (f) { return /address|home_base/.test(f[0]); }) || [])[0]);
    if (rec.OBJECTID && l.attach) attachUi(bg, k, rec.OBJECTID);
    if (o.onOpen) o.onOpen(bg, rec);
    return bg;
  };
  function pick(d) { var o = {}; Object.keys(d).forEach(function (x) { if (x[0] !== '_') o[x] = d[x]; }); return o; }
  OPS.incFixFor = function (k) { return OPS.LAYERS[k].fields.some(function (f) { return f[0] === 'incident_key'; }) && OPS.inc && !/^(resources|volunteers)$/.test(k) ? OPS.incFix() : {}; };
  async function attachUi(bg, k, oid) {
    var box = bg.querySelector('#attBox'), inp = bg.querySelector('#attFile');
    async function paint() { try { var a = await OPS.attachments(k, oid); var links = await Promise.all(a.map(function (x) { return OPS.attachUrl(k, oid, x.id).then(function (u) { return '<div class="row" style="gap:6px"><a href="' + E(u) + '" target="_blank" rel="noopener">' + I('report') + E(x.name) + '</a><span class="dim">' + Math.round(x.size / 1024) + ' KB</span><button class="ibtn del" data-att="' + x.id + '">' + I('trash') + '</button></div>'; }); })); box.innerHTML = links.join('') || 'No files yet. Attach a PDF or Word file below; it is stored in ArcGIS with this record.'; } catch (e) { box.textContent = e.message; } }
    paint();
    inp.addEventListener('change', async function () { var f = inp.files[0]; if (!f) return; box.textContent = 'Uploading ' + f.name + '…'; try { await OPS.attach(k, oid, f); U.toast('File stored in ArcGIS', 'ok'); } catch (e) { U.toast(E(e.message), 'err'); } inp.value = ''; paint(); });
    box.addEventListener('click', async function (e) { var b = e.target.closest('[data-att]'); if (!b) return; if (!confirm('Delete this file?')) return; await OPS.delAttach(k, oid, b.dataset.att).catch(function () {}); paint(); });
  }

  // ---------- generic table ----------
  // cfg: {k, rows, cols:[name | {f,l,fmt}], q:'search', empty, click:'act', actions:fn(row)->html}
  OPS.fmtCell = function (k, f, v) {
    var fd = OPS.LAYERS[k].fields.find(function (x) { return x[0] === f; });
    if (v == null || v === '') return '<span class="dim">—</span>';
    if (fd && fd[1] === 'T') return '<span class="mono" style="font-size:12.5px">' + E(OPS.dt(v)) + '</span>';
    if (fd && /\(\$/.test(fd[3])) return E(OPS.money(v));
    if (/^(status|triage|result|doc_status|power|priority)$/.test(f)) return OPS.chip(v);
    return E(String(v).length > 90 ? String(v).slice(0, 88) + '…' : v);
  };
  OPS.table = function (cfg) {
    var k = cfg.k, l = OPS.LAYERS[k], rows = cfg.rows || [];
    var cols = (cfg.cols || l.fields.filter(function (f) { return f[4] && f[4].list; }).map(function (f) { return f[0]; })).map(function (c) { if (typeof c === 'object') return c; var fd = l.fields.find(function (x) { return x[0] === c; }); return { f: c, l: fd ? fd[3] : c }; });
    if (cfg.q) { var q = cfg.q.toLowerCase(); rows = rows.filter(function (r) { return Object.keys(r).some(function (x) { return r[x] != null && String(r[x]).toLowerCase().indexOf(q) >= 0; }); }); }
    var h = '<div class="tbl-wrap"><table class="t ot"><thead><tr>' + cols.map(function (c) { return '<th>' + E(c.l) + '</th>'; }).join('') + (cfg.actions ? '<th></th>' : '') + '</tr></thead><tbody>';
    if (!rows.length) h += '<tr><td colspan="' + (cols.length + 1) + '" class="muted" style="padding:18px;text-align:center">' + E(cfg.empty || 'Nothing here yet.') + '</td></tr>';
    rows.slice(0, cfg.max || 1000).forEach(function (r) {
      h += '<tr class="' + (cfg.rowCls ? cfg.rowCls(r) : '') + (r._pending ? ' pending-row" title="Saved on this device, waiting to send to ArcGIS' : '') + '" data-act="' + (cfg.click || 'edit') + '" data-a="' + k + '|' + r.OBJECTID + '">' + cols.map(function (c) { return '<td>' + (c.fmt ? c.fmt(r) : OPS.fmtCell(k, c.f, r[c.f])) + '</td>'; }).join('') + (cfg.actions ? '<td class="act" onclick="event.stopPropagation()">' + cfg.actions(r) + '</td>' : '') + '</tr>';
    });
    h += '</tbody></table></div>';
    if (rows.length > (cfg.max || 1000)) h += '<div class="dim" style="font-size:12px;margin-top:4px">Showing ' + (cfg.max || 1000) + ' of ' + rows.length + '. Search to narrow.</div>';
    return h;
  };
  OPS.findRow = function (k, oid) { var c = OPS.st.cache; for (var key in c) { var d = c[key] && c[key].data; if (Array.isArray(d)) { var r = d.find(function (x) { return x && x.OBJECTID === +oid && (key === k || key.indexOf(k + ':') === 0); }); if (r) return r; } } return null; };
  OPS.act.edit = async function (a) { var p = a.split('|'), k = p[0], oid = +p[1]; var r = OPS.findRow(k, oid); if (!r) { var rr = await OPS.rows(k, 'OBJECTID=' + oid); r = rr[0]; } var t = OPS.tools[OPS.st.tool]; if (t && t.edit && t.edit[k]) return t.edit[k](r); OPS.edit(k, r); };
  OPS.searchBox = function (key, ph) { return '<input class="in" style="max-width:280px" placeholder="' + E(ph || 'Search') + '" data-chg="search" data-a="' + key + '" value="' + E(OPS.st.ui['q_' + key] || '') + '">'; };
  OPS.chg.search = function (el) { OPS.st.ui['q_' + el.dataset.a] = el.value; clearTimeout(OPS._sT); OPS._sT = setTimeout(function () { OPS.repaint(); var n = document.querySelector('[data-chg="search"][data-a="' + el.dataset.a + '"]'); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }, 250); };
  OPS.seg = function (key, opts, cur) { return '<div class="seg">' + opts.map(function (o) { var v = typeof o === 'object' ? o[0] : o, l = typeof o === 'object' ? o[1] : o; return '<button data-act="seg" data-a="' + key + '|' + E(v) + '" class="' + (String(cur) === String(v) ? 'on' : '') + '">' + E(l) + '</button>'; }).join('') + '</div>'; };
  OPS.act.seg = function (a) { var i = a.indexOf('|'); OPS.st.ui[a.slice(0, i)] = a.slice(i + 1); OPS.repaint(); };
  OPS.tabs = function (key, opts, cur) { return '<div class="tabs">' + opts.map(function (o) { return '<button data-act="seg" data-a="' + key + '|' + o[0] + '" class="' + (cur === o[0] ? 'on' : '') + '">' + E(o[1]) + (o[2] != null && o[2] !== '' ? ' <span class="ct">' + o[2] + '</span>' : '') + '</button>'; }).join('') + '</div>'; };
  OPS.stat = function (v, l, cls, s) { return '<div class="stat ' + (cls || '') + '"><div class="v">' + v + '</div><div class="l">' + E(l) + '</div>' + (s ? '<div class="s">' + s + '</div>' : '') + '</div>'; };
  OPS.csv = function (name, k, rows, cols) {
    var l = OPS.LAYERS[k]; cols = cols || l.fields.filter(function (f) { return !(f[4] || {}).hide; }).map(function (f) { return f[0]; });
    var head = cols.map(function (c) { var fd = l.fields.find(function (x) { return x[0] === c; }); return fd ? fd[3] : c; });
    var data = rows.map(function (r) { return cols.map(function (c) { var fd = l.fields.find(function (x) { return x[0] === c; }); var v = r[c]; return fd && fd[1] === 'T' && v ? OPS.dt(v) : v; }); });
    U.download(name + '.csv', U.csv([head].concat(data)), 'text/csv');
  };
  // print a simple branded report
  OPS.print = function (title, sub, html) {
    var w = window.open('', '_blank'); if (!w) { U.toast('Allow pop-ups to print', 'err'); return; }
    w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>' + E(title) + '</title><style>body{font:12px/1.35 Arial,sans-serif;color:#111;margin:24px}h1{font:800 18px Arial;margin:0}h2{font:700 14px Arial;margin:16px 0 6px;border-bottom:2px solid #0B1A2B}.k{font:700 10px Arial;letter-spacing:2px;color:#9a6b00}.sub{color:#444;margin:2px 0 12px}table{border-collapse:collapse;width:100%;margin:6px 0}th,td{border:1px solid #999;padding:4px 6px;text-align:left;vertical-align:top}th{background:#e8edf3;font-size:11px}.bar{height:5px;background:linear-gradient(90deg,#D02129 0 33%,#FDB833 33% 66%,#2E3192 66%);margin:8px 0 14px}.r{text-align:right}.foot{margin-top:20px;font-size:10px;color:#666}@media print{body{margin:10mm}}</style></head><body>' +
      '<div class="k">BOTETOURT COUNTY EMERGENCY MANAGEMENT</div><h1>' + E(title) + '</h1><div class="sub">' + (sub || '') + '</div><div class="bar"></div>' + html + '<div class="foot">Printed ' + E(CP.fmtDT(CP.now())) + ' by ' + E(OPS.me()) + ' · EM Ops (ArcGIS)</div><script>setTimeout(function(){print()},300)<\/script></body></html>');
    w.document.close();
  };
  OPS.ptable = function (head, rows) { return '<table><thead><tr>' + head.map(function (h) { return '<th>' + E(h) + '</th>'; }).join('') + '</tr></thead><tbody>' + rows.map(function (r) { return '<tr>' + r.map(function (c) { return '<td>' + (c == null ? '' : E(c)) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table>'; };

  // map helper for tool pages
  OPS.mapPage = function (id, h) { return '<div class="map" id="' + id + '" style="height:' + (h || 460) + 'px"></div>'; };
  OPS.drawMap = function (id, pts, o) {
    o = o || {}; var el = document.getElementById(id); if (!el) return null;
    var m = CP.map.create(el, {}), g = L.featureGroup().addTo(m);
    pts.forEach(function (p) { if (!p.ll) return; var mk = L.marker(p.ll, { icon: p.dot ? CP.map.dotIcon(p.c || '#FDB833', p.s || 12) : CP.map.pinIcon(p.c || '#FDB833', p.t || '', p.s || 24) }); if (p.pop) mk.bindPopup(p.pop); if (p.act) mk.on('click', function () { OPS.act[p.act[0]](p.act[1]); }); g.addLayer(mk); });
    (o.polys || []).forEach(function (pg) { L.polygon(pg.ll, { color: pg.c || '#F0444C', weight: 2, fillOpacity: 0.12 }).bindPopup(pg.pop || '').addTo(m); });
    if (g.getLayers().length && o.fit !== false) m.fitBounds(g.getBounds().pad(0.2), { maxZoom: 14 });
    setTimeout(function () { m.invalidateSize(); }, 100);
    return m;
  };
  OPS.ringsLL = function (geom) { return (geom && geom.rings || []).map(function (r) { return r.map(function (p) { return [p[1], p[0]]; }); }); };
  OPS.inRings = function (lat, lng, rings) { var ins = false; (rings || []).forEach(function (p) { for (var i = 0, j = p.length - 1; i < p.length; j = i++) { var yi = p[i][1], xi = p[i][0], yj = p[j][1], xj = p[j][0]; if (((yi > lat) !== (yj > lat)) && (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi)) ins = !ins; } }); return ins; };
  OPS.miles = function (a, b, c, d) { var R = 3958.8, r = Math.PI / 180, x = Math.sin((c - a) * r / 2), y = Math.sin((d - b) * r / 2); return 2 * R * Math.asin(Math.sqrt(x * x + Math.cos(a * r) * Math.cos(c * r) * y * y)); };

  // ---------- shell ----------
  function headerArt() {
    var g = ''; for (var x = 0; x <= 2000; x += 40) g += '<line x1="' + x + '" y1="0" x2="' + x + '" y2="120"/>'; for (var y = 0; y <= 120; y += 40) g += '<line x1="0" y1="' + y + '" x2="2000" y2="' + y + '"/>';
    return '<div class="art"><svg viewBox="0 0 2000 120" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="hg" x1="0" x2="1"><stop offset="0" stop-color="#08131F"/><stop offset=".55" stop-color="#0d2238"/><stop offset="1" stop-color="#16365c"/></linearGradient><radialGradient id="hr" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#FDB833" stop-opacity=".22"/><stop offset="1" stop-color="#FDB833" stop-opacity="0"/></radialGradient></defs>' +
      '<rect width="2000" height="120" fill="url(#hg)"/><g stroke="#ffffff" stroke-opacity=".035" stroke-width="1">' + g + '</g><g transform="translate(1250 58)"><circle r="120" fill="url(#hr)"/><g fill="none" stroke="#FDB833" stroke-opacity=".22"><circle r="26"/><circle r="52"/><circle r="80" stroke-opacity=".14"/><circle r="110" stroke-opacity=".08"/></g>' +
      '<g stroke="#FDB833" stroke-opacity=".35"><line x1="-130" y1="0" x2="-30" y2="0"/><line x1="30" y1="0" x2="130" y2="0"/><line x1="0" y1="-70" x2="0" y2="-30"/><line x1="0" y1="30" x2="0" y2="70"/></g><g id="hdrGlyph"></g></g>' +
      '<g stroke="#3D7BFF" stroke-opacity=".18" fill="none"><path d="M1500 120 L1640 0"/><path d="M1560 120 L1700 0"/><path d="M1620 120 L1760 0"/></g></svg></div>';
  }
  OPS.mount = function () {
    document.getElementById('app').innerHTML = '<header class="hdr">' + headerArt() + '<button class="ibtn mnav" data-act="menu" style="position:relative;margin-left:8px;color:#fff">' + I('menu') + '</button><img class="seal" src="seal.png" alt="Botetourt County Emergency Management seal"><div class="lock opslock" data-act="go" data-a="home" id="lock"></div><div class="right"><div class="clock" id="clock"></div></div></header>' +
      '<div id="ibar"></div><div class="body"><nav class="nav" id="nav"></nav><main class="main" id="main"></main></div>' +
      '<datalist id="dl_kinds">' + CP.RES_KINDS.map(function (k) { return '<option value="' + E(k) + '">'; }).join('') + '</datalist>' +
      '<datalist id="dl_agency">' + OPS.LISTS.owner.concat(['Virginia State Police', 'VDOT', 'American Red Cross', 'AEP', 'Craig-Botetourt Electric Cooperative', 'Carilion Clinic', 'Roanoke County', 'Rockbridge County', 'Craig County', 'Bedford County', 'Virginia Dept. of Forestry', 'Virginia Dept. of Health']).map(function (k) { return '<option value="' + E(k) + '">'; }).join('') + '</datalist>';
    tick(); setInterval(tick, 15000);
  };
  function tick() { var d = new Date(), el = document.getElementById('clock'); if (el) el.innerHTML = CP.pad(d.getHours()) + CP.pad(d.getMinutes()) + '<small>' + d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase() + '</small>'; }
  OPS.paintChrome = function () {
    var t = OPS.tools[OPS.st.tool] || OPS.tools.home;
    document.getElementById('lock').innerHTML = '<div class="k">' + E(CP.BRAND) + ' · BOTETOURT COUNTY EMERGENCY MANAGEMENT</div><div class="t">' + E(t.n.toUpperCase()) + '</div><div class="s">' + E((t.sub || '').toUpperCase()) + '</div>';
    document.title = t.n + ' · ' + CP.BRAND + ' · Botetourt County EM';
    var st = A.status, sync = !A.signedIn() ? '<span class="sync">' + I('cloud') + 'Not signed in</span>' : st === 'busy' ? '<span class="sync busy">' + I('cloud') + 'Connecting…</span>' : st === 'err' ? '<span class="sync err" title="' + E(A.err) + '">' + I('cloud') + 'Offline</span>' : '<span class="sync on" title="County ArcGIS Online">' + I('cloud') + 'ArcGIS</span>';
    var sel = '<select class="in incsel" data-chg="inc"><option value="">County-wide (no incident)</option>' + OPS.incList.filter(function (a) { return a.status !== 'Closed' || (OPS.inc && a.incident_key === OPS.inc.key); }).map(function (a) { return '<option value="' + E(a.incident_key) + '"' + (OPS.inc && OPS.inc.key === a.incident_key ? ' selected' : '') + '>' + E(a.incident_name) + ' · ' + E(a.incident_number) + (a.status === 'Closed' ? ' (closed)' : '') + '</option>'; }).join('') +
      (OPS.incList.some(function (a) { return a.status === 'Closed'; }) ? '<optgroup label="Closed incidents">' + OPS.incList.filter(function (a) { return a.status === 'Closed' && !(OPS.inc && a.incident_key === OPS.inc.key); }).slice(0, 40).map(function (a) { return '<option value="' + E(a.incident_key) + '">' + E(a.incident_name) + ' · ' + E(a.incident_number) + '</option>'; }).join('') + '</optgroup>' : '') + '</select>';
    var inc = OPS.inc; CP.practice = !!(inc && inc.exercise); document.body.classList.toggle('practice', CP.practice);
    document.getElementById('ibar').innerHTML = '<div class="ibar"><span class="dim" style="font:700 12px var(--cond);letter-spacing:1.6px">INCIDENT</span>' + sel +
      (inc && inc.exercise ? '<span class="chip practice">PRACTICE</span>' : '') + (inc ? '<span class="chip ' + (inc.status === 'Closed' ? 'mute' : 'ok') + '">' + (inc.status === 'Closed' ? 'Closed' : '<span class="dot"></span>Active ' + E(CP.elapsed(new Date(inc.start).toISOString()))) + '</span><a class="btn sm ghost" href="' + OPS.cpLink() + '" target="_blank" rel="noopener">' + I('link') + 'Command Post</a>' : '') +
      '<span class="sp"></span>' + sync + (A.signedIn() ? '<span class="dim" style="font-size:13px">' + E(OPS.me()) + '</span>' : '<button class="btn sm pri" data-act="signin">Sign in with ArcGIS</button>') + '</div>';
    var nav = document.getElementById('nav');
    if (OPS.st.solo) { document.body.classList.add('solo'); nav.innerHTML = ''; return; }
    var h = '';
    OPS.GROUPS.forEach(function (g) { h += '<div class="grp">' + E(g[0]) + '</div>' + g[1].filter(function (k) { return OPS.tools[k] && OPS.canUse(k); }).map(function (k) { var x = OPS.tools[k]; return '<a href="#' + k + '" data-act="go" data-a="' + k + '" class="' + (OPS.st.tool === k ? 'on' : '') + '">' + I(x.icon || 'list') + E(x.n) + (x.badge ? '<span class="ct">' + x.badge + '</span>' : '') + '</a>'; }).join(''); });
    h += '<div class="grp">Linked apps</div><a href="' + OPS.cpLink() + '" target="_blank" rel="noopener">' + I('brief') + 'Command Post</a>' + CP.TOOLKIT.slice(0, 5).map(function (t) { return '<a href="' + t.u + '" target="_blank" rel="noopener">' + I('link') + E(t.n) + '</a>'; }).join('');
    nav.innerHTML = h;
  };
  OPS.render = function () {
    var main = document.getElementById('main'); if (!main) return;
    var t = OPS.tools[OPS.st.tool] || OPS.tools.home, html;
    if (!A.signedIn()) html = signInPage(t);
    else if (!OPS.canUse(t.k)) html = '<div class="wrap">' + OPS.noAccess(t) + '</div>';
    else { try { html = '<div class="wrap">' + t.render() + (t.eop && OPS.eopCard ? OPS.eopCard(t.eop) : '') + '</div>'; } catch (e) { console.error(e); html = '<div class="wrap"><div class="warnbox">This page hit an error: ' + E(e.message) + '</div></div>'; } }
    var y = main.scrollTop; main.innerHTML = html; if (OPS._keep) main.scrollTop = y; OPS._keep = false;
    OPS.paintChrome();
    if (A.signedIn() && t.after) try { t.after(); } catch (e) { console.error(e); }
    document.getElementById('nav').classList.remove('open');
  };
  OPS.repaint = function () { if (document.getElementById('modal') && OPS.st.holdForModal) return; var a = document.activeElement; if (a && a.closest && a.closest('#main') && /INPUT|TEXTAREA|SELECT/.test(a.tagName) && a.dataset.chg !== 'search') return; OPS._keep = true; OPS.render(); };
  OPS.go = function (k) { if (!OPS.tools[k]) k = 'home'; OPS.st.tool = k; OPS.st.ui = {}; if (location.hash !== '#' + k) history.replaceState(null, '', location.pathname + location.search.replace(/([?&])tool=[^&]*&?/, '$1').replace(/[?&]$/, '') + '#' + k); document.getElementById('main').scrollTop = 0; OPS.render(); };
  function signInPage(t) {
    return '<div class="wrap"><div class="hero"><h2>' + E(t.n) + '</h2><p>' + E(t.d || '') + '</p><p>Part of <b>' + E(CP.BRAND) + '</b>' + (CP.BRAND_LONG ? ' (' + E(CP.BRAND_LONG) + ')' : '') + ', the county\'s emergency operations system. Records live in Botetourt County ArcGIS Online and share incidents with Command Post. Sign in with your county ArcGIS account to continue.</p><button class="btn big pri" data-act="signin">' + I('cloud') + 'Sign in with ArcGIS</button></div></div>';
  }

  // ---------- events ----------
  OPS.act.go = function (k) { OPS.go(k); };
  OPS.act.signin = function () { A.signIn(); };
  OPS.act.menu = function () { document.getElementById('nav').classList.toggle('open'); };
  OPS.act.refresh = function () { OPS.bust(); OPS.render(); };
  OPS.chg.inc = function (el) { OPS.setInc(el.value); };
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]'); if (!el) return;
    var f = OPS.act[el.dataset.act]; if (!f) return;
    if (el.tagName === 'A' && el.getAttribute('target') === '_blank') return;
    e.preventDefault(); try { var r = f(el.dataset.a, el, e); if (r && r.catch) r.catch(function (er) { console.error(er); U.toast(E(er.message), 'err', 6000); }); } catch (er) { console.error(er); U.toast(E(er.message), 'err', 6000); }
  });
  document.addEventListener('change', function (e) { var el = e.target.closest('[data-chg]'); if (!el || e.target.dataset.chg === 'search') return; var f = OPS.chg[el.dataset.chg]; if (f) f(el, e); });
  document.addEventListener('input', function (e) { var el = e.target; if (el.dataset && el.dataset.chg === 'search') OPS.chg.search(el); });
  window.addEventListener('hashchange', function () { var k = location.hash.slice(1); if (k && k !== OPS.st.tool && OPS.tools[k]) { OPS.st.tool = k; OPS.st.ui = {}; OPS.render(); } });

  // ---------- boot ----------
  OPS.boot = async function () {
    var qs = new URLSearchParams(location.search), en = OPS.st.entry;
    OPS.mount();
    try { if (await A.handleRedirect() === 'away') return; } catch (e) { console.warn(e); }
    qs = new URLSearchParams(location.search);
    OPS.st.tool = en.tool || qs.get('tool') || location.hash.slice(1) || 'home'; if (!OPS.tools[OPS.st.tool]) OPS.st.tool = 'home';
    OPS.st.solo = !!en.solo || qs.get('solo') === '1';
    if (qs.get('incident')) { OPS.st.wantInc = qs.get('incident'); CP.store.setPref('opsInc', OPS.st.wantInc); }
    OPS.st.params = qs;
    OPS.render();
    if (A.signedIn()) {
      await A.connect();
      if (!CP.me.name && A.user) { CP.me = Object.assign({}, CP.me, { name: A.user.name }); CP.store.setPref('me', CP.me); }
      if (A.user) { await Promise.all([OPS.findServices(), OPS.loadIncidents()]); }
      OPS.render();
    }
    // another tab or Command Post picked a different incident: follow it
    window.addEventListener('storage', function (ev) {
      if (ev.key !== 'bcem.cp.prefs.v1') return; var cur = CP.store.prefs().curInc; if (!cur) return;
      var now = OPS.inc ? OPS.inc.key : ''; if (cur.key === now || document.getElementById('modal')) return;
      if (!cur.key || OPS.incList.some(function (a) { return a.incident_key === cur.key; })) { OPS.setInc(cur.key, true); U.toast(cur.key ? 'Switched to ' + E(OPS.inc ? OPS.inc.name : 'the incident') + ' (picked in another window)' : 'Switched to county-wide (picked in another window)'); }
    });
    window.addEventListener('cp-reconnected', function () { Promise.all([OPS.findServices(), OPS.loadIncidents()]).then(function () { OPS.bust(); OPS.render(); }); });
    window.addEventListener('cp-outbox', function () { if (!CP.sync.busy) { OPS.bust(); OPS.repaint(); } });
    setInterval(function () { if (!A.signedIn() || document.getElementById('modal')) return; var t = OPS.tools[OPS.st.tool]; if (t && t.live) { OPS.bust(t.live === true ? null : t.live); OPS.repaint(); } }, 60000);
    setInterval(function () { if (A.signedIn() && A.user) OPS.loadIncidents().then(OPS.paintChrome); }, 120000);
  };
})(window.CP);
