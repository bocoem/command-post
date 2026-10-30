/* EM OPS — Cost Recovery: FEMA Public Assistance ledger fed by Check-In, Resources, Volunteers and PODs */
(function (CP) {
  'use strict';
  var OPS = CP.ops, A = CP.arc, U = CP.ui, E = CP.esc, I = U.icon, K = OPS.LISTS;
  // FY2026 countywide per capita impact indicator, incidents starting on/after Oct 1, 2025 (FEMA notice). Editable below.
  var DEF = { pop: 33596, ind: 4.86, volRate: 20, fringe: 0 };
  OPS.costCfg = Object.assign({}, DEF, CP.store.prefs().opsCost || {});
  OPS.volRate = function () { return OPS.costCfg.volRate; };
  async function loadCfg() { try { var s = await A.settings.get('ops_cost_cfg'); if (s) { OPS.costCfg = Object.assign({}, DEF, JSON.parse(s)); CP.store.setPref('opsCost', OPS.costCfg); } } catch (e) {} }

  function amount(a) {
    if (a.cost_type === 'Force Account Labor') { var base = (a.reg_hours || 0) * (a.reg_rate || 0) + (a.ot_hours || 0) * (a.ot_rate || 0); return Math.round(base * (1 + (a.fringe_pct || 0) / 100) * 100) / 100; }
    return Math.round((a.quantity || 0) * (a.unit_cost || 0) * 100) / 100 || a.amount || 0;
  }
  OPS.costAmount = amount;
  function rows() { return OPS.load('costs:' + OPS.inc.key, function () { return OPS.rows('costs', OPS.incWhere(), { order: 'work_date DESC', n: 5000 }); }); }
  var cat = function (c) { return (c || '').slice(0, 1); };

  OPS.tool('costs', { eop: 'costs',
    n: 'Cost Recovery', sub: 'FEMA Public Assistance Ledger', icon: 'report', color: 'green', d: 'Track every incident cost by FEMA PA category. Imports labor from Check-In, equipment from Resources, volunteer hours and POD purchases.',
    nums: async function () { var s = await A.stats(OPS.url('costs') || (function () { throw new Error('Not set up'); })(), OPS.incWhere(), [{ statisticType: 'sum', onStatisticField: 'amount', outStatisticFieldName: 't' }, { statisticType: 'count', onStatisticField: 'OBJECTID', outStatisticFieldName: 'n' }]); var x = s[0] || {}; return [[OPS.money(x.t || 0).replace(/\.\d\d$/, ''), 'tracked'], [x.n || 0, 'entries']]; },
    render: function () {
      if (!OPS.inc) return '<h1 class="pg">Cost Recovery</h1>' + OPS.needInc('track costs');
      if (!OPS._costCfgLoaded) { OPS._costCfgLoaded = true; loadCfg().then(OPS.repaint); }
      var d = rows(), u = OPS.st.ui, tab = u.ct || 'sum';
      var h = '<div class="phead"><div><h1 class="pg">Cost Recovery · ' + E(OPS.inc.name) + '</h1><p class="pgsub" style="margin:0">Ledger in ArcGIS (OPS_Costs). Keep documentation with each entry: timesheets, equipment logs, invoices.</p></div><div class="acts"><button class="btn sm" data-act="costImport">' + I('down') + 'Import from other tools</button><button class="btn sm" data-act="costPrint">' + I('print') + 'FEMA summaries</button><button class="btn sm" data-act="costCsv">' + I('down') + 'CSV</button><button class="btn pri" data-act="costNew">' + I('plus') + 'Add cost</button></div></div>';
      if (OPS.bad(d)) return h + OPS.wait(d, 'ledger');
      h += OPS.tabs('ct', [['sum', 'Summary'], ['led', 'Ledger', d.length], ['set', 'Settings']], tab);
      if (tab === 'sum') h += summary(d);
      else if (tab === 'led') {
        h += '<div class="toolbar">' + OPS.searchBox('cost', 'Search description, person, vendor') + '<select class="in" style="max-width:250px" data-chg="cf"><option value="">All PA categories</option>' + K.paCat.map(function (c) { return '<option' + (u.cf === c ? ' selected' : '') + '>' + E(c) + '</option>'; }).join('') + '</select><select class="in" style="max-width:220px" data-chg="ctf"><option value="">All cost types</option>' + K.costType.map(function (c) { return '<option' + (u.ctf === c ? ' selected' : '') + '>' + E(c) + '</option>'; }).join('') + '</select></div>';
        h += OPS.table({ k: 'costs', rows: d.filter(function (r) { return (!u.cf || r.pa_category === u.cf) && (!u.ctf || r.cost_type === u.ctf); }), q: u.q_cost, cols: [{ f: 'work_date', l: 'Date', fmt: function (r) { return E(OPS.d(r.work_date)); } }, { f: 'pa_category', l: 'Cat', fmt: function (r) { return '<span class="chip">' + E(cat(r.pa_category)) + '</span>'; } }, 'cost_type', 'description', 'who', { f: 'amount', l: 'Total', fmt: function (r) { return '<b>' + E(OPS.money(r.amount)) + '</b>'; } }, 'doc_status', { f: 'source', l: 'From' }], rowCls: function (r) { return r.doc_status === 'Missing' ? 'row-bad' : r.doc_status === 'Partial' ? 'row-warn' : ''; }, empty: 'No costs yet. Add one or import from Check-In and Resources.' });
      } else h += settings();
      return h;
    },
    edit: { costs: function (r) { costForm(r); } }
  });
  OPS.chg.cf = function (el) { OPS.st.ui.cf = el.value; OPS.repaint(); };
  OPS.chg.ctf = function (el) { OPS.st.ui.ctf = el.value; OPS.repaint(); };

  function summary(d) {
    var tot = 0, byCat = {}, byType = {}, docs = { Missing: 0, Partial: 0 };
    d.forEach(function (r) { var a = r.amount || 0; tot += a; byCat[r.pa_category || '?'] = (byCat[r.pa_category || '?'] || 0) + a; byType[r.cost_type || '?'] = (byType[r.cost_type || '?'] || 0) + a; if (docs[r.doc_status] != null) docs[r.doc_status]++; });
    var cfg = OPS.costCfg, thr = cfg.pop * cfg.ind, elig = tot - (byCat['Not PA eligible'] || 0), pct = thr ? Math.min(100, elig / thr * 100) : 0;
    var emerg = (byCat['A - Debris Removal'] || 0) + (byCat['B - Emergency Protective Measures'] || 0), perm = elig - emerg - (byCat['Z - Management Costs'] || 0);
    var h = '<div class="grid g4" style="margin-bottom:12px">' + OPS.stat(OPS.money(tot).replace(/\.\d\d$/, ''), 'Total tracked', 'gold') + OPS.stat(OPS.money(emerg).replace(/\.\d\d$/, ''), 'Emergency work (A-B)', 'blue') + OPS.stat(OPS.money(perm).replace(/\.\d\d$/, ''), 'Permanent work (C-G)') + OPS.stat(docs.Missing + docs.Partial, 'Need documentation', docs.Missing ? 'red' : '', docs.Missing + ' missing · ' + docs.Partial + ' partial') + '</div>';
    h += '<div class="card" style="margin-bottom:12px"><h3>' + I('target') + 'County per capita indicator</h3><div class="row" style="margin-bottom:8px"><div class="grow"><div class="prog"><i style="width:' + pct.toFixed(1) + '%;background:' + (pct >= 100 ? 'var(--green)' : 'linear-gradient(90deg,var(--gold2),var(--gold))') + '"></i></div></div><b class="mono">' + pct.toFixed(0) + '%</b></div>' +
      '<p class="dim" style="margin:0;font-size:13.5px">Eligible damage and costs tracked: <b>' + OPS.money(elig) + '</b> vs. county threshold <b>' + OPS.money(thr) + '</b> (' + cfg.pop.toLocaleString() + ' people × $' + cfg.ind.toFixed(2) + '). FEMA also weighs the statewide indicator, insurance and localized impacts; this is a planning gauge, not an eligibility ruling. Damage Assessment estimates belong in the same total once known.</p></div>';
    function bars(obj) { var keys = Object.keys(obj).sort(function (a, b) { return obj[b] - obj[a]; }); return keys.length ? keys.map(function (k) { var p = tot ? obj[k] / tot * 100 : 0; return '<div style="margin-bottom:8px"><div class="row" style="justify-content:space-between"><span>' + E(k) + '</span><b>' + OPS.money(obj[k]) + '</b></div><div class="prog"><i style="width:' + p.toFixed(1) + '%"></i></div></div>'; }).join('') : '<div class="empty">No costs yet.</div>'; }
    h += '<div class="grid g2"><div class="card"><h3>' + I('list') + 'By PA category</h3>' + bars(byCat) + '</div><div class="card"><h3>' + I('list') + 'By cost type</h3>' + bars(byType) + '</div></div>';
    return h;
  }
  function settings() {
    var c = OPS.costCfg;
    return '<div class="card" style="max-width:720px"><h3>' + I('gear') + 'Cost settings (shared county-wide)</h3><div class="grid g2" id="cset"><label class="f"><span>County population</span><input class="in" type="number" name="pop" value="' + c.pop + '"></label><label class="f"><span>Countywide per capita indicator ($)</span><input class="in" type="number" step="0.01" name="ind" value="' + c.ind + '"></label>' +
      '<label class="f"><span>Volunteer labor value ($/hr)</span><input class="in" type="number" step="0.01" name="volRate" value="' + c.volRate + '"></label><label class="f"><span>Default fringe benefit %</span><input class="in" type="number" step="0.1" name="fringe" value="' + c.fringe + '"></label></div>' +
      '<p class="dim" style="font-size:12.5px">FEMA credits donated volunteer labor at the rate the county would pay for the same work. The per capita indicator changes every October 1; FY2026 is $4.86 for incidents starting on or after Oct 1, 2025.</p><button class="btn pri" data-act="costSaveCfg">Save settings</button></div>';
  }
  OPS.act.costSaveCfg = async function () { var box = document.getElementById('cset'); var g = function (n) { return +box.querySelector('[name="' + n + '"]').value || 0; }; OPS.costCfg = { pop: g('pop'), ind: g('ind'), volRate: g('volRate'), fringe: g('fringe') }; CP.store.setPref('opsCost', OPS.costCfg); try { await A.settings.set('ops_cost_cfg', JSON.stringify(OPS.costCfg)); U.toast('Saved for everyone', 'ok'); } catch (e) { U.toast('Saved on this device (' + E(e.message) + ')', 'err'); } OPS.repaint(); };

  function costForm(r) {
    OPS.edit('costs', r, { defaults: r ? null : { work_date: Date.now(), doc_status: 'Missing', fringe_pct: OPS.costCfg.fringe, pa_category: 'B - Emergency Protective Measures', source: 'Manual' },
      top: '<div class="hint" style="margin-bottom:10px">Labor: hours × rates (+ fringe). Everything else: quantity × unit cost. The total is calculated when you save.</div>',
      before: function (at) { at.amount = amount(at); if (!at.source) at.source = 'Manual'; return at; } });
  }
  OPS.act.costNew = function () { costForm(null); };
  OPS.act.costCsv = function () { var d = rows(); if (Array.isArray(d)) OPS.csv(OPS.inc.number + ' costs', 'costs', d); };

  // imports
  OPS.act.costImport = function () {
    U.modal('Import costs for ' + OPS.inc.name, '<p class="dim" style="margin-top:0">Each source is matched to entries it already made, so running this again updates hours instead of duplicating. Check the rates and documentation after import.</p>' +
      '<label class="chk"><input type="checkbox" name="lab" checked> <b>Labor</b> from Check-In (people, hours on scene)</label><br><label class="chk"><input type="checkbox" name="eq" checked> <b>Equipment</b> from Resources (county inventory hours × rate)</label><br><label class="chk"><input type="checkbox" name="vol" checked> <b>Volunteer hours</b> as donated resources ($' + OPS.costCfg.volRate + '/hr)</label><br><label class="chk"><input type="checkbox" name="pod" checked> <b>POD commodities</b> the county bought</label>' +
      '<div class="grid g2" style="margin-top:10px"><label class="f"><span>PA category for imported labor & equipment</span><select class="in" name="cat">' + K.paCat.map(function (c) { return '<option' + (/^B/.test(c) ? ' selected' : '') + '>' + E(c) + '</option>'; }).join('') + '</select></label><label class="f"><span>Default labor rate ($/hr, blank = fill in later)</span><input class="in" type="number" step="0.01" name="rate"></label></div>',
      [{ label: 'Cancel', cls: 'ghost' }, { label: 'Import', cls: 'pri', fn: function (bg) { var o = { lab: U.val(bg, 'lab'), eq: U.val(bg, 'eq'), vol: U.val(bg, 'vol'), pod: U.val(bg, 'pod'), cat: U.val(bg, 'cat'), rate: +U.val(bg, 'rate') || null }; runImport(o).then(function (m) { U.toast(m, 'ok', 7000); OPS.repaint(); }).catch(function (e) { U.toast(E(e.message), 'err', 8000); }); } }]);
  };
  async function runImport(o) {
    var inc = OPS.inc, base = { incident_key: inc.key, incident_name: inc.name }, out = [];
    var have = {}; (await OPS.rows('costs', OPS.incWhere('source_id IS NOT NULL'), { fields: 'OBJECTID,source_id,reg_rate,ot_rate,unit_cost,doc_status,pa_category', n: 5000 })).forEach(function (r) { have[r.source_id] = r; });
    function put(sid, at) { var ex = have[sid]; at.source_id = sid; if (ex) { at.OBJECTID = ex.OBJECTID; ['reg_rate', 'ot_rate', 'unit_cost', 'doc_status', 'pa_category'].forEach(function (k) { if (ex[k] != null) at[k] = ex[k]; }); } at.amount = amount(at); out.push(Object.assign({}, base, at)); }
    var ci = (o.lab || o.eq) ? await OPS.rows('checkins', OPS.incWhere(), { n: 3000 }) : [];
    var resById = {}; if (o.eq) (await OPS.rows('resources', '1=1', { n: 3000 })).forEach(function (r) { resById[r.OBJECTID] = r; });
    if (o.lab) ci.filter(function (r) { return !r.res_id && !r.vol_id && r.role !== 'Contractor'; }).forEach(function (r) {
      var h = Math.round(OPS.hrs(r.checkin_time, r.checkout_time) * 4) / 4 * (r.persons || 1), reg = Math.min(h, 8 * (r.persons || 1)), ot = Math.max(0, h - reg);
      put('ci:' + r.OBJECTID, { work_date: r.checkin_time, pa_category: o.cat, cost_type: r.role === 'Mutual Aid' ? 'Mutual Aid' : 'Force Account Labor', description: (r.position || 'Incident response') + (r.assignment ? ' · ' + r.assignment : ''), who: r.person, department: r.agency, reg_hours: reg, ot_hours: ot, reg_rate: o.rate, ot_rate: o.rate ? Math.round(o.rate * 1.5 * 100) / 100 : null, fringe_pct: OPS.costCfg.fringe, doc_status: 'Partial', source: 'Check-In' });
    });
    if (o.eq) {
      ci.filter(function (r) { return r.res_id; }).forEach(function (r) { var res = resById[+r.res_id] || {}; var h = Math.round(OPS.hrs(r.checkin_time, r.checkout_time) * 4) / 4; put('ci:' + r.OBJECTID, { work_date: r.checkin_time, pa_category: o.cat, cost_type: res.rate_source === 'Contract' ? 'Rented Equipment' : 'Force Account Equipment', description: [res.kind, res.nims_type].filter(Boolean).join(' · ') || r.position || 'Equipment', who: r.person, department: res.owner || r.agency, quantity: h, unit_cost: res.rate_hr || null, fema_code: res.fema_code || null, doc_status: 'Partial', source: 'Resources' }); });
      Object.keys(resById).map(function (k) { return resById[k]; }).filter(function (r) { return r.status === 'Assigned' && r.incident_key === inc.key && !ci.some(function (c) { return +c.res_id === r.OBJECTID && c.status !== 'Checked Out'; }); }).forEach(function (r) {
        put('res:' + r.OBJECTID + ':' + (r.status_time || 0), { work_date: r.status_time, pa_category: o.cat, cost_type: r.rate_source === 'Contract' ? 'Rented Equipment' : 'Force Account Equipment', description: [r.kind, r.nims_type].filter(Boolean).join(' · ') || r.name, who: (r.res_id ? r.res_id + ' ' : '') + r.name, department: r.owner, quantity: Math.round(OPS.hrs(r.status_time) * 4) / 4, unit_cost: r.rate_hr || null, fema_code: r.fema_code || null, doc_status: 'Partial', source: 'Resources' });
      });
    }
    if (o.vol && OPS.ready('volhours')) (await OPS.rows('volhours', OPS.incWhere(), { n: 3000 })).forEach(function (v) { put('vol:' + v.OBJECTID, { work_date: v.work_date, pa_category: 'B - Emergency Protective Measures', cost_type: 'Donated Resources', description: 'Volunteer labor · ' + (v.task || ''), who: v.volunteer, quantity: v.hours, unit_cost: v.rate || OPS.costCfg.volRate, doc_status: 'Partial', source: 'Volunteers' }); });
    if (o.pod && OPS.ready('podledger')) (await OPS.rows('podledger', OPS.incWhere("txn='Received' AND source='County purchase'"), { n: 3000 })).forEach(function (p) { put('pod:' + p.OBJECTID, { work_date: p.txn_time, pa_category: 'B - Emergency Protective Measures', cost_type: 'Commodities', description: p.commodity + ' for ' + (p.pod || 'POD'), who: p.ref || '', quantity: p.qty, unit_cost: p.unit_cost, invoice: p.ref, doc_status: p.ref ? 'Partial' : 'Missing', source: 'PODs' }); });
    if (!out.length) return 'Nothing to import yet.';
    await OPS.saveMany('costs', out); OPS.bust('costs');
    var n = out.filter(function (x) { return !x.OBJECTID; }).length; return n + ' new cost entries, ' + (out.length - n) + ' updated.';
  }

  OPS.act.costPrint = function () {
    var d = rows(); if (!Array.isArray(d)) return;
    var lab = d.filter(function (r) { return r.cost_type === 'Force Account Labor'; }), eq = d.filter(function (r) { return /Equipment/.test(r.cost_type); }), mat = d.filter(function (r) { return /Materials|Commodities|Contract|Other|Mutual|Donated/.test(r.cost_type); });
    var sum = function (l) { return OPS.money(l.reduce(function (n, r) { return n + (r.amount || 0); }, 0)); };
    OPS.print('Cost Summary · ' + OPS.inc.name, E(OPS.inc.number) + ' · prepared for FEMA Public Assistance / VDEM',
      '<h2>Force account labor (' + sum(lab) + ')</h2>' + OPS.ptable(['Date', 'Cat', 'Name', 'Dept', 'Description', 'Reg hrs', 'Reg rate', 'OT hrs', 'OT rate', 'Fringe %', 'Total', 'Docs'], lab.map(function (r) { return [OPS.d(r.work_date), cat(r.pa_category), r.who, r.department, r.description, r.reg_hours, r.reg_rate, r.ot_hours, r.ot_rate, r.fringe_pct, OPS.money(r.amount), r.doc_status]; })) +
      '<h2>Force account / rented equipment (' + sum(eq) + ')</h2>' + OPS.ptable(['Date', 'Cat', 'Equipment', 'Owner', 'Description', 'FEMA code', 'Hours', 'Rate', 'Total', 'Docs'], eq.map(function (r) { return [OPS.d(r.work_date), cat(r.pa_category), r.who, r.department, r.description, r.fema_code, r.quantity, OPS.money(r.unit_cost), OPS.money(r.amount), r.doc_status]; })) +
      '<h2>Materials, contracts, commodities, mutual aid & donated resources (' + sum(mat) + ')</h2>' + OPS.ptable(['Date', 'Cat', 'Type', 'Vendor / who', 'Description', 'Qty', 'Unit cost', 'Invoice', 'Total', 'Docs'], mat.map(function (r) { return [OPS.d(r.work_date), cat(r.pa_category), r.cost_type, r.who, r.description, r.quantity, OPS.money(r.unit_cost), r.invoice, OPS.money(r.amount), r.doc_status]; })) +
      '<h2>Total ' + sum(d) + '</h2>');
  };
})(window.CP);
