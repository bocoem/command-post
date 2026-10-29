/* COMMAND POST — ArcGIS Online integration
   Sign-in (OAuth 2.0 + PKCE), the Command Post's own hosted service, write-through to the county EM layers,
   and live read-only feeds from CAD, Stormwatch, shelters, damage assessment, roads and NWS. */
(function (CP) {
  'use strict';
  var C = window.CP_CONFIG || {};
  var B = 'https://services6.arcgis.com/6h5xc2eGkGuRiFia/arcgis/rest/services/';
  var arc = CP.arc = {
    portal: C.portal || 'https://botetourt.maps.arcgis.com',
    clientId: C.clientId || '',
    serviceName: C.serviceName || 'BOCO_Command_Post',
    L: {
      incPoints: B + 'Incidents_468a9f8a8b8e4b2a9c4102a1d00243f1/FeatureServer/0',
      incAreas: B + 'Incidents_468a9f8a8b8e4b2a9c4102a1d00243f1/FeatureServer/2',
      facilities: B + 'IncidentFacilities_468a9f8a8b8e4b2a9c4102a1d00243f1/FeatureServer/0',
      pubMsg: B + 'EmergencyInformation_468a9f8a8b8e4b2a9c4102a1d00243f1/FeatureServer/0',
      lifelines: B + 'EmergencyInformation_468a9f8a8b8e4b2a9c4102a1d00243f1/FeatureServer/1',
      shelters: B + 'Resources_468a9f8a8b8e4b2a9c4102a1d00243f1/FeatureServer/1',
      pods: B + 'Resources_468a9f8a8b8e4b2a9c4102a1d00243f1/FeatureServer/0',
      closures: B + 'RoadClosures_ad0e8a3412044da3bf1b9d6ebdb3c97e/FeatureServer/1',
      notices: B + 'NoticesAndEvacuations_468a9f8a8b8e4b2a9c4102a1d00243f1/FeatureServer/0',
      sitrep: B + 'SitRep_Reports/FeatureServer/0',
      lifelineTasks: B + 'Lifeline_Tasks/FeatureServer/0',
      shelterReg: B + 'BOCO_Shelter_Registry/FeatureServer/0',
      shelterOut: B + 'BOCO_Shelter_Checkouts_staff/FeatureServer/0',
      daZones: B + 'BOCO_DA_Operations/FeatureServer/0',
      daConfig: B + 'BOCO_DA_Operations/FeatureServer/1',
      daTeams: B + 'BOCO_DA_Operations/FeatureServer/2',
      cad: B + 'CAD%20Calls%20For%20Service%20-%20Active/FeatureServer/0',
      cadUnits: B + 'CAD%20Units/FeatureServer/0',
      stormResp: B + 'survey123_87946e73db344d4da8e41655a205e6e7_results/FeatureServer/0',
      stormDisp: B + 'survey123_25c0b913f91447e88a85ccf562bdfcbb_results/FeatureServer/0',
      stormPub: B + 'survey123_8249fcd3b5db4db3a982ab6f4e65acb2_results/FeatureServer/0',
      houseChecks: B + 'survey123_3c05a771c9124f6096c7de50b40201b5_results/FeatureServer/0',
      vdot: B + 'VDOT_Incidents__SmarterRoads/FeatureServer/0',
      caltopo: B + 'CalTopo_Live_Locations/FeatureServer/0',
      nws: 'https://services9.arcgis.com/RHVPKKiFTONKtxq3/arcgis/rest/services/NWS_Watches_Warnings_v1/FeatureServer/6'
    },
    user: null, own: null, live: {}, status: 'local', err: ''
  };
  var TK = 'bcem.cp.auth.v1', MIR = 'bcem.cp.mirror.v1';

  // ---------- auth ----------
  function b64url(buf) { return btoa(String.fromCharCode.apply(null, new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function redirectUri() { return location.origin + location.pathname.replace(/index\.html$/, ''); }
  arc.auth = function () { try { return JSON.parse(localStorage.getItem(TK) || 'null'); } catch (e) { return null; } };
  function setAuth(a) { if (a) localStorage.setItem(TK, JSON.stringify(a)); else localStorage.removeItem(TK); }
  arc.signedIn = function () { var a = arc.auth(); return !!(a && a.token); };
  arc.configured = function () { return !!arc.clientId; };

  arc.signIn = async function () {
    if (!arc.clientId) { CP.ui.toast('ArcGIS sign-in is not configured yet. Add the app\'s client ID in js/config.js.', 'err', 6000); return; }
    var v = b64url(crypto.getRandomValues(new Uint8Array(32)));
    var ch = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v)));
    var st = b64url(crypto.getRandomValues(new Uint8Array(12)));
    sessionStorage.setItem('cp.pkce', JSON.stringify({ v: v, st: st, back: location.hash }));
    location.href = arc.portal + '/sharing/rest/oauth2/authorize?' + new URLSearchParams({ client_id: arc.clientId, response_type: 'code', redirect_uri: redirectUri(), code_challenge: ch, code_challenge_method: 'S256', state: st, expiration: '20160' });
  };
  arc.handleRedirect = async function () {
    var q = new URLSearchParams(location.search); if (!q.get('code') && !q.get('error')) return false;
    var pk = JSON.parse(sessionStorage.getItem('cp.pkce') || '{}'); sessionStorage.removeItem('cp.pkce');
    history.replaceState(null, '', location.pathname + (pk.back || ''));
    if (q.get('error')) { CP.ui.toast('ArcGIS sign-in was cancelled.', 'err'); return false; }
    if (q.get('state') !== pk.st) { CP.ui.toast('Sign-in check failed. Try again.', 'err'); return false; }
    var r = await fetch(arc.portal + '/sharing/rest/oauth2/token', { method: 'POST', body: new URLSearchParams({ client_id: arc.clientId, grant_type: 'authorization_code', code: q.get('code'), redirect_uri: redirectUri(), code_verifier: pk.v }) }).then(function (x) { return x.json(); });
    if (!r.access_token) { CP.ui.toast('Sign-in failed: ' + ((r.error && r.error.message) || 'no token'), 'err', 6000); return false; }
    setAuth({ token: r.access_token, exp: Date.now() + (r.expires_in - 60) * 1000, refresh: r.refresh_token, user: r.username });
    return true;
  };
  async function token() {
    var a = arc.auth(); if (!a) return null;
    if (Date.now() < a.exp) return a.token;
    if (!a.refresh) { setAuth(null); return null; }
    var r = await fetch(arc.portal + '/sharing/rest/oauth2/token', { method: 'POST', body: new URLSearchParams({ client_id: arc.clientId, grant_type: 'refresh_token', refresh_token: a.refresh }) }).then(function (x) { return x.json(); }).catch(function () { return {}; });
    if (!r.access_token) { setAuth(null); arc.user = null; arc.status = 'local'; CP.app && CP.app.paintChrome(); return null; }
    a.token = r.access_token; a.exp = Date.now() + (r.expires_in - 60) * 1000; setAuth(a); return a.token;
  }
  arc.signOut = function () { setAuth(null); arc.user = null; arc.own = null; arc.status = 'local'; };

  // ---------- REST ----------
  arc.req = async function (url, params, post) {
    var t = await token();
    var p = Object.assign({ f: 'json' }, params || {});
    if (t) p.token = t;
    Object.keys(p).forEach(function (k) { if (typeof p[k] === 'object') p[k] = JSON.stringify(p[k]); });
    var res = post ? await fetch(url, { method: 'POST', body: new URLSearchParams(p) }) : await fetch(url + (url.indexOf('?') > 0 ? '&' : '?') + new URLSearchParams(p));
    var j = await res.json();
    if (j && j.error) { var e = new Error(j.error.message || 'ArcGIS error'); e.code = j.error.code; e.details = j.error.details; throw e; }
    return j;
  };
  arc.query = function (layer, where, o) {
    o = o || {};
    return arc.req(layer + '/query', Object.assign({ where: where || '1=1', outFields: o.fields || '*', returnGeometry: !!o.geom, outSR: 4326, resultRecordCount: o.n || 2000, orderByFields: o.order || '' }, o.extra || {}))
      .then(function (r) { return r.features || []; });
  };
  arc.count = function (layer, where) { return arc.req(layer + '/query', { where: where || '1=1', returnCountOnly: true }).then(function (r) { return r.count || 0; }); };
  arc.stats = function (layer, where, stats, group) { return arc.req(layer + '/query', { where: where || '1=1', outStatistics: stats, groupByFieldsForStatistics: group || '' }).then(function (r) { return (r.features || []).map(function (f) { return f.attributes; }); }); };
  function edits(layer, kind, feats) {
    if (!feats.length) return Promise.resolve([]);
    var p = {}; p[kind === 'deletes' ? 'objectIds' : 'features'] = kind === 'deletes' ? feats.join(',') : feats;
    var op = { adds: 'addFeatures', updates: 'updateFeatures', deletes: 'deleteFeatures' }[kind];
    return arc.req(layer + '/' + op, p, true).then(function (r) {
      var rr = r.addResults || r.updateResults || r.deleteResults || [];
      var bad = rr.filter(function (x) { return !x.success; });
      if (bad.length) throw new Error((bad[0].error && bad[0].error.description) || 'Edit failed');
      return rr;
    });
  }
  arc.add = function (l, f) { return edits(l, 'adds', f); };
  arc.update = function (l, f) { return edits(l, 'updates', f); };
  arc.del = function (l, ids) { return edits(l, 'deletes', ids); };
  function sq(s) { return "'" + String(s).replace(/'/g, "''") + "'"; }
  arc.sq = sq;
  function ms(iso) { return iso ? new Date(iso).getTime() : null; }
  function cut(s, n) { s = s == null ? '' : String(s); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
  // geometry: layers here are Web Mercator; send WGS84 with spatialReference so the server projects it
  function pt(lat, lng) { return lat != null && lng != null ? { x: +lng, y: +lat, spatialReference: { wkid: 4326 } } : null; }
  function poly(latlngs) { return latlngs && latlngs.length > 2 ? { rings: [latlngs.map(function (p) { return [p[1], p[0]]; }).concat([[latlngs[0][1], latlngs[0][0]]])], spatialReference: { wkid: 4326 } } : null; }
  // project WGS84 geometry to the layer's spatial reference (county layers are Web Mercator)
  var srCache = {};
  async function layerWkid(layer) {
    if (srCache[layer]) return srCache[layer];
    var info = await arc.req(layer).catch(function () { return {}; });
    var sr = (info.extent && info.extent.spatialReference) || info.spatialReference || {};
    return (srCache[layer] = sr.latestWkid || sr.wkid || 4326);
  }
  function merc(x, y) { var R = 6378137; return [x * Math.PI / 180 * R, R * Math.log(Math.tan(Math.PI / 4 + y * Math.PI / 360))]; }
  async function toLayerSR(layer, g) {
    if (!g) return g;
    var w = await layerWkid(layer);
    if (w !== 3857 && w !== 102100) return g;
    var out = { spatialReference: { wkid: 102100, latestWkid: 3857 } };
    if (g.rings) out.rings = g.rings.map(function (r) { return r.map(function (p) { return merc(p[0], p[1]); }); });
    else { var m = merc(g.x, g.y); out.x = m[0]; out.y = m[1]; }
    return out;
  }
  async function upsert(layer, keyField, keyVal, attrs, geom) {
    geom = await toLayerSR(layer, geom);
    var f = await arc.query(layer, keyField + '=' + sq(keyVal), { fields: 'OBJECTID', n: 1 }).catch(function () { return arc.query(layer, keyField + '=' + sq(keyVal), { fields: '*', n: 1 }); });
    var feat = { attributes: attrs }; if (geom) feat.geometry = geom;
    if (f.length) { var a = f[0].attributes, oidF = Object.keys(a).find(function (k) { return /^objectid$/i.test(k) || /^fid$/i.test(k); }); feat.attributes[oidF || 'OBJECTID'] = a[oidF || 'OBJECTID']; await arc.update(layer, [feat]); return 'updated'; }
    await arc.add(layer, [feat]); return 'added';
  }

  // ---------- connect ----------
  arc.connect = async function () {
    if (!arc.signedIn()) { arc.status = 'local'; return false; }
    arc.status = 'busy'; CP.app && CP.app.paintChrome();
    try {
      var me = await arc.req(arc.portal + '/sharing/rest/community/self');
      var portal = await arc.req(arc.portal + '/sharing/rest/portals/self');
      arc.user = { username: me.username, name: me.fullName, email: me.email, role: me.role, privileges: me.privileges || [], orgId: portal.id, canPublish: (me.privileges || []).indexOf('portal:publisher:publishFeatures') >= 0 };
      if (!CP.me || !CP.me.name) CP.app && CP.app.setMe({ name: me.fullName, pos: (CP.me && CP.me.pos) || '' });
      await arc.findOwn();
      arc.status = arc.own ? 'on' : 'nosvc'; arc.err = '';
    } catch (e) { arc.status = 'err'; arc.err = e.message; console.warn(e); }
    CP.app && CP.app.paintChrome();
    return arc.status === 'on';
  };

  // ---------- Command Post's own service ----------
  arc.findOwn = async function () {
    var fixed = C.serviceUrl || CP.store.prefs().serviceUrl;
    if (fixed) { arc.own = { url: fixed.replace(/\/$/, '') }; return arc.own; }
    var r = await arc.req(arc.portal + '/sharing/rest/search', { q: 'title:"' + arc.serviceName + '" AND type:"Feature Service" AND orgid:' + arc.user.orgId, num: 5 });
    var it = (r.results || []).find(function (x) { return x.title === arc.serviceName; });
    arc.own = it ? { url: it.url.replace(/\/$/, ''), id: it.id } : null;
    return arc.own;
  };
  function fld(name, type, len, alias) { var f = { name: name, type: 'esriFieldType' + type, alias: alias || name, nullable: true, editable: true }; if (type === 'String') f.length = len || 255; return f; }
  var BASE_FIELDS = [{ name: 'OBJECTID', type: 'esriFieldTypeOID', alias: 'OBJECTID', nullable: false, editable: false }, { name: 'GlobalID', type: 'esriFieldTypeGlobalID', alias: 'GlobalID', length: 38, nullable: false, editable: false },
    fld('CreationDate', 'Date'), fld('Creator', 'String', 128), fld('EditDate', 'Date'), fld('Editor', 'String', 128)];
  function layerDef(id, name, type, fields, geom) {
    var d = { id: id, name: name, type: type, displayField: fields[0].name, description: 'Command Post (Botetourt County EM)', objectIdField: 'OBJECTID', globalIdField: 'GlobalID',
      fields: BASE_FIELDS.concat(fields), hasAttachments: false, capabilities: 'Create,Delete,Query,Update,Editing,ChangeTracking',
      editFieldsInfo: { creationDateField: 'CreationDate', creatorField: 'Creator', editDateField: 'EditDate', editorField: 'Editor' } };
    if (geom) { d.geometryType = geom; d.extent = { xmin: -80.2, ymin: 37.3, xmax: -79.4, ymax: 37.85, spatialReference: { wkid: 4326 } };
      d.drawingInfo = { renderer: { type: 'simple', symbol: { type: 'esriSMS', style: 'esriSMSDiamond', color: [253, 184, 51, 255], size: 14, outline: { color: [11, 26, 43, 255], width: 1.5 } } } }; }
    return d;
  }
  arc.createOwn = async function () {
    var u = arc.user.username, name = arc.serviceName;
    var cp = { name: name, serviceDescription: 'Command Post incident management records (Botetourt County EM).', hasStaticData: false, maxRecordCount: 2000, supportedQueryFormats: 'JSON', capabilities: 'Create,Delete,Query,Update,Editing,ChangeTracking',
      spatialReference: { wkid: 4326 }, initialExtent: { xmin: -80.2, ymin: 37.3, xmax: -79.4, ymax: 37.85, spatialReference: { wkid: 4326 } }, allowGeometryUpdates: true, units: 'esriDecimalDegrees',
      xssPreventionInfo: { xssPreventionEnabled: true, xssPreventionRule: 'InputOnly', xssInputRule: 'rejectInvalid' },
      editorTrackingInfo: { enableEditorTracking: true, enableOwnershipAccessControl: false, allowOthersToUpdate: true, allowOthersToDelete: false } };
    var r = await arc.req(arc.portal + '/sharing/rest/content/users/' + u + '/createService', { createParameters: cp, outputType: 'featureService', tags: 'Command Post,ICS,Emergency Management', snippet: 'Command Post incident records, activity log and resource check-ins.' }, true);
    if (!r.success) throw new Error('Could not create the service');
    var admin = r.encodedServiceURL.replace('/rest/services/', '/rest/admin/services/');
    var S = function (n, l, a) { return fld(n, 'String', l, a); };
    var layers = [
      layerDef(0, 'CP_Incidents', 'Feature Layer', [S('incident_key', 40, 'Incident Key'), S('incident_number', 64, 'Incident Number'), S('incident_name', 255, 'Incident Name'), S('incident_type', 75, 'Type'), fld('complexity', 'Integer', 0, 'Complexity Type'), S('status', 20, 'Status'),
        fld('start_time', 'Date', 0, 'Start'), fld('closed_time', 'Date', 0, 'Closed'), fld('op_period', 'Integer', 0, 'Current Op Period'), S('ic_name', 150, 'Incident Commander'), S('location_desc', 500, 'Location'), S('eoc_status', 60, 'EOC Status'),
        fld('resources_count', 'Integer', 0, 'Resources'), fld('personnel_count', 'Integer', 0, 'Personnel'), S('public_view', 5, 'Public'), S('doc_version', 64, 'Doc Version'), S('doc', 20000000, 'Incident Record (compressed)')], 'esriGeometryPoint'),
      layerDef(1, 'CP_Log', 'Table', [S('incident_key', 40), S('incident_name', 255, 'Incident'), S('entry_id', 40), fld('entry_time', 'Date', 0, 'Time'), S('author', 150, 'Author'), S('position', 150, 'Position'), S('category', 40, 'Category'), S('entry_text', 4000, 'Entry'), fld('op_period', 'Integer', 0, 'Op Period')]),
      layerDef(2, 'CP_Resources', 'Table', [S('incident_key', 40), S('incident_name', 255, 'Incident'), S('res_id', 40), S('resource_name', 150, 'Resource'), S('kind', 80, 'Kind'), S('rtype', 20, 'Type'), S('agency', 150, 'Agency'), S('leader', 150, 'Leader'), fld('persons', 'Integer', 0, 'Personnel'),
        S('status', 40, 'Status'), S('assignment', 150, 'Assignment'), fld('checkin_time', 'Date', 0, 'Checked In'), S('contact', 255, 'Contact'), S('location', 255, 'Location')])
    ];
    var a = await arc.req(admin + '/addToDefinition', { addToDefinition: { layers: layers.filter(function (l) { return l.type !== 'Table'; }), tables: layers.filter(function (l) { return l.type === 'Table'; }) } }, true);
    if (!a.success) throw new Error('Could not build the layers');
    arc.own = { url: r.encodedServiceURL.replace(/\/$/, ''), id: r.itemId };
    CP.store.setPref('serviceUrl', arc.own.url);
    arc.status = 'on';
    return arc.own;
  };
  function own(i) { return arc.own.url + '/' + i; }

  // ---------- doc encoding (gzip + base64 keeps it compact and XSS-filter safe) ----------
  async function enc(obj) {
    var s = JSON.stringify(obj);
    if (window.CompressionStream) {
      var st = new Blob([s]).stream().pipeThrough(new CompressionStream('gzip'));
      var buf = new Uint8Array(await new Response(st).arrayBuffer()), bin = '';
      for (var i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
      return 'gz:' + btoa(bin);
    }
    return 'b64:' + btoa(unescape(encodeURIComponent(s)));
  }
  async function dec(s) {
    if (!s) return null;
    if (s.indexOf('gz:') === 0) {
      var bin = atob(s.slice(3)), buf = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
      var st = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
      return JSON.parse(await new Response(st).text());
    }
    if (s.indexOf('b64:') === 0) return JSON.parse(decodeURIComponent(escape(atob(s.slice(4)))));
    return JSON.parse(s);
  }
  arc._enc = enc; arc._dec = dec;

  // ---------- sync ----------
  var seen = {}; // incident id -> {oid, ver}
  arc.listRemote = async function () {
    if (arc.status !== 'on') return [];
    var f = await arc.query(own(0), '1=1', { fields: 'OBJECTID,incident_key,incident_number,incident_name,incident_type,complexity,status,start_time,closed_time,op_period,ic_name,location_desc,doc_version,EditDate,Editor', order: 'EditDate DESC', n: 500 });
    return f.map(function (x) { var a = x.attributes; seen[a.incident_key] = seen[a.incident_key] || {}; seen[a.incident_key].oid = a.OBJECTID; return a; });
  };
  arc.loadRemote = async function (key) {
    var f = await arc.query(own(0), 'incident_key=' + sq(key), { fields: 'OBJECTID,doc,doc_version', n: 1 });
    if (!f.length) return null;
    var a = f[0].attributes; seen[key] = { oid: a.OBJECTID, ver: a.doc_version };
    return dec(a.doc);
  };
  arc.remoteVersion = async function (key) {
    var f = await arc.query(own(0), 'incident_key=' + sq(key), { fields: 'OBJECTID,doc_version', n: 1 });
    return f.length ? f[0].attributes : null;
  };
  arc.save = async function (inc) {
    if (arc.status !== 'on') return inc;
    var key = inc.id, s = seen[key] || {};
    var rv = await arc.remoteVersion(key);
    if (rv && rv.doc_version && rv.doc_version !== s.ver) { // someone else saved since we last looked: merge first
      var remote = await arc.loadRemote(key); if (remote) inc = CP.merge(inc, remote);
    }
    var ver = CP.now() + '|' + ((arc.user && arc.user.username) || '') ;
    var ops = CP.curOP(inc);
    var attrs = { incident_key: key, incident_number: inc.number, incident_name: cut(inc.name, 255), incident_type: inc.type, complexity: inc.complexity, status: inc.status, start_time: ms(inc.start), closed_time: ms(inc.closed),
      op_period: ops ? ops.n : 1, ic_name: cut(CP.personName(inc, 'IC'), 150), location_desc: cut(inc.location.desc, 500), eoc_status: inc.eoc.eoc_status,
      resources_count: CP.alive(inc.resources).filter(function (r) { return ['Released', 'Demobilized'].indexOf(r.status) < 0; }).length, personnel_count: CP.app ? CP.app.personnel(inc) : 0,
      public_view: inc.publicView ? 'Yes' : 'No', doc_version: ver, doc: await enc(inc) };
    var feat = { attributes: attrs, geometry: pt(inc.location.lat, inc.location.lng) || undefined };
    if (rv) { attrs.OBJECTID = rv.OBJECTID; await arc.update(own(0), [feat]); }
    else { var r = await arc.add(own(0), [feat]); rv = { OBJECTID: r[0].objectId }; }
    seen[key] = { oid: rv.OBJECTID, ver: ver };
    inc.arc = inc.arc || {}; inc.arc.linked = true;
    await mirror(inc).catch(function (e) { console.warn('mirror', e); });
    return inc;
  };
  arc.checkRemote = async function (inc) { // returns merged incident if remote changed, else null
    if (arc.status !== 'on' || !inc) return null;
    var rv = await arc.remoteVersion(inc.id); if (!rv) return null;
    var s = seen[inc.id] || {};
    if (!s.ver) { seen[inc.id] = { oid: rv.OBJECTID, ver: rv.doc_version }; return null; }
    if (rv.doc_version === s.ver) return null;
    var remote = await arc.loadRemote(inc.id);
    return remote ? CP.merge(inc, remote) : null;
  };
  // mirror log + resources into plain tables so dashboards and other apps can use them
  async function mirror(inc) {
    var all = JSON.parse(localStorage.getItem(MIR) || '{}'), m = all[inc.id] = all[inc.id] || { log: {}, res: {} };
    var addL = [], delL = [];
    (inc.log || []).forEach(function (l) {
      if (l.del && m.log[l.id]) { delL.push(m.log[l.id]); delete m.log[l.id]; }
      else if (!l.del && !m.log[l.id]) addL.push({ attributes: { incident_key: inc.id, incident_name: cut(inc.name, 255), entry_id: l.id, entry_time: ms(l.ts), author: cut(l.author, 150), position: cut(l.pos, 150), category: l.cat, entry_text: cut(l.text, 4000), op_period: l.op || null } });
    });
    if (addL.length) { var r = await arc.add(own(1), addL); r.forEach(function (x, i) { m.log[addL[i].attributes.entry_id] = x.objectId; }); }
    if (delL.length) await arc.del(own(1), delL);
    var addR = [], updR = [], delR = [];
    (inc.resources || []).forEach(function (x) {
      var rec = m.res[x.id];
      if (x.del) { if (rec) { delR.push(rec.oid); delete m.res[x.id]; } return; }
      if (rec && rec.u === x.u) return;
      var at = { incident_key: inc.id, incident_name: cut(inc.name, 255), res_id: x.id, resource_name: cut(x.name, 150), kind: cut(x.kind, 80), rtype: cut(x.type, 20), agency: cut(x.agency, 150), leader: cut(x.leader, 150), persons: +x.persons || null,
        status: x.status, assignment: cut(CP.forms.assignName(inc, x.assign), 150), checkin_time: ms(x.checkin), contact: cut(x.contact, 255), location: cut(x.location, 255) };
      if (rec) { at.OBJECTID = rec.oid; updR.push({ attributes: at, _id: x.id, _u: x.u }); } else addR.push({ attributes: at, _id: x.id, _u: x.u });
    });
    if (addR.length) { var ra = await arc.add(own(2), addR.map(function (f) { return { attributes: f.attributes }; })); ra.forEach(function (x, i) { m.res[addR[i]._id] = { oid: x.objectId, u: addR[i]._u }; }); }
    if (updR.length) { await arc.update(own(2), updR.map(function (f) { return { attributes: f.attributes }; })); updR.forEach(function (f) { m.res[f._id].u = f._u; }); }
    if (delR.length) await arc.del(own(2), delR);
    localStorage.setItem(MIR, JSON.stringify(all));
  }

  // ---------- push to county EM layers ----------
  var TYPE_OK = CP.INCIDENT_TYPES;
  arc.push = {};
  arc.push.incident = async function (inc) {
    var st = inc.status === 'Closed' ? 'Closed' : 'Open', act = inc.status === 'Closed' ? 'No' : 'Yes';
    var at = { incidentid: inc.number.slice(0, 30), incidentnm: cut(inc.name, 255), incidenttp: TYPE_OK.indexOf(inc.type) >= 0 ? inc.type : 'Other', reptime: ms(inc.start),
      description: cut(inc.situation, 500), locdesc: cut(inc.location.desc || inc.location.address, 500), status: st, activeincid: act, publicview: inc.publicView ? 'Yes' : 'No' };
    var out = [];
    if (inc.location.lat) out.push('point ' + await upsert(arc.L.incPoints, 'incidentid', at.incidentid, at, pt(inc.location.lat, inc.location.lng)));
    if (inc.perimeter && inc.perimeter.length > 2) out.push('area ' + await upsert(arc.L.incAreas, 'incidentid', at.incidentid, Object.assign({}, at), poly(inc.perimeter)));
    if (!out.length) throw new Error('Set the incident location on the map first');
    return out.join(', ');
  };
  var FAC_MAP = { 'Incident Command Post': 'Incident Command Post', 'Staging Area': 'Staging Area', 'Incident Base': 'Incident Base', 'Camp': 'Camp ' };
  arc.push.facilities = async function (inc) {
    var n = 0;
    for (var f of CP.alive(inc.facilities)) {
      if (!f.lat) continue;
      var at = { facilityid: ('CP' + f.id).slice(0, 20), name: cut(f.name, 255), factype: FAC_MAP[f.type] || 'Other', agency: cut(f.agency || 'Botetourt County', 255), fulladdr: cut(f.address, 250), pocname: cut(f.poc, 255), pocphone: cut(f.phone, 15),
        status: f.status === 'Closed' || inc.status === 'Closed' ? 'Closed' : 'Open', incidentnm: cut(inc.name, 255), activeincid: inc.status === 'Closed' ? 'No' : 'Yes', notes: cut(f.type + (f.notes ? ' · ' + f.notes : ''), 500), opendate: ms(f.opened || inc.start) };
      await upsert(arc.L.facilities, 'facilityid', at.facilityid, at, pt(f.lat, f.lng)); n++;
    }
    for (var d of (inc.facilities || []).filter(function (x) { return x.del; })) {
      var q = await arc.query(arc.L.facilities, 'facilityid=' + sq(('CP' + d.id).slice(0, 20)), { fields: 'OBJECTID', n: 1 }).catch(function () { return []; });
      if (q.length) await arc.update(arc.L.facilities, [{ attributes: { OBJECTID: q[0].attributes.OBJECTID, status: 'Closed', activeincid: 'No' } }]);
    }
    if (!n) throw new Error('No facilities with a map location');
    return n + ' facilit' + (n === 1 ? 'y' : 'ies');
  };
  arc.push.publicMessage = async function (inc) {
    var p = inc.publicInfo; if (!p.shortMessage) throw new Error('Write a short public message first');
    await arc.add(arc.L.pubMsg, [{ attributes: { status: inc.status === 'Closed' ? 'Inactive' : 'Active', incidentnm: cut(inc.name, 255), shortmessage: cut(p.shortMessage, 255), longmessage: cut(p.longMessage, 1000), url: cut(p.url, 256), actionrequired: p.actionRequired ? 'Yes' : 'No', actionmessage: cut(p.actionMessage, 50) } }]);
    return 'message posted';
  };
  arc.push.lifelines = async function (inc) {
    var at = { description: cut(inc.name + ' — ' + (inc.lifelineSummary || inc.situation || ''), 1000) };
    CP.LIFELINES.forEach(function (l) { var x = inc.lifelines[l.key] || {}; at[l.key] = x.status || 'Unknown'; at[l.key + 'desc'] = cut(x.desc, 500); });
    await arc.add(arc.L.lifelines, [{ attributes: at }]);
    return 'lifeline status record added';
  };
  arc.push.sitrep = async function (inc, sr) {
    var ops = CP.curOP(inc), lv = arc.live || {};
    var at = Object.assign({}, inc.eoc, {
      sitrep_number: sr.number, report_time: ms(sr.ts), report_state: sr.final ? 'Final' : 'Live', incident_name: inc.name, operational_period: ops ? ops.n : 1, prepared_by: sr.preparedBy, next_report_due: ms(sr.nextDue),
      changes_summary: sr.changes, weather_conditions: sr.weather, road_conditions: sr.roads, fire_ems_augmentation: sr.fireEms,
      aep_customers: num(sr.aep_customers), aep_outages: num(sr.aep_outages), cb_customers: num(sr.cb_customers), cb_outages: num(sr.cb_outages), dominion_customers: num(sr.dominion_customers), dominion_outages: num(sr.dominion_outages),
      shelters_open: lv.sheltersOpen != null ? lv.sheltersOpen : null, shelter_population: lv.shelterPop != null ? lv.shelterPop : null, shelter_households: lv.shelterHH != null ? lv.shelterHH : null, shelter_pets: lv.shelterPets != null ? lv.shelterPets : null, shelter_summary: lv.shelterSummary || null
    });
    ['st1', 'st2', 'st3', 'st4', 'st5', 'st7'].forEach(function (s) { at[s + '_ems'] = (sr.stations || {})[s + '_ems'] || null; at[s + '_fire'] = (sr.stations || {})[s + '_fire'] || null; });
    CP.LIFELINES.forEach(function (l) { var x = inc.lifelines[l.key] || {}; at[l.sitrep] = x.desc ? '[' + (x.status || '') + '] ' + x.desc : (x.status || null); });
    // carry the newest damage assessment numbers forward so this SitRep stays complete
    try {
      var last = await arc.query(arc.L.sitrep, 'incident_name=' + sq(inc.name) + ' AND da_asof IS NOT NULL', { order: 'report_time DESC', n: 1 });
      if (last.length) Object.keys(last[0].attributes).forEach(function (k) { if (/^da_/.test(k)) at[k] = last[0].attributes[k]; });
    } catch (e) {}
    await arc.add(arc.L.sitrep, [{ attributes: at }]);
    return 'SitRep ' + sr.number + ' added';
  };
  function num(x) { return x === '' || x == null ? null : +x; }
  arc.push.damage = async function (inc) {
    var at = { incident_name: cut(inc.name, 150), active: inc.status === 'Closed' ? 'No' : 'Yes', incident_start: ms(inc.start), notes: cut('Activated from Command Post · ' + inc.number, 1000) };
    var d = inc.eoc.declaration_status; at.fema_declaration = /Federal/.test(d) ? 'dr' : /State/.test(d) ? 'state' : /Local/.test(d) ? 'local' : 'none';
    return 'damage assessment ' + await upsert(arc.L.daConfig, 'incident_name', at.incident_name, at);
  };

  // ---------- live feeds ----------
  function settle(p) { return p.then(function (v) { return v; }, function (e) { return { _err: e.message }; }); }
  arc.refreshLive = async function (inc) {
    if (!arc.signedIn()) return arc.live;
    var since = inc && inc.start ? new Date(new Date(inc.start).getTime() - 6 * 3600000) : new Date(Date.now() - 86400000);
    var d = "CreationDate >= TIMESTAMP '" + since.toISOString().slice(0, 19).replace('T', ' ') + "'";
    var bb = { geometry: CP.COUNTY.bbox.xmin + ',' + CP.COUNTY.bbox.ymin + ',' + CP.COUNTY.bbox.xmax + ',' + CP.COUNTY.bbox.ymax, geometryType: 'esriGeometryEnvelope', inSR: 4326, spatialRel: 'esriSpatialRelIntersects' };
    var L = arc.L;
    var R = await Promise.all([
      settle(arc.query(L.cad, '1=1', { fields: 'callid,calltype,callcat,priority,fulladdr,calldate,agency,disposition', geom: true, order: 'calldate DESC', n: 200 })),
      settle(arc.stats(L.cadUnits, '1=1', [{ statisticType: 'count', onStatisticField: 'UnitID', outStatisticFieldName: 'n' }], 'StatusName')),
      settle(arc.count(L.stormResp, d)), settle(arc.count(L.stormDisp, d)), settle(arc.count(L.stormPub, d)),
      settle(arc.query(L.shelters, "status IN ('Open','Alert','Standby')", { fields: 'facname,status,capacity,occupancy,fulladdr,allowpets', geom: true })),
      settle(arc.query(L.shelterReg, d.replace('CreationDate', 'checkin_time'), { fields: 'reg_code,shelter_name,hh_total,pet_count' })),
      settle(arc.query(L.shelterOut, d, { fields: '*' })),
      settle(arc.query(L.closures, "activeincid='Yes'", { fields: 'street,reason,description,starttime,endtime', geom: true })),
      settle(arc.query(L.notices, "activeincid='Yes'", { fields: 'zonename,evactype,description' })),
      settle(arc.stats(L.daZones, inc ? 'incident_name=' + sq(inc.name) : '1=1', [{ statisticType: 'count', onStatisticField: 'OBJECTID', outStatisticFieldName: 'n' }], 'zone_status')),
      settle(arc.query(L.sitrep, '1=1', { fields: '*', order: 'report_time DESC', n: 1 })),
      settle(arc.query(L.nws, '1=1', { fields: 'Event,Severity,End_,Affected', extra: bb, n: 50 })),
      settle(arc.count(L.vdot, '1=1')),
      settle(arc.count(L.caltopo, '1=1')),
      settle(arc.stats(L.lifelineTasks, inc ? 'incident_name=' + sq(inc.name) : '1=1', [{ statisticType: 'count', onStatisticField: 'OBJECTID', outStatisticFieldName: 'n' }], 'status')),
      settle(arc.count(L.houseChecks, d))
    ]);
    var lv = { asof: CP.fmtDT(CP.now()), errors: [] };
    function ok(x, name) { if (x && x._err) { lv.errors.push(name + ': ' + x._err); return false; } return true; }
    if (ok(R[0], 'CAD calls')) { lv.cadCalls = R[0].map(function (f) { var a = f.attributes; return { id: a.callid, type: a.calltype || a.callcat, pri: a.priority, addr: a.fulladdr, ts: a.calldate, agency: a.agency, lat: f.geometry && f.geometry.y, lng: f.geometry && f.geometry.x }; }); lv.cadCount = lv.cadCalls.length; }
    if (ok(R[1], 'CAD units')) { lv.units = {}; R[1].forEach(function (a) { lv.units[a.StatusName || 'Unknown'] = a.n; }); }
    if (ok(R[2], 'Storm reports')) lv.stormCount = (R[2] || 0) + (ok(R[3], 'Dispatch storm') ? R[3] : 0) + (ok(R[4], 'Public storm') ? R[4] : 0);
    if (ok(R[5], 'Shelters')) { lv.shelters = R[5].map(function (f) { var a = f.attributes; return { name: a.facname, status: a.status, cap: a.capacity, occ: a.occupancy, lat: f.geometry && f.geometry.y, lng: f.geometry && f.geometry.x }; }); lv.sheltersOpen = lv.shelters.filter(function (s) { return s.status === 'Open'; }).length; }
    if (ok(R[6], 'Shelter registry')) {
      var out = {}; if (!R[7]._err) R[7].forEach(function (f) { if (f.attributes.reg_code) out[f.attributes.reg_code] = 1; });
      var inS = R[6].filter(function (f) { return !out[f.attributes.reg_code]; });
      lv.shelterHH = inS.length; lv.shelterPop = inS.reduce(function (s, f) { return s + (+f.attributes.hh_total || 1); }, 0); lv.shelterPets = inS.reduce(function (s, f) { return s + (+f.attributes.pet_count || 0); }, 0);
      var byS = {}; inS.forEach(function (f) { var n = f.attributes.shelter_name || '?'; byS[n] = (byS[n] || 0) + (+f.attributes.hh_total || 1); });
      lv.shelterSummary = Object.keys(byS).map(function (k) { return k + ': ' + byS[k]; }).join('; ');
      lv.shelterReg = R[6].length;
    } else if (lv.shelters) { lv.shelterPop = lv.shelters.reduce(function (s, x) { return s + (+x.occ || 0); }, 0); }
    if (ok(R[8], 'Road closures')) { lv.closures = R[8].filter(function (f) { return !f.attributes.endtime || f.attributes.endtime > Date.now(); }).map(function (f) { var a = f.attributes; return { street: a.street, reason: a.reason, desc: a.description, paths: f.geometry && f.geometry.paths }; }); lv.closureCount = lv.closures.length; }
    if (ok(R[9], 'Evacuation notices')) { lv.notices = R[9].map(function (f) { return f.attributes; }); }
    if (ok(R[10], 'DA zones')) { lv.daZones = {}; R[10].forEach(function (a) { lv.daZones[a.zone_status] = a.n; }); }
    if (ok(R[11], 'SitRep') && R[11].length) { var s = R[11][0].attributes; lv.lastSitrep = s; lv.daDestroyed = s.da_destroyed; lv.daMajor = s.da_major; lv.daMinor = s.da_minor; lv.daAffected = s.da_affected; lv.daAsOf = s.da_asof; lv.outages = (s.aep_outages || 0) + (s.cb_outages || 0) + (s.dominion_outages || 0); }
    if (ok(R[12], 'NWS')) lv.nws = R[12].map(function (f) { return f.attributes; });
    if (ok(R[13], 'VDOT')) lv.vdot = R[13];
    if (ok(R[14], 'CalTopo')) lv.caltopo = R[14];
    if (ok(R[15], 'Lifeline tasks')) { lv.tasks = {}; R[15].forEach(function (a) { lv.tasks[a.status || 'Open'] = a.n; }); }
    if (ok(R[16], 'House checks')) lv.houseChecks = R[16];
    arc.live = lv; CP.liveSummary = lv;
    return lv;
  };

  // map overlays (GeoJSON-ish lists)
  arc.overlay = async function (name) {
    var L = arc.L;
    if (name === 'storm') {
      var since = "CreationDate >= TIMESTAMP '" + new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 19).replace('T', ' ') + "'";
      var parts = await Promise.all([[L.stormResp, 'Responder'], [L.stormDisp, 'Dispatch'], [L.stormPub, 'Public']].map(function (x) { return arc.query(x[0], since, { geom: true, n: 500 }).then(function (f) { return f.map(function (g) { g._src = x[1]; return g; }); }).catch(function () { return []; }); }));
      return [].concat.apply([], parts);
    }
    if (name === 'cadUnits') return arc.query(L.cadUnits, '1=1', { geom: true, fields: 'UnitID,StatusName,UnitTypeDesc,DeptName,CFSNumber' });
    if (name === 'caltopo') return arc.query(L.caltopo, '1=1', { geom: true });
    if (name === 'nws') { var b = CP.COUNTY.bbox; return arc.query(L.nws, '1=1', { geom: true, fields: 'Event,Severity,End_', extra: { geometry: b.xmin + ',' + b.ymin + ',' + b.xmax + ',' + b.ymax, geometryType: 'esriGeometryEnvelope', inSR: 4326, spatialRel: 'esriSpatialRelIntersects', maxAllowableOffset: 0.005 } }); }
    if (name === 'notices') return arc.query(L.notices, "activeincid='Yes'", { geom: true, extra: { maxAllowableOffset: 0.0005 } });
    return [];
  };
})(window.CP);
