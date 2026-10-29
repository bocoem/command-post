/* COMMAND POST — community operations that write straight to the county ArcGIS layers:
   road closures, evacuation notices, shelters, PODs, field reports and house checks. Plus quick-action dialogs. */
(function (CP) {
  'use strict';
  var U = CP.ui, E = CP.esc, A = CP.alive, I = U.icon, V = CP.views, AFTER = CP.after;
  var Q = CP.quick = {};
  function app() { return CP.app; }
  function signedIn() { return CP.arc.signedIn(); }
  function needSignIn(what) { return '<div class="empty">' + E(what) + ' come straight from the county ArcGIS layers. <button class="btn pri sm" data-act="signin" style="margin-left:8px">Sign in with ArcGIS</button></div>'; }
  function phead(t, s, a) { return V.phead(t, s, a); }
  function card(t, b, x) { return '<div class="card"><h3>' + t + (x ? '<span class="x">' + x + '</span>' : '') + '</h3>' + b + '</div>'; }
  function when(ms) { return ms ? CP.fmtDT(new Date(ms).toISOString()) : ''; }
  function fail(e) { U.toast('ArcGIS said: ' + E(e.message), 'err', 7000); }

  // ---------- map dialog: fields + a map you click on ----------
  // mode: 'point' | 'line' | 'poly'
  function mapDialog(title, fields, mode, saveLabel, onSave) {
    var pts = [], m = null, shape = null, marks = null;
    var help = { point: 'Click the map to place it.', line: 'Click along the road to trace the closed section (2 or more points).', poly: 'Click around the area to outline it (3 or more points).' }[mode];
    var bg = U.modal(title, '<div class="grid g2" style="align-items:start"><div class="grid">' + fields + '</div><div><div class="map" id="qmap" style="height:340px"></div><div class="row" style="margin-top:6px"><span class="dim" style="font-size:12px" id="qmhelp">' + help + '</span><button class="btn xs ghost" type="button" id="qmundo" style="margin-left:auto">Undo point</button><button class="btn xs ghost" type="button" id="qmclear">Clear</button></div></div></div>',
      [{ label: 'Cancel', cls: 'ghost' }, { label: saveLabel, cls: 'pri', fn: function (b) {
        var need = { point: 1, line: 2, poly: 3 }[mode];
        if (pts.length < need) { U.toast(help, 'err'); return false; }
        var go = onSave(b, mode === 'point' ? pts[pts.length - 1] : pts.slice());
        if (go === false) return false;
      } }], { wide: true, sticky: true, onOpen: function (b) {
        setTimeout(function () {
          if (!window.L) return;
          m = CP.map.create(b.querySelector('#qmap'), {});
          var g = L.layerGroup().addTo(m); var p0 = CP.map.drawIncident(m, app().inc, g);
          if (p0.length) m.setView(p0[p0.length - 1], 14);
          marks = L.layerGroup().addTo(m);
          function draw() {
            marks.clearLayers(); if (shape) { shape.remove(); shape = null; }
            if (mode === 'point' && pts.length) marks.addLayer(L.marker(pts[pts.length - 1], { icon: CP.map.pinIcon('#3D7BFF', '•', 26) }));
            else { pts.forEach(function (p) { marks.addLayer(L.circleMarker(p, { radius: 4, color: '#FDB833' })); }); if (pts.length > 1) shape = (mode === 'line' ? L.polyline(pts, { color: '#ff4d58', weight: 5 }) : L.polygon(pts, { color: '#c77dff', weight: 2, fillOpacity: .2 })).addTo(m); }
          }
          m.getContainer().style.cursor = 'crosshair';
          m.on('click', function (e) { if (mode === 'point') pts = [[e.latlng.lat, e.latlng.lng]]; else pts.push([e.latlng.lat, e.latlng.lng]); draw(); });
          b.querySelector('#qmundo').onclick = function () { pts.pop(); draw(); };
          b.querySelector('#qmclear').onclick = function () { pts = []; draw(); };
        }, 60);
      } });
    return bg;
  }
  function sel(name, opts, v) { return '<select class="in" name="' + name + '">' + opts.map(function (o) { var val = Array.isArray(o) ? o[0] : o, lab = Array.isArray(o) ? o[1] : o; return '<option value="' + E(val) + '"' + (val === v ? ' selected' : '') + '>' + E(lab) + '</option>'; }).join('') + '</select>'; }
  function f(label, inner) { return '<label class="f"><span>' + label + '</span>' + inner + '</label>'; }
  function inp(name, ph, v, type) { return '<input class="in" name="' + name + '"' + (type ? ' type="' + type + '"' : '') + (ph ? ' placeholder="' + E(ph) + '"' : '') + ' value="' + E(v || '') + '">'; }
  function ta(name, ph) { return '<textarea class="in" name="' + name + '" style="min-height:60px" placeholder="' + E(ph || '') + '"></textarea>'; }
  function track(kind, rec) { var inc = app().inc; inc.links = inc.links || []; inc.links.push(Object.assign({ id: CP.uid(), u: CP.now(), kind: kind, ts: CP.now(), by: CP.me.name || '' }, rec)); CP.touch(inc, 'links'); }
  function done(msg, cat) { app().log(msg, cat || 'Action'); app().commit(true); U.toast(E(msg), 'ok'); app().ui.cache = {}; }
  function guard() { if (!signedIn()) { U.toast('Sign in with ArcGIS first. This goes straight to the county layers.', 'err', 5000); return false; } if (!app().inc) return false; return true; }

  // shared with impact.js
  Q._h = { mapDialog: mapDialog, sel: sel, f: f, inp: inp, ta: ta, track: track, done: done, fail: fail, guard: guard, card: card, when: when, needSignIn: needSignIn, signedIn: signedIn };

  // ---------- quick actions ----------
  Q.closeRoad = function () {
    if (!guard()) return;
    mapDialog('Close a road', f('Road / street *', inp('street', 'e.g. Rt 220 (Botetourt Rd)')) + '<div class="grid g2">' + f('Reason', sel('reason', ['Hazard', 'Construction', 'Event'])) + f('Who can get through', sel('access', ['No Access', 'Police and Fire', 'Critical Services', 'Local Access'])) + f('Lanes', sel('lanes', ['All Lanes', 'Some Lanes', 'Alternating One Way'])) + f('Direction', sel('dir', ['Both Directions', 'One Direction'])) + '</div>' +
      f('What the public should know', ta('desc', 'e.g. Water over the road at the Jackson Rd bridge.')) + f('Detour', inp('alt', 'e.g. Use Rt 43')) + '<div class="grid g2">' + f('Expected to reopen', inp('end', '', '', 'datetime-local')) + f('Contact phone', inp('phone')) + '</div>',
      'line', I('check') + 'Close road', function (b, pts) {
        var a = { street: U.val(b, 'street'), reason: U.val(b, 'reason'), access: U.val(b, 'access'), lanes: U.val(b, 'lanes'), direction: U.val(b, 'dir'), desc: U.val(b, 'desc'), alt: U.val(b, 'alt'), end: CP.fromLocalInput(U.val(b, 'end')), phone: U.val(b, 'phone') };
        if (!a.street) { U.toast('Name the road.', 'err'); return false; }
        CP.arc.roads.close(a, pts).then(function (oid) { track('closure', { oid: oid, label: a.street }); done('Road closed: ' + a.street + (a.alt ? ' (detour ' + a.alt + ')' : '') + '. Posted to county Road Closures.'); }).catch(fail);
      });
  };
  Q.roadBlock = function () {
    if (!guard()) return;
    mapDialog('Road block / barricade', f('Road / street *', inp('street')) + '<div class="grid g2">' + f('Reason', sel('reason', ['Hazard', 'Construction', 'Event'])) + f('Who can get through', sel('access', ['No Access', 'Police and Fire', 'Critical Services', 'Local Access'])) + '</div>' + f('Details', ta('desc', 'e.g. Barricades at the low-water crossing.')),
      'point', I('check') + 'Place road block', function (b, ll) {
        var a = { street: U.val(b, 'street'), reason: U.val(b, 'reason'), access: U.val(b, 'access'), desc: U.val(b, 'desc') };
        if (!a.street) { U.toast('Name the road.', 'err'); return false; }
        CP.arc.roads.block(a, ll).then(function (oid) { track('block', { oid: oid, label: a.street }); done('Road block placed: ' + a.street + '. Posted to county Road Closures.'); }).catch(fail);
      });
  };
  Q.evac = function () {
    if (!guard()) return;
    mapDialog('Evacuation / shelter-in-place notice', f('Area name *', inp('zone', 'e.g. Eagle Rock – River Rd area')) + f('Notice', sel('level', [['Level 3', 'Level 3 — GO NOW'], ['Level 2', 'Level 2 — Get set'], ['Level 1', 'Level 1 — Be ready'], ['Voluntary Evacuation', 'Voluntary evacuation'], ['Shelter in Place', 'Shelter in place']])) +
      f('Message to residents', ta('desc', 'What to do, where to go, which shelter is open.')) + f('More information link', inp('url')) + '<label class="chk"><input type="checkbox" name="pub" checked> Show on public maps and the EM website</label>',
      'poly', I('check') + 'Issue notice', function (b, pts) {
        var a = { zone: U.val(b, 'zone'), level: U.val(b, 'level'), desc: U.val(b, 'desc'), url: U.val(b, 'url'), pub: U.val(b, 'pub') };
        if (!a.zone) { U.toast('Name the area.', 'err'); return false; }
        CP.arc.evac.add(app().inc, a, pts).then(function (oid) {
          track('notice', { oid: oid, label: a.zone + ' (' + a.level + ')' });
          var s = app().inc.s209.threatMgmt = app().inc.s209.threatMgmt || {}; if (/Level 3|Voluntary/.test(a.level)) s['Evacuation(s) in Progress'] = true; if (a.level === 'Shelter in Place') s['Shelter-in-Place in Progress'] = true; CP.touch(app().inc, 's209');
          done(a.level + ' notice issued for ' + a.zone + '. Posted to county Notices & Evacuations.', 'Public Info');
        }).catch(fail);
      });
  };
  Q.detour = function () {
    if (!guard()) return;
    var r = (app().ui.cache && app().ui.cache.roads && app().ui.cache.roads.data) || null;
    var cls = r && !r._err ? r.closures : [];
    mapDialog('Detour route', f('Detour name / road *', inp('street', 'e.g. Rt 43 detour around Rt 220 closure')) + f('For which closure', '<select class="in" name="closure"><option value="">(not tied to a closure)</option>' + cls.map(function (x) { var a = x.attributes; return '<option value="' + E(a.GlobalID || a.globalid || '') + '">' + E(a.street) + '</option>'; }).join('') + '</select>') +
      f('Directions for drivers', ta('desc', 'e.g. Northbound traffic follow Rt 43 to Buchanan, then Rt 11.')) + f('Expected to end', inp('end', '', '', 'datetime-local')),
      'line', I('check') + 'Post detour', function (b, pts) {
        var a = { street: U.val(b, 'street'), closureGlobalId: U.val(b, 'closure'), desc: U.val(b, 'desc'), end: CP.fromLocalInput(U.val(b, 'end')) };
        if (!a.street) { U.toast('Name the detour.', 'err'); return false; }
        CP.arc.roads.detour(a, pts).then(function (oid) { track('detour', { oid: oid, label: a.street }); done('Detour posted: ' + a.street + '. Posted to county Road Closures (Detours).'); }).catch(fail);
      });
  };
  Q.evacRoute = function () {
    if (!guard()) return;
    mapDialog('Evacuation route', f('Route name *', inp('name', 'e.g. Eagle Rock to Lord Botetourt HS shelter via Rt 220 S')) + '<div class="grid g2">' + f('Road class', sel('roadclass', ['Highway', 'Major Arterial', 'Minor Arterial', 'Collector', 'Local', 'Unknown'], 'Highway')) + '<label class="chk" style="align-self:end"><input type="checkbox" name="contraflow"> Contraflow</label></div>' +
      f('Directions', ta('desc', 'Where it starts, where it goes, who should use it.')),
      'line', I('check') + 'Post route', function (b, pts) {
        var a = { name: U.val(b, 'name'), roadclass: U.val(b, 'roadclass'), contraflow: U.val(b, 'contraflow'), desc: U.val(b, 'desc') };
        if (!a.name) { U.toast('Name the route.', 'err'); return false; }
        CP.arc.routes.add(app().inc, a, pts).then(function (oid) { track('evacroute', { oid: oid, label: a.name }); done('Evacuation route posted: ' + a.name + '. Posted to county Evacuation Routes.', 'Public Info'); }).catch(fail);
      });
  };
  Q.incLine = function () {
    if (!guard()) return;
    mapDialog('Incident line / path', f('What it is *', inp('name', 'e.g. Fire line, storm track, spill reach, hose lay')) + f('Details', ta('desc')) + '<label class="chk"><input type="checkbox" name="pub"> Show on public maps</label>',
      'line', I('check') + 'Post line', function (b, pts) {
        var a = { name: U.val(b, 'name'), desc: U.val(b, 'desc'), pub: U.val(b, 'pub') };
        if (!a.name) { U.toast('Say what the line is.', 'err'); return false; }
        CP.arc.incLines.add(app().inc, a, pts).then(function (oid) { track('incline', { oid: oid, label: a.name }); done('Incident line posted: ' + a.name + '. Posted to county Incident Lines.', 'Event'); }).catch(fail);
      });
  };
  Q.critFacility = function () {
    if (!guard()) return;
    mapDialog('Critical facility', f('Name *', inp('name', 'e.g. Buchanan water treatment plant')) + '<div class="grid g2">' + f('Sector', sel('sector', CP.arc.critInfra.SECTORS, 'Other')) + f('Type', inp('type', 'e.g. Water plant, cell tower, nursing home')) + '</div>' + f('Address', inp('address')) + '<div class="grid g2">' + f('Contact', inp('poc')) + f('Phone', inp('phone')) + '</div>' + f('Notes', ta('comments')),
      'point', I('check') + 'Add facility', function (b, ll) {
        var a = { name: U.val(b, 'name'), sector: U.val(b, 'sector'), type: U.val(b, 'type'), address: U.val(b, 'address'), poc: U.val(b, 'poc'), phone: U.val(b, 'phone'), comments: U.val(b, 'comments') };
        if (!a.name) { U.toast('Name the facility.', 'err'); return false; }
        CP.arc.critInfra.add(a, ll).then(function () { done('Critical facility added: ' + a.name + ' (' + a.sector + '). Posted to county Critical Infrastructure.', 'Event'); }).catch(fail);
      });
  };
  Q.shelter = function () {
    if (!guard()) return;
    mapDialog('Open a shelter', f('Shelter name *', inp('name', 'e.g. Lord Botetourt High School')) + f('Address', inp('address')) + '<div class="grid g2">' + f('Capacity', inp('capacity', '', '', 'number')) + f('Status', sel('status', ['Open', 'Standby', 'Alert'])) + f('Contact', inp('poc')) + f('Phone', inp('phone')) + '</div>' +
      '<label class="chk"><input type="checkbox" name="pets"> Pets allowed</label><label class="chk"><input type="checkbox" name="pub" checked> Show on public maps and the EM website</label>',
      'point', I('check') + 'Open shelter', function (b, ll) {
        var a = { name: U.val(b, 'name'), address: U.val(b, 'address'), capacity: U.val(b, 'capacity'), status: U.val(b, 'status'), poc: U.val(b, 'poc'), phone: U.val(b, 'phone'), pets: U.val(b, 'pets'), pub: U.val(b, 'pub') };
        if (!a.name) { U.toast('Name the shelter.', 'err'); return false; }
        CP.arc.sites.addShelter(a, ll).then(function (oid) {
          track('shelter', { oid: oid, label: a.name });
          CP.addItem(app().inc, 'facilities', { type: 'Shelter', name: a.name, address: a.address, status: 'Open', poc: a.poc, phone: a.phone, lat: ll[0], lng: ll[1], opened: CP.now() });
          if (app().inc.eoc.shelter_status === 'Closed' || app().inc.eoc.shelter_status === 'On Standby') CP.setPath(app().inc, 'eoc.shelter_status', 'Open');
          done('Shelter opened: ' + a.name + '. Posted to county Shelters.', 'Event');
        }).catch(fail);
      });
  };
  Q.pod = function () {
    if (!guard()) return;
    mapDialog('Open a distribution site (POD)', f('Site name *', inp('name')) + f('Address', inp('address')) + '<div class="flab">Handing out</div><div class="row">' + ['water', 'food', 'ice', 'tarps', 'comfortkits'].map(function (k) { return '<label class="chk"><input type="checkbox" name="' + k + '"' + (k === 'water' ? ' checked' : '') + '> ' + ({ comfortkits: 'Comfort kits' }[k] || k[0].toUpperCase() + k.slice(1)) + '</label>'; }).join('') + '</div>' +
      '<div class="grid g2">' + f('Contact', inp('poc')) + f('Phone', inp('phone')) + '</div>' + f('Hours / notes', inp('notes')) + '<label class="chk"><input type="checkbox" name="pub" checked> Show on public maps and the EM website</label>',
      'point', I('check') + 'Open site', function (b, ll) {
        var a = { name: U.val(b, 'name'), address: U.val(b, 'address'), poc: U.val(b, 'poc'), phone: U.val(b, 'phone'), notes: U.val(b, 'notes'), pub: U.val(b, 'pub') };
        ['water', 'food', 'ice', 'tarps', 'comfortkits'].forEach(function (k) { a[k] = U.val(b, k); });
        if (!a.name) { U.toast('Name the site.', 'err'); return false; }
        CP.arc.sites.addPod(app().inc, a, ll).then(function (oid) {
          track('pod', { oid: oid, label: a.name });
          CP.addItem(app().inc, 'facilities', { type: 'Point of Distribution', name: a.name, address: a.address, status: 'Open', poc: a.poc, phone: a.phone, lat: ll[0], lng: ll[1], opened: CP.now() });
          done('Distribution site opened: ' + a.name + '. Posted to county Distribution Sites.', 'Event');
        }).catch(fail);
      });
  };
  Q.fieldReport = function () {
    if (!guard()) return;
    mapDialog('Field report', f('What is it', sel('type', CP.arc.field.STORM_TYPES)) + f('If other, what', inp('other')) + f('Details *', ta('comments', 'e.g. Tree across both lanes, power lines tangled.')) + '<div class="grid g2">' + f('Reported by', inp('name', '', CP.me.name)) + f('Phone', inp('phone')) + '</div><div class="dim" style="font-size:12px">Goes to Stormwatch Responder reports, so it shows on Stormwatch, Overwatch and the EOC map.</div>',
      'point', I('check') + 'Send report', function (b, ll) {
        var a = { type: U.val(b, 'type'), other: U.val(b, 'other'), comments: U.val(b, 'comments'), name: U.val(b, 'name'), phone: U.val(b, 'phone') };
        if (!a.comments) { U.toast('Add details.', 'err'); return false; }
        CP.arc.field.storm(a, ll).then(function () { var t = CP.arc.field.STORM_TYPES.find(function (x) { return x[0] === a.type; }); done('Field report (' + (t ? t[1] : a.type) + '): ' + a.comments, 'Event'); }).catch(fail);
      });
  };
  Q.houseCheck = function () {
    if (!guard()) return;
    mapDialog('House check', f('Result', sel('type', CP.arc.field.HOUSE_TYPES)) + f('If other, what', inp('other')) + '<div class="grid g2">' + f('Team', inp('team')) + f('# residents', inp('count', '', '', 'number')) + f('Resident name', inp('resident')) + f('Resident phone', inp('phone')) + '</div>' + f('Notes', ta('comments')) +
      '<div class="warnbox" style="font-size:12px">Contains personal information. It goes to the restricted House Checks layer only.</div>',
      'point', I('check') + 'Save house check', function (b, ll) {
        var a = { type: U.val(b, 'type'), other: U.val(b, 'other'), team: U.val(b, 'team'), count: U.val(b, 'count'), resident: U.val(b, 'resident'), phone: U.val(b, 'phone'), comments: U.val(b, 'comments') };
        CP.arc.field.house(a, ll).then(function () { done('House check recorded: ' + a.type + (a.team ? ' (' + a.team + ')' : ''), 'Action'); }).catch(fail);
      });
  };
  Q.checkin = function () {
    var a = app();
    U.modal('Check in a unit', '<div class="grid g2">' + f('Unit / name *', inp('name', 'Engine 1, BCSO 214, Jane Doe…')) + f('Kind', '<input class="in" name="kind" list="dl_kinds" placeholder="Engine, Dozer, Overhead…">') + f('Agency', '<input class="in" name="agency" list="dl_agency">') + f('# people', inp('persons', '', '', 'number')) + f('Leader', inp('leader')) + f('Contact', inp('contact', 'cell / radio')) +
      f('Status', sel('status', ['Checked In', 'Staged', 'Assigned', 'En Route', 'Ordered'])) + f('Assign to', '<select class="in" name="assign"><option value=""></option>' + A(a.inc.assignments).map(function (x) { return '<option value="' + x.id + '">' + E(CP.forms.assignName(a.inc, x.id) || 'Team') + '</option>'; }).join('') + '</select>') + '</div>',
      [{ label: 'Cancel', cls: 'ghost' }, { label: I('check') + 'Check in', cls: 'pri', fn: function (b) {
        var n = U.val(b, 'name'); if (!n) return false; var st = U.val(b, 'status'), asg = U.val(b, 'assign');
        CP.addItem(a.inc, 'resources', { name: n, kind: U.val(b, 'kind'), agency: U.val(b, 'agency'), persons: U.val(b, 'persons') === '' ? '' : +U.val(b, 'persons'), leader: U.val(b, 'leader'), contact: U.val(b, 'contact'), status: asg && st === 'Checked In' ? 'Assigned' : st, assign: asg, checkinLoc: 'ICP', location: 'ICP', checkin: /Ordered|En Route/.test(st) ? '' : CP.now(), ordered: st === 'Ordered' ? CP.now() : '' });
        a.log((/Ordered|En Route/.test(st) ? st + ': ' : 'Checked in: ') + n + (U.val(b, 'kind') ? ' (' + U.val(b, 'kind') + ')' : '') + (U.val(b, 'agency') ? ', ' + U.val(b, 'agency') : ''), 'Resource'); a.commit(true); U.toast(E(n) + ' checked in.', 'ok');
      } }]);
  };
  Q.person = function () {
    var a = app();
    U.modal('Add someone to a role', '<div class="grid g2">' + f('Role', '<select class="in" name="pos">' + CP.SECTIONS.map(function (s) { return '<optgroup label="' + s + '">' + CP.POSITIONS.filter(function (p) { return p.s === s; }).map(function (p) { return '<option value="' + p.k + '">' + p.t + '</option>'; }).join('') + '</optgroup>'; }).join('') + '</select>') + f('Label (Division A, Branch II…)', inp('label')) + f('Name *', inp('name')) + f('Agency', '<input class="in" name="agency" list="dl_agency">') + f('Phone', inp('phone')) + f('Radio', inp('radio')) + '</div>',
      [{ label: 'Cancel', cls: 'ghost' }, { label: I('check') + 'Add', cls: 'pri', fn: function (b) {
        var n = U.val(b, 'name'); if (!n) return false; var pos = U.val(b, 'pos');
        CP.addItem(a.inc, 'org', { pos: pos, label: U.val(b, 'label'), name: n, agency: U.val(b, 'agency'), phone: U.val(b, 'phone'), radio: U.val(b, 'radio'), email: '', checkin: CP.now() });
        a.log(n + ' assigned as ' + CP.POS[pos].t + (U.val(b, 'label') ? ' (' + U.val(b, 'label') + ')' : ''), 'Resource'); a.commit(true);
      } }]);
  };
  Q.publicUpdate = function () {
    var a = app(), p = a.inc.publicInfo;
    U.modal('Public update', f('Headline (what residents see first) *', '<input class="in" name="short" maxlength="255" value="' + E(p.shortMessage) + '">') + '<div style="height:8px"></div>' + f('Full message', '<textarea class="in" name="long" style="min-height:110px">' + E(p.longMessage) + '</textarea>') + '<div class="grid g2" style="margin-top:8px">' + f('Action residents should take (50 characters)', '<input class="in" name="act" maxlength="50" value="' + E(p.actionMessage) + '">') + f('More information link', '<input class="in" name="url" value="' + E(p.url) + '">') + '</div>' +
      '<div class="dim" style="font-size:12px;margin-top:8px">' + (signedIn() ? 'Posts to the county Public Message table (public Incident Status dashboard and EM website) and logs the release.' : 'Logs the release. Sign in to post it to ArcGIS.') + '</div>',
      [{ label: 'Cancel', cls: 'ghost' }, { label: I('news') + 'Release', cls: 'pri', fn: function (b) {
        if (!U.val(b, 'short')) return false;
        p.shortMessage = U.val(b, 'short'); p.longMessage = U.val(b, 'long'); p.actionMessage = U.val(b, 'act'); p.url = U.val(b, 'url'); p.actionRequired = !!p.actionMessage; CP.touch(a.inc, 'publicInfo');
        a.act.release();
      } }], { wide: true });
  };

  // ---------- data cache for the community pages ----------
  function load(key, fn) {
    var c = app().ui.cache = app().ui.cache || {};
    if (c[key] && c[key].data) return c[key].data;
    if (!c[key] || !c[key].loading) { c[key] = { loading: true }; fn().then(function (d) { c[key] = { data: d }; if (app().view && document.getElementById('main')) app().rerender(); }).catch(function (e) { c[key] = { data: { _err: e.message } }; app().rerender(); }); }
    return null;
  }
  Q._h.load = function (k, fn) { return load(k, fn); }; Q._h.refreshBtn = function () { return refreshBtn(); };
  function refreshBtn() { return '<button class="btn sm" data-act="cacheRefresh">' + I('refresh') + 'Refresh</button>'; }

  // ---------- ROADS & EVACUATIONS ----------
  V.roads = function (inc) {
    var acts = '<button class="btn pri sm" data-act="q" data-a="closeRoad">' + I('plus') + 'Close a road</button><button class="btn sm" data-act="q" data-a="roadBlock">' + I('plus') + 'Road block</button><button class="btn sm" data-act="q" data-a="detour">' + I('plus') + 'Detour</button><button class="btn sm red" data-act="q" data-a="evac">' + I('warn') + 'Evacuation notice</button><button class="btn sm" data-act="q" data-a="evacRoute">' + I('plus') + 'Evacuation route</button>' + (signedIn() ? refreshBtn() : '');
    if (!signedIn()) return '<div class="wrap">' + phead('Roads &amp; Evacuations', 'Close roads and issue evacuation or shelter-in-place notices. They post straight to the county layers that feed Overwatch, Stormwatch, the public Incident Status dashboard and the EM website.', '') + needSignIn('Road closures and evacuation notices') + '</div>';
    var r = load('roads', CP.arc.roads.list), e = load('evac', CP.arc.evac.list), rt = load('routes', CP.arc.routes.list);
    var mapCard = '<div class="card" style="padding:8px"><div class="map" id="roadmap" style="height:420px"></div></div>';
    var cl = !r ? '<div class="muted">Loading…</div>' : r._err ? '<div class="warnbox">' + E(r._err) + '</div>' : (r.closures.length + r.blocks.length + (r.detours || []).length) ? '<div class="tbl-wrap"><table class="t ro"><thead><tr><th>Road</th><th>Type</th><th>Access</th><th>Since</th><th>Reopens</th><th></th></tr></thead><tbody>' +
      r.closures.map(function (x) { var a = x.attributes; return '<tr><td><b>' + E(a.street) + '</b><div class="dim" style="font-size:12px">' + E(a.description || '') + (a.altroute ? ' · Detour: ' + E(a.altroute) : '') + '</div></td><td>Closure · ' + E(a.laneimpact || '') + '</td><td>' + E(a.accessallowed || '') + '</td><td>' + when(a.starttime) + '</td><td>' + (when(a.endtime) || '—') + '</td><td class="act"><button class="btn xs" data-act="reopen" data-a="closure|' + CP.arc.oidOf(a) + '|' + E(a.street) + '">Reopen</button></td></tr>'; }).join('') +
      r.blocks.map(function (x) { var a = x.attributes; return '<tr><td><b>' + E(a.street) + '</b><div class="dim" style="font-size:12px">' + E(a.description || '') + '</div></td><td>Road block</td><td>' + E(a.accessallowed || '') + '</td><td>' + when(a.starttime) + '</td><td>' + (when(a.endtime) || '—') + '</td><td class="act"><button class="btn xs" data-act="reopen" data-a="block|' + CP.arc.oidOf(a) + '|' + E(a.street) + '">Reopen</button></td></tr>'; }).join('') +
      (r.detours || []).map(function (x) { var a = x.attributes; return '<tr><td><b>' + E(a.street) + '</b><div class="dim" style="font-size:12px">' + E(a.description || '') + '</div></td><td>Detour</td><td>—</td><td>' + when(a.starttime) + '</td><td>' + (when(a.endtime) || '—') + '</td><td class="act"><button class="btn xs" data-act="reopen" data-a="detour|' + CP.arc.oidOf(a) + '|' + E(a.street) + '">End</button></td></tr>'; }).join('') + '</tbody></table></div>' : (r.detours || []).length ? '' : '<div class="empty">No active road closures in the county.</div>';
    var LV = ['Level 3', 'Level 2', 'Level 1', 'Voluntary Evacuation', 'Shelter in Place', 'Clear'];
    var ev = !e ? '<div class="muted">Loading…</div>' : e._err ? '<div class="warnbox">' + E(e._err) + '</div>' : e.length ? '<div class="tbl-wrap"><table class="t ro"><thead><tr><th>Area</th><th>Notice</th><th>Issued</th><th>Change to</th></tr></thead><tbody>' + e.map(function (x) {
      var a = x.attributes; return '<tr><td><b>' + E(a.zonename || a.incidentnm || 'Zone') + '</b><div class="dim" style="font-size:12px">' + E(a.description || '') + '</div></td><td><span class="chip ' + (/Level 3/.test(a.evactype) ? 'red' : /Level 2|Shelter/.test(a.evactype) ? 'warn' : 'blue') + '">' + E(a.evactype) + '</span></td><td>' + when(a.dateissued || a.startdate) + '</td><td class="act"><select class="in" style="min-width:150px" data-act-change="evacLevel" data-k="' + CP.arc.oidOf(a) + '|' + E(a.zonename || '') + '"><option value=""></option>' + LV.filter(function (l) { return l !== a.evactype; }).map(function (l) { return '<option>' + l + '</option>'; }).join('') + '</select></td></tr>';
    }).join('') + '</tbody></table></div>' : '<div class="empty">No active evacuation or shelter-in-place notices.</div>';
    var rts = !rt ? '<div class="muted">Loading…</div>' : rt._err ? '<div class="warnbox">' + E(rt._err) + '</div>' : rt.length ? '<div class="tbl-wrap"><table class="t ro"><thead><tr><th>Route</th><th>Since</th><th></th></tr></thead><tbody>' + rt.map(function (x) { var a = x.attributes; return '<tr><td><b>' + E(a.routenm || 'Route') + '</b>' + (a.contraflow === 'Yes' ? ' <span class="chip warn">Contraflow</span>' : '') + '<div class="dim" style="font-size:12px">' + E(a.description || '') + '</div></td><td>' + when(a.startdate) + '</td><td class="act"><button class="btn xs" data-act="endRoute" data-a="' + CP.arc.oidOf(a) + '|' + E(a.routenm || '') + '">End</button></td></tr>'; }).join('') + '</tbody></table></div>' : '<div class="empty">No active evacuation routes.</div>';
    return '<div class="wrap">' + phead('Roads &amp; Evacuations', 'Everything here is live county-wide data. Changes post straight to the county Road Closures and Notices &amp; Evacuations layers (Overwatch, Stormwatch, public dashboard, EM website) and are logged.', acts) +
      '<div class="grid g2"><div class="grid" style="align-content:start">' + card('Active road closures &amp; detours', cl) + card('Evacuation &amp; shelter-in-place notices', ev) + card('Evacuation routes', rts) + '</div>' + mapCard + '</div></div>';
  };
  AFTER.roads = function (inc) {
    var el = document.getElementById('roadmap'); if (!el || !window.L) return;
    var m = CP.map.create(el, {}); var g = L.layerGroup().addTo(m); var pts = CP.map.drawIncident(m, inc, g);
    var c = (app().ui.cache || {}), r = c.roads && c.roads.data, e = c.evac && c.evac.data, all = L.featureGroup().addTo(m);
    if (r && !r._err) { r.closures.forEach(function (x) { var l = CP.map.esri(x.geometry); if (l) all.addLayer(l.bindPopup('<b>' + E(x.attributes.street) + '</b><br>' + E(x.attributes.description || ''))); }); r.blocks.forEach(function (x) { var l = CP.map.esri(x.geometry, { icon: CP.map.pinIcon('#ff4d58', '✕', 22) }); if (l) all.addLayer(l.bindPopup('<b>' + E(x.attributes.street) + '</b> road block')); }); }
    if (e && !e._err) e.forEach(function (x) { var l = CP.map.esri(x.geometry); if (l) all.addLayer(l.bindPopup('<b>' + E(x.attributes.zonename || '') + '</b><br>' + E(x.attributes.evactype))); });
    if (r && !r._err) (r.detours || []).forEach(function (x) { var l = CP.map.esri(x.geometry, { color: '#FDB833', weight: 5, dashArray: '8 6' }); if (l) all.addLayer(l.bindPopup('<b>Detour: ' + E(x.attributes.street) + '</b><br>' + E(x.attributes.description || ''))); });
    var rt = c.routes && c.routes.data; if (rt && !rt._err) rt.forEach(function (x) { var l = CP.map.esri(x.geometry, { color: '#2FBF71', weight: 5 }); if (l) all.addLayer(l.bindPopup('<b>Evacuation route: ' + E(x.attributes.routenm || '') + '</b><br>' + E(x.attributes.description || ''))); });
    if (all.getLayers().length) m.fitBounds(all.getBounds().pad(0.2), { maxZoom: 14 }); else if (pts.length) m.setView(pts[pts.length - 1], 12);
  };

  // ---------- SHELTERS & PODS ----------
  V.shelters = function (inc) {
    var acts = '<button class="btn pri sm" data-act="q" data-a="shelter">' + I('plus') + 'Open a shelter</button><button class="btn sm" data-act="q" data-a="pod">' + I('plus') + 'Open a distribution site</button>' + (signedIn() ? refreshBtn() : '') + '<a class="btn sm ghost" href="https://botetourt.maps.arcgis.com/apps/dashboards/7dddb021e06f4a52922526bd380a78a7" target="_blank" rel="noopener">' + I('link') + 'Shelter operations</a>';
    if (!signedIn()) return '<div class="wrap">' + phead('Shelters &amp; Distribution', 'Open, update and close shelters and distribution sites.', '') + needSignIn('Shelters and distribution sites') + '</div>';
    var d = load('sites', CP.arc.sites.list), lv = CP.arc.live || {};
    var reg = {}; (lv.shelterSummary || '').split('; ').forEach(function (p) { var i = p.lastIndexOf(': '); if (i > 0) reg[p.slice(0, i)] = +p.slice(i + 2); });
    var sh = !d ? '<div class="muted">Loading…</div>' : d._err ? '<div class="warnbox">' + E(d._err) + '</div>' : '<div class="tbl-wrap"><table class="t"><thead><tr><th>Shelter</th><th>Status</th><th>Capacity</th><th>Occupancy</th><th>Checked in (registry)</th><th>Pets</th><th>Public</th><th></th></tr></thead><tbody>' + d.shelters.map(function (x) {
      var a = x.attributes, o = CP.arc.oidOf(a), r = reg[a.facname];
      return '<tr data-oid="' + o + '"><td><b>' + E(a.facname) + '</b><div class="dim" style="font-size:12px">' + E(a.fulladdr || '') + '</div></td><td>' + '<select class="in" name="status">' + ['Open', 'Standby', 'Alert', 'Closed', 'Unknown'].map(function (s) { return '<option' + (s === a.status ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select></td><td><input class="in" type="number" name="capacity" value="' + E(a.capacity) + '" style="min-width:80px"></td><td><input class="in" type="number" name="occupancy" value="' + E(a.occupancy) + '" style="min-width:80px"></td><td>' + (r != null ? '<b>' + r + '</b> people' : '<span class="dim">—</span>') + (r != null ? ' <button class="btn xs ghost" data-act="useReg" data-a="' + r + '">use</button>' : '') + '</td><td>' + E(a.allowpets || '') + '</td><td><select class="in" name="publicview" style="min-width:80px"><option' + (a.publicview === 'Yes' ? ' selected' : '') + '>Yes</option><option' + (a.publicview !== 'Yes' ? ' selected' : '') + '>No</option></select></td><td class="act"><button class="btn xs pri" data-act="saveShelter" data-a="' + o + '">Save</button></td></tr>';
    }).join('') + '</tbody></table></div>';
    var pods = !d || d._err ? '' : d.pods.length ? '<div class="tbl-wrap"><table class="t"><thead><tr><th>Site</th><th>Status</th><th>Handing out</th><th>Public</th><th></th></tr></thead><tbody>' + d.pods.map(function (x) {
      var a = x.attributes, o = CP.arc.oidOf(a);
      return '<tr data-oid="' + o + '"><td><b>' + E(a.name) + '</b><div class="dim" style="font-size:12px">' + E(a.fulladdr || '') + '</div></td><td><select class="in" name="status">' + ['Open', 'Standby', 'Alert', 'Closed', 'Unknown'].map(function (s) { return '<option' + (s === a.status ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select></td><td>' + ['water', 'food', 'ice', 'tarps', 'comfortkits'].filter(function (k) { return a[k] === 'Yes'; }).join(', ') + '</td><td><select class="in" name="publicview" style="min-width:80px"><option' + (a.publicview === 'Yes' ? ' selected' : '') + '>Yes</option><option' + (a.publicview !== 'Yes' ? ' selected' : '') + '>No</option></select></td><td class="act"><button class="btn xs pri" data-act="savePod" data-a="' + o + '">Save</button></td></tr>';
    }).join('') + '</tbody></table></div>' : '<div class="empty">No distribution sites.</div>';
    var stats = '<div class="grid g4" style="margin-bottom:14px"><div class="stat red"><div class="v">' + (lv.shelterPop != null ? lv.shelterPop : '—') + '</div><div class="l">People in shelters</div><div class="s">from shelter check-in kiosks</div></div><div class="stat"><div class="v">' + (lv.shelterHH != null ? lv.shelterHH : '—') + '</div><div class="l">Households</div></div><div class="stat"><div class="v">' + (lv.shelterPets != null ? lv.shelterPets : '—') + '</div><div class="l">Pets</div></div><div class="stat gold"><div class="v">' + (d && !d._err ? d.shelters.filter(function (x) { return x.attributes.status === 'Open'; }).length : '—') + '</div><div class="l">Shelters open</div></div></div>';
    return '<div class="wrap">' + phead('Shelters &amp; Distribution', 'County shelters and distribution sites. Status, capacity and occupancy changes post straight to the county Shelters and Distribution Sites layers (public shelter dashboard, EM website). Check-in counts come from the shelter kiosks.', acts) + stats +
      card('Shelters', sh) + '<div style="height:14px"></div>' + card('Distribution sites (PODs)', pods) + '</div>';
  };
  AFTER.shelters = function () { if (signedIn() && !(CP.arc.live && CP.arc.live.asof)) app().refreshLive(); };

  // ---------- FIELD REPORTS ----------
  V.field = function (inc) {
    var acts = '<button class="btn pri sm" data-act="q" data-a="fieldReport">' + I('plus') + 'Field report</button><button class="btn sm" data-act="q" data-a="houseCheck">' + I('plus') + 'House check</button>' + (signedIn() ? refreshBtn() : '') + '<a class="btn sm ghost" href="https://experience.arcgis.com/experience/0f7a1564b1db45c2adcb469b56973330" target="_blank" rel="noopener">' + I('link') + 'Stormwatch Responder</a>';
    if (!signedIn()) return '<div class="wrap">' + phead('Field Reports', 'Storm reports from responders, dispatch and the public, and house checks.', '') + needSignIn('Field reports') + '</div>';
    var d = load('field', function () { return CP.arc.field.recent(3); });
    var flt = app().ui.fieldFilter || 'All';
    var list = d && !d._err ? d.filter(function (x) { return flt === 'All' || x._src === flt; }) : [];
    var srcs = ['All', 'Responder', 'Dispatch', 'Public', 'House check'];
    var body = !d ? '<div class="muted">Loading…</div>' : d._err ? '<div class="warnbox">' + E(d._err) + '</div>' : list.length ? '<div class="tbl-wrap"><table class="t ro"><thead><tr><th>Time</th><th>Source</th><th>Type</th><th>Details</th><th></th></tr></thead><tbody>' + list.slice(0, 150).map(function (x, i) {
      var a = x.attributes, t = a.type === 'other' ? (a.type_other || 'Other') : (a.type || '');
      var det = x._src === 'House check' ? [a.responderteam_name, a.number_of_residents_at_this_add ? a.number_of_residents_at_this_add + ' residents' : '', a.comments].filter(Boolean).join(' · ') : (a.comments || '');
      return '<tr><td>' + when(a.CreationDate) + '</td><td><span class="chip ' + ({ Responder: 'blue', Dispatch: 'gold', Public: 'mute', 'House check': 'red' }[x._src]) + '">' + x._src + '</span></td><td>' + E(String(t).replace(/_/g, ' ')) + '</td><td>' + E(det) + '</td><td class="act">' + (x.geometry ? '<button class="btn xs ghost" data-act="logField" data-a="' + i + '" title="Copy into the incident log">To log</button>' : '') + '</td></tr>';
    }).join('') + '</tbody></table></div>' : '<div class="empty">No reports in the last 3 days.</div>';
    app().ui.fieldList = list;
    return '<div class="wrap">' + phead('Field Reports', 'The last 3 days of Stormwatch reports (responder, dispatch, public) and house checks. New reports from here post to the same layers, so they show on Stormwatch, Overwatch and the EOC map.', acts) +
      '<div class="grid g3"><div class="span2"><div class="seg" style="margin-bottom:10px">' + srcs.map(function (s) { return '<button class="' + (s === flt ? 'on' : '') + '" data-act="fieldFilter" data-a="' + s + '">' + s + '</button>'; }).join('') + '</div>' + body + '</div><div class="card" style="padding:8px;align-self:start"><div class="map" id="fieldmap" style="height:460px"></div></div></div></div>';
  };
  AFTER.field = function (inc) {
    var el = document.getElementById('fieldmap'); if (!el || !window.L) return;
    var m = CP.map.create(el, {}); var g = L.layerGroup().addTo(m); CP.map.drawIncident(m, inc, g);
    var all = L.featureGroup().addTo(m), col = { Responder: '#3D7BFF', Dispatch: '#FDB833', Public: '#9fb2c8', 'House check': '#F0444C' };
    (app().ui.fieldList || []).forEach(function (x) { if (x.geometry) all.addLayer(L.marker([x.geometry.y, x.geometry.x], { icon: CP.map.dotIcon(col[x._src], 12) }).bindPopup('<b>' + x._src + '</b><br>' + E(String(x.attributes.type || '').replace(/_/g, ' ')) + '<br>' + E(x.attributes.comments || ''))); });
    if (all.getLayers().length) m.fitBounds(all.getBounds().pad(0.15), { maxZoom: 14 });
  };

  // ---------- actions ----------
  CP.extendActs = function (act) {
    act.q = function (k) { if (Q[k]) Q[k](); };
    act.cacheRefresh = function () { app().ui.cache = {}; app().refreshLive(); app().rerender(); };
    act.reopen = function (a) {
      var p = a.split('|');
      U.confirm((p[0] === 'detour' ? 'End ' : 'Reopen ') + p[2] + '?', 'This ends the ' + ({ block: 'road block', detour: 'detour' }[p[0]] || 'closure') + ' on the county Road Closures layer now.', p[0] === 'detour' ? 'End detour' : 'Reopen road', function () { CP.arc.roads.reopen(p[0], +p[1]).then(function () { done((p[0] === 'detour' ? 'Detour ended: ' : 'Road reopened: ') + p[2], 'Action'); }).catch(fail); });
    };
    act.endRoute = function (a) { var p = a.split('|'); U.confirm('End evacuation route ' + E(p[1]) + '?', 'Takes it off the county Evacuation Routes layer.', 'End route', function () { CP.arc.routes.end(+p[0]).then(function () { done('Evacuation route ended: ' + p[1], 'Public Info'); }).catch(fail); }); };
    act.saveShelter = function (oid) {
      var tr = document.querySelector('tr[data-oid="' + oid + '"]'); var g = function (n) { var el = tr.querySelector('[name="' + n + '"]'); return el ? el.value : ''; };
      var a = { status: g('status'), capacity: g('capacity') === '' ? null : +g('capacity'), occupancy: g('occupancy') === '' ? null : +g('occupancy'), publicview: g('publicview') };
      var name = tr.querySelector('b').textContent;
      CP.arc.sites.updShelter(+oid, a).then(function () { done('Shelter updated: ' + name + ' — ' + a.status + (a.occupancy != null ? ', ' + a.occupancy + (a.capacity ? '/' + a.capacity : '') + ' occupied' : ''), 'Event'); }).catch(fail);
    };
    act.savePod = function (oid) {
      var tr = document.querySelector('tr[data-oid="' + oid + '"]'); var g = function (n) { return tr.querySelector('[name="' + n + '"]').value; };
      var name = tr.querySelector('b').textContent;
      CP.arc.sites.updPod(+oid, { status: g('status'), publicview: g('publicview') }).then(function () { done('Distribution site updated: ' + name + ' — ' + g('status'), 'Event'); }).catch(fail);
    };
    act.useReg = function (n, t) { var tr = t.closest('tr'); tr.querySelector('[name="occupancy"]').value = n; };
    act.fieldFilter = function (s) { app().ui.fieldFilter = s; app().rerender(); };
    act.logField = function (i) { var x = (app().ui.fieldList || [])[+i]; if (!x) return; var a = x.attributes; app().log(x._src + ' report: ' + String(a.type === 'other' ? a.type_other : a.type || '').replace(/_/g, ' ') + ' — ' + (a.comments || '') + (x.geometry ? ' (' + x.geometry.y.toFixed(5) + ', ' + x.geometry.x.toFixed(5) + ')' : ''), 'Event', { ts: a.CreationDate ? new Date(a.CreationDate).toISOString() : CP.now() }); app().commit(false); U.toast('Added to the log.', 'ok'); };
  };
  CP.extendChange = function (ch) {
    ch.evacLevel = function (el) {
      if (!el.value) return; var p = el.dataset.k.split('|'), lvl = el.value;
      U.confirm('Change notice to ' + lvl + '?', 'Updates ' + E(p[1] || 'this zone') + ' on the county Notices &amp; Evacuations layer' + (lvl === 'Clear' ? ' and ends the notice.' : '.'), 'Update notice', function () { CP.arc.evac.set(+p[0], lvl).then(function () { done('Evacuation notice for ' + (p[1] || 'zone') + ' changed to ' + lvl, 'Public Info'); }).catch(fail); });
    };
  };
})(window.CP);
