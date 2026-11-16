/* EM OPS — Fire preplans: one-time setup and health check (Setup → Fire preplans).
   Nothing here runs on a schedule and no ArcGIS Notebook is used. With the signed-in publisher's account it creates,
   or brings back in line, everything the preplan program needs in county ArcGIS Online:
   - BOCO_Preplans (private): sites, map features, building outlines, hazmat, contacts, photos
   - views: Intake (public, add-only, review fields hidden), Protected (read), Review (edit), Tactical (approved, safe only)
   - groups, three web maps, the Preplan Program dashboard, delete protection on all of it
   - the two Survey123 forms, once they are published from Survey123 Connect: found, shared and linked from the dashboard
   Day to day there are two ways in, and they read and write the same layers:
   - Survey123 (the backbone): the crew form and the review form. All of it is in ArcGIS, so it works when the BEACON apps are not reachable.
   - the Preplan Builder app (preplan.html): build on one map on an iPad, review in one save.
   The definitions come from ops/preplans.data.js (generated from the preplan schema; loaded only when this runs). */
(function (CP) {
  'use strict';
  var OPS = CP.ops, A = CP.arc, U = CP.ui, E = CP.esc, I = U.icon;
  var PP = OPS.preplans = { settle: 2500, lines: [], busy: false };
  var APP = location.origin + location.pathname.replace(/[^\/]*$/, '') + 'preplan.html'; // the Preplan Builder, beside this page
  var S123 = 'https://survey123.arcgis.com/share/';
  var S; // the spec, once loaded

  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  function P(path) { return A.portal + '/sharing/rest' + path; }
  function admin(url) { return url.replace('/rest/services/', '/rest/admin/services/'); }
  function me() { return A.user.username; }
  function capsSame(a, b) { var n = function (x) { return String(x || '').split(',').map(function (y) { return y.trim(); }).filter(Boolean).sort().join(','); }; return n(a) === n(b); }
  PP.loadSpec = function () {
    if (OPS.PREPLAN_SPEC) return Promise.resolve(S = OPS.PREPLAN_SPEC);
    return new Promise(function (ok, no) { var s = document.createElement('script'); s.src = 'ops/preplans.data.js?v=4'; s.onload = function () { S = OPS.PREPLAN_SPEC; S ? ok(S) : no(new Error('preplan definitions did not load')); }; s.onerror = function () { no(new Error('could not load the preplan definitions (connection?)')); }; document.head.appendChild(s); });
  };

  // ---------- small ArcGIS helpers ----------
  async function find(title, type) {
    var r = await A.req(P('/search'), { q: 'title:"' + title + '" AND type:"' + type + '" AND orgid:' + A.user.orgId, num: 20 });
    var hits = (r.results || []).filter(function (x) { return x.title === title && x.type === type; });
    return hits.find(function (x) { return x.owner === me(); }) || hits[0] || null;
  }
  function item(id) { return A.req(P('/content/items/' + id), {}); }
  // ArcGIS search lags a minute or two behind new items, so anything this step made is looked up directly first:
  // a service by its address, a group through the signed-in member, a map or dashboard by the id remembered on this computer.
  var SVC = (A.L && A.L.cad ? A.L.cad.replace(/CAD%20Calls.*$/, '') : 'https://services6.arcgis.com/6h5xc2eGkGuRiFia/arcgis/rest/services/');
  async function findService(name) {
    try { var j = await A.req(SVC + encodeURIComponent(name) + '/FeatureServer', { _: Date.now() }); if (j && j.serviceItemId) return await item(j.serviceItemId); } catch (e) {}
    return find(name, 'Feature Service');
  }
  async function findKnown(id, title, type) { if (id) { try { var it = await item(id); if (it && it.id && it.type === type) return it; } catch (e) {} } return find(title, type); }
  async function folder() {
    var r = await A.req(P('/content/users/' + me()), {}), f = (r.folders || []).find(function (x) { return x.title === S.folder; }); if (f) return f.id;
    var c = await A.req(P('/content/users/' + me() + '/createFolder'), { title: S.folder }, true); return (c.folder || {}).id || '';
  }
  async function base() { var f = await folder(); return P('/content/users/' + me() + (f ? '/' + f : '')); }
  function share(it, how) {
    return A.req(P('/content/users/' + it.owner + '/items/' + it.id + '/share'), { everyone: !!how.everyone, org: !!(how.org || how.everyone), groups: (how.groups || []).join(',') }, true)
      .then(function (r) { if (r.notSharedWith && r.notSharedWith.length) throw new Error('could not share with ' + r.notSharedWith.length + ' group(s)'); });
  }
  function protect(it) { return it.protected ? Promise.resolve() : A.req(P('/content/users/' + it.owner + '/items/' + it.id + '/protect'), {}, true).catch(function () {}); }
  async function layerIds(url) { var j = await A.req(url, { _: Date.now() }), o = {}; (j.layers || []).concat(j.tables || []).forEach(function (x) { o[x.name] = x.id; }); return { ids: o, caps: j.capabilities || '' }; }
  function split(defs) { return { layers: defs.filter(function (d) { return d.geometryType; }), tables: defs.filter(function (d) { return !d.geometryType; }) }; }
  async function anon(url, params) { // a request with no sign-in at all, to prove what the public can and cannot do
    var q = new URLSearchParams(Object.assign({ f: 'json', _: Date.now() }, params || {}));
    var j = await fetch(url + '?' + q, { cache: 'no-store', credentials: 'omit' }).then(function (r) { return r.json(); });
    if (j && j.error) { var e = new Error(j.error.message || 'refused'); e.code = j.error.code; throw e; } return j;
  }

  // ---------- 1. groups ----------
  async function groups(st) {
    st.groups = {};
    for (var g of S.groups) {
      var mine = await A.req(P('/community/self'), {}).catch(function () { return {}; }), hit = (mine.groups || []).find(function (x) { return x.title === g.title; }), made = false;
      if (!hit) { var r = await A.req(P('/community/groups'), { q: 'title:"' + g.title + '" AND orgid:' + A.user.orgId, num: 20 }); hit = (r.results || []).find(function (x) { return x.title === g.title; }); }
      if (!hit) { var c = await A.req(P('/community/createGroup'), { title: g.title, description: g.desc, snippet: g.desc.slice(0, 250), tags: S.tags, access: 'org', isInvitationOnly: true, isViewOnly: false, sortField: 'title', sortOrder: 'asc' }, true); if (!c.success && !c.group) throw new Error('could not create the group ' + g.title); hit = c.group; made = true; }
      st.groups[g.key] = hit.id; st.made = st.made || made;
    }
    return Object.keys(st.groups).length + ' groups ready';
  }

  // ---------- 2. the full service ----------
  async function service(st) {
    var it = await findService(S.service), made = false;
    if (!it) {
      var r = await A.req((await base()) + '/createService', { createParameters: S.create, outputType: 'featureService', tags: S.tags, snippet: 'BEACON fire preplans: sites, map features, outlines, hazmat, contacts and photos. Use the views.' }, true);
      if (!r.success) throw new Error('ArcGIS could not create ' + S.service);
      it = await item(r.itemId || r.serviceItemId); made = true;
    }
    var url = it.url.replace(/\/$/, ''), have = (await layerIds(url)).ids, missing = S.layers.filter(function (l) { return have[l.name] == null; }), out = [];
    if (missing.length && missing.length < S.layers.length) throw new Error(S.service + ' is only partly built (' + (S.layers.length - missing.length) + ' of ' + S.layers.length + ' layers). If it holds no records, delete it in ArcGIS and run this again.');
    if (missing.length) {
      var a = await A.req(admin(url) + '/addToDefinition', { addToDefinition: split(S.layers) }, true); if (a.success === false) throw new Error('could not add the layers to ' + S.service);
      out.push(S.layers.length + ' layers added');
    } else {
      for (var l of S.layers) { // schema grew since the last run: add fields, extend pick lists. Nothing is ever removed.
        var li = await A.req(url + '/' + have[l.name], { _: Date.now() }), cur = {}; (li.fields || []).forEach(function (f) { cur[f.name] = f; });
        var add = l.fields.filter(function (f) { return !cur[f.name]; });
        if (add.length) { await A.req(admin(url) + '/' + have[l.name] + '/addToDefinition', { addToDefinition: { fields: add } }, true); out.push(l.name + ': +' + add.map(function (f) { return f.name; }).join(', ')); }
        var codes = function (f) { return ((f.domain || {}).codedValues || []).map(function (c) { return c.code; }).join('|'); };
        var grow = l.fields.filter(function (f) { return f.domain && cur[f.name] && codes(cur[f.name]) !== codes(f); }).map(function (f) { return { name: f.name, domain: f.domain }; });
        if (grow.length) { await A.req(admin(url) + '/' + have[l.name] + '/updateDefinition', { updateDefinition: { fields: grow } }, true); out.push(l.name + ': pick lists updated'); }
      }
    }
    st.main = it; st.url = url; st.srcName = decodeURIComponent(url.match(/services\/([^/]+)\/FeatureServer/)[1]);
    return (made ? 'created' : 'found') + (out.length ? ', ' + out.join('; ') : ', up to date');
  }

  // ---------- 3. views ----------
  function viewDef(v, lv) {
    var src = S.layers.find(function (l) { return l.id === lv.id; });
    var flds = lv.hide.length ? src.fields.filter(function (f) { return lv.hide.indexOf(f.name) < 0; }).map(function (f) { return { name: f.name, alias: f.alias, source: f.name }; }) : '*';
    var d = { id: src.id, name: src.name, type: src.type, displayField: src.displayField, description: src.description, adminLayerInfo: { viewLayerDefinition: { sourceServiceName: v._src, sourceLayerId: src.id, sourceLayerFields: flds } } };
    if (src.geometryType) { d.geometryType = src.geometryType; d.drawingInfo = src.drawingInfo; }
    return d;
  }
  async function view(st, v) {
    var it = await findService(v.name), made = false; v._src = st.srcName;
    if (!it) {
      var r = await A.req((await base()) + '/createService', { createParameters: { name: v.name, isView: true, sourceSchemaChangesAllowed: true, isUpdatableView: true, capabilities: v.caps, spatialReference: { wkid: 4326 } }, outputType: 'featureService', isView: true, tags: S.tags + ',View', snippet: v.desc }, true);
      if (!r.success) throw new Error('ArcGIS could not create the view');
      it = await item(r.itemId); made = true;
      await A.req(P('/content/users/' + me() + '/items/' + it.id + '/update'), { description: v.desc + '<br>View of ' + S.service + '. Made by EM Ops Setup; do not rename its layers.' }, true).catch(function () {});
      await A.req(P('/content/users/' + me() + '/addRelationship'), { originItemId: st.main.id, destinationItemId: it.id, relationshipType: 'Service2Service' }, true).catch(function () {});
    }
    var url = it.url.replace(/\/$/, ''), info = await layerIds(url), have = info.ids;
    var add = v.layers.filter(function (lv) { return have[S.layers.find(function (l) { return l.id === lv.id; }).name] == null; }).map(function (lv) { return viewDef(v, lv); });
    if (add.length) { var a = await A.req(admin(url) + '/addToDefinition', { addToDefinition: split(add) }, true); if (a.success === false) throw new Error('could not add layers to the view'); await sleep(PP.settle); info = await layerIds(url); have = info.ids; }
    var problems = [];
    for (var lv of v.layers) {
      var name = S.layers.find(function (l) { return l.id === lv.id; }).name, id = have[name]; if (id == null) { problems.push(name + ' is missing'); continue; }
      var li = await A.req(url + '/' + id, { _: Date.now() }), upd = {};
      if (lv.where && (li.viewDefinitionQuery || '') !== lv.where) upd.viewDefinitionQuery = lv.where;
      var show = lv.hide.filter(function (n) { return (li.fields || []).some(function (f) { return f.name === n; }); });
      if (show.length) upd.fields = show.map(function (n) { return { name: n, visible: false }; });
      if (Object.keys(upd).length) {
        await A.req(admin(url) + '/' + id + '/updateDefinition', { updateDefinition: upd }, true); await sleep(PP.settle);
        li = await A.req(url + '/' + id, { _: Date.now() }); // read back: did ArcGIS take it?
        if (lv.where && (li.viewDefinitionQuery || '') !== lv.where) problems.push(name + ': filter not applied');
        var still = lv.hide.filter(function (n) { return (li.fields || []).some(function (f) { return f.name === n; }); }); if (still.length) problems.push(name + ' still shows ' + still.join(', '));
      }
      if (lv.id === 0 && v.layers.length > 1 && !(li.relationships || []).length) problems.push('Preplan_Sites lost its links to the related tables in this view (the Survey123 form needs them)');
    }
    if (!capsSame(info.caps, v.caps)) await A.req(admin(url) + '/updateDefinition', { updateDefinition: { capabilities: v.caps } }, true);
    if (v.name === S.names.intake) await A.req(admin(url) + '/updateDefinition', { updateDefinition: { editorTrackingInfo: { enableEditorTracking: true, enableOwnershipAccessControl: true, allowOthersToQuery: false, allowOthersToUpdate: false, allowOthersToDelete: false, allowAnonymousToQuery: false, allowAnonymousToUpdate: false, allowAnonymousToDelete: false } } }, true).catch(function () {});
    st.views[v.name] = { id: it.id, url: url, owner: it.owner, protected: it.protected };
    if (problems.length) throw new Error('made, but not locked down: ' + problems.join('; '));
    return (made ? 'created' : 'checked') + ', ' + v.layers.length + ' layers';
  }

  // ---------- 4. sharing and delete protection ----------
  function sharePlan(st) {
    var g = st.groups, both = [g.protected, g.review], N = S.names, t = st.tactical, p = {};
    p[N.intake] = { everyone: true };
    p[N.protected] = { groups: both };
    p[N.review] = { groups: [g.review] };
    p[N.tactical] = t === 'everyone' ? { everyone: true, groups: both } : t === 'org' ? { org: true, groups: both } : { groups: both };
    return p;
  }
  async function sharing(st) {
    var plan = sharePlan(st), out = [];
    for (var n of Object.keys(plan)) { var v = st.views[n]; await share(v, plan[n]); await protect(v); out.push(n.replace('BOCO_Preplans_', '') + ': ' + (plan[n].everyone ? 'public' : plan[n].org ? 'county sign-in' : 'groups only')); }
    await share(st.main, {}); // the full service stays with its owner
    await A.req(P('/content/users/' + st.main.owner + '/items/' + st.main.id + '/unshare'), { groups: Object.keys(st.groups).map(function (k) { return st.groups[k]; }).join(',') }, true).catch(function () {});
    await protect(st.main);
    return out.join(' · ');
  }

  // ---------- 5. the two Survey123 forms ----------
  // Published once from Survey123 Connect. Found by what they submit to (whatever they were titled), or by title.
  // The crew form is opened to everyone so crews need no sign-in; the review form goes to the reviewers' group.
  async function forms(st) {
    st.forms = {}; st.formItems = {}; var want = { crew: S.names.intake, review: S.names.review }, out = [], todo = false;
    for (var k of Object.keys(want)) {
      var f = null;
      try { var r = await A.req(P('/content/items/' + st.views[want[k]].id + '/relatedItems'), { relationshipType: 'Survey2Service', direction: 'reverse' }); f = (r.relatedItems || []).find(function (x) { return x.type === 'Form'; }) || null; } catch (e) {}
      if (!f) f = await findKnown(((CP.store.prefs().ppState || {}).forms || {})[k], S.forms[k], 'Form').catch(function () { return null; });
      if (!f) { out.push((k === 'crew' ? 'crew' : 'review') + ' form not published yet'); todo = true; continue; }
      st.forms[k] = f.id; st.formItems[k] = f;
      try { await share(f, k === 'crew' ? { everyone: true } : { groups: [st.groups.review] }); await protect(f); out.push((k === 'crew' ? 'crew form: public' : 'review form: reviewers only')); }
      catch (e) { out.push((k === 'crew' ? 'crew' : 'review') + ' form found, but it could not be shared (' + (e.message || 'refused') + '). Share it in Survey123: Collaborate.'); st.formShareErr = true; }
    }
    return todo ? { todo: true, text: out.join(' · ') } : out.join(' · ');
  }

  // ---------- 6. web maps and dashboard ----------
  async function put(type, title, text, snippet, extra, knownId) {
    var it = await findKnown(knownId, title, type);
    if (!it) { var r = await A.req((await base()) + '/addItem', Object.assign({ type: type, title: title, tags: S.tags, snippet: snippet, text: text }, extra || {}), true); if (!r.success) throw new Error('could not create ' + title); return item(r.id); }
    await A.req(P('/content/users/' + it.owner + '/items/' + it.id + '/update'), { text: text }, true); return it;
  }
  async function maps(st) {
    // one preplan's links: Survey123 first (once the review form is published), then the Preplan Builder
    var s123 = st.forms && st.forms.review ? S123 + st.forms.review + '?mode=edit&recalculate=' + S.recalc + '&globalId=' : '', plan = sharePlan(st), N = S.names, out = [];
    var links = function (where) { var w = S.links[where], parts = []; if (s123) parts.push(S.links.s123.replace('__S123__', s123)); parts.push(S.links.app.replace('__APP__', APP + '?review=')); return JSON.stringify(w[0] + parts.join(S.links.sep).split('__GID__').join(w[2]) + w[1]).slice(1, -1); };
    st.maps = {}; var old = CP.store.prefs().ppState || {};
    for (var m of S.maps) {
      var v = st.views[N[m.view]];
      var text = JSON.stringify(m.json).split('__URL__').join(v.url).split('__ITEM__').join(v.id).split('__LINK__').join(links('map'));
      var it = await put('Web Map', m.title, text, m.snippet, { extent: '-80.2,37.3,-79.4,37.85', typeKeywords: 'ArcGIS Online,Explorer Web Map,Map,Online Map,Web Map' }, (old.maps || {})[m.key]);
      await share(it, plan[N[m.view]]); await protect(it); st.maps[m.key] = it.id; out.push(m.key);
    }
    var d = JSON.stringify(S.dash.json).split('__ITEM__').join(st.views[N.protected].id).split('__MAP__').join(st.maps.protected).split('__DLINK__').join(links('dash'));
    var dash = await put('Dashboard', S.dash.title, d, S.dash.snippet, { typeKeywords: 'Dashboard,Operations Dashboard,ArcGIS Dashboards' }, old.dash);
    await share(dash, { groups: [st.groups.protected, st.groups.review] }); await protect(dash); st.dash = dash.id;
    return out.length + ' maps and the dashboard, linked to ' + (s123 ? 'the Survey123 review form and the Preplan Builder' : 'the Preplan Builder (the Survey123 link is added once the review form is published)');
  }

  // ---------- 7. health check: what can someone with no sign-in actually do? ----------
  PP.health = async function (st) {
    var N = S.names, V = st.views, out = [], ok = function (good, msg) { out.push([good ? 'ok' : 'bad', msg]); }, todo = function (msg) { out.push(['todo', msg]); };
    var readable = async function (n) { try { await anon(V[n].url + '/0/query', { where: '1=1', returnCountOnly: true }); return true; } catch (e) { return false; } };
    ok(!(await readable(N.intake)), 'Intake: nobody can read preplans through the public form or the app');
    try {
      var d = await anon(V[N.intake].url + '/0'), leak = S.intakeHidden.filter(function (n) { return (d.fields || []).some(function (f) { return f.name === n; }); });
      ok(/Create/.test(d.capabilities || ''), 'Intake: crews can submit with no sign-in');
      ok(!leak.length, leak.length ? 'Intake: someone with no sign-in could set ' + leak.join(', ') + ' (must be hidden)' : 'Intake: someone with no sign-in cannot set status or any review field');
      var ph = await anon(V[N.intake].url + '/' + S.layers.find(function (l) { return l.hasAttachments; }).id); ok(!!ph.hasAttachments, 'Intake: photos can be attached');
    } catch (e) { ok(false, 'Intake is not public yet, so crews could not submit (' + e.message + ')'); }
    var pub = await readable(N.tactical);
    ok(pub === (st.tactical === 'everyone'), 'Field view: ' + (pub ? 'open with no sign-in' : 'needs a sign-in') + ' (set to: ' + ({ everyone: 'anyone, no sign-in', org: 'anyone signed in to the county', groups: 'Preplans groups only' })[st.tactical] + ')');
    for (var n of [N.protected, N.review]) ok(!(await readable(n)), n.replace('BOCO_Preplans_', '') + ' view needs a sign-in');
    var t0 = await A.req(V[N.tactical].url + '/0', { _: Date.now() }), want = S.views.find(function (v) { return v.name === N.tactical; }).layers[0];
    ok((t0.viewDefinitionQuery || '') === want.where, 'Field view shows approved, non-restricted preplans only');
    ok(!want.hide.some(function (n) { return (t0.fields || []).some(function (f) { return f.name === n; }); }), 'Field view hides Knox location, gate codes, occupant notes and reviewer notes');
    for (var k of ['intake', 'review', 'protected', 'tactical']) { var exp = 'https://services6.arcgis.com/6h5xc2eGkGuRiFia/arcgis/rest/services/' + N[k] + '/FeatureServer'; if (V[N[k]].url !== exp) ok(false, 'The ' + k + ' view was given a different address than expected: ' + V[N[k]].url + '. Put it in config.js under preplans.' + k + 'Url' + (k === 'intake' || k === 'review' ? ', and in the ' + (k === 'intake' ? 'crew' : 'review') + ' XLSForm settings sheet as submission_url, then publish that form again.' : '.')); }
    // the Survey123 forms (the backbone): published, and reachable by the right people
    var F = st.forms || {};
    if (!F.crew) todo('Survey123 crew form not published yet (Survey123 Connect: ' + S.formFiles.crew + '), then press this button again');
    else { var pubForm = false; try { var fi = await anon(P('/content/items/' + F.crew)); pubForm = fi.access === 'public'; } catch (e) {} ok(pubForm, pubForm ? 'Survey123 crew form: open with no sign-in' : 'Survey123 crew form is published but not open to everyone, so crews would be asked to sign in. In Survey123: Collaborate → Everyone (public).'); }
    if (!F.review) todo('Survey123 review form not published yet (Survey123 Connect: ' + S.formFiles.review + '), then press this button again');
    else { var rf = await item(F.review).catch(function () { return {}; }), priv = rf.access !== 'public'; ok(priv && !st.formShareErr, priv ? 'Survey123 review form: reviewers only' + (st.formShareErr ? ' (sharing needs a look, see above)' : '') : 'Survey123 review form is open to everyone. It must be shared with the Preplans (Review) group only.'); }
    return out;
  };

  // ---------- run ----------
  PP.run = async function (tactical) {
    if (PP.busy) return; PP.busy = true; PP.lines = []; PP.result = null;
    var st = { tactical: tactical || 'groups', views: {} }, failed = false;
    var paint = function () { var b = document.getElementById('ppLog'); if (b) b.textContent = PP.lines.join('\n'); };
    var step = async function (name, fn) { if (failed) return; PP.lines.push('… ' + name); paint(); var at = PP.lines.length - 1; try { var r = await fn(), mk = '✓ '; if (r && typeof r === 'object') { mk = r.todo ? '○ ' : '✓ '; r = r.text; } PP.lines[at] = mk + name + (r ? ': ' + r : ''); } catch (e) { console.warn(name, e); PP.lines[at] = '✗ ' + name + ': ' + (OPS.errText ? OPS.errText(e) : e.message); failed = true; } paint(); };
    try {
      await step('Preplan definitions', async function () { await PP.loadSpec(); return 'loaded'; });
      await step('Groups', function () { return groups(st); });
      await step(S ? S.service : 'Service', function () { return service(st); });
      for (var v of (S ? S.views : [])) { var vv = v; await step(vv.name, function () { return view(st, vv); }); }
      await step('Sharing and delete protection', function () { return sharing(st); });
      await step('Survey123 forms', function () { return forms(st); });
      await step('Web maps and dashboard', function () { return maps(st); });
      if (!failed) {
        var h = await PP.health(st); h.forEach(function (x) { PP.lines.push((x[0] === 'ok' ? '✓ ' : x[0] === 'todo' ? '○ ' : '✗ ') + x[1]); });
        PP.result = { ok: h.every(function (x) { return x[0] !== 'bad'; }), todo: h.filter(function (x) { return x[0] === 'todo'; }).length, health: h };
        CP.store.setPref('ppState', { t: Date.now(), tactical: st.tactical, dash: st.dash, maps: st.maps, forms: st.forms });
      } else PP.lines.push('Stopped. Fix the line marked ✗ and run it again; it is safe to rerun.');
    } finally { PP.busy = false; paint(); if (OPS.repaint) OPS.repaint(); }
    return { st: st, failed: failed, result: PP.result };
  };

  // ---------- Setup card ----------
  PP.panel = function (canPub) {
    var p = CP.store.prefs().ppState, t = (p && p.tactical) || 'groups', link = function (href, ic, label) { return '<a class="btn ghost" target="_blank" rel="noopener" href="' + E(href) + '">' + I(ic) + E(label) + '</a>'; };
    var opt = function (v, l) { return '<option value="' + v + '"' + (t === v ? ' selected' : '') + '>' + E(l) + '</option>'; };
    var fm = (p && p.forms) || {};
    var h = '<p class="dim" style="margin-top:0">Crews build preplans with no sign-in, in the Survey123 crew form or the Preplan Builder app. A reviewer approves them in the Survey123 review form or the app, and approved preplans load onto the Command Board. Both write the same ArcGIS layer; Survey123 keeps working when the BEACON apps are not reachable. This button builds the ArcGIS side once and checks it any time after. Nothing runs on a schedule.</p>' +
      '<label class="f" style="max-width:520px"><span>Who can open approved preplans in the field view (never Knox, codes, contacts, photos or restricted buildings)</span><select class="in" id="ppShare">' + opt('groups', 'Preplans groups only (sign-in)') + opt('org', 'Anyone signed in to the county ArcGIS') + opt('everyone', 'Anyone, no sign-in') + '</select></label>' +
      '<div class="row" style="margin-top:10px"><button class="btn pri" data-act="ppBuild"' + (canPub && !PP.busy ? '' : ' disabled') + '>' + I('build') + (p ? 'Check and repair preplans' : 'Build preplans') + '</button>' +
      (fm.crew ? link(S123 + fm.crew, 'forms', 'Survey123 crew form') : '') + link(APP, 'brief', 'Preplan Builder app') + (p && p.dash ? link(A.portal + '/apps/dashboards/' + p.dash, 'dash', 'Preplan dashboard') : '') +
      (p && p.maps && p.maps.field ? link(A.portal + '/apps/mapviewer/index.html?webmap=' + p.maps.field, 'map', 'Field map') : '') + '</div>' +
      (p && !(fm.crew && fm.review) ? '<p class="warn-t" style="font-size:12.5px;margin:8px 0 0">Next: publish the two forms in Survey123 Connect (' + E('BEACON Preplan.xlsx') + ' and ' + E('BEACON Preplan - Review.xlsx') + '), then press the button again. It finds them, shares them and adds their links to the dashboard.</p>' : '') +
      '<div id="ppLog" class="mono" style="font-size:12.5px;white-space:pre-wrap;margin-top:10px">' + E(PP.lines.join('\n')) + '</div>';
    return '<div class="card" style="margin-top:14px"><h3>' + I('brief') + 'Fire preplans' + (p ? '<span class="x">' + OPS.chip('Active') + '</span>' : '') + '</h3>' + h + '</div>';
  };
  OPS.act.ppBuild = function () {
    var sel = document.getElementById('ppShare'), t = sel ? sel.value : 'groups';
    var go = function () { PP.run(t).catch(function (e) { U.toast(E(e.message), 'err'); }); };
    if (t === 'everyone') return U.confirm('Open the field view to everyone?', 'Approved, non-restricted preplans (address, construction, hazards, map features) will be readable with no sign-in. Knox locations, codes, contacts, photos and restricted buildings stay protected.', 'Yes, build it', go);
    go();
  };
})(window.CP);
