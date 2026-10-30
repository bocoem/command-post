/* EM OPS — keep the two hub pages current (Setup → Hub pages)
   Responder Operations Directory (Hub page): adds the system's apps to each role section and the "All tools" catalog,
   and fixes the role tile counts. Public site (bocoem.org): adds the public information hotline number to the
   911 strip (only while the hotline is active) and a "Questions people are asking" tile linking to the public answers page.
   Everything this adds sits between markers, so running it again replaces it instead of duplicating it.
   Also makes the public answers view: PIO-approved hotline answers only (no incident or staff details), read-only, public. */
(function (CP) {
  'use strict';
  var OPS = CP.ops, A = CP.arc, U = CP.ui, E = CP.esc, I = U.icon;
  var HB = OPS.hubs = {};
  var DIR_ID = 'a15306f28560414bbbb4f48c93b9f4f6', SITE_ID = '4a92157ef20543ffb1904ffa7591c227';
  var PUB_VIEW = 'BOCO_Hotline_Public_Answers';
  var BASE = 'https://bocoem.github.io/command-post/';
  function P(path) { return A.portal + '/sharing/rest' + path; }
  function brand() { return CP.BRAND || 'Command Post'; }
  function S(tag) { return '<span id="cpS-' + tag + '"></span>'; } function En(tag) { return '<span id="cpE-' + tag + '"></span>'; }
  function put(html, tag, block, insertAt) { // replace between markers, or insert at a position
    var s = html.indexOf(S(tag)), e = html.indexOf(En(tag));
    var wrapped = S(tag) + block + En(tag);
    if (s >= 0 && e > s) return html.slice(0, s) + wrapped + html.slice(e + En(tag).length);
    if (insertAt == null || insertAt < 0) throw new Error('could not find where to add ' + tag);
    return html.slice(0, insertAt) + wrapped + html.slice(insertAt);
  }
  function strip(html, tag) { var s = html.indexOf(S(tag)), e = html.indexOf(En(tag)); return s >= 0 && e > s ? html.slice(0, s) + html.slice(e + En(tag).length) : html; }

  // ---------- the apps, and who gets each ----------
  var GRP = { em: 'BOCO Access 1 - Emergency Management (Full Access)', so: "BOCO Access 2 - Sheriff's Office", fire: 'BOCO Access 3 - Fire & EMS', disp: 'BOCO Access 4 - Emergency Communications (Dispatch)', ems: 'BOCO Role - EMS Patient Care (Protected)', lead: 'BOCO Role - Leadership & Partners (Read-Only)' };
  var SHORT = { em: 'Emergency Mgmt', so: "Sheriff's Office", fire: 'Fire & EMS', disp: 'Dispatch', ems: 'EMS patient care', lead: 'Leadership', all: 'Anyone' };
  function apps() {
    var dash = CP.store.prefs().leadDash;
    return [
      { k: 'cp', n: 'Command Post', ty: 'Web app', off: 1, url: BASE, btn: 'Open Command Post', d: 'Run an incident: ICS 201–215 forms, resources, assignments, activity log and briefings. Shared live through ArcGIS; works offline and catches up when the connection is back.', who: ['em', 'so', 'fire', 'disp'] },
      { k: 'ops', n: 'EM Ops tools', ty: 'Web app', off: 1, url: BASE + 'ops.html', btn: 'Open EM Ops', d: 'County resources and requests, PODs, infrastructure, flood watch, volunteers, cost recovery and training, all tied to the Command Post incident. You see the tools your group can use.', who: ['em', 'so', 'fire', 'disp'] },
      { k: 'cb', n: 'Command Board', ty: 'Tablet / computer', off: 1, url: BASE + 'commandboard.html', btn: 'Open Command Board', d: 'Tap-first command board for fire alarms, structure fires and the first hour of any incident: units, divisions and groups, benchmarks, PAR timer, MAYDAY and CAN reports. Officers follow it live on their phones; one tap moves it into Command Post.', who: ['em', 'so', 'fire', 'disp'] },
      { k: 'hot', n: 'Hotline desk', ty: 'Web app', off: 1, url: BASE + 'hotline.html', btn: 'Open Hotline', d: 'Public information line for desktop and tablet: log calls, answer from PIO-approved talking points and live shelter, POD and road facts, and route callers to reunification, AFN, volunteers or the PIO.', who: ['em', 'so', 'disp'] },
      { k: 'ci', n: 'Check-In', ty: 'Phone app', off: 1, url: BASE + 'checkin.html', btn: 'Open Check-In', d: 'Check in and out of an incident from your phone, or scan a unit tag or volunteer badge. Lands on the Command Post resources list and ICS 211.', who: ['em', 'so', 'fire', 'disp'] },
      { k: 'mci', n: 'MCI', ty: 'Phone app', off: 1, url: BASE + 'mci.html', btn: 'Open MCI', d: 'Mass casualty triage (scan the tag), transport and the hospital board. Patient records are visible only to EM and the EMS patient care group.', who: ['em', 'ems'] },
      { k: 'ru', n: 'Reunification', ty: 'Web app', off: 1, url: BASE + 'reunify.html', btn: 'Open Reunification', d: 'Family reunification cases, the family check-in queue, unaccompanied children and the two-person child release.', who: ['em'] },
      { k: 'lead', n: 'EM Leadership Dashboard', ty: 'Dashboard', url: dash ? A.portal + '/apps/dashboards/' + dash : '', btn: 'Open', d: 'Read-only picture for leaders and partners: people on scene, open requests, facilities down, PODs, flood watch and hotline topics. Practice incidents are left out.', who: ['lead', 'em'] },
      { k: 'fam', n: 'Family Reunification Check-In', ty: 'Kiosk / QR', url: BASE + 'family.html', btn: 'Open check-in', d: 'For families at a reunification site: a tablet kiosk or QR code. Families can add their details but nobody can read records through it. Only post it when a reunification site is open.', who: ['all'] }
    ].filter(function (a) { return a.url; });
  }
  var ROLE_APPS = { em: ['cp', 'cb', 'ops', 'hot', 'ci', 'mci', 'ru', 'lead'], so: ['cp', 'cb', 'ops', 'hot', 'ci'], fire: ['cb', 'cp', 'ops', 'ci', 'mci'], disp: ['cp', 'cb', 'ops', 'hot', 'ci'], lead: ['lead'], all: ['fam'] };
  function row(a) {
    return '<div class="rz-row"><div class="rz-rm"><div class="rz-rt"><b>' + E(a.n) + '</b><span class="rz-ty">' + E(a.ty) + '</span>' + (a.off ? '<span class="rz-ph">Works offline · save to home screen</span>' : '') + '</div><p>' + E(a.d) + (a.k === 'mci' ? ' Fire &amp; EMS: ask EM to add you to the EMS patient care group.' : '') + '</p></div><div class="rz-ra"><a class="rz-btn" href="' + E(a.url) + '" target="_blank" rel="noopener">' + E(a.btn) + '</a></div></div>';
  }
  function card(a) {
    return '<div class="rz-card"><div class="rz-ct"><span class="rz-ty">' + E(a.ty) + '</span><span class="rz-b rz-grp">' + (a.who[0] === 'all' ? 'NO SIGN-IN' : 'GROUP ACCESS') + '</span></div><h4>' + E(a.n) + '</h4><p>' + E(a.d) + '</p><div class="rz-who"><span>WHO:</span> ' + a.who.map(function (w) { return '<span class="rz-chip"' + (GRP[w] ? ' title="' + E(GRP[w]) + '"' : '') + '>' + E(SHORT[w]) + '</span>'; }).join('') + '</div>' + (a.off ? '<div class="rz-phl"><a href="#rz-phone">Works offline · save to home screen</a></div>' : '') + '<div class="rz-btns"><a class="rz-btn" href="' + E(a.url) + '" target="_blank" rel="noopener">' + E(a.btn) + '</a></div></div>';
  }

  // ---------- responder directory ----------
  HB.directory = async function () {
    var it = await A.req(P('/content/items/' + DIR_ID), {}), d = await A.req(P('/content/items/' + DIR_ID + '/data'), {});
    var c = d.values.layout.sections[0].rows[0].cards[0].component.settings, md = c.markdown, all = apps(), by = {}; all.forEach(function (a) { by[a.k] = a; });
    // each role section: our rows go right after the role header
    var delta = {};
    Object.keys(ROLE_APPS).forEach(function (r) {
      var ps = md.indexOf(S('role-' + r)), pe = md.indexOf(En('role-' + r)), prev = ps >= 0 && pe > ps ? Math.max(0, (md.slice(ps, pe).match(/class="rz-row"/g) || []).length - 1) : 0;
      delta[r] = (ROLE_APPS[r].filter(function (k) { return by[k]; }).length) - prev;
      var list = ROLE_APPS[r].map(function (k) { return by[k]; }).filter(Boolean); if (!list.length) return;
      var block = '<div class="rz-row" style="border-left:3px solid var(--au);background:rgba(253,184,51,.06)"><div class="rz-rm"><div class="rz-rt"><b>' + E(brand()) + '</b><span class="rz-ty">County operations system</span></div><p>Incident command, field and hotline apps on county ArcGIS. Sign in with your county ArcGIS account.</p></div></div>' + list.map(row).join('');
      var at = md.indexOf('id="rz-r-' + r + '"'); if (at < 0) return;
      var hdrEnd = md.indexOf('class="rz-top"', at); hdrEnd = md.indexOf('</div>', md.indexOf('</a>', hdrEnd)) + 6;
      md = put(md, 'role-' + r, block, md.indexOf(S('role-' + r)) >= 0 ? null : hdrEnd);
    });
    // catalog: a group of its own at the top of "All tools"
    var cat = '<details class="rz-det" open><summary><span class="rz-arr">▸</span> ' + E(brand()) + ' · Command Post, EM Ops &amp; Hotline <span class="rz-cnt">' + all.length + '</span></summary><div class="rz-detb"><div class="rz-grid">' + all.map(card).join('') + '</div></div></details>';
    var ci = md.indexOf('id="rz-catalog"'); var firstDet = md.indexOf('<details class="rz-det"', ci);
    md = put(md, 'catalog', cat, md.indexOf(S('catalog')) >= 0 ? null : firstDet);
    // offline note in the phone setup section
    var ph = md.indexOf('id="rz-phone"'), phh = ph >= 0 ? md.indexOf('</div>', md.indexOf('</h2>', ph)) + 6 : -1;
    md = put(md, 'offline', '<div class="rz-row"><div class="rz-rm"><div class="rz-rt"><b>Works with no signal</b></div><p>' + E(brand()) + ' apps (Command Post, EM Ops, Hotline, Check-In, MCI, Reunification) open and keep working offline once you have opened them on that device while connected. Changes wait on the device and send by themselves when the signal is back; a pill at the bottom left shows what is waiting. Don\'t sign out or clear the browser until it is empty.</p></div></div>', md.indexOf(S('offline')) >= 0 ? null : phh);
    // role tile counts
    md = md.replace(/<a class="rz-tile" href="#rz-r-([a-z]+)"([^>]*)>([\s\S]*?)<i>(\d+) tools →<\/i><\/a>/g, function (m, r, attrs, inner, n0) {
      return '<a class="rz-tile" href="#rz-r-' + r + '"' + attrs + '>' + inner + '<i>' + (+n0 + (delta[r] || 0)) + ' tools →</i></a>';
    });
    c.markdown = md;
    var r2 = await A.req(P('/content/users/' + it.owner + '/items/' + DIR_ID + '/update'), { text: JSON.stringify(d) }, true);
    if (!r2.success) throw new Error('ArcGIS did not save the directory page');
    return all.length + ' apps added to ' + Object.keys(ROLE_APPS).length + ' role sections and the catalog';
  };

  // ---------- public answers view (approved hotline answers only) ----------
  HB.publicView = async function () {
    var src = OPS.svc.main; if (!src || src.view) throw new Error('full EM Operations service needed');
    var r = await A.req(P('/search'), { q: 'title:"' + PUB_VIEW + '" AND orgid:' + A.user.orgId, num: 3 }), it = (r.results || []).find(function (x) { return x.title === PUB_VIEW; });
    if (!it) {
      var c = await A.req(P('/content/users/' + A.user.username + '/createService'), { createParameters: { name: PUB_VIEW, isView: true, capabilities: 'Query', spatialReference: { wkid: 4326 } }, outputType: 'featureService', isView: true, tags: 'Emergency Management,Hotline,Public', snippet: 'PIO-approved answers to the questions the public hotline is getting. Read-only.' }, true).catch(function (e) { if (e.offline) return { _lost: true }; throw e; });
      if (c._lost) { await new Promise(function (res) { setTimeout(res, 8000); }); r = await A.req(P('/search'), { q: 'title:"' + PUB_VIEW + '" AND orgid:' + A.user.orgId, num: 3 }); it = (r.results || []).find(function (x) { return x.title === PUB_VIEW; }); if (!it) throw new Error('ArcGIS did not answer; run it again'); }
      else it = { id: c.itemId, url: c.serviceurl || c.encodedServiceURL, owner: A.user.username };
    }
    var url = it.url.replace(/\/$/, ''), info = await A.req(url, {}), adm = url.replace('/rest/services/', '/rest/admin/services/');
    if (!(info.tables || []).concat(info.layers || []).length) {
      var si = await A.req(src.url + '/' + src.ids.OPS_HotlineInfo, {});
      await A.req(adm + '/addToDefinition', { addToDefinition: { tables: [{ id: 0, name: 'Answers', type: 'Table', displayField: 'question', description: 'Approved hotline answers', adminLayerInfo: { viewLayerDefinition: { sourceServiceName: src.url.match(/services\/([^/]+)\/FeatureServer/)[1], sourceLayerId: src.ids.OPS_HotlineInfo, sourceLayerFields: '*' } } }] } }, true).catch(function (e) { if (!e.offline) throw e; });
      await new Promise(function (res) { setTimeout(res, 3000); }); info = await A.req(url, {});
    }
    var t = (info.tables || []).concat(info.layers || [])[0]; if (!t) throw new Error('view has no table yet; run it again');
    var want = "status = 'Approved' AND (practice IS NULL OR practice <> 'Yes')";
    var hide = ['approved_by', 'times_used', 'pinned', 'incident_key', 'practice', 'Creator', 'Editor'].map(function (n) { return { name: n, visible: false }; });
    await A.req(adm + '/' + t.id + '/updateDefinition', { updateDefinition: { viewDefinitionQuery: want, fields: hide } }, true).catch(function (e) { if (!e.offline) throw e; });
    await A.req(P('/content/users/' + (it.owner || A.user.username) + '/items/' + it.id + '/share'), { everyone: true, org: true, groups: '' }, true);
    await new Promise(function (res) { setTimeout(res, 1500); });
    var li = await A.req(url + '/' + t.id, { _: Date.now() }); var leak = (li.fields || []).filter(function (f) { return /approved_by|incident_key|Creator|Editor/.test(f.name); }).map(function (f) { return f.name; });
    if ((li.viewDefinitionQuery || '') !== want || leak.length) throw new Error('public view not fully limited yet (' + ((li.viewDefinitionQuery || '') !== want ? 'filter' : '') + (leak.length ? ' fields ' + leak.join(',') : '') + '); run it again');
    return 'public, approved answers only';
  };

  // ---------- public site ----------
  HB.site = async function (o) {
    var it = await A.req(P('/content/items/' + SITE_ID), {}), d = await A.req(P('/content/items/' + SITE_ID + '/data'), {}), S0 = d.values.layout.sections;
    var strip911 = S0[1].rows[0].cards[0].component.settings;
    var tel = (o.phone || '').replace(/\D/g, '');
    strip911.markdown = o.active && tel ? put(strip911.markdown, 'hotline', ' <span>Public information hotline: <a href="tel:' + tel + '">' + E(o.phone) + '</a></span>', strip911.markdown.indexOf(S('hotline')) >= 0 ? null : strip911.markdown.lastIndexOf('</div>')) : strip(strip911.markdown, 'hotline');
    // "Stay informed" section: a tile row of our own
    var sec = S0.find(function (s) { return s.rows.some(function (r) { return r.cards.some(function (c) { return /Where official information comes from/.test(c.component.settings.markdown || ''); }); }); });
    if (!sec) throw new Error('could not find the Stay informed section');
    var html = '<div class="bc-grid bc-c2">' +
      '<div class="bc-tile bc-gold"><h3>Questions people are asking</h3><p>Answers from Botetourt County Emergency Management to the questions coming in to the public information hotline, updated as things change. In English and Spanish.</p><a class="bc-more" href="' + BASE + 'faq.html" target="_blank" rel="noopener">See current answers &rarr;</a></div>' +
      '<div class="bc-tile bc-blue"><h3>Public information hotline</h3><p>' + (o.active && tel ? 'Open now for questions about the current emergency: <a href="tel:' + tel + '"><strong>' + E(o.phone) + '</strong></a>. For emergencies call 9-1-1.' : 'During a major emergency the county opens a public information hotline. When it is open, the number appears at the top of this page and in county alerts. For emergencies call 9-1-1.') + '</p><a class="bc-more" href="' + BASE + 'faq.html" target="_blank" rel="noopener">Current answers &rarr;</a></div></div>';
    var mine = sec.rows.find(function (r) { return r.cards.some(function (c) { return (c.component.settings.markdown || '').indexOf(S('stay')) >= 0; }); });
    var mdc = { component: { name: 'markdown-card', settings: { markdown: S('stay') + html + En('stay'), schemaVersion: 2.1 } }, width: 12 };
    if (mine) mine.cards = [mdc]; else sec.rows.push({ cards: [mdc] });
    var r2 = await A.req(P('/content/users/' + it.owner + '/items/' + SITE_ID + '/update'), { text: JSON.stringify(d) }, true);
    if (!r2.success) throw new Error('ArcGIS did not save the site');
    CP.store.setPref('hubHotline', { phone: o.phone || '', active: !!o.active });
    return 'answers tile added' + (o.active && tel ? ', hotline ' + o.phone + ' shown at the top' : ', hotline number hidden (not active)');
  };

  HB.run = async function (o) {
    var out = [], box = function () { return document.getElementById('buildLog'); };
    var log = function () { OPS._buildLog = out.join('\n'); var b = box(); if (b) b.textContent = OPS._buildLog; };
    var step = async function (name, fn) { out.push('… ' + name); log(); var at = out.length - 1; try { var r = await fn(); out[at] = '✓ ' + name + (r ? ': ' + r : ''); } catch (e) { console.warn(name, e); out[at] = '✗ ' + name + ': ' + OPS.errText(e); } log(); };
    await step('Public answers view', HB.publicView);
    await step('Responder Operations Directory', HB.directory);
    await step('Public site (bocoem.org)', function () { return HB.site(o); });
    out.push('\nDone.'); log(); U.toast('Hub pages updated', 'ok');
  };
  OPS.act.hubs = function () {
    var p = CP.store.prefs().hubHotline || {};
    U.modal('Update hub pages', '<p style="margin-top:0">Adds the ' + E(brand()) + ' apps to the <b>Responder Operations Directory</b> (each role and the All tools catalog) and adds a <b>Questions people are asking</b> tile to the public site, backed by the PIO-approved hotline answers. Run it again whenever this changes.</p>' +
      '<div class="grid g2"><label class="f"><span>Public hotline number</span><input class="in" name="phone" value="' + E(p.phone || '') + '" placeholder="540-555-0100"></label><label class="chk" style="align-self:end"><input type="checkbox" name="active"' + (p.active ? ' checked' : '') + '> Hotline is open now (show the number on the public site)</label></div>',
      [{ label: 'Cancel', cls: 'ghost' }, { label: I('check') + 'Update hub pages', cls: 'pri', fn: function (bg) { HB.run({ phone: U.val(bg, 'phone'), active: !!U.val(bg, 'active') }); } }]);
  };
})(window.CP);
