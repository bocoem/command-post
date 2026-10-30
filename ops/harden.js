/* EM OPS — Secure & connect (one click in Setup) and the health check.
   Secure & connect:
   - adds anything missing to the services (new layers and fields such as the practice flag and the Hotline)
   - adds the CP_Changes table and the exercise field to Command Post's service (safe simultaneous saves, practice mode)
   - least-access views: field crews (no cost/training), leadership (read-only, no contact details, no practice data),
     EMS (patients from the last 72 hours), each shared with its group; the full services are unshared from those groups
   - delete protection on every service, view, map and dashboard
   - leadership web map and ArcGIS Dashboard (read-only)
   Health check: shows, in plain words, whether everything above is still in place. */
(function (CP) {
  'use strict';
  var OPS = CP.ops, A = CP.arc, U = CP.ui, E = CP.esc, I = U.icon;
  var H = OPS.harden = {};
  var LEAD_MAP = 'EM Leadership Map', LEAD_DASH = 'EM Leadership Dashboard';

  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  // long ArcGIS admin operations sometimes finish on the server but the answer never arrives: wait, then let the caller re-check
  async function slow(fn) { try { return await fn(); } catch (e) { if (!e.offline) throw e; if (CP.net) CP.net.up(); await sleep(8000); return { _lost: true }; } }
  function P(path) { return A.portal + '/sharing/rest' + path; }
  async function find(title, type) { var r = await A.req(P('/search'), { q: 'title:"' + title + '"' + (type ? ' AND type:"' + type + '"' : '') + ' AND orgid:' + A.user.orgId, num: 5 }); return (r.results || []).find(function (x) { return x.title === title; }) || null; }
  async function myGroups() { var me = await A.req(P('/community/self'), {}); return me.groups || []; }
  function admin(url) { return url.replace('/rest/services/', '/rest/admin/services/'); }
  async function itemGroups(id) { var g = await A.req(P('/content/items/' + id + '/groups'), {}); return (g.admin || []).concat(g.member || [], g.other || []); }
  async function share(item, groupIds) {
    var cur = await itemGroups(item.id).catch(function () { return []; }); groupIds = groupIds.filter(function (g) { return !cur.some(function (c) { return c.id === g; }); });
    if (!groupIds.length) return; var r = await A.req(P('/content/users/' + item.owner + '/items/' + item.id + '/share'), { everyone: false, org: false, groups: groupIds.join(',') }, true); if (r.notSharedWith && r.notSharedWith.length) throw new Error('could not share with ' + r.notSharedWith.length + ' group(s)'); }
  async function unshare(item, groupIds) { if (!groupIds.length) return; await A.req(P('/content/users/' + item.owner + '/items/' + item.id + '/unshare'), { groups: groupIds.join(',') }, true); }
  async function protect(item) { if (item.protected) return false; await A.req(P('/content/users/' + item.owner + '/items/' + item.id + '/protect'), {}, true); return true; }
  async function fullItem(id) { return A.req(P('/content/items/' + id), {}); }

  // ---------- Command Post service: change rows + practice flag ----------
  H.cpService = async function () {
    if (!A.own) throw new Error('Command Post service not found');
    var url = A.own.url, svc = await A.req(url, {}), out = [];
    var adm = admin(url);
    if (!(svc.tables || []).some(function (t) { return t.name === 'CP_Changes'; })) {
      var ids = (svc.layers || []).concat(svc.tables || []).map(function (x) { return x.id; }), id = Math.max.apply(null, ids.concat([3])) + 1;
      var f = function (n, t, l, a) { var o = { name: n, type: 'esriFieldType' + t, alias: a || n, nullable: true, editable: true }; if (t === 'String') o.length = l; return o; };
      var tbl = { id: id, name: 'CP_Changes', type: 'Table', displayField: 'incident_key', description: 'Command Post change rows (safe simultaneous saves). Rows older than 30 minutes are removed automatically.', objectIdField: 'OBJECTID', globalIdField: 'GlobalID', hasAttachments: false, capabilities: 'Create,Delete,Query,Update,Editing',
        fields: [{ name: 'OBJECTID', type: 'esriFieldTypeOID', alias: 'OBJECTID', nullable: false, editable: false }, { name: 'GlobalID', type: 'esriFieldTypeGlobalID', alias: 'GlobalID', length: 38, nullable: false, editable: false }, f('CreationDate', 'Date'), f('Creator', 'String', 128), f('EditDate', 'Date'), f('Editor', 'String', 128),
          f('incident_key', 'String', 40, 'Incident'), f('change_time', 'Date', 0, 'Time'), f('author', 'String', 128, 'By'), f('patch', 'String', 1000000, 'Changes (compressed)')],
        editFieldsInfo: { creationDateField: 'CreationDate', creatorField: 'Creator', editDateField: 'EditDate', editorField: 'Editor' } };
      var r = await A.req(adm + '/addToDefinition', { addToDefinition: { tables: [tbl] } }, true); if (!r.success) throw new Error('could not add CP_Changes');
      A.changes._id = undefined; out.push('change table added');
    }
    var l0 = await A.req(url + '/0', {});
    if (!(l0.fields || []).some(function (x) { return x.name === 'exercise'; })) {
      var r2 = await A.req(adm + '/0/addToDefinition', { addToDefinition: { fields: [{ name: 'exercise', type: 'esriFieldTypeString', alias: 'Practice / exercise', length: 5, nullable: true, editable: true }] } }, true);
      if (!r2.success) throw new Error('could not add the practice field'); A.own.fields = A.own.fields || {}; A.own.fields.exercise = 1; out.push('practice field added');
    }
    return out.join(', ') || 'already in place';
  };

  // ---------- views ----------
  H.view = async function (vk) {
    var v = OPS.VIEWS[vk], src = OPS.svc[v.svc]; if (!src || src.view) throw new Error('full ' + OPS.SERVICES[v.svc].name + ' service not available to you');
    var it = await find(v.name, 'Feature Service'), made = false;
    if (!it) {
      var r = await slow(function () { return A.req(P('/content/users/' + A.user.username + '/createService'), { createParameters: { name: v.name, isView: true, sourceSchemaChangesAllowed: true, isUpdatableView: true, capabilities: v.caps, spatialReference: { wkid: 4326 } }, outputType: 'featureService', isView: true, tags: 'Emergency Management,EM Ops,View', snippet: v.desc }, true); });
      if (r._lost) { var again = await find(v.name, 'Feature Service'); if (!again) throw new Error('ArcGIS did not answer; run Secure & connect again'); r = { success: true, itemId: again.id, serviceurl: again.url }; }
      if (!r.success) throw new Error('ArcGIS could not create the view');
      it = { id: r.itemId, url: r.serviceurl || r.encodedServiceURL, owner: A.user.username }; made = true;
      await A.req(P('/content/users/' + A.user.username + '/items/' + r.itemId + '/update'), { title: v.name, description: v.desc + '<br>View of ' + OPS.SERVICES[v.svc].name + '. Made by EM Ops Setup; do not rename layers.' }, true).catch(function () {});
      await A.req(P('/content/users/' + A.user.username + '/addRelationship'), { originItemId: src.id, destinationItemId: r.itemId, relationshipType: 'Service2Service' }, true).catch(function () {});
    }
    var url = it.url.replace(/\/$/, ''), info = await A.req(url, {}), have = {};
    (info.layers || []).concat(info.tables || []).forEach(function (x) { have[x.name] = x.id; });
    var srcName = src.url.match(/services\/([^/]+)\/FeatureServer/)[1], add = { layers: [], tables: [] }, next = 0;
    for (var lk of v.layers) {
      var l = OPS.LAYERS[lk]; if (have[l.name] != null || src.ids[l.name] == null) continue;
      var srcInfo = await A.req(src.url + '/' + src.ids[l.name], {});
      var hide = (v.hideFields || {})[lk] || [];
      var flds = hide.length ? (srcInfo.fields || []).filter(function (f) { return hide.indexOf(f.name) < 0; }).map(function (f) { return { name: f.name, alias: f.alias, source: f.name }; }) : '*';
      var d = { id: next++, name: l.name, type: srcInfo.type, displayField: srcInfo.displayField, description: l.title, adminLayerInfo: { viewLayerDefinition: { sourceServiceName: decodeURIComponent(srcName), sourceLayerId: src.ids[l.name], sourceLayerFields: flds } } };
      if (srcInfo.geometryType) { d.geometryType = srcInfo.geometryType; d.drawingInfo = srcInfo.drawingInfo; }
      (srcInfo.type === 'Table' ? add.tables : add.layers).push(d);
    }
    if (add.layers.length || add.tables.length) {
      var used = Object.keys(have).map(function (k) { return have[k]; }); var nid = used.length ? Math.max.apply(null, used) + 1 : 0;
      add.layers.concat(add.tables).forEach(function (d) { d.id = nid++; });
      var a = await slow(function () { return A.req(admin(url) + '/addToDefinition', { addToDefinition: add }, true); }); if (!a.success && !a._lost) throw new Error('could not add layers to the view');
      info = await A.req(url, {}); (info.layers || []).concat(info.tables || []).forEach(function (x) { have[x.name] = x.id; });
    }
    var problems = [];
    for (var lk2 of v.layers) {
      var l2 = OPS.LAYERS[lk2], id = have[l2.name]; if (id == null) continue;
      var li = await A.req(url + '/' + id, {}), upd = {};
      var wantQ = v.where && !(/practice/.test(v.where) && !l2.fields.some(function (f) { return f[0] === 'practice'; })) ? v.where : null;
      if (wantQ && (li.viewDefinitionQuery || '') !== wantQ) upd.viewDefinitionQuery = wantQ;
      var hide = ((v.hideFields || {})[lk2] || []).filter(function (n) { return (li.fields || []).some(function (f) { return f.name === n; }); });
      if (hide.length) upd.fields = hide.map(function (n) { return { name: n, visible: false }; });
      if (!Object.keys(upd).length) continue;
      await slow(function () { return A.req(admin(url) + '/' + id + '/updateDefinition', { updateDefinition: upd }, true); });
      var chk = await A.req(url + '/' + id, {}); // read back: did it take?
      if (upd.viewDefinitionQuery && (chk.viewDefinitionQuery || '') !== wantQ) problems.push(l2.name + ' filter');
      var still = hide.filter(function (n) { return (chk.fields || []).some(function (f) { return f.name === n; }); }); if (still.length) problems.push(l2.name + ' still shows ' + still.join(', '));
    }
    if (problems.length) throw new Error('view made, but not fully locked down: ' + problems.join('; '));
    if ((info.capabilities || '') !== v.caps) await A.req(admin(url) + '/updateDefinition', { updateDefinition: { capabilities: v.caps } }, true).catch(function () {});
    // share with its groups; take the full service away from those groups (least access)
    var gs = await myGroups(), want = gs.filter(function (g) { return v.groups.some(function (re) { return re.test(g.title); }); });
    var full = Object.assign({ owner: src.owner, id: src.id }, {});
    await share(Object.assign({ owner: it.owner || A.user.username }, it), want.map(function (g) { return g.id; }));
    if (v.svc === 'main' && vk === 'field') await unshare(full, want.map(function (g) { return g.id; }));
    if (vk === 'emsField') await unshare(full, want.map(function (g) { return g.id; }));
    var fi = await fullItem(it.id); await protect(fi).catch(function () {});
    return (made ? 'created' : 'updated') + ', ' + Object.keys(have).length + ' layers, shared with ' + (want.map(function (g) { return g.title.replace(/^BOCO (Role|Access \d) - /, ''); }).join(', ') || 'no groups (create the group first)');
  };

  // ---------- delete protection ----------
  H.protectAll = async function () {
    var ids = OPS.SVC_KEYS.map(function (k) { return OPS.svc[k] && !OPS.svc[k].view && OPS.svc[k].id; }).filter(Boolean);
    if (A.own && A.own.id) ids.push(A.own.id); else { var cp = await find(A.serviceName, 'Feature Service'); if (cp) ids.push(cp.id); }
    var wm = OPS.webmapId(); if (wm) ids.push(wm);
    for (var t of ['BOCO_Reunification_Public_Intake', LEAD_MAP, LEAD_DASH]) { var x = await find(t); if (x) ids.push(x.id); }
    var n = 0, mine = 0;
    for (var id of ids) { var it = await fullItem(id).catch(function () { return null; }); if (!it) continue; if (it.owner !== A.user.username && A.user.role !== 'org_admin') continue; mine++; if (await protect(it).catch(function () { return false; })) n++; }
    return n + ' newly protected, ' + mine + ' checked';
  };

  // ---------- leadership map + dashboard ----------
  H.leadership = async function () {
    var v = OPS.VIEWS.lead, it = await find(v.name, 'Feature Service'); if (!it) throw new Error('make the leadership view first');
    var url = it.url.replace(/\/$/, ''), info = await A.req(url, {}), ids = {}; (info.layers || []).concat(info.tables || []).forEach(function (x) { ids[x.name] = x.id; });
    var gs = await myGroups(), lg = gs.filter(function (g) { return /^BOCO Role - Leadership/.test(g.title); }).map(function (g) { return g.id; });
    // map
    var map = await find(LEAD_MAP, 'Web Map');
    if (!map) {
      var ops = ['infra', 'watch', 'checkins', 'hospitals', 'calls'].filter(function (k) { return ids[OPS.LAYERS[k].name] != null && OPS.LAYERS[k].geom; }).map(function (k) { return { id: k, title: OPS.LAYERS[k].title, url: url + '/' + ids[OPS.LAYERS[k].name], itemId: it.id, layerType: 'ArcGISFeatureLayer', visibility: k !== 'calls', opacity: 1 }; });
      [['Open PODs', A.L.pods], ['Shelters', A.L.shelters], ['Road closures', A.L.closures], ['Evacuation notices', A.L.notices]].forEach(function (x) { if (x[1]) ops.push({ id: x[0].replace(/\W/g, ''), title: x[0], url: x[1], layerType: 'ArcGISFeatureLayer', visibility: true, opacity: 1 }); });
      var wm = { operationalLayers: ops, baseMap: { baseMapLayers: [{ id: 'dark', layerType: 'ArcGISTiledMapServiceLayer', url: 'https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer', visibility: true, opacity: 1, title: 'Dark Gray Canvas' }], title: 'Dark Gray Canvas' },
        spatialReference: { wkid: 102100, latestWkid: 3857 }, authoringApp: 'Botetourt EM Ops', authoringAppVersion: '1', version: '2.31', initialState: { viewpoint: { targetGeometry: { xmin: -8925000, ymin: 4495000, xmax: -8850000, ymax: 4540000, spatialReference: { wkid: 102100 } } } } };
      var r = await A.req(P('/content/users/' + A.user.username + '/addItem'), { type: 'Web Map', title: LEAD_MAP, tags: 'Emergency Management,EM Ops,Leadership', snippet: 'Read-only operations picture for leadership and partners.', extent: '-80.2,37.3,-79.4,37.85', text: JSON.stringify(wm) }, true);
      if (!r.success) throw new Error('could not create the leadership map'); map = { id: r.id, owner: A.user.username };
    }
    await share(Object.assign({ owner: map.owner || A.user.username }, map), lg).catch(function () {});
    // dashboard
    var dash = await find(LEAD_DASH, 'Dashboard'), made = false;
    var data = dashboardJson(it.id, ids, map.id);
    if (!dash) { var r2 = await A.req(P('/content/users/' + A.user.username + '/addItem'), { type: 'Dashboard', typeKeywords: 'Dashboard,Operations Dashboard,ArcGIS Dashboards', title: LEAD_DASH, tags: 'Emergency Management,EM Ops,Leadership', snippet: 'Read-only leadership picture: people on scene, requests, infrastructure, PODs, flood watch and hotline. Practice incidents left out.', text: JSON.stringify(data) }, true); if (!r2.success) throw new Error('could not create the dashboard'); dash = { id: r2.id, owner: A.user.username }; made = true; }
    else await A.req(P('/content/users/' + dash.owner + '/items/' + dash.id + '/update'), { text: JSON.stringify(data) }, true);
    await share(Object.assign({ owner: dash.owner || A.user.username }, dash), lg).catch(function () {});
    CP.store.setPref('leadDash', dash.id);
    return (made ? 'dashboard created' : 'dashboard updated') + (lg.length ? ', shared with Leadership & Partners' : '');
  };
  function uid() { return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) { var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }); }
  function dashboardJson(viewId, ids, mapId) {
    var lid = function (k) { return ids[OPS.LAYERS[k].name]; };
    var fs = function (k, fields) { return "FeatureSetByPortalItem(p, '" + viewId + "', " + lid(k) + ", " + JSON.stringify(fields) + ", false)"; };
    var arc = [];
    var totals = { type: 'arcadeItem', itemId: uid(), name: 'Leadership totals', refreshInterval: 1, script:
      "var p = Portal('https://www.arcgis.com');\n" +
      "var ci = " + fs('checkins', ['status', 'persons']) + ";\nvar rq = " + fs('requests', ['status']) + ";\nvar inf = " + fs('infra', ['status', 'report_time']) + ";\nvar pl = " + fs('podledger', ['txn', 'households', 'txn_time']) + ";\nvar wp = " + fs('watch', ['status']) + ";\nvar cl = " + fs('calls', ['call_time', 'status', 'priority']) + ";\n" +
      "var ppl = 0; var units = 0; for (var c in ci) { if (c.status != 'Checked Out') { units += 1; ppl += DefaultValue(c.persons, 1); } }\n" +
      "var openReq = 0; for (var r in rq) { if (IndexOf(['Filled','Cancelled','Unable to Fill'], r.status) < 0) { openReq += 1; } }\n" +
      "var down = 0; for (var i in inf) { if (i.status == 'Down') { down += 1; } }\n" +
      "var since = DateAdd(Now(), -24, 'hours'); var hh = 0; for (var t in pl) { if (t.txn == 'Distributed' && !IsEmpty(t.txn_time) && t.txn_time >= since) { hh += DefaultValue(t.households, 0); } }\n" +
      "var fl = 0; for (var w in wp) { if (w.status == 'Flooded / closed') { fl += 1; } }\n" +
      "var calls = 0; var cb = 0; for (var k in cl) { if (!IsEmpty(k.call_time) && k.call_time >= since) { calls += 1; } if (k.status == 'Callback needed' || (k.priority == 'Urgent' && k.status != 'Closed')) { cb += 1; } }\n" +
      "return FeatureSet(Text({ fields: [{name:'people',type:'esriFieldTypeInteger'},{name:'units',type:'esriFieldTypeInteger'},{name:'open_requests',type:'esriFieldTypeInteger'},{name:'infra_down',type:'esriFieldTypeInteger'},{name:'pod_households_24h',type:'esriFieldTypeInteger'},{name:'flooded',type:'esriFieldTypeInteger'},{name:'calls_24h',type:'esriFieldTypeInteger'},{name:'calls_open',type:'esriFieldTypeInteger'}], geometryType: '', features: [{ attributes: { people: ppl, units: units, open_requests: openReq, infra_down: down, pod_households_24h: hh, flooded: fl, calls_24h: calls, calls_open: cb } }] }));" };
    arc.push(totals);
    var infraList = { type: 'arcadeItem', itemId: uid(), name: 'Infrastructure not operational', refreshInterval: 1, script:
      "var p = Portal('https://www.arcgis.com');\nvar inf = " + fs('infra', ['facility', 'status', 'lifeline', 'report_time']) + ";\nvar latest = {};\nfor (var i in inf) { var k = DefaultValue(i.facility, ''); if (k == '') { continue; } if (!HasKey(latest, k) || Number(i.report_time) > latest[k].t) { latest[k] = { t: Number(i.report_time), s: i.status, l: i.lifeline }; } }\n" +
      "var f = []; for (var k in latest) { var x = latest[k]; if (x.s != 'Operational') { Push(f, { attributes: { facility: k, status: x.s, lifeline: DefaultValue(x.l, ''), reported: x.t } }); } }\n" +
      "if (Count(f) == 0) { Push(f, { attributes: { facility: 'All reported facilities operational', status: 'OK', lifeline: '', reported: null } }); }\n" +
      "return FeatureSet(Text({ fields: [{name:'facility',type:'esriFieldTypeString'},{name:'status',type:'esriFieldTypeString'},{name:'lifeline',type:'esriFieldTypeString'},{name:'reported',type:'esriFieldTypeDate'}], geometryType: '', features: f }));" };
    arc.push(infraList);
    var callTopics = { type: 'arcadeItem', itemId: uid(), name: 'Hotline topics (24 h)', refreshInterval: 1, script:
      "var p = Portal('https://www.arcgis.com');\nvar cl = " + fs('calls', ['call_time', 'category']) + ";\nvar since = DateAdd(Now(), -24, 'hours'); var t = {};\nfor (var k in cl) { if (!IsEmpty(k.call_time) && k.call_time >= since) { var c = DefaultValue(k.category, 'Other'); t[c] = IIf(HasKey(t, c), t[c] + 1, 1); } }\n" +
      "var f = []; for (var c in t) { Push(f, { attributes: { topic: c, calls: t[c] } }); }\nif (Count(f) == 0) { Push(f, { attributes: { topic: 'No calls in the last 24 hours', calls: 0 } }); }\n" +
      "return FeatureSet(Text({ fields: [{name:'topic',type:'esriFieldTypeString'},{name:'calls',type:'esriFieldTypeInteger'}], geometryType: '', features: f }));" };
    arc.push(callTopics);
    var reqList = { type: 'arcadeItem', itemId: uid(), name: 'Open resource requests', refreshInterval: 1, script:
      "var p = Portal('https://www.arcgis.com');\nvar rq = " + fs('requests', ['req_no', 'status', 'kind', 'description', 'qty', 'priority', 'incident_name']) + ";\nvar f = [];\nfor (var r in rq) { if (IndexOf(['Filled','Cancelled','Unable to Fill'], r.status) < 0) { Push(f, { attributes: { req: DefaultValue(r.req_no, ''), what: Concatenate([Text(DefaultValue(r.qty, '')), DefaultValue(r.kind, DefaultValue(r.description, ''))], ' '), status: r.status, priority: DefaultValue(r.priority, ''), incident: DefaultValue(r.incident_name, '') } }); } }\n" +
      "if (Count(f) == 0) { Push(f, { attributes: { req: '', what: 'No open requests', status: '', priority: '', incident: '' } }); }\n" +
      "return FeatureSet(Text({ fields: [{name:'req',type:'esriFieldTypeString'},{name:'what',type:'esriFieldTypeString'},{name:'status',type:'esriFieldTypeString'},{name:'priority',type:'esriFieldTypeString'},{name:'incident',type:'esriFieldTypeString'}], geometryType: '', features: f }));" };
    arc.push(reqList);
    var W = [], ind = function (field, label, sub, color) {
      var id = uid(); W.push({ id: id, dashboardItemType: 'widget', name: label, noDataState: {}, noFilterState: {}, focusModeEnabled: false, type: 'indicatorWidget', valueType: 'statistic', comparison: 'none', verticalAlignment: 'middle', showFeatureMenu: false,
        datasets: [{ type: 'serviceDataset', name: 'main', dataSource: { type: 'arcadeDataSource', itemId: totals.itemId }, groupByFields: [], orderByFields: [], statisticDefinitions: [{ onStatisticField: field, statisticType: 'sum', outStatisticFieldName: 'v' }], outFields: [field], returnDistinctValues: false, allowSourceDownload: false, allowSummaryDownload: false }],
        defaultSettings: { topSection: { maxHeight: 18, textInfo: { text: label.toUpperCase(), weight: 'bold', fillColor: '#A9B8CA' } }, middleSection: { maxHeight: 46, textInfo: { text: '{calculated/value}', weight: 'bold', fillColor: color || '#FDB833' } }, bottomSection: { maxHeight: 14, textInfo: { text: sub, weight: 'normal', fillColor: '#A9B8CA' } } },
        valueFormat: { name: 'value', prefix: false, style: 'decimal', useGrouping: true, maximumFractionDigits: 0 }, percentageFormat: { name: 'percentage', prefix: false, style: 'percent', useGrouping: true }, ratioFormat: { name: 'ratio', prefix: false, style: 'decimal', useGrouping: true, maximumFractionDigits: 2 }, noValueState: { textInfo: { text: '0' } } });
      return id; };
    var lst = function (name, title, ds, fields, order, html) { var id = uid(); W.push({ id: id, dashboardItemType: 'widget', name: name, title: title, noDataState: {}, noFilterState: {}, focusModeEnabled: false, type: 'listWidget', selectionMode: 'none', iconType: 'none', showFilter: false, text: html,
      datasets: [{ type: 'serviceDataset', name: 'main', dataSource: { type: 'arcadeDataSource', itemId: ds }, groupByFields: [], orderByFields: order, statisticDefinitions: [], outFields: fields, returnDistinctValues: false, allowSourceDownload: false, allowSummaryDownload: false, maxFeatures: 50 }] }); return id; };
    var i1 = ind('people', 'People on scene', 'checked in now'), i2 = ind('open_requests', 'Open requests', 'resources (213RR)'), i3 = ind('infra_down', 'Facilities down', 'critical infrastructure', '#F0444C'),
      i4 = ind('pod_households_24h', 'Households served', 'PODs, last 24 h', '#2FBF71'), i5 = ind('flooded', 'Flooded crossings', 'flood watch points', '#3D9BFF'), i6 = ind('calls_24h', 'Hotline calls', 'last 24 h');
    var mapW = uid(); W.push({ id: mapW, dashboardItemType: 'widget', name: 'Map', title: 'OPERATIONS MAP', noDataState: {}, noFilterState: {}, focusModeEnabled: false, type: 'mapWidget', flashRepeats: 3, itemId: mapId, linkedMapWidgetIds: [], mapTools: [{ type: 'legendTool' }], showMeasureTool: false, showNavigation: true, showPanRotate: false, showLocate: false, showCompass: false, showPopup: true, scalebarStyle: 'none', editingEnabled: false, trackedFeatureRadius: 60, selectTool: { type: 'selectTool', clickToSelect: false, advanceSketchTools: [] } });
    var l1 = lst('Infrastructure', 'INFRASTRUCTURE NOT OPERATIONAL', infraList.itemId, ['facility', 'status', 'lifeline', 'reported'], ['facility ASC'], '<div style="border-left:5px solid #F0444C;padding:4px 10px;"><p style="margin:0;font-size:14px;"><strong><span style="color:#FFFFFF;">{field/facility}</span></strong></p><p style="margin:0;font-size:12px;"><span style="color:#FDB833;">{field/status}</span><span style="color:#A9B8CA;"> {field/lifeline}</span></p></div>');
    var l2 = lst('Requests', 'OPEN RESOURCE REQUESTS', reqList.itemId, ['req', 'what', 'status', 'priority', 'incident'], ['priority DESC'], '<div style="border-left:5px solid #FDB833;padding:4px 10px;"><p style="margin:0;font-size:14px;"><strong><span style="color:#FFFFFF;">{field/what}</span></strong></p><p style="margin:0;font-size:12px;"><span style="color:#A9B8CA;">{field/req} · {field/status} · {field/priority} · {field/incident}</span></p></div>');
    var l3 = lst('Hotline', 'HOTLINE TOPICS · 24 H', callTopics.itemId, ['topic', 'calls'], ['calls DESC'], '<div style="padding:3px 10px;"><span style="color:#FDB833;font-size:16px;"><strong>{field/calls}</strong></span><span style="color:#E6ECF3;font-size:13px;"> {field/topic}</span></div>');
    var item = function (id, w, h) { return { type: 'itemLayoutElement', id: id, width: w, height: h }; };
    var layout = { type: 'dockingLayout', rootElement: { type: 'stackLayoutElement', orientation: 'row', id: uid(), width: 1, height: 1, elements: [
      { type: 'stackLayoutElement', orientation: 'col', id: uid(), width: 1, height: 0.16, elements: [i1, i2, i3, i4, i5, i6].map(function (x) { return item(x, 1 / 6, 1); }) },
      { type: 'stackLayoutElement', orientation: 'col', id: uid(), width: 1, height: 0.84, elements: [item(mapW, 0.56, 1), { type: 'stackLayoutElement', orientation: 'row', id: uid(), width: 0.44, height: 1, elements: [item(l1, 1, 0.38), item(l2, 1, 0.38), item(l3, 1, 0.24)] }] }] } };
    return { version: '5.1.0', authoringApp: 'ArcGIS Dashboards', authoringAppVersion: '5.1.0', maxPaginationRecords: 50000, maxChartRecords: 10000, timeZone: 'system', theme: { id: 'user', type: 'resource' }, arcadeDataSourceItems: arc, elementMappings: {},
      desktopView: { type: 'desktop', settings: { allowElementResizing: false, allowReset: false }, layout: layout, widgets: W } };
  }

  // ---------- run everything ----------
  H.run = async function () {
    var out = [], box = function () { return document.getElementById('buildLog'); };
    var log = function () { OPS._buildLog = out.join('\n'); var b = box(); if (b) b.textContent = OPS._buildLog; };
    var step = async function (name, fn) { out.push('… ' + name); log(); var at = out.length - 1; try { var r = await fn(); out[at] = '✓ ' + name + (r ? ': ' + r : ''); } catch (e) { console.warn(name, e); out[at] = '✗ ' + name + ': ' + OPS.errText(e); } log(); };
    if (OPS.st.tool !== 'setup') OPS.go('setup');
    await OPS.findServices();
    for (var k of OPS.SVC_KEYS) { if (OPS.svc[k] && !OPS.svc[k].view) { var kk = k; await step('Update ' + OPS.SERVICES[kk].name, function () { return OPS.upgrade(kk); }); } }
    await step('Command Post service (safe saves, practice)', H.cpService);
    await OPS.findServices();
    for (var vk of Object.keys(OPS.VIEWS)) { var v2 = vk; await step('View: ' + OPS.VIEWS[v2].title, function () { return H.view(v2); }); }
    await step('Leadership map and dashboard', H.leadership);
    await step('Delete protection', H.protectAll);
    out.push('\nDone. Run the health check any time to confirm everything is still in place.'); log();
    OPS.bust(); await OPS.findServices(); OPS.render(); U.toast('Secure & connect finished', 'ok', 6000);
  };

  // ---------- health check ----------
  H.check = async function () {
    var R = [], add = function (ok, what, fix) { R.push({ ok: ok, what: what, fix: fix || '' }); };
    var t0 = Date.now();
    try { await A.req(P('/community/self'), {}); add(true, 'ArcGIS sign-in works (' + A.user.username + ')'); } catch (e) { add(false, 'ArcGIS sign-in', CP.friendly(e.message)); return R; }
    await OPS.findServices();
    for (var k of OPS.SVC_KEYS) {
      var s = OPS.svc[k], d = OPS.SERVICES[k];
      if (!s) { add(false, d.name + ' is not reachable', 'Open Setup and run Build everything.'); continue; }
      if (s.view) { add(true, d.name + ': you use the ' + OPS.VIEWS[s.view].title + ' view'); continue; }
      var g = await OPS.schemaGaps(k).catch(function () { return null; });
      add(g && !g.layers.length && !g.fields.length, d.name + ': ' + (g ? (g.layers.length || g.fields.length ? g.layers.length + ' layers / ' + g.fields.reduce(function (n, x) { return n + x.f.length; }, 0) + ' fields missing' : 'all ' + OPS.layersFor(k).length + ' layers answer and match') : 'could not read'), 'Run Secure & connect.');
      var it = await fullItem(s.id).catch(function () { return null; });
      if (it) {
        add(!!it.protected, d.name + ': delete protection ' + (it.protected ? 'on' : 'OFF'), 'Run Secure & connect.');
        add(it.access !== 'public', d.name + ': not public (' + it.access + ')', 'Unshare it from Everyone in ArcGIS now.');
        var grp = await itemGroups(s.id).catch(function () { return []; }), names = grp.map(function (x) { return x.title; });
        if (k === 'prot') add(names.length > 0 && names.every(function (n) { return /^BOCO Access 1/.test(n); }), 'EM Protected shared only with EM (' + (names.join(', ') || 'nobody') + ')', 'Share it only with BOCO Access 1.');
        if (k === 'ems') add(!names.some(function (n) { return /^BOCO Access [234]/.test(n); }), 'EMS Patient Care not shared with Sheriff / Fire / Dispatch groups', 'Unshare it from those groups; EMS uses its own group.');
        if (k === 'main') add(!names.some(function (n) { return /^BOCO Access [234]/.test(n); }) || !OPS.VIEWS.field, 'EM Operations (full) shared with: ' + (names.join(', ') || 'nobody'), 'Run Secure & connect: field crews should use the field view.');
      }
    }
    try { var ch = await A.changes.table(); add(!!ch, 'Command Post: safe simultaneous saves ' + (ch ? 'on' : 'not set up'), 'Run Secure & connect.'); } catch (e) { add(false, 'Command Post service', CP.friendly(e.message)); }
    add(!!(A.own && A.own.fields && A.own.fields.exercise), 'Command Post: practice mode field ' + (A.own && A.own.fields && A.own.fields.exercise ? 'present' : 'missing'), 'Run Secure & connect.');
    for (var vk of Object.keys(OPS.VIEWS)) { var v = OPS.VIEWS[vk], vi = await find(v.name, 'Feature Service').catch(function () { return null; }); if (!vi) { add(false, 'View missing: ' + v.title, 'Run Secure & connect.'); continue; } var vg = await itemGroups(vi.id).catch(function () { return []; }); add(vg.length > 0 && vi.access !== 'public', 'View ' + v.title + ': shared with ' + (vg.map(function (x) { return x.title; }).join(', ') || 'nobody'), vg.length ? 'Unshare from Everyone.' : 'Create the group in ArcGIS, then run Secure & connect.'); }
    var view = await find('BOCO_Reunification_Public_Intake', 'Feature Service').catch(function () { return null; });
    if (view) {
      var u = view.url.replace(/\/$/, '') + '/0/query?where=1%3D1&outFields=*&f=json';
      var j = await fetch(u).then(function (r) { return r.json(); }).catch(function () { return { error: { message: 'no answer' } }; });
      var leaks = j && j.features && j.features.length; add(!leaks, 'Public family check-in cannot be read by the public' + (leaks ? ': ' + j.features.length + ' RECORDS VISIBLE' : ''), 'Open Reunification → Kiosk & QR and turn the public view off and on again, or set the view to add-only in ArcGIS.');
    } else add(true, 'Public family check-in: not turned on');
    var dash = await find(LEAD_DASH, 'Dashboard').catch(function () { return null; }); add(!!dash, 'Leadership dashboard ' + (dash ? 'present' : 'missing'), 'Run Secure & connect.');
    var n = CP.sync ? CP.sync.count() : 0, bad = CP.sync ? CP.sync.failed().length : 0; add(!bad, 'This device: ' + (n ? n + ' change(s) waiting to send' : 'nothing waiting to send') + (bad ? ', ' + bad + ' need attention' : ''), 'Click the status pill at the bottom left.');
    add('serviceWorker' in navigator && !!navigator.serviceWorker.controller, 'This device can open the apps offline' + (navigator.serviceWorker && navigator.serviceWorker.controller ? '' : ' (not yet: reload once)'), 'Reload the page once while online.');
    R.ms = Date.now() - t0; R.t = Date.now();
    return R;
  };
  H.panel = function () {
    var r = OPS.load('health', H.check, 10 * 60000);
    var h = '<div class="card" style="margin-top:14px" id="healthCard"><h3>' + I('shield') + 'Health check<span class="x"><button class="btn sm" data-act="healthRun">' + I('refresh') + 'Run now</button></span></h3>';
    if (r === undefined) return h + '<div class="empty">' + I('refresh') + ' Checking services, sharing, protection and this device…</div></div>';
    if (r && r._err) return h + '<div class="warnbox">' + E(CP.friendly(r._err)) + '</div></div>';
    var bad = r.filter(function (x) { return !x.ok; });
    h += '<p style="margin:0 0 8px" class="' + (bad.length ? 'warn-t' : 'ok-t') + '"><b>' + (bad.length ? bad.length + ' item' + (bad.length > 1 ? 's need' : ' needs') + ' attention' : 'Everything checks out') + '</b> <span class="dim">· checked ' + E(OPS.ago(r.t)) + ' ago</span></p>';
    h += '<div class="hc">' + r.map(function (x) { return '<div class="hcrow ' + (x.ok ? 'ok' : 'bad') + '">' + I(x.ok ? 'check' : 'warn') + '<div><div>' + E(x.what) + '</div>' + (!x.ok && x.fix ? '<div class="dim" style="font-size:12.5px">Fix: ' + E(x.fix) + '</div>' : '') + '</div></div>'; }).join('') + '</div></div>';
    return h;
  };
  OPS.act.healthRun = function () { OPS.bust('health'); OPS.repaint(); };
  OPS.act.harden = function () {
    U.confirm('Secure & connect', 'This updates the services, adds the Command Post change table and practice field, makes the field, leadership and EMS views and shares them with their groups, removes the full services from those groups, turns on delete protection, and builds the leadership dashboard. It changes nothing in existing records.', 'Run it', function () { H.run(); });
  };
})(window.CP);
