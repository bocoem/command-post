/* COMMAND POST — Live Apps side panel: Overwatch, Stormwatch and other EM apps shown inside Command Post. */
(function (CP) {
  'use strict';
  var I = CP.ui.icon, E = CP.esc;
  var X = 'https://experience.arcgis.com/experience/';
  var LIST = [
    { k: 'overwatch', n: 'Overwatch', d: 'Live CAD, VDOT, power, weather', u: X + '299778f2f57a472eb478ac1bf21bb424', native: true },
    { k: 'responder', n: 'Stormwatch Responder', d: 'Responder storm reports', u: X + '0f7a1564b1db45c2adcb469b56973330' }
  ];
  var P = CP.liveApps = { open: false, cur: 'overwatch', wide: false, made: {} };
  try { var pr = CP.store.prefs(); P.cur = pr.appsCur === 'responder' ? 'responder' : 'overwatch'; P.wide = !!pr.appsWide; } catch (e) {}

  P.paint = function () {
    var el = document.getElementById('apps'); if (!el) return;
    document.body.classList.toggle('apps-open', P.open);
    document.body.classList.toggle('apps-wide', P.wide);
    var tab = document.getElementById('appstab');
    if (tab) tab.innerHTML = I('map') + '<span>' + (LIST.length === 1 ? LIST[0].n.toUpperCase() : 'LIVE APPS') + '</span>';
    if (!el.dataset.built) {
      el.dataset.built = '1';
      el.innerHTML = '<div class="chead"><b>' + I('map') + ' ' + (LIST.length === 1 ? E(LIST[0].n) : 'Live apps') + '</b><button class="ibtn" data-act="appsWide" title="Wider / narrower">' + I('eye') + '</button><a class="ibtn" id="appsNew" href="#" target="_blank" rel="noopener" title="Open in a new tab">' + I('link') + '</a><button class="ibtn" data-act="appsToggle" title="Close">' + I('x') + '</button></div>' +
        '<div class="cfilt" id="appsSw"' + (LIST.length === 1 ? ' style="display:none"' : '') + '>' + LIST.map(function (a) { return '<button data-act="appsShow" data-a="' + a.k + '" title="' + E(a.d) + '">' + E(a.n) + '</button>'; }).join('') + '</div>' +
        '<div class="appsnote" id="appsNote"></div><div class="appframes" id="appFrames"></div>';
    }
    var a = LIST.find(function (x) { return x.k === P.cur; }) || LIST[0];
    el.querySelectorAll('#appsSw button').forEach(function (b) { b.classList.toggle('on', b.dataset.a === a.k); });
    el.querySelector('#appsNew').href = a.u;
    el.querySelector('#appsNote').innerHTML = a.native ? 'Live Overwatch picture, loaded with your Command Post sign-in. <a href="' + a.u + '" target="_blank" rel="noopener">Open the full Overwatch app</a>.' : a.sign ? 'County sign-in app. If it stays on the loading bars, your browser is blocking the sign-in inside Command Post. <a href="#" data-act="appsBeside" data-a="' + a.k + '">Open it beside Command Post</a>.' : '';
    if (P.open) {
      var box = el.querySelector('#appFrames');
      if (!P.made[a.k] && a.native) { var nb = document.createElement('div'); nb.dataset.k = a.k; nb.className = 'appnative'; box.appendChild(nb); P.made[a.k] = nb; CP.ow.mount(nb); }
      if (!P.made[a.k]) { var f = document.createElement('iframe'); f.src = a.u; f.dataset.k = a.k; f.title = a.n; f.setAttribute('allow', 'geolocation; fullscreen; clipboard-write'); box.appendChild(f); P.made[a.k] = f;
        if (a.sign) { var ov = document.createElement('div'); ov.className = 'appstall'; ov.dataset.k = a.k; ov.style.display = 'none';
          ov.innerHTML = '<div><b>' + E(a.n) + ' needs your county sign-in</b><p>Browsers block ArcGIS sign-in inside another site, so ' + E(a.n) + ' may not load in this panel. Open it in its own window, docked beside Command Post.</p><button class="btn pri" data-act="appsBeside" data-a="' + a.k + '">Open beside Command Post</button> <button class="btn" data-act="appsWait" data-a="' + a.k + '">Keep waiting</button></div>';
          box.appendChild(ov); setTimeout(function () { if (!ov.dataset.dismiss) { ov.dataset.show = '1'; P.paint(); } }, 12000); } }
      Object.keys(P.made).forEach(function (k) { P.made[k].style.display = k === a.k ? (P.made[k].tagName === 'DIV' ? 'flex' : 'block') : 'none'; });
      if (a.native && CP.ow.map) setTimeout(function () { CP.ow.map.invalidateSize(); }, 280);
      box.querySelectorAll('.appstall').forEach(function (o) { o.style.display = (o.dataset.k === a.k && o.dataset.show && !o.dataset.dismiss) ? 'flex' : 'none'; });
    }
  };
  P.beside = function (k) {
    var a = LIST.find(function (x) { return x.k === k; }) || LIST[0];
    var sw = screen.availWidth || 1600, sh = screen.availHeight || 900, w = Math.round(sw * 0.45);
    var win = window.open(a.u, 'bcem_' + a.k, 'popup,width=' + w + ',height=' + sh + ',left=' + (sw - w) + ',top=0');
    if (!win) { window.open(a.u, '_blank', 'noopener'); return; }
    try { window.moveTo(0, 0); window.resizeTo(sw - w, sh); } catch (e) {}
    win.focus(); if (P.open) { P.open = false; P.paint(); }
    CP.ui.toast(a.n + ' opened in its own window on the right');
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
    act.appsShow0 = act.appsShow; act.appsShow = function (k) { act.appsShow0(k); if (k === 'overwatch' && CP.ow.box) { CP.ow.paint(); CP.ow.refresh(); } };
    act.appsBeside = function (k) { P.beside(k || P.cur); };
    act.appsWait = function (k) { var o = document.querySelector('.appstall[data-k="' + k + '"]'); if (o) o.dataset.dismiss = '1'; P.paint(); };
    act.appsWide = function () { P.wide = !P.wide; CP.store.setPref('appsWide', P.wide); P.paint(); };
    var ct = act.callsToggle; act.callsToggle = function () { if (P.open) { P.open = false; P.paint(); } ct(); };
  };
  P.LIST = LIST;
})(window.CP);
