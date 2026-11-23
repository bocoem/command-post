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
  CP.native = function (msg) { try { if (N) N.postMessage(msg); } catch (e) {} };
  var lvlRank = { None: 0, Guest: 1, Viewer: 2, Officer: 3, Command: 4, Admin: 5 };
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
  // the app tells the page when the connection comes back
  window.addEventListener('online', function () { A.connect(); });
})(window.CP = window.CP || {});
