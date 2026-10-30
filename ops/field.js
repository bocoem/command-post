/* EM OPS — phone-first field helpers
   - OPS.scan(): camera scanner for QR codes and barcodes (BarcodeDetector where the phone has it, jsQR otherwise), with typed entry as a fallback
   - QR tags for county inventory and volunteer badges (print on label stock or card)
   - Scan a tag to check a unit or volunteer in or out
   - Scan a triage tag barcode into the MCI triage screen
   - Quick hand-out screen for PODs: big buttons, one tap per case or household */
(function (CP) {
  'use strict';
  var OPS = CP.ops, A = CP.arc, U = CP.ui, E = CP.esc, I = U.icon;
  var F = OPS.field = {};
  var PFX = 'BOCOEM:';

  // ---------- scanner ----------
  function loadJsQR() { return window.jsQR ? Promise.resolve() : new Promise(function (res, rej) { var s = document.createElement('script'); s.src = 'lib/jsQR.js'; s.onload = res; s.onerror = function () { rej(new Error('Scanner did not load')); }; document.head.appendChild(s); }); }
  OPS.scan = function (o) {
    o = o || {};
    return new Promise(function (resolve) {
      var done = false, stream = null, raf = null, det = null;
      var bg = U.modal(o.title || 'Scan', '<div class="scanbox"><video id="scV" playsinline muted></video><div class="scanframe"></div></div><p class="dim" id="scMsg" style="text-align:center;margin:8px 0">' + E(o.hint || 'Point the camera at the code.') + '</p>' +
        '<div class="row"><input class="in grow" id="scTxt" placeholder="' + E(o.typeHint || 'Or type the number') + '" inputmode="text"><button class="btn pri" id="scUse">Use</button></div>',
        [{ label: 'Cancel', cls: 'ghost', fn: function () { finish(null); } }], { nofocus: true });
      function finish(v) { if (done) return; done = true; if (raf) cancelAnimationFrame(raf); if (stream) stream.getTracks().forEach(function (t) { t.stop(); }); U.closeModal(); resolve(v ? String(v).trim() : null); }
      bg.querySelector('#scUse').onclick = function () { var v = bg.querySelector('#scTxt').value; if (v) finish(v); };
      bg.querySelector('#scTxt').addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target.value) finish(e.target.value); });
      var obs = new MutationObserver(function () { if (!document.body.contains(bg)) { obs.disconnect(); if (!done) { done = true; if (raf) cancelAnimationFrame(raf); if (stream) stream.getTracks().forEach(function (t) { t.stop(); }); resolve(null); } } });
      obs.observe(document.body, { childList: true, subtree: true });
      var v = bg.querySelector('#scV'), msg = bg.querySelector('#scMsg');
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { msg.textContent = 'No camera here. Type the number instead.'; return; }
      navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }).then(async function (s) {
        stream = s; v.srcObject = s; await v.play().catch(function () {});
        if ('BarcodeDetector' in window) { try { det = new window.BarcodeDetector({ formats: ['qr_code', 'code_128', 'code_39', 'pdf417', 'data_matrix', 'ean_13', 'upc_a', 'codabar', 'itf'] }); } catch (e) { det = null; } }
        if (!det) await loadJsQR().catch(function () { msg.textContent = 'Scanner did not load. Type the number instead.'; });
        var c = document.createElement('canvas'), x = c.getContext('2d', { willReadFrequently: true });
        var tick = async function () {
          if (done) return;
          if (v.readyState >= 2) {
            try {
              if (det) { var r = await det.detect(v); if (r && r.length) return finish(r[0].rawValue); }
              else if (window.jsQR) { c.width = v.videoWidth; c.height = v.videoHeight; x.drawImage(v, 0, 0); var d = x.getImageData(0, 0, c.width, c.height), q = window.jsQR(d.data, d.width, d.height, { inversionAttempts: 'dontInvert' }); if (q && q.data) return finish(q.data); }
            } catch (e) {}
          }
          raf = requestAnimationFrame(function () { setTimeout(tick, det ? 120 : 200); });
        };
        tick();
      }).catch(function () { msg.textContent = 'Camera blocked. Allow the camera for this site, or type the number.'; });
    });
  };
  F.parse = function (t) { var m = /^BOCOEM:(RES|VOL):(.+)$/.exec(t || ''); return m ? { kind: m[1], id: m[2] } : { kind: 'TXT', id: t }; };

  // ---------- QR tags ----------
  function qrImg(text, cell) { try { var q = window.qrcode(0, 'M'); q.addData(text); q.make(); return q.createImgTag(cell || 4, 4); } catch (e) { return ''; } }
  F.printTags = function (title, items) { // items: [{code, top, sub}]
    if (!items.length) { U.toast('Nothing to print', 'err'); return; }
    OPS.print(title, items.length + ' tags · cut along the lines', '<style>.tg{display:inline-block;width:2.3in;height:1.25in;border:1px dashed #999;margin:2px;padding:6px;box-sizing:border-box;vertical-align:top;overflow:hidden}.tg img{float:left;width:.95in;height:.95in;margin-right:6px}.tg b{display:block;font-size:12px}.tg span{font-size:10px;color:#333}.tg i{display:block;font-size:8px;color:#666;margin-top:4px;font-style:normal}</style>' +
      items.map(function (t) { return '<div class="tg">' + qrImg(t.code, 3) + '<b>' + E(t.top) + '</b><span>' + E(t.sub || '') + '</span><i>Botetourt County EM · scan to check in</i></div>'; }).join(''));
  };
  OPS.act.resTags = async function () {
    var r = await OPS.rows('resources', '1=1', { order: 'name', n: 2000 }).catch(function (e) { U.toast(E(e.message), 'err'); return null; }); if (!r) return;
    F.printTags('County inventory QR tags', r.filter(function (x) { return x.OBJECTID > 0; }).map(function (x) { return { code: PFX + 'RES:' + x.OBJECTID, top: (x.res_id ? x.res_id + ' · ' : '') + x.name, sub: [x.kind, x.owner].filter(Boolean).join(' · ') }; }));
  };
  OPS.act.volTags = async function () {
    var r = await OPS.rows('volunteers', "status<>'Inactive'", { order: 'last_name', n: 3000 }).catch(function (e) { U.toast(E(e.message), 'err'); return null; }); if (!r) return;
    F.printTags('Volunteer badges', r.filter(function (x) { return x.vol_id; }).map(function (x) { return { code: PFX + 'VOL:' + x.vol_id, top: x.first_name + ' ' + x.last_name, sub: [x.team, x.vol_id].filter(Boolean).join(' · ') }; }));
  };

  // ---------- scan to check in / out ----------
  OPS.act.ciScan = async function () {
    if (!OPS.inc) { U.toast('Pick the incident first', 'err'); return; }
    var t = await OPS.scan({ title: 'Scan a unit tag or volunteer badge', typeHint: 'Or type a unit number or volunteer ID' }); if (!t) return;
    var p = F.parse(t), on = OPS.arr(OPS.ci.rows()).filter(function (r) { return r.status !== 'Checked Out'; });
    if (p.kind === 'RES' || p.kind === 'TXT') {
      var res = p.kind === 'RES' ? (await OPS.rows('resources', 'OBJECTID=' + (+p.id)))[0] : (await OPS.rows('resources', 'UPPER(res_id)=' + A.sq(String(p.id).toUpperCase()), { n: 1 }))[0];
      if (res) {
        var hit = on.find(function (r) { return r.res_id === String(res.OBJECTID); });
        if (hit) return OPS.act.ciOut(hit.OBJECTID);
        return OPS.act.ciNew().then(function () { pick('INV ' + (res.res_id || res.OBJECTID) + ' · ' + res.name); });
      }
    }
    if (p.kind === 'VOL' || p.kind === 'TXT') {
      var vol = (await OPS.rows('volunteers', 'vol_id=' + A.sq(p.id), { n: 1 }).catch(function () { return []; }))[0];
      if (vol) {
        var vh = on.find(function (r) { return r.vol_id === vol.vol_id; });
        if (vh) return OPS.act.ciOut(vh.OBJECTID);
        return OPS.act.ciNew().then(function () { pick('VOL ' + vol.vol_id + ' · ' + vol.first_name + ' ' + vol.last_name); });
      }
    }
    U.toast('No county unit or volunteer matches ' + E(t) + '. Check them in by hand.', 'err', 6000);
  };
  function pick(v) { setTimeout(function () { var el = document.getElementById('ciPick'); if (el) { el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); } }, 60); }

  // ---------- MCI: scan the triage tag number ----------
  document.addEventListener('click', async function (e) {
    var b = e.target.closest('[data-scan-into]'); if (!b) return; e.preventDefault();
    var bg = b.closest('.modal') || document, name = b.dataset.scanInto;
    var t = await OPS.scan({ title: 'Scan triage tag', hint: 'Point at the barcode on the triage tag.', typeHint: 'Or type the tag number' });
    if (!t) return;
    var el = document.querySelector('[name="' + name + '"]') || bg.querySelector('[name="' + name + '"]'); if (el) { el.value = t; el.dispatchEvent(new Event('input', { bubbles: true })); }
  });

  // ---------- PODs: quick hand-out (one tap per item) ----------
  OPS.act.podQuick = function (oid) {
    if (!OPS.inc) { U.toast('Pick the incident first', 'err'); return; }
    var x = OPS.arr(OPS.podsList && OPS.podsList()).find(function (s) { return s.OBJECTID === +oid; }) || { OBJECTID: +oid, name: 'POD' };
    var items = OPS.LISTS.commodity || ['Water (cases)', 'MREs / meals', 'Ice (bags)', 'Tarps'];
    var counts = {}, hh = 0;
    var body = '<div class="podq"><div class="podhh"><span>Households served</span><div class="row"><button class="btn big" data-q="hh|-1">−</button><b id="pqhh">0</b><button class="btn big pri" data-q="hh|1">+1 car</button></div></div>' +
      items.map(function (c) { return '<div class="podrow"><span>' + E(c) + '</span><div class="row"><button class="btn" data-q="' + E(c) + '|-1">−</button><b data-ct="' + E(c) + '">0</b><button class="btn pri" data-q="' + E(c) + '|1">+1</button><button class="btn" data-q="' + E(c) + '|5">+5</button></div></div>'; }).join('') + '</div>' +
      '<p class="dim" style="font-size:12.5px">Tap as each car or family is served. Save every few minutes or at shift change; it works offline.</p>';
    var bg = U.modal('Hand out · ' + x.name, body, [{ label: 'Cancel', cls: 'ghost' }, { label: I('check') + 'Save hand-outs', cls: 'pri', fn: function () {
      var rows = Object.keys(counts).filter(function (c) { return counts[c] > 0; }).map(function (c, i) { return Object.assign(OPS.incFix(), { pod_oid: x.OBJECTID, pod: x.name, txn: 'Distributed', txn_time: Date.now(), commodity: c, qty: counts[c], households: i === 0 ? hh : 0, recorded_by: OPS.me() }); });
      if (!rows.length) { U.toast('Nothing tapped yet', 'err'); return false; }
      OPS.saveMany('podledger', rows).then(function () { OPS.bust('podledger'); U.toast('Saved ' + rows.length + ' hand-out line' + (rows.length > 1 ? 's' : '') + (hh ? ' · ' + hh + ' households' : ''), 'ok'); OPS.repaint(); }).catch(function (e) { U.toast(E(e.message), 'err', 7000); });
    } }], { sticky: true, nofocus: true });
    bg.addEventListener('click', function (e) {
      var b = e.target.closest('[data-q]'); if (!b) return; e.preventDefault();
      var p = b.dataset.q.split('|'), d = +p[1];
      if (p[0] === 'hh') { hh = Math.max(0, hh + d); bg.querySelector('#pqhh').textContent = hh; }
      else { counts[p[0]] = Math.max(0, (counts[p[0]] || 0) + d); bg.querySelector('[data-ct="' + p[0].replace(/"/g, '\\"') + '"]').textContent = counts[p[0]]; }
      if (navigator.vibrate) navigator.vibrate(15);
    });
  };
})(window.CP);
