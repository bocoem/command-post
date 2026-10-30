/* EM OPS — Commodity distribution (PODs): county POD layer + commodity ledger, on-hand, burn rate, public flags, resupply requests */
(function (CP) {
  'use strict';
  var OPS = CP.ops, A = CP.arc, U = CP.ui, E = CP.esc, I = U.icon, K = OPS.LISTS;
  var FLAG = { 'Water (cases)': 'water', 'Water (bulk gal)': 'water', 'Meals / MREs': 'food', 'Ice (bags)': 'ice', 'Tarps': 'tarps', 'Comfort kits': 'comfortkits', 'Hygiene kits': 'comfortkits' };
  var SIGN = { 'Received': 1, 'Transferred in': 1, 'Distributed': -1, 'Transferred out': -1, 'Damaged / expired': -1, 'Adjustment': 1 };
  function pods() { return OPS.load('pods:sites', function () { return A.query(A.L.pods, '1=1', { geom: true, order: 'name', n: 500 }).then(function (fs) { return fs.map(function (f) { var a = f.attributes; if (f.geometry) a._ll = [f.geometry.y, f.geometry.x]; return a; }); }); }, 60000); }
  function ledger() { return OPS.load('podledger:' + (OPS.inc ? OPS.inc.key : ''), function () { return OPS.rows('podledger', OPS.incWhere(), { order: 'txn_time DESC', n: 10000 }); }, 30000); }
  function stock(led) {
    var by = {}, now = Date.now();
    led.forEach(function (t) { var p = by[t.pod_oid] = by[t.pod_oid] || { on: {}, out24: {}, out6: {}, hh: 0, last: 0 }; var q = (t.qty || 0) * (SIGN[t.txn] || 0); p.on[t.commodity] = (p.on[t.commodity] || 0) + q; if (t.txn === 'Distributed') { if (now - t.txn_time < 864e5) p.out24[t.commodity] = (p.out24[t.commodity] || 0) + t.qty; if (now - t.txn_time < 6 * 3600e3) p.out6[t.commodity] = (p.out6[t.commodity] || 0) + t.qty; p.hh += t.households || 0; } p.last = Math.max(p.last, t.txn_time || 0); });
    return by;
  }
  function hoursLeft(p, c) { var on = p.on[c] || 0, r6 = (p.out6[c] || 0) / 6, r24 = (p.out24[c] || 0) / 24, r = r6 || r24; return r > 0 ? on / r : null; }

  OPS.tool('pods', { eop: 'pods',
    n: 'PODs', sub: 'Commodity Distribution', icon: 'flag', color: 'red', live: 'podledger', d: 'Points of distribution from the county POD layer with a commodity ledger: received, handed out, on hand, burn rate and hours left. Keeps the public POD map flags current.',
    nums: async function () { var o = await A.count(A.L.pods, "status='Open'"); var s = await A.stats(OPS.url('podledger') || (function () { throw new Error('Not set up'); })(), OPS.incWhere("txn='Distributed'"), [{ statisticType: 'sum', onStatisticField: 'households', outStatisticFieldName: 'h' }]); return [[o, 'open PODs'], [(s[0] && s[0].h) || 0, 'households served']]; },
    render: function () {
      var p = pods(), l = ledger(), u = OPS.st.ui, tab = u.pt2 || 'board';
      var h = '<div class="phead"><div><h1 class="pg">PODs · Commodity Distribution</h1><p class="pgsub" style="margin:0">POD sites are the county Resources/PODs layer (public map). Every receipt and hand-out is a row in OPS_PODLedger' + (OPS.inc ? ' for <b>' + E(OPS.inc.name) + '</b>' : '') + '.</p></div><div class="acts"><button class="btn sm" data-act="podFlags">' + I('refresh') + 'Update public map flags</button>' + (OPS.inc ? '<button class="btn sm pri" data-act="podNew">' + I('plus') + 'Open a POD</button>' : '') + '</div></div>';
      if (OPS.bad(p)) return h + OPS.wait(p, 'POD sites');
      if (!OPS.inc) h += OPS.needInc('record distribution') + '<div style="height:10px"></div>';
      if (OPS.bad(l)) return h + OPS.wait(l, 'ledger');
      var st = stock(l), open = p.filter(function (x) { return x.status === 'Open'; }), tot = { hh: 0 }, onAll = {};
      Object.keys(st).forEach(function (k) { tot.hh += st[k].hh; Object.keys(st[k].on).forEach(function (c) { onAll[c] = (onAll[c] || 0) + st[k].on[c]; }); });
      h += '<div class="grid g6" style="margin-bottom:12px">' + OPS.stat(open.length, 'Open PODs', 'gold') + OPS.stat(tot.hh.toLocaleString(), 'Households served', 'green') + ['Water (cases)', 'Meals / MREs', 'Ice (bags)', 'Tarps'].map(function (c) { return OPS.stat(Math.round(onAll[c] || 0).toLocaleString(), c + ' on hand', (onAll[c] || 0) <= 0 ? '' : 'blue'); }).join('') + '</div>';
      h += OPS.tabs('pt2', [['board', 'POD board'], ['led', 'Ledger', l.length], ['map', 'Map']], tab);
      if (tab === 'board') {
        var list = p.filter(function (x) { return x.status === 'Open' || st[x.OBJECTID] || (OPS.inc && x.incidentnm === OPS.inc.name); });
        if (!list.length) return h + '<div class="empty">No PODs open' + (OPS.inc ? ' for this incident' : '') + '. Open one, or set an existing county POD to Open.</div>' + allSites(p);
        h += '<div class="grid g2">' + list.map(function (x) {
          var s = st[x.OBJECTID] || { on: {}, out24: {}, out6: {}, hh: 0 }, cs = Object.keys(s.on).filter(function (c) { return s.on[c] || s.out24[c]; });
          return '<div class="card"><h3>' + I('flag') + E(x.name) + '<span class="x">' + OPS.chip(x.status) + '</span></h3><div class="dim" style="font-size:13px;margin:-4px 0 8px">' + E(x.fulladdr || '') + (x.pocname ? ' · ' + E(x.pocname) + ' ' + E(x.pocphone || '') : '') + ' · ' + s.hh + ' households</div>' +
            (cs.length ? '<table class="t" style="font-size:13.5px"><thead><tr><th>Commodity</th><th>On hand</th><th>Out 24 h</th><th>Hours left</th></tr></thead><tbody>' + cs.map(function (c) { var hl = hoursLeft(s, c); return '<tr><td>' + E(c) + '</td><td class="mono"><b class="' + (s.on[c] <= 0 ? 'bad-t' : '') + '">' + Math.round(s.on[c]).toLocaleString() + '</b></td><td class="mono">' + Math.round(s.out24[c] || 0).toLocaleString() + '</td><td class="mono ' + (hl != null && hl < 12 ? 'bad-t' : hl != null && hl < 24 ? 'warn-t' : '') + '">' + (hl != null ? Math.round(hl) + ' h' : '—') + '</td></tr>'; }).join('') + '</tbody></table>' : '<div class="empty" style="padding:10px">No commodities recorded yet.</div>') +
            '<div class="row" style="margin-top:10px">' + (OPS.inc ? '<button class="btn sm pri" data-act="podTxn" data-a="' + x.OBJECTID + '|Distributed">Hand out</button><button class="btn sm" data-act="podTxn" data-a="' + x.OBJECTID + '|Received">Receive</button><button class="btn sm ghost" data-act="podTxn" data-a="' + x.OBJECTID + '|Transferred out">Transfer</button><button class="btn sm ghost" data-act="podResupply" data-a="' + x.OBJECTID + '">Resupply request</button>' : '') + '<button class="btn sm ghost" data-act="podStatus" data-a="' + x.OBJECTID + '">' + (x.status === 'Open' ? 'Close' : 'Open') + '</button></div></div>';
        }).join('') + '</div>' + allSites(p);
      } else if (tab === 'led') h += '<div class="toolbar">' + OPS.searchBox('pl', 'Search POD, commodity, ticket') + '<span class="sp"></span><button class="btn sm" data-act="podCsv">' + I('down') + 'CSV</button></div>' + OPS.table({ k: 'podledger', rows: l, q: u.q_pl, cols: ['txn_time', 'pod', 'txn', 'commodity', 'qty', 'households', 'source', 'ref', 'recorded_by'], empty: 'No transactions yet.' });
      else h += OPS.mapPage('podMap', 540);
      return h;
    },
    after: function () { if ((OPS.st.ui.pt2 || 'board') !== 'map') return; var p = pods(); if (Array.isArray(p)) OPS.drawMap('podMap', p.map(function (x) { return { ll: x._ll, c: x.status === 'Open' ? '#F28C28' : '#6A83A2', t: 'POD', s: 26, pop: '<b>' + E(x.name) + '</b><br>' + E(x.status || '') + '<br>' + ['water', 'food', 'ice', 'tarps', 'comfortkits'].filter(function (k) { return x[k] === 'Yes'; }).join(', ') }; })); }
  });
  function allSites(p) { var closed = p.filter(function (x) { return x.status !== 'Open'; }); return closed.length ? '<details style="margin-top:14px"><summary class="dim" style="cursor:pointer">' + closed.length + ' other county POD sites</summary><div class="tk" style="margin-top:8px">' + closed.map(function (x) { return '<a href="#" data-act="podStatus" data-a="' + x.OBJECTID + '" class="mute"><b>' + E(x.name) + '</b><span>' + E(x.fulladdr || '') + ' · click to open</span></a>'; }).join('') + '</div></details>' : ''; }
  OPS.act.podTxn = function (a) {
    var p = a.split('|'), x = OPS.arr(pods()).find(function (s) { return s.OBJECTID === +p[0]; }); if (!x) return;
    var transfer = p[1] === 'Transferred out', others = OPS.arr(pods()).filter(function (s) { return s.status === 'Open' && s.OBJECTID !== x.OBJECTID; });
    OPS.edit('podledger', null, { title: p[1] + ' · ' + x.name, noMap: true, defaults: { pod_oid: x.OBJECTID, pod: x.name, txn: p[1], txn_time: Date.now(), commodity: 'Water (cases)', recorded_by: OPS.me(), source: p[1] === 'Received' ? 'VDEM' : null },
      skip: p[1] === 'Distributed' ? ['source', 'unit_cost', 'ref'] : ['households'],
      top: transfer ? '<label class="f" style="margin-bottom:10px"><span>Transfer to</span><select class="in" id="xferTo">' + others.map(function (s) { return '<option value="' + s.OBJECTID + '">' + E(s.name) + '</option>'; }).join('') + '</select></label>' : '',
      before: function (at, old, bg) { at.pod_oid = x.OBJECTID; at.pod = x.name; if (transfer) { var to = bg.querySelector('#xferTo'); if (!to || !to.value) { U.toast('No other open POD to transfer to', 'err'); return false; } at._to = +to.value; at.notes = (at.notes ? at.notes + ' · ' : '') + 'to ' + to.options[to.selectedIndex].text; } return at; },
      after: async function (oid, at) {
        if (at._to) { var dest = others.find(function (s) { return s.OBJECTID === at._to; }); await OPS.save('podledger', { incident_key: OPS.inc.key, incident_name: OPS.inc.name, pod_oid: dest.OBJECTID, pod: dest.name, txn: 'Transferred in', txn_time: at.txn_time, commodity: at.commodity, qty: at.qty, recorded_by: at.recorded_by, notes: 'from ' + x.name }); }
        OPS.bust('podledger'); OPS.bust('home'); await syncFlags([x.OBJECTID]).catch(function () {});
      } });
  };
  // public map flags: a commodity shows "Yes" while that POD has any on hand
  async function syncFlags(only) {
    var p = await A.query(A.L.pods, '1=1', { fields: 'OBJECTID,status', n: 500 }); var led = await OPS.rows('podledger', '1=1', { fields: 'pod_oid,txn,commodity,qty,txn_time,households', n: 20000 }); var st = stock(led), n = 0;
    for (var f of p) { var oid = f.attributes.OBJECTID; if (only && only.indexOf(oid) < 0) continue; var s = st[oid]; if (!s) continue; var at = { water: 'No', food: 'No', ice: 'No', tarps: 'No', comfortkits: 'No' }; Object.keys(s.on).forEach(function (c) { if (FLAG[c] && s.on[c] > 0) at[FLAG[c]] = 'Yes'; }); await A.sites.updPod(oid, at); n++; }
    OPS.bust('pods'); return n;
  }
  OPS.act.podFlags = function () { syncFlags().then(function (n) { U.toast(n + ' POD sites updated on the public map', 'ok'); OPS.repaint(); }).catch(function (e) { U.toast(E(e.message), 'err'); }); };
  OPS.act.podStatus = function (oid) { var x = OPS.arr(pods()).find(function (s) { return s.OBJECTID === +oid; }); if (!x) return; var to = x.status === 'Open' ? 'Closed' : 'Open'; U.confirm((to === 'Open' ? 'Open ' : 'Close ') + E(x.name) + '?', 'Updates the county POD layer' + (to === 'Open' ? ' and the public map (if public view is on)' : '') + (OPS.inc ? ', and logs to Command Post' : '') + '.', to, function () { A.sites.updPod(x.OBJECTID, Object.assign({ status: to }, to === 'Open' && OPS.inc ? { incidentnm: OPS.inc.name, incidentid: (OPS.inc.number || '').slice(0, 30) } : {})).then(function () { if (OPS.inc) OPS.cpEdit(OPS.inc.key, function () {}, 'POD ' + x.name + ' ' + to.toLowerCase(), 'Event').catch(function () {}); OPS.bust('pods'); OPS.repaint(); }).catch(function (e) { U.toast(E(e.message), 'err'); }); }); };
  OPS.act.podNew = function () {
    var bg = U.modal('Open a new POD', '<div class="grid g2"><label class="f"><span>Name</span><input class="in" name="name"></label><label class="f"><span>Address</span><input class="in" name="address"></label><label class="f"><span>POC</span><input class="in" name="poc"></label><label class="f"><span>POC phone</span><input class="in" name="phone"></label></div><label class="chk" style="margin:8px 0"><input type="checkbox" name="pub" checked> Show on the public map</label>' + OPS.pickerHtml(),
      [{ label: 'Cancel', cls: 'ghost' }, { label: 'Open POD', cls: 'pri', fn: function (b) { if (!pk.ll) { U.toast('Place it on the map', 'err'); return false; } var g = function (n) { return U.val(b, n); }; A.sites.addPod({ name: OPS.inc.name, number: OPS.inc.number || '' }, { name: g('name'), address: g('address'), poc: g('poc'), phone: g('phone'), pub: g('pub'), status: 'Open' }, pk.ll).then(function () { OPS.cpEdit(OPS.inc.key, function () {}, 'POD opened: ' + g('name'), 'Event').catch(function () {}); OPS.bust('pods'); U.toast('POD added to the county layer', 'ok'); OPS.repaint(); }).catch(function (e) { U.toast(E(e.message), 'err', 8000); }); } }], { wide: true, sticky: true });
    var pk = OPS.picker(bg, null, 'address');
  };
  OPS.act.podResupply = function (oid) {
    var x = OPS.arr(pods()).find(function (s) { return s.OBJECTID === +oid; }); var s = stockOPS.arr(ledger())[+oid] || { on: {}, out24: {}, out6: {} };
    var low = Object.keys(s.on).filter(function (c) { var hl = hoursLeft(s, c); return hl != null && hl < 36; });
    OPS.st.tool = 'resources'; OPS.st.ui = { tab: 'req' }; OPS.render();
    setTimeout(function () { OPS.act.reqNew(); setTimeout(function () { var bg = document.getElementById('modal'); if (!bg) return; bg.querySelector('[name="deliverTo"]').value = x.name + (x.fulladdr ? ', ' + x.fulladdr : ''); var tb = bg.querySelector('#items tbody'); tb.innerHTML = ''; (low.length ? low : ['Water (cases)']).forEach(function (c) { tb.insertAdjacentHTML('beforeend', '<tr data-id=""><td><input class="in" type="number" name="qty" value="' + Math.max(1, Math.round((s.out24[c] || 0))) + '" style="width:64px"></td><td><input class="in" name="kind" value="Commodity"></td><td><input class="in" name="type" value="" style="width:60px"></td><td><input class="in" name="desc" value="' + E(c) + ' for ' + E(x.name) + '"></td><td><input class="in" type="datetime-local" name="arrival" value=""></td><td><input class="in" name="cost" value="" style="width:90px"></td><td><button class="ibtn del" data-rmrow>' + I('trash') + '</button></td></tr>'); }); }, 120); }, 500);
  };
  OPS.act.podCsv = function () { var l = ledger(); if (Array.isArray(l)) OPS.csv('POD ledger', 'podledger', l); };
})(window.CP);
