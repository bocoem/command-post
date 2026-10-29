/* COMMAND POST — Live Apps side panel: Overwatch, Stormwatch and other EM apps shown inside Command Post. */
(function (CP) {
  'use strict';
  var I = CP.ui.icon, E = CP.esc;
  var X = 'https://experience.arcgis.com/experience/';
  var LIST = [
    { k: 'overwatch', n: 'Overwatch', d: 'Live CAD, VDOT, power, weather', u: X + '299778f2f57a472eb478ac1bf21bb424', sign: true },
    { k: 'stormwatch', n: 'Stormwatch', d: 'Public storm reports', u: X + 'c8f438b974da4e2b9d9fd01893687ec4' },
    { k: 'responder', n: 'Stormwatch Responder', d: 'Responder storm reports', u: X + '0f7a1564b1db45c2adcb469b56973330' },
    { k: 'eoc', n: 'EOC app', d: 'SitReps, lifelines, checklists', u: X + '0ed836c463984dcc86ab3e1a6d36831a', sign: true }
  ];
  var P = CP.liveApps = { open: false, cur: 'overwatch', wide: false, made: {} };
  try { var pr = CP.store.prefs(); P.cur = pr.appsCur || 'overwatch'; P.wide = !!pr.appsWide; } catch (e) {}

  P.paint = function () {
    var el = document.getElementById('apps'); if (!el) return;
    document.body.classList.toggle('apps-open', P.open);
    document.body.classList.toggle('apps-wide', P.wide);
    var tab = document.getElementById('appstab');
    if (tab) tab.innerHTML = I('map') + '<span>LIVE APPS</span>';
    if (!el.dataset.built) {
      el.dataset.built = '1';
      el.innerHTML = '<div class="chead"><b>' + I('map') + ' Live apps</b><button class="ibtn" data-act="appsWide" title="Wider / narrower">' + I('eye') + '</button><a class="ibtn" id="appsNew" href="#" target="_blank" rel="noopener" title="Open in a new tab">' + I('link') + '</a><button class="ibtn" data-act="appsToggle" title="Close">' + I('x') + '</button></div>' +
        '<div class="cfilt" id="appsSw">' + LIST.map(function (a) { return '<button data-act="appsShow" data-a="' + a.k + '" title="' + E(a.d) + '">' + E(a.n) + '</button>'; }).join('') + '</div>' +
        '<div class="appsnote" id="appsNote"></div><div class="appframes" id="appFrames"></div>';
    }
    var a = LIST.find(function (x) { return x.k === P.cur; }) || LIST[0];
    el.querySelectorAll('#appsSw button').forEach(function (b) { b.classList.toggle('on', b.dataset.a === a.k); });
    el.querySelector('#appsNew').href = a.u;
    el.querySelector('#appsNote').innerHTML = a.sign ? 'If it asks you to sign in, use <b>Sign in</b> inside the panel (it opens a small ArcGIS window). Or <a href="' + a.u + '" target="_blank" rel="noopener">open it in a new tab</a>.' : '';
    if (P.open) {
      var box = el.querySelector('#appFrames');
      if (!P.made[a.k]) { var f = document.createElement('iframe'); f.src = a.u; f.dataset.k = a.k; f.title = a.n; f.setAttribute('allow', 'geolocation; fullscreen; clipboard-write'); box.appendChild(f); P.made[a.k] = f; }
      Object.keys(P.made).forEach(function (k) { P.made[k].style.display = k === a.k ? 'block' : 'none'; });
    }
  };
  P.toggle = function (k) {
    if (k) { P.cur = k; P.open = true; } else P.open = !P.open;
    if (P.open && CP.calls && CP.calls.open) CP.calls.toggle();
    CP.store.setPref('appsCur', P.cur); P.paint();
    setTimeout(function () { var m = CP.app && CP.app._big; if (m) m.invalidateSize(); }, 260);
  };
  CP.extendAppsActs = function (act) {
    act.appsToggle = function () { P.toggle(); };
    act.appsShow = function (k) { P.cur = k; CP.store.setPref('appsCur', k); P.paint(); };
    act.appsWide = function () { P.wide = !P.wide; CP.store.setPref('appsWide', P.wide); P.paint(); };
    var ct = act.callsToggle; act.callsToggle = function () { if (P.open) { P.open = false; P.paint(); } ct(); };
  };
  P.LIST = LIST;
})(window.CP);
