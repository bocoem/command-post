/* EM OPS — Family Reunification staff app.
   Cases (protected), family check-in from kiosk / QR (public add-only view), cross-list search (shelter registry, MCI patients,
   check-ins), automatic match suggestions, unaccompanied-minor board with two-staff release log, EOP + best-practice guidance. */
(function (CP) {
  'use strict';
  var OPS = CP.ops, A = CP.arc, U = CP.ui, E = CP.esc, I = U.icon, K = OPS.LISTS;
  var RU = OPS.ru = {};
  var VIEW_NAME = 'BOCO_Reunification_Public_Intake';

  // ---------- data ----------
  function cases() { return OPS.load('reunify:' + (OPS.inc ? OPS.inc.key : ''), function () { return OPS.rows('reunify', OPS.inc ? OPS.incWhere() : "status NOT IN ('Closed','Reunited')", { order: 'CreationDate DESC', n: 5000 }); }, 30000); }
  function intake() { return OPS.load('intake:' + (OPS.inc ? OPS.inc.key : ''), function () { return OPS.rows('intake', OPS.inc ? "(incident_key=" + A.sq(OPS.inc.key) + " OR incident_key IS NULL) AND (status IS NULL OR status IN ('New','Reviewed'))" : "status IS NULL OR status IN ('New','Reviewed')", { order: 'CreationDate DESC', n: 3000 }); }, 20000); }
  function releases() { return OPS.load('releases:' + (OPS.inc ? OPS.inc.key : ''), function () { return OPS.rows('releases', OPS.incWhere(), { order: 'release_time DESC', n: 3000 }); }, 30000); }
  function norm(s) { return String(s || '').toLowerCase().replace(/[^a-z]/g, ''); }
  function lev(a, b) { if (a === b) return 0; if (!a || !b) return 99; var m = [], i, j; for (i = 0; i <= b.length; i++) m[i] = [i]; for (j = 0; j <= a.length; j++) m[0][j] = j; for (i = 1; i <= b.length; i++) for (j = 1; j <= a.length; j++) m[i][j] = b[i - 1] === a[j - 1] ? m[i - 1][j - 1] : Math.min(m[i - 1][j - 1] + 1, m[i][j - 1] + 1, m[i - 1][j] + 1); return m[b.length][a.length]; }
  RU.score = function (f1, l1, f2, l2) { var a = norm(l1), b = norm(l2), c = norm(f1), d = norm(f2); if (!a || !b) return 0; var ls = a === b ? 60 : lev(a, b) <= 1 && a.length > 3 ? 45 : 0; if (!ls) return 0; var fs = !c || !d ? 10 : c === d ? 40 : c[0] === d[0] && (c.indexOf(d) === 0 || d.indexOf(c) === 0) ? 30 : lev(c, d) <= 2 ? 25 : c[0] === d[0] ? 12 : 0; return ls + fs; };

  // generic name search across any ArcGIS layer (finds its name fields)
  var fieldCache = {};
  async function nameFields(url) { if (fieldCache[url]) return fieldCache[url]; var info = await A.req(url, {}).catch(function () { return {}; }); var fs = (info.fields || []).filter(function (f) { return f.type === 'esriFieldTypeString' && /name/i.test(f.name) && !/shelter|site|facility|incident|creator|editor|team|unit|agency|street|road/i.test(f.name); }).map(function (f) { return f.name; }); return (fieldCache[url] = { names: fs, all: (info.fields || []).map(function (f) { return f.name; }) }); }
  RU.searchLayer = async function (url, text) {
    var nf = await nameFields(url); if (!nf.names.length) return [];
    var words = text.toUpperCase().split(/\s+/).filter(function (w) { return w.length > 1; }).slice(0, 3); if (!words.length) return [];
    var where = words.map(function (w) { return '(' + nf.names.map(function (f) { return 'UPPER(' + f + ") LIKE '%" + w.replace(/'/g, "''") + "%'"; }).join(' OR ') + ')'; }).join(' AND ');
    var r = await A.query(url, where, { n: 50 }).catch(function () { return []; }); return r.map(function (f) { return f.attributes; });
  };
  function label(a) { var f = a.first_name || a.firstname || a.fname || a.first || '', l = a.last_name || a.lastname || a.lname || a.last || ''; return (f || l) ? (f + ' ' + l).trim() : a.name || a.full_name || a.person || a.reg_code || '(record)'; }

  // ---------- public intake view (anyone can add, nobody can read) ----------
  RU.view = null;
  RU.findView = async function () {
    var r = await A.req(A.portal + '/sharing/rest/search', { q: 'title:"' + VIEW_NAME + '" AND type:"Feature Service" AND orgid:' + A.user.orgId, num: 3 }).catch(function () { return { results: [] }; });
    var it = (r.results || []).find(function (x) { return x.title === VIEW_NAME; });
    RU.view = it ? { url: it.url.replace(/\/$/, ''), id: it.id, access: it.access } : null; return RU.view;
  };
  RU.createView = async function () {
    var src = OPS.svc.prot; if (!src) throw new Error('Set up BOCO_EM_Protected first');
    var lid = src.ids.PROT_FamilyIntake; if (lid == null) throw new Error('Family intake layer missing: run Update layers in Setup');
    var u = A.user.username;
    var cr = await A.req(A.portal + '/sharing/rest/content/users/' + u + '/createService', { isView: true, outputType: 'featureService', createParameters: { name: VIEW_NAME, isView: true, sourceSchemaChangesAllowed: true, isUpdatableView: true, capabilities: 'Create', spatialReference: { wkid: 4326 } }, tags: 'Emergency Management,Reunification,Public intake', snippet: 'Public add-only view for the family reunification kiosk and QR form. Records cannot be read through this view.' }, true);
    if (!cr.success) throw new Error('Could not create the view');
    var admin = cr.encodedServiceURL.replace('/rest/services/', '/rest/admin/services/');
    var srcName = src.url.replace(/\/FeatureServer$/, '').split('/').pop();
    var add = await A.req(admin + '/addToDefinition', { addToDefinition: { tables: [{ name: 'Family_Intake', adminLayerInfo: { viewLayerDefinition: { sourceServiceName: srcName, sourceLayerId: lid, sourceLayerFields: '*' } } }] } }, true);
    if (!add.success) throw new Error('Could not link the view to the intake layer');
    await A.req(admin + '/updateDefinition', { updateDefinition: { capabilities: 'Create', editorTrackingInfo: { enableEditorTracking: true, enableOwnershipAccessControl: true, allowOthersToQuery: false, allowOthersToUpdate: false, allowOthersToDelete: false, allowAnonymousToQuery: false, allowAnonymousToUpdate: false, allowAnonymousToDelete: false } } }, true).catch(function () {});
    await A.req(A.portal + '/sharing/rest/content/users/' + u + '/items/' + cr.itemId + '/share', { everyone: true, org: true }, true);
    await RU.findView();
    try { await A.settings.set('ops_intake_url', RU.view.url + '/0'); } catch (e) {}
    return RU.view;
  };
  RU.formLink = function (site, kiosk) { if (!RU.view) return ''; var base = location.origin + location.pathname.replace(/[^\/]*$/, ''); return base + 'family.html?svc=' + encodeURIComponent(RU.view.url + '/0') + (site ? '&site=' + encodeURIComponent(site) : '') + (OPS.inc ? '&incident=' + encodeURIComponent(OPS.inc.key) : '') + (kiosk ? '&kiosk=1' : ''); };

  // ---------- matches ----------
  function matches(cs, ins, extra) {
    var miss = cs.filter(function (c) { return c.rec_type === 'Missing (inquiry)' && ['Open inquiry', 'Possible match'].indexOf(c.status) >= 0; });
    var found = cs.filter(function (c) { return c.rec_type !== 'Missing (inquiry)' && ['Reunited', 'Closed'].indexOf(c.status) < 0; }).map(function (c) { return { src: 'Case ' + c.case_no, f: c.first_name, l: c.last_name, where: c.located_at || c.center || '', ref: c }; });
    (ins || []).filter(function (x) { return x.intake_type === 'Checking in safe'; }).forEach(function (x) { found.push({ src: 'Family check-in ' + (x.intake_no || ''), f: x.first_name, l: x.last_name, where: x.current_loc || x.site || '', ref: x, intake: 1 }); });
    (extra || []).forEach(function (x) { found.push(x); });
    var out = [];
    miss.forEach(function (m) { found.forEach(function (f) { var s = RU.score(m.first_name, m.last_name, f.f, f.l); if (s >= 55) out.push({ m: m, f: f, s: s }); }); });
    return out.sort(function (a, b) { return b.s - a.s; });
  }
  function patientsAsFound() { return OPS.load('ru:pts:' + (OPS.inc ? OPS.inc.key : ''), function () { return OPS.ready('patients') ? OPS.rows('patients', OPS.incWhere("last_name IS NOT NULL"), { n: 2000 }).then(function (r) { return r.map(function (p) { return { src: 'MCI patient ' + p.tag_no, f: p.first_name, l: p.last_name, where: (p.hospital ? 'to ' + p.hospital : p.status) || '', ref: p, pt: 1 }; }); }) : []; }, 60000); }

  OPS.tool('reunify', {
    n: 'Reunification', sub: 'Family Reunification Center', icon: 'users', color: 'red', live: 'reunify', d: 'Family reunification: inquiries and found persons, kiosk and QR family check-in, search of every list, match suggestions, unaccompanied minors and two-staff child release.',
    nums: async function () { var o = await OPS.count('reunify', OPS.incWhere("status IN ('Open inquiry','Possible match')")), m = await OPS.count('reunify', OPS.incWhere("unaccompanied='Yes' AND status NOT IN ('Reunited','Closed')")), i = await OPS.count('intake', "status IS NULL OR status='New'").catch(function () { return 0; }); return [[o, 'open inquiries', o ? 'warn-t' : ''], [m, 'children in care', m ? 'bad-t' : ''], [i, 'new check-ins']]; },
    render: function () {
      if (!OPS.svc.prot) return '<h1 class="pg">Reunification</h1><div class="warnbox">The protected EM service is not set up or not shared with you. Reunification records are restricted. <a href="#setup" data-act="go" data-a="setup">Setup</a></div>' + OPS.eopCard('reunify', true);
      if (RU.view === null && !RU._looked && A.user) { RU._looked = true; RU.findView().then(OPS.repaint); }
      var c = cases(), ins = intake(), u = OPS.st.ui, tab = u.rt || 'dash';
      var h = '<div class="phead"><div><h1 class="pg">Family Reunification</h1><p class="pgsub" style="margin:0">Restricted. Records live in BOCO_EM_Protected. Families check in from the kiosk or QR form. Lead: DSS and Sheriff\'s Office (EOP).</p></div><div class="acts"><button class="btn sm" data-act="ruKiosk">' + I('copy') + 'Kiosk & QR</button><button class="btn sm" data-act="ruNew" data-a="Found / accounted for">' + I('plus') + 'Found person</button><button class="btn sm" data-act="ruNew" data-a="unacc">' + I('plus') + 'Unaccompanied child</button><button class="btn pri" data-act="ruNew" data-a="Missing (inquiry)">' + I('plus') + 'Inquiry</button></div></div>';
      if (OPS.bad(c)) return h + OPS.wait(c, 'cases');
      var insl = Array.isArray(ins) ? ins : [], newIn = insl.filter(function (x) { return !x.status || x.status === 'New'; });
      var kids = c.filter(function (x) { return x.unaccompanied === 'Yes' && ['Reunited', 'Closed'].indexOf(x.status) < 0; });
      var pts = patientsAsFound(), mt = RU._mt = matches(c, insl, Array.isArray(pts) ? pts : []);
      h += OPS.tabs('rt', [['dash', 'Board'], ['in', 'Family check-ins', newIn.length || ''], ['cases', 'Cases', c.length], ['kids', 'Children in care', kids.length || ''], ['match', 'Possible matches', mt.length || ''], ['search', 'Search all lists'], ['rel', 'Release log'], ['guide', 'Best practices']], tab);
      if (tab === 'dash') h += board(c, insl, newIn, kids, mt);
      else if (tab === 'in') h += inTab(insl);
      else if (tab === 'cases') h += casesTab(c);
      else if (tab === 'kids') h += kidsTab(kids);
      else if (tab === 'match') h += matchTab(mt);
      else if (tab === 'search') h += searchTab();
      else if (tab === 'rel') { var r = releases(); h += OPS.bad(r) ? OPS.wait(r) : '<div class="toolbar"><span class="muted">Every child release with two-staff verification.</span><span class="sp"></span><button class="btn sm" data-act="ruRelPrint">' + I('print') + 'Print log</button></div>' + OPS.table({ k: 'releases', rows: r, empty: 'No releases yet.' }); }
      else h += '<div class="grid g2"><div class="card"><h3>' + I('brief') + E(OPS.EOP.reunify.t) + '</h3>' + OPS.eopHtml('reunify') + '</div><div class="card"><h3>' + I('shield') + E(OPS.EOP.reunifyBest.t) + '</h3>' + OPS.eopHtml('reunifyBest') + '</div></div>';
      return h;
    },
    edit: { reunify: function (r) { caseForm(r); }, intake: function (r) { inForm(r); }, releases: function (r) { OPS.edit('releases', r, { noDelete: true }); } }
  });

  function board(c, insl, newIn, kids, mt) {
    var open = c.filter(function (x) { return x.rec_type === 'Missing (inquiry)' && ['Open inquiry', 'Possible match'].indexOf(x.status) >= 0; }), found = c.filter(function (x) { return x.rec_type !== 'Missing (inquiry)'; }), reun = c.filter(function (x) { return x.status === 'Reunited' || x.status === 'Located - safe'; });
    var h = '<div class="grid g6" style="margin-bottom:12px">' + OPS.stat(newIn.length, 'New family check-ins', newIn.length ? 'gold' : '') + OPS.stat(open.length, 'Open inquiries', open.length ? 'red' : '') + OPS.stat(kids.length, 'Children in care', kids.length ? 'red' : '') + OPS.stat(mt.length, 'Possible matches', mt.length ? 'gold' : '') + OPS.stat(found.length, 'Found / displaced', 'blue') + OPS.stat(reun.length, 'Located or reunited', 'green') + '</div>';
    if (kids.length) h += '<div class="warnbox" style="margin-bottom:12px;color:#ffb3b8;border-color:rgba(240,68,76,.6);background:rgba(208,33,41,.12)">' + I('warn') + ' <b>' + kids.length + ' unaccompanied ' + (kids.length === 1 ? 'child' : 'children') + ' in care.</b> ' + kids.filter(function (k) { return k.dss_notified !== 'Yes'; }).length + ' without DSS notified, ' + kids.filter(function (k) { return k.le_notified !== 'Yes'; }).length + ' without law enforcement notified. <a href="#" data-act="seg" data-a="rt|kids">Open</a></div>';
    if (!RU.view) h += '<div class="hint" style="margin-bottom:12px">' + I('copy') + ' The public family check-in (kiosk & QR) is not set up yet. <a href="#" data-act="ruKiosk">Set it up</a></div>';
    h += '<div class="grid g2"><div class="card"><h3>' + I('users') + 'Newest family check-ins<span class="x"><a href="#" data-act="seg" data-a="rt|in" class="dim" style="font-size:12px">all</a></span></h3>' + (newIn.slice(0, 8).map(function (x) { return '<div class="kc" data-act="edit" data-a="intake|' + x.OBJECTID + '"><b>' + E(x.first_name + ' ' + x.last_name) + ' · ' + E(x.intake_type || '') + '</b><div class="m">' + E((x.sought || '').slice(0, 120)) + '</div><div class="m">' + E(x.site || '') + ' · ' + E(OPS.ago(x.CreationDate)) + (x.children === 'Yes' ? ' · <span class="bad-t">children</span>' : '') + '</div></div>'; }).join('') || '<div class="empty">No new check-ins.</div>') + '</div>' +
      '<div class="card"><h3>' + I('link') + 'Top possible matches</h3>' + (mt.slice(0, 6).map(matchRow).join('') || '<div class="empty">No matches right now.</div>') + '</div></div>';
    return h + OPS.eopCard('reunify');
  }
  function matchRow(x, i) { return '<div class="kc"><b>' + E(x.m.first_name + ' ' + x.m.last_name) + ' (inquiry ' + E(x.m.case_no) + ') ↔ ' + E((x.f.f || '') + ' ' + (x.f.l || '')) + '</b><div class="m">' + E(x.f.src) + (x.f.where ? ' · ' + E(x.f.where) : '') + ' · score ' + x.s + '</div><div class="row" style="margin-top:6px"><button class="btn xs pri" data-act="ruConfirm" data-a="' + i + '">Confirm match</button><button class="btn xs ghost" data-act="edit" data-a="reunify|' + x.m.OBJECTID + '">Open inquiry</button></div></div>'; }
  function inTab(insl) {
    var u = OPS.st.ui;
    return '<div class="toolbar">' + OPS.searchBox('ri', 'Search names, who they seek') + OPS.seg('rif', ['New', 'Reviewed', 'All open'], u.rif || 'New') + '<span class="sp"></span><button class="btn sm" data-act="ruKiosk">' + I('copy') + 'Kiosk & QR links</button></div>' +
      OPS.table({ k: 'intake', rows: insl.filter(function (x) { var f = u.rif || 'New'; return f === 'All open' || (f === 'New' ? !x.status || x.status === 'New' : x.status === f); }), q: u.q_ri, cols: [{ f: 'CreationDate', l: 'When', fmt: function (x) { return E(OPS.ago(x.CreationDate)); } }, 'intake_type', { f: 'n', l: 'Name', fmt: function (x) { return '<b>' + E(x.first_name + ' ' + x.last_name) + '</b><div class="mono dim" style="font-size:12px">' + E(x.phone || '') + '</div>'; } }, 'sought', 'children', 'site', 'status'], rowCls: function (x) { return x.children === 'Yes' ? 'row-bad' : ''; }, actions: function (x) { return '<button class="btn xs pri" data-act="ruFromIntake" data-a="' + x.OBJECTID + '">Open case</button>'; }, empty: 'No family check-ins.' });
  }
  function casesTab(c) {
    var u = OPS.st.ui;
    return '<div class="toolbar">' + OPS.searchBox('rc', 'Search name, case, location') + OPS.seg('rcf', ['Open', 'All', 'Reunited', 'Closed'], u.rcf || 'Open') + '<select class="in" style="max-width:220px" data-chg="rct"><option value="">All record types</option>' + K.reunType.map(function (t) { return '<option' + (u.rct === t ? ' selected' : '') + '>' + E(t) + '</option>'; }).join('') + '</select><span class="sp"></span><button class="btn sm" data-act="ruCsv">' + I('down') + 'CSV</button></div>' +
      OPS.table({ k: 'reunify', rows: c.filter(function (x) { var f = u.rcf || 'Open'; return (f === 'All' || (f === 'Open' ? ['Reunited', 'Closed'].indexOf(x.status) < 0 : x.status === f)) && (!u.rct || x.rec_type === u.rct); }), q: u.q_rc, cols: ['case_no', 'rec_type', { f: 'n', l: 'Name', fmt: function (x) { return '<b>' + E((x.first_name || '') + ' ' + x.last_name) + '</b>' + (x.age != null ? ' <span class="dim">' + x.age + '</span>' : '') + (x.is_minor === 'Yes' ? ' <span class="chip red">minor</span>' : ''); } }, 'status', 'located_at', { f: 'rp', l: 'Reported by', fmt: function (x) { return E(x.rp_name || '') + (x.rp_phone ? '<div class="mono dim" style="font-size:12px">' + E(x.rp_phone) + '</div>' : ''); } }, { f: 'age_', l: 'Open', fmt: function (x) { return E(OPS.ago(x.CreationDate)); } }], rowCls: function (x) { return x.unaccompanied === 'Yes' && ['Reunited', 'Closed'].indexOf(x.status) < 0 ? 'row-bad' : x.status === 'Possible match' ? 'row-warn' : x.status === 'Reunited' ? 'row-ok' : ''; }, empty: 'No cases.' });
  }
  OPS.chg.rct = function (el) { OPS.st.ui.rct = el.value; OPS.repaint(); };
  function kidsTab(kids) {
    if (!kids.length) return '<div class="empty">No unaccompanied children in care.</div>' + OPS.eopCard('reunifyBest', true);
    return '<div class="hint" style="margin-bottom:10px">' + I('shield') + ' Keep children in a supervised area with at least two adults. Release only after photo ID matches the guardian on record and two staff verify. Conflicts go to DSS and law enforcement.</div><div class="grid g2">' + kids.map(function (k) {
      return '<div class="card" style="border-left:4px solid var(--red)"><h3>' + I('users') + E((k.first_name || '') + ' ' + k.last_name) + '<small>' + E(k.case_no || '') + '</small><span class="x">' + OPS.chip(k.status) + '</span></h3><div style="font-size:13.5px">' + (k.age != null ? 'Age ' + k.age + ' · ' : '') + E(k.sex || '') + (k.center ? ' · at ' + E(k.center) : '') + '<br>Guardian: <b>' + E(k.guardian || 'unknown') + '</b> ' + E(k.guardian_phone || '') + (k.school ? '<br>School / care: ' + E(k.school) : '') + (k.medical ? '<br><span class="warn-t">Medical: ' + E(k.medical) + '</span>' : '') + '</div>' +
        '<div class="pills" style="margin:8px 0">' + ['dss_notified', 'le_notified', 'ncmec'].map(function (f, i) { var on = k[f] === 'Yes'; return '<button class="btn xs ' + (on ? '' : 'red') + '" data-act="ruFlag" data-a="' + k.OBJECTID + '|' + f + '">' + (on ? I('check') : '') + ['DSS', 'Law enforcement', 'NCMEC'][i] + (on ? ' notified' : ' not notified') + '</button>'; }).join('') + '</div>' +
        '<div class="row"><button class="btn sm pri" data-act="ruRelease" data-a="' + k.OBJECTID + '">' + I('check') + 'Release to guardian</button><button class="btn sm ghost" data-act="edit" data-a="reunify|' + k.OBJECTID + '">Open case</button></div></div>';
    }).join('') + '</div>';
  }
  function matchTab(mt) { RU._mt = mt; return '<p class="dim" style="margin-top:0">Inquiries compared with found persons, family "I\'m safe" check-ins and named MCI patients' + (OPS.inc ? ' for this incident' : '') + '. Use <b>Search all lists</b> for shelter registrations and check-ins too. Confirm only after talking to both sides.</p>' + (mt.map(matchRow).join('') || '<div class="empty">No possible matches right now.</div>'); }
  function searchTab() {
    var q = OPS.st.ui.rsq || '', res = q ? OPS.load('ru:search:' + q + ':' + (OPS.inc ? OPS.inc.key : ''), function () { return RU.searchAll(q); }, 30000) : null;
    var h = '<div class="toolbar"><input class="in" id="rsq" style="max-width:360px" placeholder="Name to search (first and/or last)" value="' + E(q) + '"><button class="btn pri" data-act="ruSearch">' + I('eye') + 'Search every list</button></div><p class="dim" style="margin-top:0;font-size:13px">Searches reunification cases, family check-ins, the county shelter registry, MCI patients and incident check-ins. Hospitals: confirm through VHASS / the hospital liaison.</p>';
    if (!q) return h; if (OPS.bad(res)) return h + OPS.wait(res, 'every list');
    return h + res.map(function (g) { return '<div class="card" style="margin-bottom:10px"><h3>' + I('list') + E(g.n) + '<small>' + (g.err ? 'not available' : g.rows.length) + '</small></h3>' + (g.err ? '<div class="dim">' + E(g.err) + '</div>' : g.rows.length ? g.rows.map(function (r) { return '<div style="padding:6px 0;border-bottom:1px solid var(--line)"><b>' + E(r.t) + '</b> <span class="dim">' + E(r.d || '') + '</span>' + (r.act ? ' <button class="btn xs ghost" data-act="' + r.act[0] + '" data-a="' + E(r.act[1]) + '">Open</button>' : '') + '</div>'; }).join('') : '<div class="dim">No match.</div>') + '</div>'; }).join('');
  }
  OPS.act.ruSearch = function () { OPS.st.ui.rsq = document.getElementById('rsq').value.trim(); OPS.repaint(); };
  RU.searchAll = async function (q) {
    var out = [], incW = OPS.inc ? ' AND incident_key=' + A.sq(OPS.inc.key) : '';
    var lists = [['Reunification cases', 'reunify', function (r) { return { t: (r.first_name || '') + ' ' + r.last_name + ' · ' + r.case_no, d: r.rec_type + ' · ' + r.status + (r.located_at ? ' · ' + r.located_at : ''), act: ['edit', 'reunify|' + r.OBJECTID] }; }],
      ['Family check-ins (kiosk / QR)', 'intake', function (r) { return { t: r.first_name + ' ' + r.last_name, d: r.intake_type + ' · ' + (r.site || '') + ' · seeking: ' + (r.sought || '').slice(0, 80), act: ['edit', 'intake|' + r.OBJECTID] }; }],
      ['MCI patients', 'patients', function (r) { return { t: (r.first_name || '') + ' ' + (r.last_name || '') + ' · tag ' + r.tag_no, d: r.triage + ' · ' + (r.status || '') + (r.hospital ? ' · ' + r.hospital : ''), act: ['edit', 'patients|' + r.OBJECTID] }; }],
      ['Incident check-ins (responders)', 'checkins', function (r) { return { t: r.person, d: (r.agency || '') + ' · ' + (r.status || '') + (r.assignment ? ' · ' + r.assignment : '') }; }]];
    for (var L of lists) {
      if (!OPS.ready(L[1])) { out.push({ n: L[0], rows: [], err: 'layer not set up' }); continue; }
      try { var rr = await RU.searchLayer(OPS.url(L[1]), q); out.push({ n: L[0], rows: rr.filter(function (r) { return L[1] !== 'checkins' || !OPS.inc || r.incident_key === OPS.inc.key; }).map(L[2]) }); } catch (e) { out.push({ n: L[0], rows: [], err: e.message }); }
    }
    try { var sr = await RU.searchLayer(A.L.shelterReg, q); out.splice(1, 0, { n: 'County shelter registry', rows: sr.map(function (r) { return { t: label(r), d: [r.shelter_name, r.reg_code ? 'reg ' + r.reg_code : '', r.hh_total ? r.hh_total + ' in household' : ''].filter(Boolean).join(' · ') }; }) }); } catch (e) { out.splice(1, 0, { n: 'County shelter registry', rows: [], err: e.message }); }
    return out;
  };

  // ---------- forms ----------
  function caseForm(r, def, more) {
    OPS.edit('reunify', r, { defaults: def || (r ? null : {}), addrField: 'home_address', noMap: false,
      top: r ? '<div class="hint" style="margin-bottom:10px">Case ' + E(r.case_no || '') + ' · opened ' + E(OPS.dt(r.CreationDate)) + (r.Creator ? ' by ' + E(r.Creator) : '') + '. The map point is the last known or found location. Attach a photo after saving if the family provides one.</div>' : '',
      before: function (at, old) { if (!old.OBJECTID) at.case_no = OPS.id('R-'); if (at.age != null && at.age < 18) at.is_minor = 'Yes'; if (!at.status) at.status = at.rec_type === 'Missing (inquiry)' ? 'Open inquiry' : at.rec_type === 'Hospitalized' ? 'Hospitalized' : 'Located - safe'; return at; },
      after: async function (oid, at, old) { OPS.bust('reunify'); if (more) await more(oid, at); if (!old.OBJECTID && OPS.inc) return OPS.cpEdit(OPS.inc.key, function () {}, 'Reunification case opened: ' + at.rec_type + (at.is_minor === 'Yes' ? ' (minor' + (at.unaccompanied === 'Yes' ? ', unaccompanied' : '') + ')' : '') + ' · ' + at.case_no, 'Event').catch(function () {}); },
      buttons: r && r.unaccompanied === 'Yes' && ['Reunited', 'Closed'].indexOf(r.status) < 0 ? [{ label: 'Release to guardian', fn: function () { setTimeout(function () { OPS.act.ruRelease(r.OBJECTID); }, 30); } }] : [] });
  }
  OPS.act.ruNew = function (t) { if (t === 'unacc') return caseForm(null, { rec_type: 'Found / accounted for', is_minor: 'Yes', unaccompanied: 'Yes', status: 'Located - safe', dss_notified: 'No', le_notified: 'No', ncmec: 'No' }); caseForm(null, { rec_type: t, status: t === 'Missing (inquiry)' ? 'Open inquiry' : 'Located - safe' }); };
  OPS.act.ruCsv = function () { var c = cases(); if (Array.isArray(c)) OPS.csv('Reunification cases (RESTRICTED)', 'reunify', c); };
  function inForm(x) { OPS.edit('intake', x, { noDelete: false, buttons: [{ label: 'Open case from this', fn: function () { setTimeout(function () { OPS.act.ruFromIntake(x.OBJECTID); }, 30); } }] }); }
  // turn a family check-in into case(s)
  OPS.act.ruFromIntake = function (oid) {
    var x = OPS.arr(intake()).find(function (i) { return i.OBJECTID === +oid; }); if (!x) return;
    var seeking = x.intake_type === 'Looking for someone', pick = x.intake_type === 'Picking up a child';
    var first = (x.sought || '').split(/[,;\n]/)[0].trim().split(/\s+/);
    caseForm(null, seeking || pick ? { rec_type: 'Missing (inquiry)', status: 'Open inquiry', first_name: first.length > 1 ? first[0] : '', last_name: first.length > 1 ? first.slice(1).join(' ') : first[0] || '', description: x.sought, last_seen: x.last_seen, rp_name: x.first_name + ' ' + x.last_name, rp_phone: x.phone, rp_relation: pick ? 'Parent / guardian' : '', language: x.language, is_minor: x.children === 'Yes' ? 'Yes' : null, intake_no: x.intake_no, center: x.site }
      : { rec_type: 'Found / accounted for', status: 'Located - safe', first_name: x.first_name, last_name: x.last_name, located_at: x.current_loc || x.site, language: x.language, notes: (x.sought ? 'With / about: ' + x.sought : '') + (x.needs ? '\nNeeds: ' + x.needs : ''), intake_no: x.intake_no, center: x.site }, function (oid2, at) { return OPS.upd('intake', x.OBJECTID, { status: 'Case opened', case_no: at.case_no }).then(function () { OPS.bust('intake'); }); });
  };
  OPS.act.ruConfirm = function (i) {
    var x = (RU._mt || matches(OPS.arr(cases()), OPS.arr(intake()), OPS.arr(patientsAsFound())))[+i]; if (!x) return;
    U.confirm('Confirm this match?', 'Inquiry <b>' + E(x.m.case_no) + '</b> (' + E(x.m.first_name + ' ' + x.m.last_name) + ') matches ' + E(x.f.src) + '. The inquiry becomes "Located - safe" (or Hospitalized) with the location. Contact the reporting party ' + E(x.m.rp_name || '') + ' ' + E(x.m.rp_phone || '') + ' and only share the location if the person agreed.', 'Confirm', async function () {
      var st = x.f.pt ? 'Hospitalized' : 'Located - safe';
      await OPS.upd('reunify', x.m.OBJECTID, { status: st, located_at: (x.f.where || x.f.src).slice(0, 255), match_case: x.f.ref.case_no || x.f.ref.intake_no || x.f.ref.tag_no || null });
      if (x.f.ref.case_no && x.f.ref.OBJECTID && !x.f.intake && !x.f.pt) await OPS.upd('reunify', x.f.ref.OBJECTID, { match_case: x.m.case_no });
      if (x.f.intake) await OPS.upd('intake', x.f.ref.OBJECTID, { status: 'Case opened', case_no: x.m.case_no });
      if (x.f.pt) await OPS.upd('patients', x.f.ref.OBJECTID, { reun_case: x.m.case_no });
      if (OPS.inc) OPS.cpEdit(OPS.inc.key, function () {}, 'Reunification: inquiry ' + x.m.case_no + ' located (' + st + ')', 'Event').catch(function () {});
      OPS.bust('reunify'); OPS.bust('intake'); OPS.bust('ru:'); U.toast('Match confirmed. Call the family.', 'ok', 6000); OPS.repaint();
    });
  };
  OPS.act.ruFlag = function (a) { var p = a.split('|'), k = OPS.arr(cases()).find(function (x) { return x.OBJECTID === +p[0]; }); if (!k) return; var on = k[p[1]] !== 'Yes'; var at = {}; at[p[1]] = on ? 'Yes' : 'No'; OPS.upd('reunify', k.OBJECTID, at).then(function () { if (on && OPS.inc) OPS.cpEdit(OPS.inc.key, function () {}, 'Unaccompanied child ' + k.case_no + ': ' + { dss_notified: 'DSS', le_notified: 'law enforcement', ncmec: 'NCMEC' }[p[1]] + ' notified', 'Communication').catch(function () {}); OPS.bust('reunify'); OPS.repaint(); }); };
  // two-staff child release
  OPS.act.ruRelease = function (oid) {
    var k = OPS.arr(cases()).find(function (x) { return x.OBJECTID === +oid; }); if (!k) return;
    OPS.edit('releases', null, { title: 'Release ' + ((k.first_name || '') + ' ' + k.last_name).trim() + ' · ' + k.case_no, noDelete: true, saveLabel: 'Record release',
      defaults: { case_no: k.case_no, child: ((k.first_name || '') + ' ' + k.last_name).trim(), released_to: k.guardian || '', relationship: 'Parent', release_time: Date.now(), verified_by_1: OPS.me(), phone: k.guardian_phone || '', custody_docs: 'Not needed' },
      top: '<div class="warnbox" style="margin-bottom:10px">' + I('shield') + ' Guardian on record: <b>' + E(k.guardian || 'none recorded') + '</b>. Check photo ID against it. Two different staff must verify. If anything conflicts (no ID, custody order, child does not recognize the adult), stop and call DSS and law enforcement.</div>',
      before: function (at) {
        if (at.id_matches !== 'Yes' && !/DSS|Law|Hospital/.test(at.relationship)) { U.toast('ID must match the guardian on record, or release to DSS / law enforcement', 'err', 7000); return false; }
        if (!at.verified_by_1 || !at.verified_by_2 || norm(at.verified_by_1) === norm(at.verified_by_2)) { U.toast('Two different staff must verify', 'err'); return false; }
        if (at.child_recognizes === 'No') { U.toast('Child does not recognize the adult: stop and contact DSS / law enforcement', 'err', 8000); return false; }
        Object.assign(at, OPS.incFix()); return at;
      },
      after: async function (oid2, at) {
        await OPS.upd('reunify', k.OBJECTID, { status: 'Reunited', reunited_time: at.release_time || Date.now(), located_at: 'Released to ' + at.relationship.toLowerCase() });
        if (OPS.inc) await OPS.cpEdit(OPS.inc.key, function () {}, 'Child ' + k.case_no + ' released to ' + at.relationship.toLowerCase() + ' after two-staff ID verification', 'Event').catch(function () {});
        OPS.bust('reunify'); OPS.bust('releases');
      } });
  };
  OPS.act.ruRelPrint = function () { var r = releases(); if (!Array.isArray(r)) return; OPS.print('Child Release Log (RESTRICTED)', OPS.inc ? E(OPS.inc.name) : 'All incidents', OPS.ptable(['Released', 'Case', 'Child', 'Released to', 'Relationship', 'ID', 'ID matches', 'Custody docs', 'Staff 1', 'Staff 2', 'Going to'], r.map(function (x) { return [OPS.dt(x.release_time), x.case_no, x.child, x.released_to, x.relationship, x.id_type + (x.id_last4 ? ' …' + x.id_last4 : ''), x.id_matches, x.custody_docs, x.verified_by_1, x.verified_by_2, x.destination]; }))); };

  // kiosk & QR
  OPS.act.ruKiosk = async function () {
    if (RU.view === null) await RU.findView();
    if (!RU.view) {
      var owner = OPS.svc.prot && OPS.svc.prot.owner === (A.user && A.user.username);
      U.modal('Set up family check-in (kiosk & QR)', '<p style="margin-top:0">Families check in on a tablet kiosk at the reunification site or by scanning a QR code with their own phone. No account needed.</p><p class="dim">This creates <b>' + VIEW_NAME + '</b>: a public view of the family intake layer that can <b>only add</b> records. Nobody can read records through it; staff see them here.</p>' + (owner ? '' : '<div class="warnbox">Only the owner of BOCO_EM_Protected (' + E(OPS.svc.prot ? OPS.svc.prot.owner : '?') + ') can create it.</div>'),
        [{ label: 'Cancel', cls: 'ghost' }, { label: 'Create public check-in', cls: 'pri', fn: function () { RU.createView().then(function () { U.toast('Family check-in is live', 'ok'); OPS.act.ruKiosk(); }).catch(function (e) { U.toast(E(e.message), 'err', 9000); }); } }]);
      return;
    }
    var bg = U.modal('Family check-in: kiosk & QR', '<label class="f"><span>Site name (shown on the form and saved with each check-in)</span><input class="in" id="kSite" value="' + E(OPS.st.ui.kSite || 'Reunification Center') + '"></label><div id="kOut" style="margin-top:12px"></div>', [{ label: 'Done', cls: 'pri' }], { wide: true });
    function paint() {
      var site = bg.querySelector('#kSite').value.trim(); OPS.st.ui.kSite = site;
      var qrl = RU.formLink(site, false), kl = RU.formLink(site, true), img = '';
      try { var q = window.qrcode(0, 'M'); q.addData(qrl); q.make(); img = q.createImgTag(5, 8); } catch (e) {}
      bg.querySelector('#kOut').innerHTML = '<div class="grid g2"><div class="card flat"><h3>' + I('copy') + 'QR for phones</h3><div class="qr">' + img + '</div><p class="mono" style="font-size:11px;word-break:break-all">' + E(qrl) + '</p><div class="row"><button class="btn sm" data-kcopy="' + E(qrl) + '">Copy link</button><button class="btn sm" data-kprint="1">Print poster</button></div></div>' +
        '<div class="card flat"><h3>' + I('dash') + 'Kiosk tablet</h3><p class="dim" style="margin-top:0;font-size:13px">Open this on a tablet at the site. Big buttons, English or Spanish, and it clears itself after each family so the next person cannot see it.</p><p class="mono" style="font-size:11px;word-break:break-all">' + E(kl) + '</p><div class="row"><a class="btn sm pri" href="' + E(kl) + '" target="_blank">Open kiosk</a><button class="btn sm" data-kcopy="' + E(kl) + '">Copy link</button></div></div></div>';
      bg._img = img; bg._qrl = qrl; bg._site = site;
    }
    paint(); bg.querySelector('#kSite').addEventListener('input', paint);
    bg.addEventListener('click', function (e) { var c = e.target.closest('[data-kcopy]'); if (c) { navigator.clipboard.writeText(c.dataset.kcopy); U.toast('Copied', 'ok'); } if (e.target.closest('[data-kprint]')) OPS.print('Looking for family? Check in here.', E(bg._site), '<div style="text-align:center;margin-top:20px">' + bg._img.replace(/width="\d+"/, 'width="380"').replace(/height="\d+"/, 'height="380"') + '<p style="font-size:22px;font-weight:700">Scan to check in or to look for a family member</p><p style="font-size:18px">Escanee para registrarse o buscar a un familiar</p><p>No account needed. Staff are here to help.</p></div>'); });
  };
})(window.CP);
