/* COMMAND POST — Affected Area: pick or draw an area, see what's inside it (homes, buildings, shelters,
   critical facilities, closures, CAD calls), estimate who lives there, run Business Analyst infographics,
   and feed the numbers into the status report and the county Impacted Area layer. */
(function (CP) {
  'use strict';
  var U = CP.ui, E = CP.esc, A = CP.alive, I = U.icon, V = CP.views, AFTER = CP.after;
  var H = CP.quick._h;
  function app() { return CP.app; }
  function inc() { return app().inc; }
  function fmt(n) { return n == null ? '—' : Number(n).toLocaleString('en-US'); }
  function pct(a, b) { return a != null && b ? ' <span class="dim">(' + Math.round(a / b * 100) + '%)</span>' : ''; }
  function cur() { var l = A(inc().impacts); return l.find(function (x) { return x.id === app().ui.impSel; }) || l[l.length - 1] || null; }
  // keep stored shapes small: at most ~200 vertices, 5 decimals
  function slim(pts) { var step = Math.max(1, Math.ceil(pts.length / 200)); return pts.filter(function (p, i) { return i % step === 0; }).map(function (p) { return [+(+p[0]).toFixed(5), +(+p[1]).toFixed(5)]; }); }
  function ringsToLatLng(g) { var r = g && g.rings && g.rings[0]; if (!r) return null; var best = g.rings.reduce(function (a, b) { return b.length > a.length ? b : a; }, r); return best.map(function (q) { return [q[1], q[0]]; }); }

  // ---------- create an area ----------
  function addArea(name, src, pts) {
    var it = CP.addItem(inc(), 'impacts', { name: name, src: src, pts: slim(pts), created: CP.now(), by: CP.me.name || '', inside: null, pop: null, reports: [], arcOid: null });
    app().ui.impSel = it.id; app().log('Affected area added: ' + name + ' (' + src + ')', 'Event'); app().commit(true);
    analyze(it.id);
  }
  CP.quick.newArea = function () {
    if (!H.guard()) return;
    var i = inc(), hasLoc = i.location && i.location.lat != null, hasPer = i.perimeter && i.perimeter.length > 2;
    var body = '<div class="grid" style="gap:10px">' +
      '<button class="qab" data-pick="draw" style="justify-content:flex-start">' + I('map') + '<span><b>Draw the area on a map</b></span></button>' +
      (hasPer ? '<button class="qab" data-pick="perimeter" style="justify-content:flex-start">' + I('target') + '<span><b>Use the incident area</b></span></button>' : '') +
      (hasLoc ? '<div class="row" style="gap:8px"><button class="qab" data-pick="ring" style="flex:1;justify-content:flex-start">' + I('target') + '<span><b>Circle around the incident location</b></span></button><select class="in" name="miles" style="max-width:110px">' + [0.25, 0.5, 1, 2, 3, 5].map(function (m) { return '<option value="' + m + '"' + (m === 1 ? ' selected' : '') + '>' + m + ' mi</option>'; }).join('') + '</select></div>' : '') +
      '<div class="flab" style="margin-top:6px">From the county layers</div><div id="np_county" class="muted">Loading evacuation zones and impacted areas…</div></div>';
    var bg = U.modal('Choose the affected area', body, [{ label: 'Cancel', cls: 'ghost' }], { nofocus: true });
    var zones = [];
    Promise.all([CP.arc.evac.list().catch(function () { return []; }), CP.arc.impact.areas().catch(function () { return []; })]).then(function (r) {
      r[0].forEach(function (f) { zones.push({ name: (f.attributes.zonename || 'Evacuation zone') + ' (' + (f.attributes.evactype || '') + ')', src: 'Evacuation zone', g: f.geometry }); });
      r[1].forEach(function (f) { zones.push({ name: (f.attributes.description || f.attributes.incidentnm || 'Impacted area').slice(0, 80), src: 'County impacted area', g: f.geometry }); });
      var el = bg.querySelector('#np_county'); if (!el) return;
      el.className = ''; el.innerHTML = zones.length ? zones.map(function (z, k) { return '<button class="btn sm" data-zone="' + k + '" style="margin:0 6px 6px 0">' + E(z.name) + '</button>'; }).join('') : '<span class="dim">No active evacuation zones or impacted areas.</span>';
    });
    bg.addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-pick],[data-zone]'); if (!b) return;
      if (b.dataset.zone != null) { var z = zones[+b.dataset.zone], pts = ringsToLatLng(z.g); U.closeModal(); if (pts) addArea(z.name, z.src, pts); return; }
      var k = b.dataset.pick; U.closeModal();
      if (k === 'perimeter') addArea('Incident area', 'Incident area', i.perimeter);
      else if (k === 'ring') { var mi = +bg.querySelector('[name="miles"]').value; addArea(mi + ' mi around incident', 'Circle', CP.arc.impact.circle(+i.location.lat, +i.location.lng, mi)); }
      else if (k === 'draw') H.mapDialog('Draw the affected area', H.f('Name *', H.inp('name', 'e.g. Glen Wilton flood area')), 'poly', I('check') + 'Use this area', function (bb, pts) { var n = U.val(bb, 'name'); if (!n) { U.toast('Name the area.', 'err'); return false; } addArea(n, 'Drawn', pts); });
    });
  };

  // ---------- analysis ----------
  var busy = {};
  function analyze(id) {
    var it = CP.byId(inc().impacts, id); if (!it || busy[id]) return;
    busy[id] = 'inside'; app().rerender();
    CP.arc.impact.inside(it.pts).then(function (d) { CP.setPath(inc(), 'impacts@' + id + '.inside', d); delete busy[id]; app().commit(true); })
      .catch(function (e) { delete busy[id]; H.fail(e); app().rerender(); });
  }
  function popNumbers(id) {
    var it = CP.byId(inc().impacts, id); if (!it || busy[id + 'p']) return;
    busy[id + 'p'] = 1; app().rerender();
    CP.arc.impact.enrich(it.pts).then(function (d) {
      CP.setPath(inc(), 'impacts@' + id + '.pop', d); delete busy[id + 'p'];
      app().log('Population estimate for ' + it.name + ': ' + fmt(d.pop) + ' people, ' + fmt(d.hh) + ' households (' + fmt(d.age65) + ' age 65+, ' + fmt(d.hhDis) + ' households with a disability, ' + fmt(d.hhNoVeh) + ' without a vehicle).', 'Event');
      app().commit(true);
    }).catch(function (e) { delete busy[id + 'p']; H.fail(e); app().rerender(); });
  }
  var tpl = null;
  function templates() { if (!tpl) { tpl = { loading: true }; CP.arc.impact.templates().then(function (l) { tpl = { list: l }; if (app().view === 'impact') app().rerender(); }).catch(function () { tpl = { list: CP.arc.impact.SUGGESTED.map(function (x) { return { id: x[0], title: x[1], group: 'Suggested for emergencies' }; }) }; }); } return tpl.list; }
  function fileName(s) { return String(s).replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_').slice(0, 80); }
  function runReport(id, rep, fmtv) {
    var it = CP.byId(inc().impacts, id); if (!it) return;
    var list = templates() || [], t = list.find(function (x) { return x.id === rep; }) || { id: rep, title: rep };
    busy[id + 'r'] = t.title; app().rerender();
    var sub = it.name + ' — ' + inc().name;
    CP.arc.impact.report(it.pts, rep, fmtv, t.title, sub).then(function (blob) {
      delete busy[id + 'r'];
      var ext = { pdf: 'pdf', xlsx: 'xlsx', html: 'html' }[fmtv] || 'pdf';
      var url = URL.createObjectURL(blob), name = fileName(t.title + ' ' + it.name) + '.' + ext;
      CP.addItem(inc(), 'impacts@' + id + '.reports', { ts: CP.now(), rep: rep, title: t.title, format: ext, by: CP.me.name || '' });
      app().log('Business Analyst report run: ' + t.title + ' for ' + it.name, 'Event'); app().commit(true);
      U.modal('Report ready', '<p style="margin:0 0 12px">' + E(t.title) + ' for <b>' + E(it.name) + '</b>.</p><div class="row"><a class="btn pri" href="' + url + '" target="_blank" rel="noopener">' + I('eye') + 'Open</a><a class="btn" href="' + url + '" download="' + E(name) + '">' + I('down') + 'Download</a></div><div class="dim" style="font-size:12px;margin-top:10px">Download it to keep it. Command Post records that it was run but does not store the file.</div>', [{ label: 'Close', cls: 'ghost' }]);
    }).catch(function (e) { delete busy[id + 'r']; H.fail(e); app().rerender(); });
  }

  // ---------- page ----------
  V.impact = function (i) {
    var acts = '<button class="btn pri sm" data-act="q" data-a="newArea">' + I('plus') + 'Add affected area</button><button class="btn sm" data-act="q" data-a="critFacility">' + I('plus') + 'Critical facility</button><button class="btn sm" data-act="q" data-a="incLine">' + I('plus') + 'Incident line</button>';
    var intro = 'Pick or draw the area that is affected. Command Post counts the homes and buildings in it, lists the shelters, critical facilities, closures and calls inside it, estimates who lives there, and runs Business Analyst reports for it.';
    if (!H.signedIn()) return '<div class="wrap">' + V.phead('Affected Area', intro, '') + H.needSignIn('Affected area analysis and Business Analyst reports') + '</div>';
    var list = A(i.impacts), it = cur();
    if (!it) return '<div class="wrap">' + V.phead('Affected Area', intro, acts) + '<div class="empty">No affected area yet. <button class="btn pri sm" data-act="q" data-a="newArea" style="margin-left:8px">' + I('plus') + 'Add affected area</button></div></div>';
    var tabs = '<div class="seg" style="margin-bottom:12px;flex-wrap:wrap">' + list.map(function (x) { return '<button class="' + (x.id === it.id ? 'on' : '') + '" data-act="impSel" data-a="' + x.id + '">' + E(x.name) + '</button>'; }).join('') + '</div>';
    var d = it.inside, p = it.pop, b = busy[it.id];
    // homes & buildings
    var homes = b === 'inside' ? '<div class="muted">Counting…</div>' : !d ? '<div class="muted">Not counted yet.</div>' :
      '<div class="grid g4" style="margin-bottom:10px"><div class="stat red"><div class="v">' + fmt(d.addr.residences + d.addr.mobileHomes) + '</div><div class="l">Homes</div><div class="s">county 911 addresses</div></div><div class="stat gold"><div class="v">' + fmt(d.addr.mobileHomes) + '</div><div class="l">Mobile homes</div></div><div class="stat"><div class="v">' + fmt(d.addr.businesses) + '</div><div class="l">Businesses</div></div><div class="stat blue"><div class="v">' + fmt(d.structures.popEst) + '</div><div class="l">People (est.)</div><div class="s">from FEMA structures</div></div></div>' +
      '<div class="dim" style="font-size:12px">' + fmt(d.addr.total) + ' addresses: ' + Object.keys(d.addr.byType).sort(function (a, c) { return d.addr.byType[c] - d.addr.byType[a]; }).map(function (k) { return E(k.toLowerCase()) + ' ' + d.addr.byType[k]; }).join(', ') + '.<br>' + fmt(d.structures.total) + ' buildings: ' + Object.keys(d.structures.byClass).map(function (k) { return E(k.toLowerCase()) + ' ' + d.structures.byClass[k]; }).join(', ') + '.</div>';
    // population
    var pop = busy[it.id + 'p'] ? '<div class="muted">Getting population numbers…</div>' : !p ? '<div class="row"><button class="btn sm pri" data-act="impPop" data-a="' + it.id + '">' + I('users') + 'Get population numbers</button><span class="dim" style="font-size:12px">Esri demographics. Uses a small number of ArcGIS credits.</span></div>' :
      '<div class="tbl-wrap"><table class="t ro"><tbody>' +
      [['Population', fmt(p.pop)], ['Daytime population', fmt(p.daypop)], ['Households', fmt(p.hh)], ['Housing units', fmt(p.hu)], ['Age 65+', fmt(p.age65) + pct(p.age65, p.pop)], ['Age 0–4', fmt(p.age0_4) + pct(p.age0_4, p.pop)], ['Households with a person with a disability', fmt(p.hhDis) + pct(p.hhDis, p.hh)], ['Households with no vehicle', fmt(p.hhNoVeh) + pct(p.hhNoVeh, p.hh)], ['Households below poverty', fmt(p.hhPov) + pct(p.hhPov, p.hh)]]
        .map(function (r) { return '<tr><td>' + r[0] + '</td><td style="text-align:right"><b>' + r[1] + '</b></td></tr>'; }).join('') + '</tbody></table></div><div class="row" style="margin-top:6px"><span class="dim" style="font-size:12px">Esri ' + new Date(p.asof).getFullYear() + ' estimates and ACS 5-year data, as of ' + H.when(p.asof) + '.</span><button class="btn xs ghost" data-act="impPop" data-a="' + it.id + '" style="margin-left:auto">Update</button></div>';
    // inside
    function li(arr, fn) { return arr && arr.length ? '<ul style="margin:4px 0 0 18px;padding:0">' + arr.map(function (x) { return '<li>' + fn(x) + '</li>'; }).join('') + '</ul>' : '<span class="dim">None</span>'; }
    var inside = !d ? '' : '<div class="grid g2" style="gap:10px 18px">' +
      '<div><div class="flab">Shelters</div>' + li(d.shelters, function (x) { return '<b>' + E(x.name) + '</b> · ' + E(x.status || '') + (x.cap ? ' · ' + (x.occ || 0) + '/' + x.cap : ''); }) + '</div>' +
      '<div><div class="flab">Distribution sites</div>' + li(d.pods, function (x) { return '<b>' + E(x.name) + '</b> · ' + E(x.status || ''); }) + '</div>' +
      '<div><div class="flab">Critical facilities</div>' + li(d.critical, function (x) { return '<b>' + E(x.name) + '</b>' + (x.sector ? ' · ' + E(x.sector) : '') + (x.poc ? ' · ' + E(x.poc) : ''); }) + '</div>' +
      '<div><div class="flab">Incident facilities</div>' + li(d.facilities, function (x) { return '<b>' + E(x.name) + '</b>' + (x.type ? ' · ' + E(x.type) : ''); }) + '</div>' +
      '<div><div class="flab">Road closures</div>' + li(d.closures, function (x) { return E(x); }) + '</div>' +
      '<div><div class="flab">Active CAD calls</div>' + (d.cad ? '<b>' + d.cad + '</b>' : '<span class="dim">None</span>') + '</div></div>' +
      '<div class="row" style="margin-top:8px"><span class="dim" style="font-size:12px">Counted ' + H.when(d.asof) + '.</span><button class="btn xs ghost" data-act="impRecount" data-a="' + it.id + '" style="margin-left:auto">' + I('refresh') + 'Recount</button></div>';
    // BA reports
    var tl = templates(), groups = {};
    (tl || []).forEach(function (t) { (groups[t.group] = groups[t.group] || []).push(t); });
    var selR = app().ui.impRep || 'at-risk-population';
    var rep = busy[it.id + 'r'] ? '<div class="muted">Running ' + E(busy[it.id + 'r']) + '… this takes 5–30 seconds.</div>' :
      '<div class="grid g2" style="align-items:end"><label class="f"><span>Report</span><select class="in" id="imp_rep">' + (!tl ? '<option>Loading…</option>' : Object.keys(groups).map(function (g) { return '<optgroup label="' + E(g) + '">' + groups[g].map(function (t) { return '<option value="' + E(t.id) + '"' + (t.id === selR ? ' selected' : '') + '>' + E(t.title) + '</option>'; }).join('') + '</optgroup>'; }).join('')) + '</select></label>' +
      '<div class="row"><select class="in" id="imp_fmt" style="max-width:150px"><option value="pdf">PDF</option><option value="xlsx">Excel</option><option value="html">Interactive (HTML)</option></select><button class="btn pri sm" data-act="impReport" data-a="' + it.id + '">' + I('report') + 'Run report</button></div></div>' +
      '<div class="dim" style="font-size:12px;margin-top:6px">Esri Business Analyst infographics for this area, plus any report templates the county has made. Each run uses ArcGIS credits.</div>' +
      (A(it.reports).length ? '<div class="flab" style="margin-top:10px">Run for this area</div><ul style="margin:4px 0 0 18px;padding:0">' + A(it.reports).slice().reverse().map(function (r) { return '<li>' + E(r.title) + ' (' + E(r.format) + ') · ' + CP.fmtDT(r.ts) + (r.by ? ' · ' + E(r.by) : '') + ' <button class="btn xs ghost" data-act="impRerun" data-a="' + it.id + '|' + E(r.rep) + '|' + E(r.format) + '">Run again</button></li>'; }).join('') + '</ul>' : '');
    // use it
    var use = '<div class="row" style="flex-wrap:wrap;gap:8px">' + (d ? '<button class="btn sm" data-act="impTo209" data-a="' + it.id + '">' + I('report') + 'Put counts in the status report</button><button class="btn sm" data-act="impLog" data-a="' + it.id + '">' + I('log') + 'Log a summary</button>' : '') +
      (it.arcOid ? '<span class="chip ok">On the county Impacted Area layer</span><button class="btn sm ghost" data-act="impUnpub" data-a="' + it.id + '">Remove from county map</button>' : '<button class="btn sm" data-act="impPub" data-a="' + it.id + '">' + I('cloud') + 'Show on county Impacted Area layer</button>') +
      '<button class="btn sm ghost" data-act="impRename" data-a="' + it.id + '">Rename</button><button class="btn sm ghost" data-act="impDel" data-a="' + it.id + '">' + I('trash') + 'Remove</button></div>';
    return '<div class="wrap">' + V.phead('Affected Area', intro, acts) + tabs +
      '<div class="dim" style="margin:-4px 0 12px;font-size:13px">' + E(it.src) + ' · added ' + CP.fmtDT(it.created) + (it.by ? ' by ' + E(it.by) : '') + '</div>' +
      '<div class="grid g2"><div class="grid" style="align-content:start">' + H.card('Homes &amp; buildings', homes) + H.card('Who lives here', pop) + H.card('Inside the area', inside || '<div class="muted">' + (b ? 'Checking…' : 'Not checked yet.') + '</div>') + H.card('Business Analyst reports', rep) + H.card('Use it', use) + '</div>' +
      '<div class="card" style="padding:8px;align-self:start;position:sticky;top:0"><div class="map" id="impmap" style="height:560px"></div></div></div></div>';
  };
  AFTER.impact = function (i) {
    var it = cur(); if (it && !it.inside && !busy[it.id]) analyze(it.id);
    var el = document.getElementById('impmap'); if (!el || !window.L || !it) return;
    var m = CP.map.create(el, {}); var g = L.layerGroup().addTo(m); CP.map.drawIncident(m, i, g);
    var poly = L.polygon(it.pts, { color: '#FDB833', weight: 3, fillColor: '#FDB833', fillOpacity: .12 }).addTo(m).bindPopup('<b>' + E(it.name) + '</b>');
    m.fitBounds(poly.getBounds().pad(0.15));
    // county context: shelters, closures and critical facilities nearby
    var lv = CP.arc.live || {};
    (lv.shelters || []).forEach(function (s) { if (s.lat) L.marker([s.lat, s.lng], { icon: CP.map.pinIcon('#F0444C', 'SH', 22) }).addTo(m).bindPopup('<b>' + E(s.name) + '</b><br>' + E(s.status)); });
    (lv.closures || []).forEach(function (c) { (c.paths || []).forEach(function (p) { L.polyline(p.map(function (q) { return [q[1], q[0]]; }), { color: '#ff4d58', weight: 4 }).addTo(m).bindPopup('<b>' + E(c.street) + '</b>'); }); });
    var sel = document.getElementById('imp_rep'); if (sel) sel.onchange = function () { app().ui.impRep = sel.value; };
  };

  // ---------- actions ----------
  var prevExt = CP.extendActs;
  CP.extendActs = function (act) {
    if (prevExt) prevExt(act);
    act.impSel = function (id) { app().ui.impSel = id; app().rerender(); };
    act.impRecount = function (id) { analyze(id); };
    act.impPop = function (id) { popNumbers(id); };
    act.impReport = function (id) { var r = document.getElementById('imp_rep'), f = document.getElementById('imp_fmt'); if (!r || !r.value || r.value === 'Loading…') return; app().ui.impRep = r.value; runReport(id, r.value, f ? f.value : 'pdf'); };
    act.impRerun = function (a) { var p = a.split('|'); runReport(p[0], p[1], p[2]); };
    act.impTo209 = function (id) {
      var i = inc(), it = CP.byId(i.impacts, id), d = it && it.inside; if (!d) return;
      var homes = d.addr.residences + d.addr.mobileHomes, com = d.addr.businesses;
      U.confirm('Put counts in the status report?', 'Sets <b>threatened</b> on the status report (209) to ' + fmt(homes) + ' single residences and ' + fmt(com) + ' commercial properties from <b>' + E(it.name) + '</b>. You can change them on the Status Reports page.', 'Use counts', function () {
        CP.setPath(i, 's209.dmg.res.thr', String(homes)); CP.setPath(i, 's209.dmg.com.thr', String(com));
        app().log('Status report threatened counts set from ' + it.name + ': ' + homes + ' residences, ' + com + ' commercial.', 'Event'); app().commit(true); U.toast('Status report updated.', 'ok');
      });
    };
    act.impLog = function (id) {
      var it = CP.byId(inc().impacts, id), d = it && it.inside; if (!d) return; var p = it.pop;
      var t = 'Affected area ' + it.name + ': ' + fmt(d.addr.residences + d.addr.mobileHomes) + ' homes (' + fmt(d.addr.mobileHomes) + ' mobile homes), ' + fmt(d.addr.businesses) + ' businesses' + (p ? ', about ' + fmt(p.pop) + ' people in ' + fmt(p.hh) + ' households (' + fmt(p.age65) + ' age 65+, ' + fmt(p.hhDis) + ' households with a disability, ' + fmt(p.hhNoVeh) + ' with no vehicle)' : ', about ' + fmt(d.structures.popEst) + ' people') + '. ' +
        (d.shelters.length ? 'Shelters inside: ' + d.shelters.map(function (x) { return x.name; }).join(', ') + '. ' : '') + (d.critical.length ? 'Critical facilities inside: ' + d.critical.map(function (x) { return x.name; }).join(', ') + '. ' : '') + (d.closures.length ? 'Closures: ' + d.closures.join(', ') + '.' : '');
      app().log(t.trim(), 'Event'); app().commit(true); U.toast('Logged.', 'ok');
    };
    act.impPub = function (id) {
      var it = CP.byId(inc().impacts, id); if (!it) return;
      CP.arc.impact.publish(inc(), it.pts, it.name).then(function (oid) { CP.setPath(inc(), 'impacts@' + id + '.arcOid', oid); H.done('Affected area ' + it.name + ' posted to the county Impacted Area layer.'); }).catch(H.fail);
    };
    act.impUnpub = function (id) {
      var it = CP.byId(inc().impacts, id); if (!it || !it.arcOid) return;
      CP.arc.impact.unpublish(it.arcOid).then(function () { CP.setPath(inc(), 'impacts@' + id + '.arcOid', null); H.done('Affected area ' + it.name + ' removed from the county Impacted Area layer.'); }).catch(H.fail);
    };
    act.impRename = function (id) {
      var it = CP.byId(inc().impacts, id); if (!it) return;
      U.modal('Rename area', H.f('Name', H.inp('name', '', it.name)), [{ label: 'Cancel', cls: 'ghost' }, { label: 'Save', cls: 'pri', fn: function (b) { var n = U.val(b, 'name'); if (!n) return false; CP.setPath(inc(), 'impacts@' + id + '.name', n); app().commit(true); } }]);
    };
    act.impDel = function (id) {
      var it = CP.byId(inc().impacts, id); if (!it) return;
      U.confirm('Remove ' + E(it.name) + '?', 'Removes it from this incident' + (it.arcOid ? ' and from the county Impacted Area layer' : '') + '. Reports you downloaded are not affected.', 'Remove', function () {
        if (it.arcOid) CP.arc.impact.unpublish(it.arcOid).catch(function () {});
        CP.delItem(inc(), 'impacts', id); if (app().ui.impSel === id) app().ui.impSel = null; app().commit(true);
      }, true);
    };
  };
})(window.CP);
