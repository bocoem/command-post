/* Family check-in (public): kiosk tablet or phone QR. Writes to the add-only public view of PROT_FamilyIntake. No sign-in. */
(function () {
  'use strict';
  var q = new URLSearchParams(location.search), SVC = q.get('svc') || '', SITE = q.get('site') || 'Reunification Center', INC = q.get('incident') || '', KIOSK = q.get('kiosk') === '1';
  var lang = 'en', st = { step: 'reason' }, idle = null;
  var T = {
    en: { t: 'Family Check-In', sub: 'Botetourt County Emergency Management', q: 'Why are you here today?', look: 'I am looking for someone', safe: 'I am safe / checking in', pick: 'I am here to pick up a child', other: 'Something else',
      fn: 'Your first name', ln: 'Your last name', ph: 'Phone number we can reach you at', em: 'Email (optional)', lg: 'Language you prefer', ps: 'How many people are with you?', who_look: 'Who are you looking for? Names, ages, and what they look like or were wearing', who_safe: 'Who is with you? (names and ages)', who_pick: 'Child\'s name, age, and school or where they were', kids: 'Is a child (under 18) involved?', yes: 'Yes', no: 'No', last: 'Where and when were they last seen?', now: 'Where are you staying now?', needs: 'Do you need anything? (medical, medicine, a ride, a place to stay)', consent: 'It is OK to tell family members who ask for me where I am', send: 'Send', back: 'Back',
      done: 'Thank you. You are checked in.', num: 'Your check-in number', next: 'Please show this number to a staff member. We will call you as soon as we have information.', child: 'If a child is missing, also call 911 and the National Center for Missing & Exploited Children: 1-800-THE-LOST (1-800-843-5678).', newp: 'Start over for the next person', req: 'Please fill in your name and phone.', err: 'Could not send. Please tell a staff member.', priv: 'Your information goes only to emergency management, social services and law enforcement staff working on reunification.' },
    es: { t: 'Registro de Familias', sub: 'Manejo de Emergencias del Condado de Botetourt', q: '¿Por qué está aquí hoy?', look: 'Estoy buscando a alguien', safe: 'Estoy a salvo / me registro', pick: 'Vengo a recoger a un niño', other: 'Otra cosa',
      fn: 'Su nombre', ln: 'Su apellido', ph: 'Teléfono donde podemos llamarle', em: 'Correo electrónico (opcional)', lg: 'Idioma que prefiere', ps: '¿Cuántas personas están con usted?', who_look: '¿A quién busca? Nombres, edades y cómo es o qué ropa llevaba', who_safe: '¿Quién está con usted? (nombres y edades)', who_pick: 'Nombre del niño, edad y escuela o dónde estaba', kids: '¿Hay un niño (menor de 18) involucrado?', yes: 'Sí', no: 'No', last: '¿Dónde y cuándo le vieron por última vez?', now: '¿Dónde se está quedando ahora?', needs: '¿Necesita algo? (médico, medicina, transporte, alojamiento)', consent: 'Está bien decirles a mis familiares que pregunten por mí dónde estoy', send: 'Enviar', back: 'Atrás',
      done: 'Gracias. Ya está registrado.', num: 'Su número de registro', next: 'Muestre este número a un miembro del personal. Le llamaremos en cuanto tengamos información.', child: 'Si falta un niño, llame también al 911 y al Centro Nacional para Niños Desaparecidos y Explotados: 1-800-THE-LOST (1-800-843-5678).', newp: 'Comenzar de nuevo para la siguiente persona', req: 'Escriba su nombre y teléfono.', err: 'No se pudo enviar. Avise a un miembro del personal.', priv: 'Su información va solo al personal de emergencias, servicios sociales y policía que trabaja en la reunificación.' }
  };
  var REASON = { look: 'Looking for someone', safe: 'Checking in safe', pick: 'Picking up a child', other: 'Other' };
  function t(k) { return T[lang][k]; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function shell(inner) {
    return '<header class="hdr" style="height:84px"><img class="seal" src="seal.png" alt="" style="width:54px;height:54px"><div class="lock opslock"><div class="k">BOTETOURT COUNTY EMERGENCY MANAGEMENT</div><div class="t">' + esc(t('t').toUpperCase()) + '</div><div class="s">' + esc(SITE.toUpperCase()) + '</div></div><div class="right"><div class="seg"><button data-lang="en" class="' + (lang === 'en' ? 'on' : '') + '">English</button><button data-lang="es" class="' + (lang === 'es' ? 'on' : '') + '">Español</button></div></div></header><main class="main" style="overflow:auto"><div class="wrap fam' + (KIOSK ? ' kiosk' : '') + '">' + inner + '</div></main>';
  }
  function paint() {
    var app = document.getElementById('app'), h;
    if (!SVC) h = '<div class="warnbox">This check-in link is missing its setup. Please ask a staff member.</div>';
    else if (st.step === 'reason') h = '<h1 class="pg" style="font-size:28px">' + esc(t('q')) + '</h1><div class="famgrid">' + ['look', 'safe', 'pick', 'other'].map(function (k) { return '<button class="fambtn ' + k + '" data-reason="' + k + '">' + esc(t(k)) + '</button>'; }).join('') + '</div><p class="dim" style="margin-top:18px">' + esc(t('priv')) + '</p>';
    else if (st.step === 'form') {
      var who = st.reason === 'look' ? t('who_look') : st.reason === 'pick' ? t('who_pick') : t('who_safe');
      h = '<h1 class="pg" style="font-size:24px">' + esc(t(st.reason)) + '</h1><div class="card"><div class="grid g2 famform">' +
        f('fn', 'first_name') + f('ln', 'last_name') + f('ph', 'phone', 'tel') + f('em', 'email', 'email') + f('lg', 'language', '', lang === 'es' ? 'Español' : 'English') + f('ps', 'party_size', 'number', '1') +
        '<label class="f spanall"><span>' + esc(who) + '</span><textarea class="in" name="sought" style="min-height:90px"></textarea></label>' +
        '<label class="f"><span>' + esc(t('kids')) + '</span><select class="in" name="children"><option value="No">' + esc(t('no')) + '</option><option value="Yes"' + (st.reason === 'pick' ? ' selected' : '') + '>' + esc(t('yes')) + '</option></select></label>' +
        (st.reason === 'look' || st.reason === 'pick' ? f('last', 'last_seen') : f('now', 'current_loc')) +
        '<label class="f spanall"><span>' + esc(t('needs')) + '</span><input class="in" name="needs"></label>' +
        '<label class="chk spanall" style="font-size:16px"><input type="checkbox" name="consent" checked> ' + esc(t('consent')) + '</label></div>' +
        '<div class="row" style="margin-top:16px"><button class="btn big ghost" data-back>' + esc(t('back')) + '</button><span style="flex:1"></span><button class="btn big pri" data-send>' + esc(t('send')) + '</button></div><div id="ferr" class="bad-t" style="margin-top:8px"></div></div>';
    } else h = '<div class="card" style="text-align:center;padding:30px"><h1 class="pg" style="font-size:28px">' + esc(t('done')) + '</h1><div class="dim" style="font:700 13px var(--cond);letter-spacing:2px;text-transform:uppercase;margin-top:12px">' + esc(t('num')) + '</div><div style="font:900 54px var(--disp);color:var(--gold);letter-spacing:3px;margin:6px 0 10px">' + esc(st.no) + '</div><p style="font-size:18px">' + esc(t('next')) + '</p>' + (st.kids ? '<div class="warnbox" style="font-size:16px;text-align:left">' + esc(t('child')) + '</div>' : '') + '<button class="btn big" style="margin-top:20px" data-reset>' + esc(t('newp')) + '</button></div>';
    app.innerHTML = shell(h);
  }
  function f(k, n, type, v) { return '<label class="f"><span>' + esc(t(k)) + '</span><input class="in" name="' + n + '"' + (type ? ' type="' + type + '"' : '') + (v ? ' value="' + esc(v) + '"' : '') + (n === 'phone' ? ' autocomplete="tel"' : '') + '></label>'; }
  function reset() { st = { step: 'reason' }; lang = 'en'; paint(); }
  function poke() { if (!KIOSK) return; clearTimeout(idle); idle = setTimeout(reset, st.step === 'done' ? 30000 : 180000); }
  async function send() {
    var g = function (n) { var el = document.querySelector('[name="' + n + '"]'); return el ? (el.type === 'checkbox' ? (el.checked ? 'Yes' : 'No') : el.value.trim()) : ''; };
    if (!g('first_name') || !g('last_name') || !g('phone')) { document.getElementById('ferr').textContent = t('req'); return; }
    var no = 'F-' + new Date().toISOString().slice(5, 10).replace('-', '') + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
    var at = { intake_no: no, intake_type: REASON[st.reason], site: SITE.slice(0, 150), channel: KIOSK ? 'Kiosk' : 'Phone', first_name: g('first_name').slice(0, 80), last_name: g('last_name').slice(0, 80), phone: g('phone').slice(0, 30), email: g('email').slice(0, 150) || null, language: g('language').slice(0, 60) || null, party_size: parseInt(g('party_size'), 10) || null, sought: g('sought').slice(0, 2000) || null, children: g('children') || 'No', last_seen: g('last_seen').slice(0, 500) || null, current_loc: g('current_loc').slice(0, 255) || null, needs: g('needs').slice(0, 500) || null, consent: g('consent'), incident_key: INC || null, status: 'New' };
    var b = document.querySelector('[data-send]'); b.disabled = true;
    try {
      var r = await fetch(SVC + '/addFeatures', { method: 'POST', body: new URLSearchParams({ f: 'json', features: JSON.stringify([{ attributes: at }]) }) }).then(function (x) { return x.json(); });
      if (!r.addResults || !r.addResults[0] || !r.addResults[0].success) throw new Error((r.error && r.error.message) || 'failed');
      st = { step: 'done', no: no, kids: at.children === 'Yes' || st.reason === 'pick' || st.reason === 'look' && /\b([0-9]|1[0-7])\b/.test(at.sought || '') }; paint(); poke();
    } catch (e) { b.disabled = false; document.getElementById('ferr').textContent = t('err'); }
  }
  document.addEventListener('click', function (e) {
    poke();
    var l = e.target.closest('[data-lang]'); if (l) { lang = l.dataset.lang; paint(); return; }
    var r = e.target.closest('[data-reason]'); if (r) { st = { step: 'form', reason: r.dataset.reason }; paint(); var x = document.querySelector('[name="first_name"]'); if (x) x.focus(); return; }
    if (e.target.closest('[data-back]')) { st = { step: 'reason' }; paint(); return; }
    if (e.target.closest('[data-send]')) { send(); return; }
    if (e.target.closest('[data-reset]')) reset();
  });
  document.addEventListener('input', poke);
  paint(); poke();
})();
