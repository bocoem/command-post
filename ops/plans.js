/* EM OPS — Plan Library: EOP, annexes, SOPs and checklists with review dates; files stored as ArcGIS attachments */
(function (CP) {
  'use strict';
  var OPS = CP.ops, A = CP.arc, U = CP.ui, E = CP.esc, I = U.icon, K = OPS.LISTS;
  function plans() { return OPS.load('plans', function () { return OPS.rows('plans', '1=1', { order: 'plan_type,esf,title', n: 2000 }); }); }
  var DAY = 864e5;

  OPS.tool('plans', {
    n: 'Plan Library', sub: 'EOP · Annexes · SOPs · Checklists', icon: 'forms', d: 'Every plan, annex, SOP and agreement with versions and review dates. Quick-reference checklists can be worked during an incident and logged to Command Post.',
    nums: async function () { var n = await OPS.count('plans', "status<>'Superseded'"), od = await OPS.count('plans', "next_review < CURRENT_TIMESTAMP AND status<>'Superseded'"); return [[n, 'documents'], [od, 'review overdue', od ? 'bad-t' : '']]; },
    render: function () {
      var d = plans(), u = OPS.st.ui;
      var h = '<div class="phead"><div><h1 class="pg">Plan Library</h1><p class="pgsub" style="margin:0">Library in ArcGIS (OPS_Plans). Attach the PDF to each record; files are stored in ArcGIS with it.</p></div><div class="acts"><button class="btn pri" data-act="planNew">' + I('plus') + 'Add document</button></div></div>';
      if (OPS.bad(d)) return h + OPS.wait(d, 'library');
      var now = Date.now(), od = d.filter(function (p) { return p.next_review && p.next_review < now && p.status !== 'Superseded'; }), soon = d.filter(function (p) { return p.next_review && p.next_review >= now && p.next_review < now + 90 * DAY; });
      h += '<div class="grid g4" style="margin-bottom:12px">' + OPS.stat(d.filter(function (p) { return p.status !== 'Superseded'; }).length, 'Documents', 'gold') + OPS.stat(d.filter(function (p) { return p.quickref; }).length, 'With checklists') + OPS.stat(soon.length, 'Review in 90 days', soon.length ? 'gold' : '') + OPS.stat(od.length, 'Review overdue', od.length ? 'red' : '') + '</div>';
      h += '<div class="toolbar">' + OPS.searchBox('plan', 'Search titles, summaries, checklists') + '<select class="in" style="max-width:220px" data-chg="pt"><option value="">All types</option>' + K.planType.map(function (t) { return '<option' + (u.pt === t ? ' selected' : '') + '>' + E(t) + '</option>'; }).join('') + '</select><select class="in" style="max-width:260px" data-chg="pe"><option value="">All ESFs</option>' + K.esf.filter(Boolean).map(function (t) { return '<option' + (u.pe === t ? ' selected' : '') + '>' + E(t) + '</option>'; }).join('') + '</select></div>';
      h += OPS.table({ k: 'plans', rows: d.filter(function (p) { return (!u.pt || p.plan_type === u.pt) && (!u.pe || p.esf === u.pe); }), q: u.q_plan, cols: ['title', 'plan_type', 'esf', 'version', 'owner', { f: 'next_review', l: 'Next review', fmt: function (p) { return p.next_review ? '<span class="' + (p.next_review < now ? 'bad-t' : p.next_review < now + 90 * DAY ? 'warn-t' : '') + '">' + E(OPS.d(p.next_review)) + '</span>' : ''; } }, 'status'], rowCls: function (p) { return p.status === 'Superseded' ? 'row-dim' : ''; },
        actions: function (p) { return (p.quickref ? '<button class="btn xs" data-act="planCheck" data-a="' + p.OBJECTID + '">' + I('check') + 'Checklist</button> ' : '') + (p.doc_url ? '<a class="btn xs ghost" href="' + E(p.doc_url) + '" target="_blank" rel="noopener">' + I('link') + 'Open</a>' : ''); }, empty: 'No documents yet. Start with the EOP base plan and ESF annexes.' });
      return h;
    }
  });
  OPS.chg.pt = function (el) { OPS.st.ui.pt = el.value; OPS.repaint(); };
  OPS.chg.pe = function (el) { OPS.st.ui.pe = el.value; OPS.repaint(); };
  OPS.act.planNew = function () { OPS.edit('plans', null, { defaults: { status: 'Current', plan_type: 'SOP / SOG', next_review: Date.now() + 365 * DAY }, after: function (oid) { OPS.bust('plans'); U.toast('Open it again to attach the file', 'ok'); } }); };
  OPS.act.planCheck = function (oid) {
    var p = OPS.arr(plans()).find(function (x) { return x.OBJECTID === +oid; }); if (!p) return;
    var steps = (p.quickref || '').split(/\n+/).map(function (s) { return s.replace(/^\s*([-*•]|\d+[.)])\s*/, '').trim(); }).filter(Boolean);
    var key = 'bcem.ops.chk.' + oid + '.' + (OPS.inc ? OPS.inc.key : 'none'), done = {}; try { done = JSON.parse(localStorage.getItem(key) || '{}'); } catch (e) {}
    var bg = U.modal(p.title, (p.summary ? '<p class="dim" style="margin-top:0">' + E(p.summary) + '</p>' : '') + (OPS.inc ? '<div class="hint" style="margin-bottom:10px">Working this for <b>' + E(OPS.inc.name) + '</b>. Each step you check is written to the Command Post activity log.</div>' : '<div class="hint" style="margin-bottom:10px">Pick an incident at the top to log steps to Command Post.</div>') +
      steps.map(function (s, i) { return '<label class="chk" style="display:flex;padding:7px 0;border-bottom:1px solid var(--line)"><input type="checkbox" data-step="' + i + '"' + (done[i] ? ' checked' : '') + '> <span>' + E(s) + (done[i] ? ' <span class="dim" style="font-size:12px">· ' + E(done[i]) + '</span>' : '') + '</span></label>'; }).join(''),
      [{ label: I('print') + 'Print', cls: 'ghost', fn: function () { OPS.print(p.title, E(p.plan_type || '') + (p.version ? ' · v' + E(p.version) : ''), '<ol>' + steps.map(function (s) { return '<li style="margin:6px 0">☐ ' + E(s) + '</li>'; }).join('') + '</ol>'); return false; } }, { label: 'Close', cls: 'pri' }], { wide: true });
    bg.addEventListener('change', function (e) {
      var c = e.target.closest('[data-step]'); if (!c) return; var i = +c.dataset.step;
      if (c.checked) { done[i] = CP.fmtTime(CP.now()) + ' ' + OPS.me(); if (OPS.inc) OPS.cpEdit(OPS.inc.key, function () {}, '✔ ' + steps[i] + ' (' + p.title + ')', 'Action').catch(function (er) { U.toast('Not logged: ' + E(er.message), 'err'); }); } else delete done[i];
      localStorage.setItem(key, JSON.stringify(done));
    });
  };
})(window.CP);
