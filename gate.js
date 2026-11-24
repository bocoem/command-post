/* BEACON gate mode: used only inside the Command Board / MCI Board iPhone-iPad apps.
   The app injects window.BEACON_GATE = { url, token, email, name, agency, level, app, incident, layers } before the page loads.
   In gate mode the board never signs in to ArcGIS itself: every ArcGIS request goes to the gate (Cloudflare Worker),
   which holds the county key, checks this person's level and only allows the layers that level may use.
   On the web (GitHub Pages) BEACON_GATE is absent and this file does nothing. */
(function (CP) {
  'use strict';
  var G = window.BEACON_GATE; if (!G || !G.url || !CP.arc) return;
  var A = CP.arc, N = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.beacon;
  CP.gate = G; A.gate = true;
  document.documentElement.classList.add('cbapp');
  CP.native = function (msg) { try { if (N) N.postMessage(msg); } catch (e) {} };
  var lvlRank = { None: 0, Guest: 1, Viewer: 2, Officer: 3, Command: 4, Chief: 5, Admin: 6 };
  CP.gate.can = function (lvl) { return (lvlRank[G.level] || 0) >= (lvlRank[lvl] || 99); };

  // layers this person may use, from the gate (/me). Map the board's CAD layers to the Fire & EMS views.
  function layer(re) { var l = (G.layers || []).find(function (x) { return re.test(x.url); }); return l ? l.url.replace(/\/$/, '') : ''; }
  var cp = layer(/BOCO_Command_Post\/FeatureServer$/), cad = layer(/CAD_Calls[^/]*\/FeatureServer$/), units = layer(/CAD_Units[^/]*\/FeatureServer$/);
  window.CP_CONFIG = window.CP_CONFIG || {}; if (cp) window.CP_CONFIG.serviceUrl = cp;
  A.L.cad = cad ? cad + '/0' : ''; A.L.cadUnits = units ? units + '/0' : '';
  A.hydrants = layer(/Hydrants\/FeatureServer$/) ? layer(/Hydrants\/FeatureServer$/) + '/0' : '';
  var allowed = (G.layers || []).map(function (l) { return l.url.replace(/\/$/, ''); });
  function viaGate(url) { return allowed.some(function (u) { return url === u || url.indexOf(u + '/') === 0; }); }

  A.signedIn = function () { return !!G.token; };
  A.configured = function () { return true; };
  A.auth = function () { return { token: '', user: G.email }; };
  A.token = async function () { return null; };
  A.signIn = function () { CP.native({ type: 'signin' }); };
  A.signOut = function () { CP.native({ type: 'signout' }); };
  A.req = async function (url, params, post) {
    var p = Object.assign({ f: 'json' }, params || {}); delete p.token;
    Object.keys(p).forEach(function (k) { if (typeof p[k] === 'object') p[k] = JSON.stringify(p[k]); });
    var gate = viaGate(url);
    if (!gate && /arcgis\.com\/sharing\//.test(url)) { var x = new Error('Not available in the app'); x.code = 403; throw x; }
    var target = gate ? G.url.replace(/\/$/, '') + '/arc/' + url.replace(/^https:\/\//, '') : url, h = gate ? { Authorization: 'Bearer ' + G.token } : {};
    var res;
    try { res = post ? await fetch(target, { method: 'POST', headers: h, body: new URLSearchParams(p) }) : await fetch(target + (target.indexOf('?') > 0 ? '&' : '?') + new URLSearchParams(p), { headers: h }); }
    catch (ne) { var oe = new Error('No connection'); oe.offline = true; if (CP.net) CP.net.down(); throw oe; }
    if (CP.net) CP.net.up();
    if (res.status === 401) CP.native({ type: 'signin', reason: 'expired' });
    var j = await res.json();
    if (j && j.error) { var e = new Error(j.error.message || 'ArcGIS error'); e.code = j.error.code; throw e; }
    return j;
  };
  A.connect = async function () {
    A.status = 'busy';
    try {
      var me = await fetch(G.url.replace(/\/$/, '') + '/me', { headers: { Authorization: 'Bearer ' + G.token } }).then(function (r) { return r.json().then(function (j) { j._s = r.status; return j; }); });
      if (me._s === 401 || me._s === 403) { CP.native({ type: 'signin', reason: me.error && me.error.message }); throw new Error(me.error && me.error.message || 'Signed out'); }
      if (me.error) throw new Error(me.error.message);
      if (me.token) { G.token = me.token; CP.native({ type: 'token', token: me.token, level: me.level, name: me.name }); }
      G.level = me.level; G.name = me.name || G.name;
      A.user = { username: G.email, name: G.name, email: G.email, role: G.level, privileges: [], groups: [], orgId: '' };
      if (!CP.me || !CP.me.name || CP.me.name !== G.name) CP.app ? CP.app.setMe({ name: G.name, pos: (CP.me && CP.me.pos) || '' }) : (CP.me = Object.assign(CP.me || {}, { name: G.name }));
      A.own = cp ? { url: cp } : null;
      if (A.own) { try { var li = await A.req(cp + '/0', {}); A.own.fields = {}; (li.fields || []).forEach(function (f) { A.own.fields[f.name.toLowerCase()] = 1; }); } catch (e4) {} }
      A.status = A.own ? 'on' : 'nosvc'; A.err = '';
    } catch (e) {
      A.user = A.user || { username: G.email, name: G.name, privileges: [], groups: [] }; A.own = cp ? { url: cp } : null;
      A.status = e.offline || !navigator.onLine || /fetch|network|load/i.test(e.message) ? 'offline' : 'err'; A.err = e.message;
    }
    return A.status === 'on';
  };

  // ---------- Users (Chief and Admin): who can sign in to the apps, and at what level ----------
  // The gate does the checking and the saving; this is only the screen.
  var LV_HELP = { None: 'No access', Viewer: 'Read only', Officer: 'Board view, own unit, assignments', Command: 'Runs boards, incident codes, close, export', Chief: 'Command, plus manages users up to Command', Admin: 'Everything, including Chiefs and Admins' };
  function gate(path, body) {
    return fetch(G.url.replace(/\/$/, '') + path, body ? { method: 'POST', headers: { Authorization: 'Bearer ' + G.token, 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { headers: { Authorization: 'Bearer ' + G.token } })
      .then(function (r) { return r.json().then(function (j) { if (j.error) { var e = new Error(j.error.message); e.code = r.status; throw e; } return j; }); }, function () { var e = new Error('Needs a connection.'); e.offline = true; throw e; });
  }
  CP.gate.users = async function (q) {
    var U = CP.ui, E = CP.esc;
    if (!CP.gate.can('Chief')) { U.toast('Only Chiefs and Admins can manage users.', 'err'); return; }
    var d;
    try { d = await gate('/admin/users'); } catch (e) { U.toast(E(e.message), 'err'); return; }
    var now = Date.now(), on = function (r) { return r.active !== 'No' && !(r.expires && r.expires < now); };
    function list(q) {
      q = (q || '').toLowerCase();
      var rows = d.users.filter(function (r) { return !q || [r.email, r.full_name, r.agency, r.cb_level].join(' ').toLowerCase().indexOf(q) >= 0; });
      return rows.length ? rows.map(function (r) {
        return '<button class="cbuser' + (on(r) ? '' : ' off') + '" data-uid="' + r.OBJECTID + '"' + (r.locked ? ' disabled' : '') + '><b>' + E(r.full_name || r.email) + (r.self ? ' <i>(you)</i>' : '') + '</b><span>' + E(r.email) + (r.agency ? ' · ' + E(r.agency) : '') + '</span><em>' + E(r.cb_level || 'None') + (r.mci_level && r.mci_level !== 'None' ? ' · MCI ' + E(r.mci_level) : '') + (on(r) ? '' : r.active === 'No' ? ' · OFF' : ' · EXPIRED') + (r.locked ? ' · Admin only' : '') + '</em></button>';
      }).join('') : '<div class="empty">Nobody matches.</div>';
    }
    var bg = U.modal('Users', '<p class="dim" style="margin-top:0">People on this list sign in to the Command Board app with their email and a 6-digit code. You can give levels up to <b>' + E(d.cap) + '</b>. Changes take effect at their next screen refresh.</p>' +
      '<div class="row" style="gap:8px;margin-bottom:10px"><input class="in" id="cbUq" placeholder="Search name, email, agency" autocapitalize="off" value="' + E(q || '') + '" style="flex:1"><button class="btn pri" data-uadd>Add person</button></div>' +
      '<div class="cbusers" id="cbUl">' + list(q) + '</div>', [{ label: 'Close', cls: 'ghost' }], { wide: true, nofocus: true, onOpen: function (b) {
        b.querySelector('#cbUq').addEventListener('input', function (e) { b.querySelector('#cbUl').innerHTML = list(e.target.value); });
        b.addEventListener('click', function (e) {
          var a = e.target.closest('[data-uadd]'), u = e.target.closest('[data-uid]');
          if (a) { e.preventDefault(); edit(null); }
          if (u && !u.disabled) { e.preventDefault(); edit(d.users.find(function (x) { return x.OBJECTID === +u.dataset.uid; })); }
        });
      } });
    function edit(r) {
      var x = r || { cb_level: 'Viewer', mci_level: 'None', active: 'Yes' }, self = r && r.self;
      var sel = function (id, v) { return '<select class="in" id="' + id + '"' + (self ? ' disabled' : '') + '>' + d.levels.concat(d.levels.indexOf(v) < 0 && v ? [v] : []).map(function (l) { return '<option value="' + l + '"' + (l === (v || 'None') ? ' selected' : '') + '>' + l + ' · ' + E(LV_HELP[l] || '') + '</option>'; }).join('') + '</select>'; };
      var exp = x.expires ? new Date(x.expires).toISOString().slice(0, 10) : '';
      var btns = [{ label: 'Cancel', cls: 'ghost', fn: function () { setTimeout(function () { CP.gate.users(q); }, 30); } }];
      if (r && !self) btns.push({ label: 'Remove', cls: 'red', fn: function () { setTimeout(function () { U.confirm('Remove ' + (r.full_name || r.email) + '?', 'They are signed out at their next refresh and cannot sign back in. To pause access instead, set Active to No.', 'Remove', function () { save({ op: 'remove', id: r.OBJECTID }); }, true); }, 30); } });
      btns.push({ label: r ? 'Save' : 'Add', cls: 'pri', fn: function (b) {
        var v = function (id) { return (b.querySelector('#' + id).value || '').trim(); };
        var u = { email: v('cbUe').toLowerCase(), full_name: v('cbUn'), agency: v('cbUa'), cb_level: v('cbUcb'), mci_level: v('cbUmci'), active: v('cbUon'), expires: v('cbUx') ? new Date(v('cbUx') + 'T23:59:00').getTime() : null, notes: v('cbUno') };
        if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(u.email)) { U.toast('Enter a full email address', 'err'); return false; }
        if (!u.full_name) { U.toast('Enter their name', 'err'); return false; }
        save(r ? { op: 'update', id: r.OBJECTID, user: u } : { op: 'add', user: u });
      } });
      U.modal(r ? (r.full_name || r.email) : 'Add person',
        (self ? '<p class="dim" style="margin-top:0">This is you. You can fix your name and agency; another Admin has to change your level.</p>' : '') +
        '<label class="f"><span>Email (what they sign in with)</span><input class="in" id="cbUe" type="email" autocapitalize="off" autocorrect="off" value="' + E(x.email || '') + '"' + (self ? ' disabled' : '') + '></label>' +
        '<div class="grid g2"><label class="f"><span>Name</span><input class="in" id="cbUn" value="' + E(x.full_name || '') + '"></label><label class="f"><span>Agency</span><input class="in" id="cbUa" value="' + E(x.agency || '') + '" placeholder="e.g. Botetourt Fire & EMS"></label></div>' +
        '<div class="grid g2"><label class="f"><span>Command Board</span>' + sel('cbUcb', x.cb_level) + '</label><label class="f"><span>MCI Board</span>' + sel('cbUmci', x.mci_level) + '</label></div>' +
        '<div class="grid g2"><label class="f"><span>Active</span><select class="in" id="cbUon"' + (self ? ' disabled' : '') + '><option' + (x.active !== 'No' ? ' selected' : '') + '>Yes</option><option' + (x.active === 'No' ? ' selected' : '') + '>No</option></select></label><label class="f"><span>Access ends (optional)</span><input class="in" id="cbUx" type="date" value="' + exp + '"' + (self ? ' disabled' : '') + '></label></div>' +
        '<label class="f"><span>Notes</span><input class="in" id="cbUno" value="' + E(x.notes || '') + '"></label>' +
        (r ? '' : '<p class="dim" style="font-size:12.5px">They also need the app: add their Apple ID email as a tester in TestFlight (App Store Connect → BEACON Command Board → TestFlight → BEACON Command).</p>'),
        btns, { nofocus: true });
    }
    async function save(body) {
      try { await gate('/admin/users', body); U.toast(body.op === 'remove' ? 'Removed' : 'Saved', 'ok'); } catch (e) { U.toast(E(e.message), 'err', 6000); }
      setTimeout(function () { CP.gate.users(q); }, 30);
    }
  };
  // the app tells the page when the connection comes back
  window.addEventListener('online', function () { A.connect(); });
})(window.CP = window.CP || {});
