/* EM OPS — Volunteers & CERT: roster, credentials (from Training), deployment through Check-In, hours for cost recovery */
(function (CP) {
  'use strict';
  var OPS = CP.ops, A = CP.arc, U = CP.ui, E = CP.esc, I = U.icon, K = OPS.LISTS;
  var SOON = 60 * 864e5;
  function vols() { return OPS.load('volunteers', function () { return OPS.rows('volunteers', '1=1', { order: 'last_name,first_name', n: 5000 }); }); }
  function training() { return OPS.load('training:all', function () { return OPS.rows('training', '1=1', { n: 10000 }); }); }
  function credsFor(v, tr) { var nm = (v.first_name + ' ' + v.last_name).toLowerCase(), em = (v.email || '').toLowerCase(); return (tr || []).filter(function (t) { return (t.person || '').toLowerCase() === nm || (em && (t.person_key || '').toLowerCase() === em); }); }
  function credState(list) { var now = Date.now(), exp = list.filter(function (t) { return t.expires && t.expires < now; }), soon = list.filter(function (t) { return t.expires && t.expires >= now && t.expires < now + SOON; }); return { exp: exp, soon: soon }; }

  OPS.tool('volunteers', {
    n: 'Volunteers', sub: 'CERT · MRC · ARES · Spontaneous', icon: 'users', d: 'Volunteer roster with credentials from Training, deployment through Check-In, and hours that count as donated resources in Cost Recovery.',
    nums: async function () { var a = await OPS.count('volunteers', "status='Active'"), d = await OPS.count('volunteers', "status='Deployed'"), p = await OPS.count('volunteers', "status LIKE 'Pending%'"); return [[a, 'active'], [d, 'deployed', d ? 'warn-t' : ''], [p, 'pending']]; },
    render: function () {
      var d = vols(), tr = training(), u = OPS.st.ui, tab = u.vt || 'roster';
      var h = '<div class="phead"><div><h1 class="pg">Volunteers</h1><p class="pgsub" style="margin:0">Roster in ArcGIS (OPS_Volunteers). Deploy someone and they are checked in to the incident and appear in Command Post.</p></div><div class="acts"><button class="btn sm" data-act="volSpont">' + I('plus') + 'Spontaneous volunteer</button><button class="btn pri" data-act="volNew">' + I('plus') + 'Add volunteer</button></div></div>';
      if (OPS.bad(d)) return h + OPS.wait(d, 'roster');
      var trl = Array.isArray(tr) ? tr : [];
      h += OPS.tabs('vt', [['roster', 'Roster', d.length], ['call', 'Call-out list'], ['hours', 'Hours'], ['cred', 'Credentials']], tab);
      if (tab === 'roster') {
        h += '<div class="toolbar">' + OPS.searchBox('vol', 'Search name, skill, phone') + OPS.seg('vs', ['All', 'Active', 'Deployed', 'Pending background check', 'Inactive'].map(function (x) { return [x, x.replace(' background check', '')]; }), u.vs || 'All') + '<select class="in" style="max-width:220px" data-chg="vteam"><option value="">All teams</option>' + K.volTeam.map(function (t) { return '<option' + (u.vteam === t ? ' selected' : '') + '>' + E(t) + '</option>'; }).join('') + '</select><span class="sp"></span><button class="btn sm" data-act="volCsv">' + I('down') + 'CSV</button></div>';
        var rows = d.filter(function (v) { return ((u.vs || 'All') === 'All' || v.status === u.vs) && (!u.vteam || v.team === u.vteam); });
        h += OPS.table({ k: 'volunteers', rows: rows, q: u.q_vol, cols: [{ f: 'n', l: 'Name', fmt: function (v) { return '<b>' + E(v.last_name + ', ' + v.first_name) + '</b>'; } }, 'team', 'phone', 'status', { f: 'skills', l: 'Skills' }, { f: 'cred', l: 'Credentials', fmt: function (v) { var c = credsFor(v, trl), s = credState(c); return c.length ? c.length + ' on file' + (s.exp.length ? ' · <span class="bad-t">' + s.exp.length + ' expired</span>' : '') + (s.soon.length ? ' · <span class="warn-t">' + s.soon.length + ' expiring</span>' : '') : '<span class="dim">none</span>'; } }, 'incident_name', { f: 'total_hours', l: 'Hours' }],
          rowCls: function (v) { return v.status === 'Deployed' ? 'row-ok' : credState(credsFor(v, trl)).exp.length ? 'row-warn' : ''; },
          actions: function (v) { return v.status === 'Active' && OPS.inc ? '<button class="btn xs" data-act="volDeploy" data-a="' + v.OBJECTID + '">Deploy</button>' : ''; }, empty: 'No volunteers yet.' });
      } else if (tab === 'call') {
        var sk = (u.vsk || '').toLowerCase(), av = d.filter(function (v) { return v.status === 'Active' && (!sk || [v.skills, v.team].join(' ').toLowerCase().indexOf(sk) >= 0); });
        h += '<div class="toolbar"><input class="in" style="max-width:280px" placeholder="Skill or team (chainsaw, ham, Spanish, nurse)" data-chg="vsk" value="' + E(u.vsk || '') + '"><span class="sp"></span><button class="btn sm" data-act="volCallPrint">' + I('print') + 'Print call-out list</button></div>' +
          OPS.table({ k: 'volunteers', rows: av, cols: [{ f: 'n', l: 'Name', fmt: function (v) { return E(v.first_name + ' ' + v.last_name); } }, 'phone', 'email', 'team', 'skills', 'availability'], empty: 'Nobody available matches.' });
      } else if (tab === 'hours') {
        var hrs = OPS.load('volhours:' + (OPS.inc ? OPS.inc.key : ''), function () { return OPS.rows('volhours', OPS.incWhere(), { order: 'work_date DESC', n: 5000 }); });
        h += '<div class="toolbar"><span class="muted">' + (OPS.inc ? 'Hours on ' + E(OPS.inc.name) : 'All volunteer hours') + '. Check-out logs hours automatically; add others by hand.</span><span class="sp"></span><button class="btn sm pri" data-act="volHrs">' + I('plus') + 'Log hours</button></div>';
        if (!OPS.bad(hrs)) { var t = hrs.reduce(function (n, x) { return n + (x.hours || 0); }, 0); h += '<div class="grid g4" style="margin-bottom:10px">' + OPS.stat(t.toFixed(1), 'Hours') + OPS.stat(OPS.money(t * OPS.volRate()).replace(/\.\d\d$/, ''), 'Donated value', 'green', 'at $' + OPS.volRate() + '/hr') + '</div>'; }
        h += OPS.bad(hrs) ? OPS.wait(hrs) : OPS.table({ k: 'volhours', rows: hrs, cols: ['volunteer', 'work_date', 'hours', 'task', 'incident_name'], empty: 'No hours logged.' });
      } else {
        var exp = [], soon = [], now = Date.now();
        trl.forEach(function (t) { if (!t.expires) return; if (t.expires < now) exp.push(t); else if (t.expires < now + SOON) soon.push(t); });
        h += '<div class="grid g2"><div class="card"><h3>' + I('warn') + 'Expired<small>' + exp.length + '</small></h3>' + OPS.table({ k: 'training', rows: exp, cols: ['person', 'course', 'expires'] }) + '</div><div class="card"><h3>' + I('clock') + 'Expiring in 60 days<small>' + soon.length + '</small></h3>' + OPS.table({ k: 'training', rows: soon, cols: ['person', 'course', 'expires'] }) + '</div></div><p class="dim" style="font-size:12.5px">Credentials come from the Training tool, matched by name or email.</p>';
      }
      return h;
    },
    edit: { volunteers: function (v) { volForm(v); } }
  });
  OPS.chg.vteam = function (el) { OPS.st.ui.vteam = el.value; OPS.repaint(); };
  OPS.chg.vsk = function (el) { OPS.st.ui.vsk = el.value; OPS.repaint(); };
  function volForm(v, def) {
    var tr = training(), c = v ? credsFor(v, Array.isArray(tr) ? tr : []) : [];
    OPS.edit('volunteers', v, { defaults: def || (v ? null : { status: 'Active', team: 'CERT' }),
      bottom: v ? '<div class="fgrp">Training & credentials</div>' + (c.length ? '<div class="pills">' + c.map(function (t) { return '<span class="chip ' + (t.expires && t.expires < Date.now() ? 'red' : 'ok') + '">' + E(t.course === 'Other' ? t.course_other : t.course) + (t.expires ? ' · exp ' + OPS.d(t.expires) : '') + '</span>'; }).join('') + '</div>' : '<span class="dim">None on file. Add them in Training.</span>') : '',
      buttons: v && v.status === 'Active' && OPS.inc ? [{ label: 'Deploy to ' + OPS.inc.name, fn: function () { setTimeout(function () { OPS.act.volDeploy(v.OBJECTID); }, 30); } }] : [],
      before: function (at, old) { if (!old.OBJECTID) at.vol_id = OPS.id('V-'); return at; } });
  }
  OPS.act.volNew = function () { volForm(null); };
  OPS.act.volSpont = function () { volForm(null, { status: 'Pending background check', team: 'Spontaneous', bg_check: 'Not started' }); };
  OPS.act.volCsv = function () { var d = vols(); if (Array.isArray(d)) OPS.csv('Volunteer roster', 'volunteers', d); };
  OPS.act.volDeploy = function (oid) {
    var v = OPS.findRow('volunteers', oid); if (!v || !OPS.inc) return;
    U.modal('Deploy ' + v.first_name + ' ' + v.last_name, '<p class="dim" style="margin-top:0">Checks them in to <b>' + E(OPS.inc.name) + '</b>. They appear in Check-In and Command Post Resources; hours are logged when they check out.</p><div class="grid g2"><label class="f"><span>Assignment</span><input class="in" name="asg"></label><label class="f"><span>Check-in location</span><select class="in" name="loc"><option>ICP</option><option>Staging Area</option><option>EOC</option><option>Shelter</option><option>POD</option><option>Other</option></select></label></div>',
      [{ label: 'Cancel', cls: 'ghost' }, { label: 'Deploy & check in', cls: 'pri', fn: function (bg) { OPS.ci.checkIn({ person: v.first_name + ' ' + v.last_name, agency: v.team, role: 'Volunteer', position: v.team + ' volunteer', persons: 1, phone: v.phone, checkin_loc: U.val(bg, 'loc'), assignment: U.val(bg, 'asg') || null, method: 'Volunteers' }, null, { vol: v }).then(function () { OPS.bust('volunteers'); U.toast('Deployed and checked in', 'ok'); OPS.repaint(); }).catch(function (e) { U.toast(E(e.message), 'err', 7000); }); } }]);
  };
  OPS.act.volHrs = async function () {
    var d = vols(); if (!Array.isArray(d)) return;
    OPS.edit('volhours', null, { defaults: { work_date: Date.now(), rate: OPS.volRate() }, noMap: true,
      top: '<label class="f" style="margin-bottom:10px"><span>Volunteer</span><select class="in" id="vhPick">' + d.map(function (v) { return '<option value="' + E(v.vol_id) + '">' + E(v.last_name + ', ' + v.first_name) + '</option>'; }).join('') + '</select></label>',
      before: async function (at, old, bg) { var v = d.find(function (x) { return x.vol_id === bg.querySelector('#vhPick').value; }); at.vol_id = v.vol_id; at.volunteer = v.first_name + ' ' + v.last_name; await OPS.upd('volunteers', v.OBJECTID, { total_hours: (v.total_hours || 0) + (at.hours || 0) }); return at; },
      after: function () { OPS.bust('volhours'); OPS.bust('volunteers'); } });
  };
  OPS.act.volCallPrint = function () { var d = vols(), sk = (OPS.st.ui.vsk || '').toLowerCase(); var av = d.filter(function (v) { return v.status === 'Active' && (!sk || [v.skills, v.team].join(' ').toLowerCase().indexOf(sk) >= 0); }); OPS.print('Volunteer call-out list', (sk ? 'Matching "' + E(sk) + '" · ' : '') + av.length + ' available', OPS.ptable(['Name', 'Phone', 'Team', 'Skills', 'Availability', 'Reached?', 'Can respond?'], av.map(function (v) { return [v.first_name + ' ' + v.last_name, v.phone, v.team, v.skills, v.availability, '', '']; }))); };
})(window.CP);
