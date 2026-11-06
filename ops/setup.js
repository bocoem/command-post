/* EM OPS — Setup page: health first, then go-live readiness, data feeds, access groups, services, test-data cleanup
   and the print kit. Replaces the original Setup render in home.js (the build/share/upgrade actions there are reused). */
(function (CP) {
  'use strict';
  var OPS = CP.ops, A = CP.arc, U = CP.ui, E = CP.esc, I = U.icon;
  var SX = OPS.setupx = {};
  var HOUR = 3600e3;
  function P(path) { return A.portal + '/sharing/rest' + path; }
  function wait(txt) { return '<div class="empty" style="padding:10px 0">' + I('refresh') + ' ' + E(txt) + '</div>'; }
  function err(x) { return '<div class="warnbox">' + E(CP.friendly ? CP.friendly(x._err) : x._err) + '</div>'; }
  function card(icon, title, right, body, accent) {
    return '<div class="card" style="margin-top:14px' + (accent ? ';border-left:4px solid var(--' + accent + ')' : '') + '"><h3>' + I(icon) + E(title) + (right ? '<span class="x">' + right + '</span>' : '') + '</h3>' + body + '</div>';
  }
  function hrow(ok, main, sub, state) {
    var cls = state || (ok ? 'ok' : 'bad');
    return '<div class="hcrow ' + cls + '">' + I(cls === 'ok' ? 'check' : cls === 'bad' ? 'warn' : 'clock') + '<div><div>' + main + '</div>' + (sub ? '<div class="dim" style="font-size:12.5px">' + sub + '</div>' : '') + '</div></div>';
  }

  // ---------- data feeds: how fresh is each outside feed ----------
  SX.FEEDS = [
    { n: 'CAD calls', u: function () { return A.L.cad; }, warn: 3 * HOUR, note: 'Vendor pushes active calls. Quiet nights can run long; days without an update mean the feed has stopped.' },
    { n: 'CAD units', u: function () { return A.L.cadUnits; }, warn: 3 * HOUR, note: 'Vendor pushes unit status.' },
    { n: 'VDOT incidents', u: function () { return A.L.vdot; }, warn: 2 * HOUR, note: 'Refreshed by the VDOT job every 30 minutes.' },
    { n: 'CalTopo team locations', u: function () { return A.L.caltopo; }, warn: 0, note: 'Only updates while teams are out with CalTopo.' },
    { n: 'VDEM power outages', u: function () { return 'https://utility.arcgis.com/usrsvcs/servers/aebf11ec0dea4f88a89928072eee0ef3/rest/services/Hosted/Join_VDEM_Regions_to_Locality_Power_Outages/FeatureServer/0'; }, warn: 26 * HOUR, note: 'State feed. If it stays stale, ask VDEM or switch Overwatch to another outage source.' }
  ];
  SX.feedCheck = async function () {
    return Promise.all(SX.FEEDS.map(async function (f) {
      try { var j = await A.req(f.u(), {}); var ei = j.editingInfo || {}; var t = ei.lastEditDate || ei.dataLastEditDate || null; return { n: f.n, t: t, warn: f.warn, note: f.note }; }
      catch (e) { return { n: f.n, err: e.message, warn: f.warn, note: f.note }; }
    }));
  };
  SX.feeds = function () {
    var r = OPS.load('sx:feeds', SX.feedCheck, 5 * 60000), btn = '<button class="btn sm" data-act="sxBust" data-a="sx:feeds">' + I('refresh') + 'Check</button>';
    if (r === undefined) return card('radio', 'Data feeds', btn, wait('Checking when each feed last updated…'));
    if (r._err) return card('radio', 'Data feeds', btn, err(r));
    var stale = 0, rows = r.map(function (f) {
      if (f.err) { stale++; return hrow(false, '<b>' + E(f.n) + '</b>: not reachable', E(f.err)); }
      if (!f.t) return hrow(true, '<b>' + E(f.n) + '</b>: no update time reported', E(f.note), 'mid');
      var age = Date.now() - f.t, old = f.warn && age > f.warn; if (old) stale++;
      return hrow(!old, '<b>' + E(f.n) + '</b>: updated ' + E(OPS.ago(f.t)) + ' ago', old ? E(f.note) : '', !f.warn ? 'mid' : null);
    }).join('');
    return card('radio', 'Data feeds', btn, '<p style="margin:0 0 8px" class="' + (stale ? 'warn-t' : 'ok-t') + '"><b>' + (stale ? stale + ' feed' + (stale > 1 ? 's look' : ' looks') + ' stale' : 'All feeds are current') + '</b></p><div class="hc">' + rows + '</div>', stale ? 'red' : null);
  };

  // ---------- access groups: who is in each BOCO group ----------
  SX.KEY_GROUPS = [/^BOCO Access 2/, /^BOCO Access 3/, /^BOCO Access 4/, /EMS Patient Care/i, /Leadership/i];
  SX.groupCheck = async function () {
    var q = 'title:"BOCO"' + (A.user && A.user.orgId ? ' AND orgid:' + A.user.orgId : '');
    var r = await A.req(P('/community/groups'), { q: q, num: 100, sortField: 'title', sortOrder: 'asc' });
    var gs = (r.results || []).filter(function (g) { return /^BOCO /.test(g.title) && !/SYSTEM|LEGACY/i.test(g.title); });
    return Promise.all(gs.map(async function (g) {
      var n = null, onlyOwner = false;
      try { var l = await A.req(P('/community/groups/' + g.id + '/userList'), {}); var un = function (x) { return x && typeof x === 'object' ? x.username : x; }; var own = un(l.owner); var m = (l.admins || []).concat(l.users || []).map(un).filter(function (v, i, a) { return v && a.indexOf(v) === i; }); n = m.length; onlyOwner = n <= 1 && (!n || m[0] === own); } catch (e) {}
      return { id: g.id, title: g.title, n: n, onlyOwner: onlyOwner, key: SX.KEY_GROUPS.some(function (rx) { return rx.test(g.title); }) };
    }));
  };
  SX.groups = function () {
    var r = OPS.load('sx:groups', SX.groupCheck, 15 * 60000), btn = '<button class="btn sm" data-act="sxBust" data-a="sx:groups">' + I('refresh') + 'Check</button>';
    if (r === undefined) return card('users', 'Access groups', btn, wait('Counting members in each BOCO group…'));
    if (r._err) return card('users', 'Access groups', btn, err(r));
    var empty = r.filter(function (g) { return g.key && (g.n === 0 || g.onlyOwner); });
    var rows = r.map(function (g) {
      var bad = g.key && (g.n === 0 || g.onlyOwner);
      return hrow(!bad, '<a href="' + A.portal + '/home/group.html?id=' + g.id + '#members" target="_blank" rel="noopener"><b>' + E(g.title) + '</b></a>: ' + (g.n == null ? 'members hidden' : g.onlyOwner ? 'only the group owner' : g.n + ' member' + (g.n === 1 ? '' : 's')),
        bad ? (/EMS Patient Care/i.test(g.title) ? 'Add EMS crews, or they will not see patients in MCI.' : 'Add the people who need this access in ArcGIS.') : '', g.n == null ? 'mid' : null);
    }).join('');
    return card('users', 'Access groups', btn, '<p style="margin:0 0 8px" class="' + (empty.length ? 'warn-t' : 'ok-t') + '"><b>' + (empty.length ? empty.length + ' key group' + (empty.length > 1 ? 's are' : ' is') + ' empty' : 'Every key group has members') + '</b> <span class="dim">· click a group to manage it in ArcGIS</span></p><div class="hc">' + rows + '</div>', empty.length ? 'gold' : null);
  };

  // ---------- go-live checklist: automatic where BEACON can tell, a tick box where it can't ----------
  SX.MANUAL = [['drill', 'Practice drill run (check-in, hotline call, MCI, PAR, MAYDAY, offline save)'], ['devices', 'Apps opened once on every tablet and phone; Board and Hotline on home screens'], ['tags', 'QR unit tags and volunteer badges printed'], ['trained', 'Each role trained and BEACON announced to all agencies']];
  SX.goliveAuto = async function () {
    var tp = null;
    if (OPS.ready('info')) { try { var rows = await OPS.rows('info', "status='Approved'", { fields: 'OBJECTID', n: 200 }); tp = rows.length; } catch (e) {} }
    var ticks = {}; try { ticks = JSON.parse(await A.settings.get('golive') || '{}'); } catch (e) {}
    return { tp: tp, ticks: ticks };
  };
  SX.golive = function () {
    var a = OPS.load('sx:golive', SX.goliveAuto, 10 * 60000), hl = OPS.healthLast, gr = OPS.st.cache['sx:groups'], fd = OPS.st.cache['sx:feeds'], tst = OPS.st.cache['sx:test'];
    if (a === undefined) return card('flag', 'Go-live checklist', '', wait('Checking readiness…'), 'gold');
    if (a._err) return card('flag', 'Go-live checklist', '', err(a), 'gold');
    var items = [], done = 0;
    function auto(ok, txt, sub) { if (ok === true) done++; items.push(hrow(ok === true, txt, ok === true ? '' : sub, ok == null ? 'mid' : null)); }
    auto(hl ? !(hl.bad && hl.bad.length) : null, 'Health check is clear', hl ? 'Fix the items in the health check above.' : 'Run the health check.');
    auto(a.tp == null ? null : a.tp >= 5, 'At least 5 approved hotline talking points' + (a.tp != null ? ' (' + a.tp + ' now)' : ''), 'The PIO adds and approves them in Hotline → Talking points.');
    var g = gr && Array.isArray(gr.data) ? gr.data : null;
    auto(g ? !g.some(function (x) { return x.key && (x.n === 0 || x.onlyOwner); }) : null, 'Key access groups have members', 'See Access groups below.');
    var f = fd && Array.isArray(fd.data) ? fd.data : null;
    auto(f ? !f.some(function (x) { return x.err || (x.warn && x.t && Date.now() - x.t > x.warn); }) : null, 'Data feeds are current', 'See Data feeds below.');
    var t = tst && tst.data && Array.isArray(tst.data.test) ? tst.data : null;
    auto(t ? !t.test.length : null, 'Test records cleared', t ? t.test.length + ' test records found. See Clean up test data below.' : 'Run the scan in Clean up test data below.');
    SX.MANUAL.forEach(function (m) {
      var on = !!a.ticks[m[0]]; if (on) done++;
      items.push('<label class="hcrow ' + (on ? 'ok' : '') + '" style="cursor:pointer"><input type="checkbox" data-chg="sxTick" data-a="' + m[0] + '"' + (on ? ' checked' : '') + ' style="margin-top:3px"><div><div>' + E(m[1]) + '</div>' + (on && a.ticks[m[0]].by ? '<div class="dim" style="font-size:12.5px">Ticked by ' + E(a.ticks[m[0]].by) + ' ' + E(OPS.ago(a.ticks[m[0]].t)) + ' ago</div>' : '') + '</div></label>');
    });
    var total = 5 + SX.MANUAL.length;
    return card('flag', 'Go-live checklist', '<span class="chip ' + (done === total ? 'ok' : 'gold') + '">' + done + ' of ' + total + '</span>', '<p class="dim" style="margin:0 0 8px">Green items check themselves; tick the others when they are done. Ticks are shared with everyone in EM.</p><div class="hc">' + items.join('') + '</div>', 'gold');
  };
  OPS.chg.sxTick = async function (el) {
    var k = el.dataset.a, on = el.checked;
    try { var t = {}; try { t = JSON.parse(await A.settings.get('golive') || '{}'); } catch (e) {}
      if (on) t[k] = { t: Date.now(), by: (A.user || {}).username || '' }; else delete t[k];
      await A.settings.set('golive', JSON.stringify(t)); OPS.bust('sx:golive'); OPS.repaint();
    } catch (e) { U.toast(E(e.message), 'err'); }
  };
  OPS.act.sxBust = function (k) { OPS.bust(k); OPS.repaint(); };

  // ---------- services: one compact table ----------
  SX.services = function (canPub, built) {
    var rows = OPS.SVC_KEYS.map(function (key) {
      var d = OPS.SERVICES[key], s = OPS.svc[key];
      var gaps = s ? OPS.load('gaps:' + key, function () { return OPS.schemaGaps(key); }) : null;
      var st = !s ? '<span class="chip red">Not set up</span>' : gaps === undefined ? '<span class="dim">Checking…</span>' : gaps && gaps._err ? '<span class="warn-t">' + E(gaps._err) + '</span>' :
        (gaps.layers.length || gaps.fields.length) ? '<span class="warn-t">' + gaps.layers.length + ' layers, ' + gaps.fields.reduce(function (n, x) { return n + x.f.length; }, 0) + ' fields missing</span> <button class="btn xs pri" data-act="upgrade" data-a="' + key + '">Update</button>' : '<span class="ok-t">' + I('check') + ' ' + OPS.layersFor(key).length + ' layers OK</span>';
      var acts = s ? (s.id ? '<a class="btn xs ghost" target="_blank" href="' + A.portal + '/home/item.html?id=' + s.id + '">Item</a> ' : '') + '<button class="btn xs" data-act="shareDlg" data-a="' + key + '">' + I('users') + 'Share</button>'
        : (canPub ? '<button class="btn xs pri" data-act="createSvc" data-a="' + key + '">' + I('plus') + 'Create</button>' : '');
      return '<tr><td><b>' + I(OPS.SVC_PRIVATE[key] ? 'shield' : 'cloud') + ' ' + E(d.title) + '</b><div class="dim mono" style="font-size:11.5px">' + E(d.name) + '</div></td><td>' + st + '</td><td class="dim">' + (s ? E(s.access || '?') : '—') + '</td><td style="text-align:right;white-space:nowrap">' + acts + '</td></tr>';
    }).join('');
    var p = CP.store.prefs();
    var tools = '<div class="row" style="margin-top:12px"><button class="btn pri" data-act="harden"' + (canPub ? '' : ' disabled') + ' title="Adds new layers and fields, views, delete protection and the leadership dashboard. Existing records are not touched.">' + I('shield') + 'Secure & connect</button>' +
      '<button class="btn" data-act="hubs" title="Responder Operations Directory and bocoem.org">' + I('link') + 'Update hub pages</button>' +
      '<button class="btn ghost" data-act="buildAll"' + (canPub ? '' : ' disabled') + ' title="Adds only what is missing">' + I('build') + 'Rebuild missing pieces</button>' +
      (OPS.webmapId() ? '<a class="btn ghost" target="_blank" href="' + A.portal + '/apps/mapviewer/index.html?webmap=' + OPS.webmapId() + '">' + I('map') + 'Web map</a>' : '<button class="btn ghost" data-act="makeMap"' + (OPS.svc.main ? '' : ' disabled') + '>' + I('plus') + 'Create web map</button>') +
      (p.leadDash ? '<a class="btn ghost" target="_blank" href="' + A.portal + '/apps/dashboards/' + p.leadDash + '">' + I('dash') + 'Leadership dashboard</a>' : '') + '</div>' +
      '<p class="dim" style="font-size:12.5px;margin:8px 0 0">Run <b>Secure & connect</b> after any update to BEACON. Staff data is in BOCO_EM_Operations; AFN and reunification in BOCO_EM_Protected (EM only); MCI patients in BOCO_EMS_PatientCare (EMS patient care and EM).</p>' +
      (OPS._buildLog ? '<div id="buildLog" class="mono" style="font-size:12.5px;white-space:pre-wrap;margin-top:10px">' + E(OPS._buildLog) + '</div>' : '<div id="buildLog" class="mono" style="font-size:12.5px;white-space:pre-wrap"></div>');
    return card('cloud', 'ArcGIS services', built ? OPS.chip('Active') : '', '<table class="t"><thead><tr><th>Service</th><th>Layers</th><th>Shared</th><th></th></tr></thead><tbody>' + rows + '</tbody></table>' + tools);
  };

  // ---------- clean up test data ----------
  SX.NAMEY = /name|title|incident|label|zone|first|last|question|topic|description|summary/i;
  SX.scanLayers = function () {
    var L = [];
    Object.keys(OPS.LAYERS).forEach(function (k) { if (OPS.ready(k)) L.push({ n: OPS.LAYERS[k].title, u: OPS.url(k) }); });
    if (A.own && A.own.url) L.push({ n: 'Command Post incidents', u: A.own.url + '/0', cp: true });
    [['shelterReg', 'Shelter registry'], ['daZones', 'Damage assessment zones'], ['sitrep', 'SitReps']].forEach(function (x) { if (A.L[x[0]]) L.push({ n: x[1], u: A.L[x[0]] }); });
    return L;
  };
  SX.scan = async function () {
    var out = { test: [], practice: [], skipped: 0 };
    for (var l of SX.scanLayers()) {
      try {
        var info = await A.req(l.u, {});
        var sf = (info.fields || []).filter(function (f) { return f.type === 'esriFieldTypeString' && SX.NAMEY.test(f.name) && (f.length || 0) <= 500; }).map(function (f) { return f.name; }).sort(function (a, b) { var r = function (x) { return /^(incident_)?name$|^title$/i.test(x) ? 0 : /name|title/i.test(x) ? 1 : 2; }; return r(a) - r(b); }).slice(0, 6);
        var oid = info.objectIdField || 'OBJECTID';
        if (sf.length) {
          var where = sf.map(function (f) { return "UPPER(" + f + ") LIKE '%TEST%'"; }).join(' OR ');
          var r = await A.req(l.u + '/query', { where: where, outFields: [oid].concat(sf).join(','), returnGeometry: false, resultRecordCount: 200 });
          (r.features || []).forEach(function (ft) {
            var at = ft.attributes, lab = sf.map(function (f) { return at[f]; }).filter(function (v) { return v && /test/i.test(v); })[0] || sf.map(function (f) { return at[f]; }).filter(Boolean)[0] || '';
            if (!/\btest/i.test(lab)) return; // whole word "test…" only, so "contest" or "latest" never match
            out.test.push({ layer: l.n, u: l.u, oid: at[oid], label: String(lab).slice(0, 120) });
          });
        }
        if (l.cp && (info.fields || []).some(function (f) { return f.name === 'exercise'; })) {
          var p = await A.req(l.u + '/query', { where: "exercise='Yes'", outFields: oid + ',' + (sf[0] || oid), returnGeometry: false, resultRecordCount: 200 });
          (p.features || []).forEach(function (ft) { out.practice.push({ layer: l.n, u: l.u, oid: ft.attributes[oid], label: String(ft.attributes[sf[0]] || ('#' + ft.attributes[oid])).slice(0, 120) }); });
        }
      } catch (e) { out.skipped++; }
    }
    return out;
  };
  SX.cleanup = function () {
    var c = OPS.st.cache['sx:test'], r = c ? c.data : null;
    var btn = '<button class="btn sm" data-act="sxScan">' + I('refresh') + (r ? 'Scan again' : 'Scan') + '</button>';
    var body;
    if (c && c.loading && !r) body = wait('Looking through every BEACON layer for records named "test"…');
    else if (!r) body = '<p class="dim" style="margin:0">Finds records with "test" in a name or title across the BEACON layers, plus practice incidents, so they can be deleted before go-live. Nothing is deleted until you pick records and confirm.</p>';
    else if (r._err) body = err(r);
    else {
      var li = function (x, i, kind, on) { return '<label class="chk" style="display:flex;gap:8px;padding:4px 0"><input type="checkbox" data-sx="' + kind + ':' + i + '"' + (on ? ' checked' : '') + '><span><b>' + E(x.label || '#' + x.oid) + '</b> <span class="dim">· ' + E(x.layer) + '</span></span></label>'; };
      body = (r.test.length ? '<div class="fgrp">Test records (' + r.test.length + ')</div>' + r.test.map(function (x, i) { return li(x, i, 'test', true); }).join('') : '<p class="ok-t" style="margin:0">' + I('check') + ' No test records found.</p>') +
        (r.practice.length ? '<div class="fgrp" style="margin-top:10px">Practice incidents (' + r.practice.length + ')</div><p class="dim" style="margin:0 0 4px;font-size:12.5px">Kept out of reports and public maps already. Delete only if you no longer need them for training.</p>' + r.practice.map(function (x, i) { return li(x, i, 'practice', false); }).join('') : '') +
        (r.skipped ? '<p class="dim" style="font-size:12.5px">' + r.skipped + ' layer(s) could not be read with your account.</p>' : '') +
        (r.test.length || r.practice.length ? '<div class="row" style="margin-top:10px"><button class="btn red" data-act="sxDelete">' + I('trash') + 'Delete selected</button></div>' : '');
    }
    return card('trash', 'Clean up test data', btn, '<div id="sxClean">' + body + '</div>');
  };
  OPS.act.sxScan = function () { OPS.bust('sx:test'); OPS.load('sx:test', SX.scan); OPS.repaint(); };
  OPS.act.sxDelete = function () {
    var r = (OPS.st.cache['sx:test'] || {}).data; if (!r) return;
    var picked = Array.prototype.map.call(document.querySelectorAll('#sxClean input[data-sx]:checked'), function (el) { var p = el.dataset.sx.split(':'); return r[p[0]][+p[1]]; }).filter(Boolean);
    if (!picked.length) { U.toast('Pick at least one record'); return; }
    U.confirm('Delete ' + picked.length + ' record' + (picked.length > 1 ? 's' : ''), 'These are deleted from ArcGIS for everyone and cannot be undone:<br><br>' + picked.slice(0, 12).map(function (x) { return '• ' + E(x.label) + ' <span class="dim">(' + E(x.layer) + ')</span>'; }).join('<br>') + (picked.length > 12 ? '<br>…and ' + (picked.length - 12) + ' more' : ''), 'Delete', async function () {
      var by = {}; picked.forEach(function (x) { (by[x.u] = by[x.u] || []).push(x.oid); });
      var ok = 0, bad = 0;
      for (var u of Object.keys(by)) { try { await A.del(u, by[u]); ok += by[u].length; } catch (e) { bad += by[u].length; console.warn('cleanup', u, e); } }
      U.toast(ok + ' deleted' + (bad ? ', ' + bad + ' could not be deleted (check your edit rights)' : ''), bad ? 'err' : 'ok', 6000);
      OPS.bust(); OPS.act.sxScan();
    });
  };

  // ---------- print kit ----------
  SX.print = function () {
    var b = function (act, ic, t, d, need) { return '<div class="hcrow" style="align-items:center">' + I(ic) + '<div style="flex:1"><div><b>' + E(t) + '</b></div><div class="dim" style="font-size:12.5px">' + E(d) + '</div></div><button class="btn sm" data-act="' + act + '"' + (need ? ' disabled title="' + E(need) + '"' : '') + '>' + I('print') + 'Print</button></div>'; };
    return card('print', 'Print kit', '', '<div class="hc">' +
      b('resTags', 'qr', 'QR unit tags', 'One tag per county unit and piece of equipment, for check-in by scan.') +
      b('volTags', 'users', 'Volunteer badges', 'Badges with QR codes for every active volunteer.') +
      b('ciQR', 'qr', 'Check-in poster', 'QR poster for the ICP, staging or EOC door.', OPS.inc ? '' : 'Pick an incident at the top first') +
      '</div>');
  };

  // ---------- page ----------
  OPS.tools.setup.render = function () {
    var u = A.user || {}, canPub = u.canPublish, built = OPS.SVC_KEYS.every(function (k) { return OPS.svc[k]; });
    if (!A.user) return '<div class="phead"><div><h1 class="pg">Setup</h1></div></div>' + wait('Signing in to ArcGIS…');
    if (!OPS.st.cache['sx:test']) OPS.load('sx:test', SX.scan, 30 * 60000); // scan once per visit so the checklist can tick
    var h = '<div class="phead"><div><h1 class="pg">Setup</h1><p class="pgsub" style="margin:0">Is BEACON healthy, current and ready? Fix anything red here first.</p></div></div>';
    if (!built) h += '<div class="card" style="border-left:4px solid var(--gold)"><h3>' + I('build') + 'Build everything</h3><p class="dim" style="margin-top:0">One click, with your publisher account: creates the three services, shares them, turns on the public family check-in, builds the web map and loads the EOP starter content.</p><div id="buildLog" class="mono" style="font-size:12.5px;white-space:pre-wrap;margin-bottom:10px">' + E(OPS._buildLog || '') + '</div><button class="btn pri" data-act="buildAll"' + (canPub ? '' : ' disabled') + '>' + I('play') + 'Build everything</button></div>';
    if (OPS.harden) {
      var hp = OPS.harden.panel(), at = hp.indexOf('<div class="hc">');
      // all clear: fold the long list away so the page opens on what needs doing
      if (at > 0 && hp.indexOf('hcrow bad') < 0) hp = hp.slice(0, at) + '<details><summary class="dim" style="cursor:pointer;font-size:13px">Show all checks</summary>' + hp.slice(at, hp.length - 6) + '</details></div>';
      h += hp;
    }
    h += SX.golive();
    h += '<div class="grid g2" style="align-items:start">' + SX.feeds() + SX.groups() + '</div>';
    h += SX.services(canPub, built);
    h += '<div class="grid g2" style="align-items:start">' + SX.cleanup() + SX.print() + '</div>';
    return h;
  };
})(window.CP);
