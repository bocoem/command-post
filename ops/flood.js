/* EM OPS — Flood Watch: live gauges (USGS + NWS), NWPS forecasts, county impact thresholds, low-water crossings tied to county road blocks */
(function (CP) {
  'use strict';
  var OPS = CP.ops, A = CP.arc, U = CP.ui, E = CP.esc, I = U.icon, K = OPS.LISTS;
  var CATC = { Action: '#ffd27a', Minor: '#F28C28', Moderate: '#F0444C', Major: '#c21bd6', Custom: '#3D9BFF' };
  function gauges() { return OPS.load('flood:gauges', async function () { if (!CP.ow.county) { var c = await A.query('https://services6.arcgis.com/6h5xc2eGkGuRiFia/arcgis/rest/services/County_Boundary/FeatureServer/0', '1=1', { geom: true, n: 1, fields: 'OBJECTID' }).catch(function () { return []; }); CP.ow.county = c[0] && c[0].geometry; } CP.ow.d.gauges = await CP.ow.loadGauges(); return CP.ow.gaugeList(); }, 5 * 60000); }
  function impacts() { return OPS.load('impacts', function () { return OPS.rows('impacts', '1=1', { order: 'gauge_id,stage_ft', n: 2000 }); }); }
  function watch() { return OPS.load('watch', function () { return OPS.rows('watch', '1=1', { order: 'name', n: 2000 }); }); }
  function fc(id) { return OPS.load('flood:fc:' + id, async function () {
    var g = await fetch('https://api.water.noaa.gov/nwps/v1/gauges/' + encodeURIComponent(id)).then(function (r) { if (!r.ok) throw new Error('No NWS forecast point'); return r.json(); });
    var sf = await fetch('https://api.water.noaa.gov/nwps/v1/gauges/' + encodeURIComponent(g.lid || id) + '/stageflow').then(function (r) { return r.json(); }).catch(function () { return {}; });
    var pts = function (s) { return ((s && s.data) || []).map(function (d) { return { t: Date.parse(d.validTime), v: d.primary }; }).filter(function (d) { return d.v != null && d.v > -900; }); };
    var cats = (g.flood && g.flood.categories) || {};
    return { lid: g.lid, name: g.name, obs: pts(sf.observed), fcst: pts(sf.forecast), cats: { Action: cats.action && cats.action.stage, Minor: cats.minor && cats.minor.stage, Moderate: cats.moderate && cats.moderate.stage, Major: cats.major && cats.major.stage }, issued: sf.forecast && sf.forecast.issuedTime };
  }, 10 * 60000); }
  function impactState(g, list) { var mine = list.filter(function (x) { return x.gauge_id === g.id || x.gauge_id === (g.nwsId || ''); }); var now = mine.filter(function (x) { return g.stage != null && g.stage >= x.stage_ft; }), next = mine.filter(function (x) { return g.stage == null || g.stage < x.stage_ft; })[0]; return { all: mine, now: now, next: next }; }

  OPS.tool('flood', { eop: 'flood',
    n: 'Flood Watch', sub: 'Gauges · Forecasts · Impacts · Crossings', icon: 'lifeline', color: 'blue', live: 'flood', d: 'River and stream gauges in and around the county with NWS forecasts, county-defined impact stages, and low-water crossings that post straight to the county road blocks layer.',
    nums: async function () { var g = gauges(); var w = await OPS.count('watch', "status='Flooded / closed'"); return [[Array.isArray(g) ? g.filter(function (x) { return x.nws && /Flood|Action/.test([x.nws.status, x.nws.f24, x.nws.f48].join(' ')); }).length : '…', 'gauges at action+'], [w, 'crossings closed', w ? 'bad-t' : '']]; },
    render: function () {
      var g = gauges(), im = impacts(), w = watch(), u = OPS.st.ui, tab = u.ft || 'g';
      var h = '<div class="phead"><div><h1 class="pg">Flood Watch</h1><p class="pgsub" style="margin:0">USGS readings and NWS flood status refresh every 5 minutes. Impact stages and watch points are county data in ArcGIS (OPS_GaugeImpacts, OPS_WatchPoints).</p></div><div class="acts"><a class="btn sm ghost" href="https://www.511virginia.org/" target="_blank" rel="noopener">' + I('link') + '511 Virginia cameras</a><a class="btn sm ghost" href="https://water.noaa.gov/wfo/rnk" target="_blank" rel="noopener">' + I('link') + 'NWS Blacksburg water</a><button class="btn sm" data-act="refresh">' + I('refresh') + 'Refresh</button></div></div>';
      var iml = Array.isArray(im) ? im : [], wl = Array.isArray(w) ? w : [];
      h += OPS.tabs('ft', [['g', 'Gauges', Array.isArray(g) ? g.length : '…'], ['w', 'Watch points', wl.length], ['i', 'Impact stages', iml.length], ['m', 'Map']], tab);
      if (tab === 'g') {
        if (OPS.bad(g)) return h + OPS.wait(g, 'gauges');
        var hit = g.filter(function (x) { return impactState(x, iml).now.length; });
        if (hit.length) h += '<div class="warnbox" style="margin-bottom:10px;color:#ffb3b8;border-color:rgba(240,68,76,.6);background:rgba(208,33,41,.12)">' + I('warn') + ' <b>County impact stages reached:</b> ' + hit.map(function (x) { var s = impactState(x, iml); return E(x.name) + ' (' + s.now.map(function (i) { return E(i.impact); }).join('; ') + ')'; }).join(' · ') + '</div>';
        h += '<div class="tbl-wrap"><table class="t ot"><thead><tr><th>Gauge</th><th>Stage</th><th>3 h trend</th><th>NWS now / 24 h / 48 h</th><th>County impacts</th><th>Updated</th></tr></thead><tbody>' + g.map(function (x) {
          var s = impactState(x, iml), n = x.nws || {};
          return '<tr data-act="gauge" data-a="' + E(x.id) + '"><td><b>' + E(x.name) + '</b><div class="dim mono" style="font-size:11.5px">' + E(x.id) + (x.dc ? ' · ' + x.dc.toFixed(0) + ' mi out' : '') + '</div></td><td class="mono"><b>' + (x.stage != null ? x.stage.toFixed(2) + ' ft' : '—') + '</b>' + (x.flow != null ? '<div class="dim">' + Math.round(x.flow).toLocaleString() + ' cfs</div>' : '') + '</td><td class="mono ' + (x.trend > 0.25 ? 'warn-t' : '') + '">' + (x.trend != null ? (x.trend > 0 ? '+' : '') + x.trend.toFixed(2) : '') + '</td><td>' + [n.status, n.f24, n.f48].map(function (v) { return v ? '<span class="chip ' + (/Major|Moderate/.test(v) ? 'red' : /Minor|Action|Near/.test(v) ? 'gold' : '') + '" style="margin:1px">' + E(v) + '</span>' : ''; }).join('') + '</td><td>' + (s.now.length ? '<span class="bad-t">' + s.now.length + ' reached</span>' : '') + (s.next ? '<div class="dim" style="font-size:12px">next at ' + s.next.stage_ft + ' ft' + (x.stage != null ? ' (' + (s.next.stage_ft - x.stage).toFixed(1) + ' ft to go)' : '') + ': ' + E(s.next.impact).slice(0, 70) + '</div>' : (s.all.length ? '' : '<span class="dim">none set</span>')) + '</td><td class="mono dim">' + E(OPS.ago(x.t)) + '</td></tr>';
        }).join('') + '</tbody></table></div><p class="dim" style="font-size:12.5px">Open a gauge for its forecast hydrograph and to add what happens in the county at each stage.</p>';
      } else if (tab === 'w') {
        h += '<div class="toolbar">' + OPS.searchBox('wp', 'Search crossings, roads') + OPS.seg('wf', ['All', 'Flooded / closed', 'Watch', 'Open'], u.wf || 'All') + '<span class="sp"></span><button class="btn sm pri" data-act="wpNew">' + I('plus') + 'Watch point</button></div>';
        h += OPS.bad(w) ? OPS.wait(w) : OPS.table({ k: 'watch', rows: wl.filter(function (x) { return (u.wf || 'All') === 'All' || x.status === u.wf; }), q: u.q_wp, cols: ['name', 'wp_type', 'road', 'gauge_id', 'flood_stage_ft', 'status', { f: 'status_time', l: 'Updated', fmt: function (x) { return E(OPS.ago(x.status_time)); } }, { f: 'block_oid', l: 'Road block', fmt: function (x) { return x.block_oid ? '<span class="chip red">posted</span>' : ''; } }], actions: function (x) { return x.status === 'Flooded / closed' ? '<button class="btn xs" data-act="wpOpen" data-a="' + x.OBJECTID + '">Reopen</button>' : '<button class="btn xs red" data-act="wpClose" data-a="' + x.OBJECTID + '">Flooded</button>'; }, empty: 'Add low-water crossings and flood-prone roads.' });
      } else if (tab === 'i') {
        h += '<div class="toolbar"><span class="muted">What happens in Botetourt County at each gauge stage (roads over, homes cut off, actions to take).</span><span class="sp"></span><button class="btn sm pri" data-act="impNew">' + I('plus') + 'Impact stage</button></div>';
        h += OPS.bad(im) ? OPS.wait(im) : OPS.table({ k: 'impacts', rows: iml, cols: ['gauge_name', 'gauge_id', 'stage_ft', 'category', 'impact', 'actions'], empty: 'No impact stages yet.' });
      } else h += OPS.mapPage('floodMap', 580);
      return h;
    },
    after: function () {
      if ((OPS.st.ui.ft || 'g') !== 'm') return;
      var g = gauges(), w = watch(), pts = [];
      (Array.isArray(g) ? g : []).forEach(function (x) { var n = x.nws || {}, s = [n.status, n.f24, n.f48].join(' '); pts.push({ ll: [x.lat, x.lng], dot: true, s: 14, c: /Major/.test(s) ? '#c21bd6' : /Moderate/.test(s) ? '#F0444C' : /Minor/.test(s) ? '#F28C28' : /Action|Near/.test(s) ? '#ffd27a' : '#3D9BFF', pop: '<b>' + E(x.name) + '</b><br>' + (x.stage != null ? x.stage.toFixed(2) + ' ft' : '') + ' ' + E(n.status || ''), act: ['gauge', x.id] }); });
      (Array.isArray(w) ? w : []).forEach(function (x) { pts.push({ ll: x._ll, c: x.status === 'Flooded / closed' ? '#F0444C' : x.status === 'Watch' ? '#FDB833' : '#2FBF71', t: 'LW', pop: '<b>' + E(x.name) + '</b><br>' + E(x.road || '') + '<br>' + E(x.status || ''), act: ['edit', 'watch|' + x.OBJECTID] }); });
      OPS.drawMap('floodMap', pts);
    },
    edit: { watch: function (x) { OPS.edit('watch', x, { before: function (at, old) { if (at.status !== old.status) at.status_time = Date.now(); return at; } }); } }
  });

  OPS.act.gauge = function (id) {
    var g = OPS.arr(gauges()).find(function (x) { return x.id === id; }); if (!g) return;
    var im = OPS.arr(impacts()).filter(function (x) { return x.gauge_id === id; });
    var bg = U.modal(g.name, '<div class="grid g4" style="margin-bottom:10px">' + OPS.stat(g.stage != null ? g.stage.toFixed(2) + ' ft' : '—', 'Stage', 'blue') + OPS.stat(g.flow != null ? Math.round(g.flow).toLocaleString() : '—', 'Flow (cfs)') + OPS.stat(g.trend != null ? (g.trend > 0 ? '+' : '') + g.trend.toFixed(2) : '—', '3 h trend') + OPS.stat(g.max24 != null ? g.max24.toFixed(2) : '—', '24 h max') + '</div><div id="fcBox"><div class="empty">Loading NWS forecast…</div></div>' +
      '<div class="fgrp">County impact stages</div>' + (im.length ? im.map(function (x) { return '<div style="margin-bottom:6px"><span class="chip" style="border-color:' + (CATC[x.category] || '#3D9BFF') + '">' + x.stage_ft + ' ft ' + E(x.category || '') + '</span> ' + E(x.impact) + (x.actions ? '<div class="dim" style="font-size:12.5px;margin-left:6px">→ ' + E(x.actions) + '</div>' : '') + '</div>'; }).join('') : '<span class="dim">None yet.</span>') +
      '<div style="margin-top:8px" class="row"><a class="btn sm ghost" target="_blank" href="https://waterdata.usgs.gov/monitoring-location/' + encodeURIComponent(id) + '/">' + I('link') + 'USGS page</a>' + (g.nws && g.nws.url ? '<a class="btn sm ghost" target="_blank" href="' + E(g.nws.url) + '">' + I('link') + 'NWS page</a>' : '') + '</div>',
      [{ label: I('plus') + 'Impact stage', fn: function () { setTimeout(function () { OPS.act.impNew(id + '|' + g.name); }, 30); } }, { label: 'Close', cls: 'pri' }], { wide: true });
    var tick = setInterval(function () { var f = fc(id); if (f === undefined || !document.body.contains(bg)) { if (!document.body.contains(bg)) clearInterval(tick); return; } clearInterval(tick); bg.querySelector('#fcBox').innerHTML = f && f._err ? '<div class="dim">No NWS forecast for this gauge (' + E(f._err) + '). Observed readings only.</div>' : chart(f, im); }, 300);
  };
  function chart(f, im) {
    var all = f.obs.concat(f.fcst); if (!all.length) return '<div class="dim">No recent data from NWS.</div>';
    var lines = Object.keys(f.cats).filter(function (k) { return f.cats[k] != null; }).map(function (k) { return { v: f.cats[k], c: CATC[k], l: k }; }).concat(im.map(function (x) { return { v: x.stage_ft, c: '#3D9BFF', l: 'County: ' + x.impact.slice(0, 30), dash: 1 }; }));
    var t0 = all[0].t, t1 = all[all.length - 1].t, vs = all.map(function (d) { return d.v; }).concat(lines.map(function (l) { return l.v; }).filter(function (v) { return v < Math.max.apply(null, all.map(function (d) { return d.v; })) * 1.6; }));
    var lo = Math.min.apply(null, vs), hi = Math.max.apply(null, vs); var pad = (hi - lo) * 0.1 || 1; lo -= pad; hi += pad;
    var W = 760, H = 220, x = function (t) { return 40 + (t - t0) / (t1 - t0 || 1) * (W - 50); }, y = function (v) { return H - 24 - (v - lo) / (hi - lo) * (H - 40); };
    var path = function (p) { return p.map(function (d, i) { return (i ? 'L' : 'M') + x(d.t).toFixed(1) + ' ' + y(d.v).toFixed(1); }).join(' '); };
    var crest = f.fcst.reduce(function (m, d) { return !m || d.v > m.v ? d : m; }, null), nowX = x(Date.now());
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="chart" preserveAspectRatio="none">' + lines.filter(function (l) { return l.v >= lo && l.v <= hi; }).map(function (l) { return '<line x1="40" x2="' + (W - 10) + '" y1="' + y(l.v) + '" y2="' + y(l.v) + '" stroke="' + l.c + '" stroke-width="1.2"' + (l.dash ? ' stroke-dasharray="5 4"' : '') + '/><text x="' + (W - 12) + '" y="' + (y(l.v) - 3) + '" fill="' + l.c + '" font-size="10" text-anchor="end">' + E(l.l) + ' ' + l.v + '</text>'; }).join('') +
      [lo, (lo + hi) / 2, hi].map(function (v) { return '<text x="4" y="' + (y(v) + 3) + '" fill="#93A9C3" font-size="10">' + v.toFixed(1) + '</text>'; }).join('') +
      '<line x1="' + nowX + '" x2="' + nowX + '" y1="8" y2="' + (H - 20) + '" stroke="#ffffff" stroke-opacity=".3"/><text x="' + (nowX + 3) + '" y="16" fill="#93A9C3" font-size="10">now</text>' +
      '<path d="' + path(f.obs) + '" fill="none" stroke="#8fb2ff" stroke-width="2.2"/>' + (f.fcst.length ? '<path d="' + path(f.fcst) + '" fill="none" stroke="#FDB833" stroke-width="2.2" stroke-dasharray="6 4"/>' : '') + '</svg>';
    return svg + '<div class="dim" style="font-size:12.5px;margin-top:4px">Blue: observed. Gold dashed: NWS forecast' + (f.issued ? ' issued ' + E(CP.fmtDT(f.issued)) : '') + '. ' + (crest ? 'Forecast crest <b>' + crest.v.toFixed(1) + ' ft</b> at ' + E(CP.fmtDT(new Date(crest.t).toISOString())) + '.' : 'No forecast issued for this point.') + ' Dashed blue lines are county impact stages.</div>';
  }
  OPS.act.impNew = function (a) { var p = (a || '').split('|'); OPS.edit('impacts', null, { defaults: { gauge_id: p[0] || '', gauge_name: p[1] || '', category: 'Custom' }, after: function () { OPS.bust('impacts'); } }); };
  OPS.act.wpNew = function () { OPS.edit('watch', null, { defaults: { status: 'Open', wp_type: 'Low-water crossing' }, before: function (at) { at.status_time = Date.now(); return at; }, after: function () { OPS.bust('watch'); } }); };
  // flooded: mark it, post a county road block (public closures map), log to Command Post
  OPS.act.wpClose = async function (oid) {
    var x = OPS.findRow('watch', oid); if (!x) return;
    U.confirm('Mark ' + E(x.name) + ' flooded?', 'Posts a road block on the county Road Closures layer (public map)' + (OPS.inc ? ' and logs it to ' + E(OPS.inc.name) : '') + '.', 'Flooded / closed', async function () {
      try {
        var b = x._ll ? await A.roads.block({ street: x.road || x.name, reason: 'Hazard', desc: 'Flooding: ' + x.name + (x.detour ? '. Detour: ' + x.detour : '') }, x._ll).catch(function (e) { U.toast('Road block not posted: ' + E(e.message), 'err', 7000); return null; }) : null;
        await OPS.upd('watch', x.OBJECTID, { status: 'Flooded / closed', status_time: Date.now(), block_oid: b || null });
        if (OPS.inc) await OPS.cpEdit(OPS.inc.key, function () {}, 'Flooded: ' + x.name + (x.road ? ' (' + x.road + ')' : '') + (x.homes_cut_off ? ', about ' + x.homes_cut_off + ' homes cut off' : '') + (b ? '. Road block posted.' : ''), 'Event').catch(function () {});
        U.toast('Marked flooded' + (b ? ' · road block posted' : ''), 'ok'); OPS.repaint();
      } catch (e) { U.toast(E(e.message), 'err'); }
    }, true);
  };
  OPS.act.wpOpen = async function (oid) {
    var x = OPS.findRow('watch', oid); if (!x) return;
    if (x.block_oid) await A.roads.reopen('block', x.block_oid).catch(function () {});
    await OPS.upd('watch', x.OBJECTID, { status: 'Open', status_time: Date.now(), block_oid: null });
    if (OPS.inc) OPS.cpEdit(OPS.inc.key, function () {}, 'Reopened: ' + x.name, 'Event').catch(function () {});
    U.toast('Reopened · road block ended', 'ok'); OPS.repaint();
  };
})(window.CP);
