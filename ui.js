/* COMMAND POST — UI helpers: icons, bound fields, editable tables, modal, toast */
(function (CP) {
  'use strict';
  var E = CP.esc;
  var ui = CP.ui = {};

  var P = {
    home: 'M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
    dash: 'M3 3h8v8H3zM13 3h8v5h-8zM13 10h8v11h-8zM3 13h8v8H3z',
    brief: 'M4 4h16v16H4zM8 8h8M8 12h8M8 16h5',
    target: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 4a6 6 0 1 0 0 12 6 6 0 0 0 0-12zm0 4a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
    org: 'M9 3h6v4H9zM3 17h6v4H3zM15 17h6v4h-6zM12 7v5M6 17v-5h12v5',
    truck: 'M2 7h11v9H2zM13 10h4l4 4v2h-8zM6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
    list: 'M8 6h13M8 12h13M8 18h13M3 6h1M3 12h1M3 18h1',
    radio: 'M5 9h14v12H5zM9 9l8-6M9 15h6M9 18h6',
    med: 'M10 3h4v7h7v4h-7v7h-4v-7H3v-4h7z',
    shield: 'M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z',
    log: 'M4 4h12l4 4v12H4zM8 10h8M8 14h8M8 18h5',
    map: 'M9 4L3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14',
    flag: 'M5 21V4M5 4h12l-2 4 2 4H5',
    req: 'M3 6h18M3 12h18M3 18h12M19 15v6M16 18h6',
    msg: 'M4 4h16v12H8l-4 4z',
    news: 'M4 5h13v14H6a2 2 0 0 1-2-2zM17 9h3v8a2 2 0 0 1-2 2M8 9h5M8 13h5M8 16h3',
    lifeline: 'M3 12h4l2-6 4 12 2-6h6',
    report: 'M6 2h9l5 5v15H6zM14 2v6h6M9 13h6M9 17h6',
    forms: 'M7 3h10v4H7zM5 5H4v16h16V5h-1M8 11h8M8 15h8',
    cloud: 'M7 18h10a4 4 0 0 0 .5-7.97A6 6 0 0 0 6 9a4.5 4.5 0 0 0 1 9z',
    gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
    plus: 'M12 5v14M5 12h14', x: 'M6 6l12 12M18 6L6 18', trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
    print: 'M6 9V3h12v6M6 18H4v-7h16v7h-2M7 14h10v7H7z', down: 'M12 3v12M7 10l5 5 5-5M4 21h16', up: 'M12 21V9M7 14l5-5 5 5M4 3h16',
    eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
    menu: 'M3 6h18M3 12h18M3 18h18', check: 'M5 12l5 5 9-10', clock: 'M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
    link: 'M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1',
    refresh: 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7', pin: 'M12 22s7-6.6 7-12a7 7 0 1 0-14 0c0 5.4 7 12 7 12zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
    copy: 'M9 9h11v11H9zM5 15H4V4h11v1', play: 'M7 4l13 8-13 8z', users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
    tools: 'M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z',
    build: 'M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6', warn: 'M12 3l10 18H2zM12 10v5M12 18v.5', demob: 'M15 3h6v6M10 14L21 3M21 14v7H3V3h7'
  };
  ui.icon = function (n, cls) { return '<svg class="ic ' + (cls || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="' + (P[n] || P.list) + '"/></svg>'; };

  // ---------- bound fields ----------
  function attrs(o) { o = o || {}; return (o.ph ? ' placeholder="' + E(o.ph) + '"' : '') + (o.rr ? ' data-rr="1"' : '') + (o.ro ? ' readonly' : '') + (o.list ? ' list="' + o.list + '"' : ''); }
  function wrap(label, inner, o) { o = o || {}; return label === null ? inner : '<label class="f' + (o.cls ? ' ' + o.cls : '') + '"><span>' + E(label) + (o.hint ? ' <i class="dim" style="text-transform:none;letter-spacing:0;font-weight:500">' + E(o.hint) + '</i>' : '') + '</span>' + inner + '</label>'; }
  ui.text = function (inc, path, label, o) { var v = CP.getPath(inc, path); return wrap(label, '<input class="in" data-p="' + path + '" value="' + E(v) + '"' + attrs(o) + '>', o); };
  ui.num = function (inc, path, label, o) { var v = CP.getPath(inc, path); return wrap(label, '<input class="in" type="number" data-t="n" data-p="' + path + '" value="' + E(v) + '"' + attrs(o) + '>', o); };
  ui.area = function (inc, path, label, o) { var v = CP.getPath(inc, path); o = o || {}; return wrap(label, '<textarea class="in" data-p="' + path + '" style="min-height:' + (o.h || 90) + 'px"' + attrs(o) + '>' + E(v) + '</textarea>', o); };
  ui.dt = function (inc, path, label, o) { var v = CP.getPath(inc, path); return wrap(label, '<input class="in" type="datetime-local" data-t="dt" data-p="' + path + '" value="' + CP.localInput(v) + '"' + attrs(o) + '>', o); };
  ui.sel = function (inc, path, label, opts, o) {
    var v = CP.getPath(inc, path); o = o || {};
    var h = '<select class="in" data-p="' + path + '"' + (o.num ? ' data-t="n"' : '') + attrs(o) + '>' + (o.blank ? '<option value=""></option>' : '');
    opts.forEach(function (x) { var val = typeof x === 'object' ? x.v : x, lab = typeof x === 'object' ? (x.label || x.v) : x; h += '<option value="' + E(val) + '"' + (String(val) === String(v) ? ' selected' : '') + '>' + E(lab) + '</option>'; });
    return wrap(label, h + '</select>', o);
  };
  ui.chk = function (inc, path, label, o) { var v = CP.getPath(inc, path); return '<label class="chk"><input type="checkbox" data-t="b" data-p="' + path + '"' + (v ? ' checked' : '') + attrs(o) + '> ' + E(label) + '</label>'; };

  // ---------- editable table ----------
  // cfg: {key, rows, cols:[{f,l,t:'text|num|sel|area|dt|chk|ro', o:[], w, ph, fmt}], add:'label', empty:'text', extra:fn(row)->html, rr:bool}
  ui.table = function (cfg) {
    var rows = CP.alive(cfg.rows);
    var h = '<div class="tbl-wrap"><table class="t"><thead><tr>';
    cfg.cols.forEach(function (c) { h += '<th' + (c.w ? ' style="width:' + c.w + '"' : '') + '>' + E(c.l) + '</th>'; });
    h += '<th></th></tr></thead><tbody>';
    if (!rows.length) h += '<tr><td colspan="' + (cfg.cols.length + 1) + '" class="muted" style="padding:16px;text-align:center">' + E(cfg.empty || 'Nothing yet.') + '</td></tr>';
    rows.forEach(function (r, i) {
      h += '<tr>';
      cfg.cols.forEach(function (c) {
        var p = cfg.key + '@' + r.id + '.' + c.f, v = r[c.f], rr = (c.rr || cfg.rr) ? ' data-rr="1"' : '';
        var ph = c.ph ? ' placeholder="' + E(c.ph) + '"' : '';
        var cell;
        if (c.t === 'ro') cell = c.fmt ? c.fmt(r, i) : E(v);
        else if (c.t === 'sel') { cell = '<select class="in" data-p="' + p + '"' + rr + '>' + (c.blank !== false ? '<option value=""></option>' : '') + (typeof c.o === 'function' ? c.o(r) : c.o).map(function (x) { var val = typeof x === 'object' ? x.v : x, lab = typeof x === 'object' ? (x.label || x.v) : x; return '<option value="' + E(val) + '"' + (String(val) === String(v == null ? '' : v) ? ' selected' : '') + '>' + E(lab) + '</option>'; }).join('') + '</select>'; }
        else if (c.t === 'area') cell = '<textarea class="in" data-p="' + p + '"' + rr + ph + '>' + E(v) + '</textarea>';
        else if (c.t === 'dt') cell = '<input class="in" type="datetime-local" data-t="dt" data-p="' + p + '" value="' + CP.localInput(v) + '"' + rr + '>';
        else if (c.t === 'chk') cell = '<input type="checkbox" data-t="b" data-p="' + p + '"' + (v ? ' checked' : '') + rr + '>';
        else if (c.t === 'num') cell = '<input class="in" type="number" data-t="n" data-p="' + p + '" value="' + E(v) + '"' + rr + ph + ' style="min-width:60px">';
        else cell = '<input class="in" data-p="' + p + '" value="' + E(v) + '"' + rr + ph + (c.list ? ' list="' + c.list + '"' : '') + '>';
        h += '<td' + (c.w ? ' style="min-width:' + c.w + '"' : '') + '>' + cell + '</td>';
      });
      h += '<td class="act">' + (cfg.extra ? cfg.extra(r) : '') + '<button class="ibtn del" title="Remove" data-del="' + cfg.key + '|' + r.id + '">' + ui.icon('trash') + '</button></td></tr>';
    });
    h += '</tbody></table></div>';
    if (cfg.add) h += '<div style="margin-top:8px"><button class="btn sm" data-add="' + cfg.key + '"' + (cfg.tpl ? ' data-tpl="' + cfg.tpl + '"' : '') + '>' + ui.icon('plus') + E(cfg.add) + '</button></div>';
    return h;
  };

  ui.chipFor = function (list, v) { var x = list.find(function (s) { return s.v === v; }); return '<span class="chip ' + (x ? x.c : 'mute') + '">' + E(v || '—') + '</span>'; };
  ui.llClass = function (v) { var x = CP.LIFELINE_STATUS.find(function (s) { return s.v === v; }); return x ? x.c : 'unk'; };

  // ---------- modal ----------
  ui.modal = function (title, body, buttons, o) {
    o = o || {};
    ui.closeModal();
    var bg = document.createElement('div'); bg.className = 'modal-bg'; bg.id = 'modal';
    bg.innerHTML = '<div class="modal' + (o.wide ? ' wide' : '') + '"><div class="mh"><h2>' + E(title) + '</h2><button class="ibtn x" data-close>' + ui.icon('x') + '</button></div><div class="mb">' + body + '</div>' +
      (buttons && buttons.length ? '<div class="mf">' + buttons.map(function (b, i) { return '<button class="btn ' + (b.cls || '') + '" data-mb="' + i + '">' + b.label + '</button>'; }).join('') + '</div>' : '') + '</div>';
    document.body.appendChild(bg);
    bg.addEventListener('click', function (e) {
      if (e.target === bg && !o.sticky) return ui.closeModal();
      if (e.target.closest('[data-close]')) return ui.closeModal();
      var mb = e.target.closest('[data-mb]');
      if (mb) { var b = buttons[+mb.dataset.mb]; if (!b.fn || b.fn(bg) !== false) ui.closeModal(); }
    });
    var f = bg.querySelector('input,textarea,select'); if (f && !o.nofocus) setTimeout(function () { f.focus(); }, 30);
    if (o.onOpen) o.onOpen(bg);
    return bg;
  };
  ui.closeModal = function () { var m = document.getElementById('modal'); if (m) m.remove(); };
  ui.confirm = function (title, text, okLabel, fn, danger) { ui.modal(title, '<p style="margin:0">' + text + '</p>', [{ label: 'Cancel', cls: 'ghost' }, { label: okLabel || 'OK', cls: danger ? 'red' : 'pri', fn: fn }]); };
  ui.toast = function (msg, kind, ms) {
    var c = document.querySelector('.toasts'); if (!c) { c = document.createElement('div'); c.className = 'toasts'; document.body.appendChild(c); }
    var t = document.createElement('div'); t.className = 'toast ' + (kind || ''); t.innerHTML = msg; c.appendChild(t);
    setTimeout(function () { t.style.opacity = '0'; t.style.transition = 'opacity .4s'; setTimeout(function () { t.remove(); }, 450); }, ms || 3200);
  };
  ui.val = function (root, name) { var el = root.querySelector('[name="' + name + '"]'); if (!el) return ''; return el.type === 'checkbox' ? el.checked : el.value.trim(); };

  ui.download = function (name, content, type) {
    var blob = content instanceof Blob ? content : new Blob([content], { type: type || 'text/plain' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  };
  ui.csv = function (rows) { return rows.map(function (r) { return r.map(function (c) { c = c == null ? '' : String(c); return /[",\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; }).join(','); }).join('\r\n'); };
})(window.CP);
