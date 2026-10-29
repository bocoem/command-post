/* COMMAND POST — Overwatch, built in.
   The same live picture as the Overwatch app (CAD calls and units, VDOT, power, weather) drawn inside
   Command Post with Command Post's own ArcGIS sign-in, so it works in the side panel where the
   Experience Builder app can't sign in. */
(function (CP) {
  'use strict';
  var E = CP.esc, I = CP.ui.icon;
  var S6 = 'https://services6.arcgis.com/6h5xc2eGkGuRiFia/arcgis/rest/services/';
  var SRC = {
    vdot: S6 + 'VDOT_Incidents_ReadOnly/FeatureServer/0',
    rwx: S6 + 'VDOT_Road_Weather_ReadOnly/FeatureServer/0',
    county: S6 + 'County_Boundary/FeatureServer/0',
    power: 'https://utility.arcgis.com/usrsvcs/servers/aebf11ec0dea4f88a89928072eee0ef3/rest/services/Hosted/Join_VDEM_Regions_to_Locality_Power_Outages/FeatureServer/0',
    radar: 'https://mapservices.weather.noaa.gov/eventdriven/rest/services/radar/radar_base_reflectivity/MapServer/export'
  };
  var NEAR = ['Botetourt', 'Roanoke', 'Craig', 'Rockbridge', 'Bedford', 'Alleghany', 'Salem'];
  var COL = { FIRE: '#F0444C', EMS: '#ff6b9a', LAW: '#3D7BFF', vdot: '#F28C28', cp: '#FDB833' };
  var LAYERS = [
    { k: 'fire', n: 'Fire & EMS calls', c: COL.FIRE, on: true },
    { k: 'law', n: "Sheriff's Office calls", c: COL.LAW, on: true },
    { k: 'ufire', n: 'Fire & EMS units', c: '#ffb3b8', on: false },
    { k: 'ulaw', n: "Sheriff's Office units", c: '#9db9ff', on: false },
    { k: 'vdot', n: 'VDOT incidents', c: COL.vdot, on: true },
    { k: 'power', n: 'Power outages', c: '#c77dff', on: true },
    { k: 'nws', n: 'Weather warnings', c: '#ffd27a', on: true },
    { k: 'radar', n: 'Radar', c: '#2FBF71', on: false },
    { k: 'cp', n: 'Command Post incidents', c: COL.cp, on: true }
  ];
  var O = CP.ow = { tab: 'map', d: { calls: [], units: [], vdot: [], power: [], nws: [], rwx: [], cp: [] }, asof: '', err: '', on: {}, timer: null };
  LAYERS.forEach(function (l) { O.on[l.k] = l.on; });
  try { var pr = CP.store.prefs(); if (pr.owOn) Object.assign(O.on, pr.owOn); O.tab = pr.owTab || 'map'; } catch (e) {}

  function t(ms) { if (!ms) return ''; var d = new Date(ms); return (Date.now() - ms < 864e5 ? '' : (d.getMonth() + 1) + '/' + d.getDate() + ' ') + d.toTimeString().slice(0, 5); }
  function ago(ms) { if (!ms) return ''; var m = Math.round((Date.now() - ms) / 60000); return m < 60 ? m + ' min' : Math.floor(m / 60) + ' h ' + (m % 60) + ' m'; }
  function cat(c) { return c === 'LAW' ? 'law' : 'fire'; }

  O.refresh = async function () {
    var a = CP.arc; if (!a.signedIn()) { O.err = 'Sign in to ArcGIS to load Overwatch.'; O.paint(); return; }
    var nearW = NEAR.map(function (n) { return "name LIKE '" + n + "%'"; }).join(' OR ');
    var jobs = {
      calls: a.query(a.L.cad, '1=1', { geom: true, order: 'calldate DESC', n: 300, fields: 'callid,callcat,calltype,priority,description,fulladdr,city,calldate,agency' }),
      units: a.query(a.L.cadUnits, '1=1', { geom: true, n: 1000, fields: 'UnitID,StatusName,UnitTypeDesc,DeptName,CFSNumber,MainTypeDesc' }),
      vdot: a.query(SRC.vdot, "district='Salem' OR county LIKE '%Botetourt%'", { geom: true, order: 'start_time DESC', n: 200, fields: 'event_type,category,description,road,county,severity,lane_status,start_time,update_time,latitude,longitude' }),
      power: a.query(SRC.power, nearW, { geom: true, n: 50, fields: 'name,localitylabel,customersout,customerstracked,percent_out,lastupdateddatetime' }),
      nws: a.query(a.L.nws, "Affected LIKE '%Botetourt%'", { geom: true, n: 50, fields: 'Event,Severity,End_,Affected' }),
      rwx: a.query(SRC.rwx, "station_name LIKE 'SAL%' OR road LIKE 'I-81%'", { geom: true, n: 300, fields: 'station_name,road,direction,air_temp_f,surface_temp_f,surface_status,black_ice_signal,obs_time,is_stale,latitude,longitude' }),
      cp: a.own ? a.query(a.own.url + '/0', "status<>'Closed'", { geom: true, n: 100, fields: 'incident_name,incident_type,status,complexity,ic_name,location_desc' }) : Promise.resolve([])
    };
    var errs = [];
    await Promise.all(Object.keys(jobs).map(function (k) { return jobs[k].then(function (r) { O.d[k] = r; }).catch(function (e) { errs.push(k + ': ' + e.message); }); }));
    if (!O.county) a.query(SRC.county, '1=1', { geom: true, n: 1, fields: 'OBJECTID' }).then(function (r) { O.county = r[0] && r[0].geometry; O.draw(); }).catch(function () {});
    O.asof = new Date().toTimeString().slice(0, 5); O.err = errs.join(' · ');
    O.paint();
  };

  O.mount = function (box) {
    O.box = box; box.classList.add('ow');
    box.innerHTML = '<div class="owbar" id="owBar"></div><div class="owbody"><div class="owmap" id="owMap"></div><div class="owlist" id="owList"></div></div>';
    O.paint();
    O.refresh();
    clearInterval(O.timer); O.timer = setInterval(function () { if (CP.liveApps.open && CP.liveApps.cur === 'overwatch') O.refresh(); }, 60000);
  };

  O.counts = function () {
    var c = O.d.calls.map(function (f) { return f.attributes.callcat; });
    var bot = O.d.vdot.filter(function (f) { return /Botetourt/i.test(f.attributes.county || ''); }).length;
    var pw = O.d.power.find(function (f) { return /^Botetourt/.test(f.attributes.name || ''); });
    return { fire: c.filter(function (x) { return x !== 'LAW'; }).length, law: c.filter(function (x) { return x === 'LAW'; }).length, vdot: O.d.vdot.length, vbot: bot, pout: pw ? pw.attributes.customersout || 0 : 0, nws: O.d.nws.length };
  };

  O.paint = function () {
    if (!O.box) return;
    var n = O.counts();
    var tabs = [['map', 'Map', ''], ['fire', 'Fire & EMS', n.fire], ['law', 'Sheriff', n.law], ['vdot', 'VDOT', n.vdot], ['power', 'Power', O.powerStale() ? '!' : (n.pout ? n.pout.toLocaleString() : 0)], ['wx', 'Weather', n.nws]];
    O.box.querySelector('#owBar').innerHTML = tabs.map(function (x) { return '<button class="' + (O.tab === x[0] ? 'on' : '') + '" data-act="owTab" data-a="' + x[0] + '">' + x[1] + (x[2] !== '' ? ' <b>' + x[2] + '</b>' : '') + '</button>'; }).join('') +
      '<span class="owasof">' + (O.err ? '<span title="' + E(O.err) + '" style="color:#ffb3b8">⚠ </span>' : '') + (O.asof ? 'Updated ' + O.asof : 'Loading…') + ' <button class="ibtn" data-act="owRefresh" title="Refresh now">' + I('refresh') + '</button></span>';
    var mapEl = O.box.querySelector('#owMap'), list = O.box.querySelector('#owList');
    mapEl.style.display = O.tab === 'map' ? 'block' : 'none';
    list.style.display = O.tab === 'map' ? 'none' : 'block';
    if (O.tab === 'map') { O.ensureMap(); O.draw(); setTimeout(function () { O.map && O.map.invalidateSize(); }, 50); }
    else list.innerHTML = O.listHtml(O.tab);
  };

  O.ensureMap = function () {
    if (O.map) return;
    var el = O.box.querySelector('#owMap');
    el.innerHTML = '<div id="owLeaf" style="position:absolute;inset:0"></div><div class="owleg" id="owLeg"></div>';
    O.map = CP.map.create(el.querySelector('#owLeaf'), {});
    O.g = {}; LAYERS.forEach(function (l) { O.g[l.k] = L.layerGroup(); });
    O.map.on('moveend', function () { if (O.on.radar) O.radar(); });
  };

  O.radar = function () {
    if (!O.map) return;
    var b = O.map.getBounds(), s = O.map.getSize();
    var url = SRC.radar + '?bbox=' + [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()].join(',') + '&bboxSR=4326&imageSR=3857&size=' + s.x + ',' + s.y + '&format=png32&transparent=true&f=image&_=' + Math.floor(Date.now() / 300000);
    O.g.radar.clearLayers(); O.g.radar.addLayer(L.imageOverlay(url, b, { opacity: 0.65 }));
  };

  function pop(title, rows) { return '<b>' + E(title || '') + '</b>' + rows.filter(function (r) { return r[1] != null && r[1] !== ''; }).map(function (r) { return '<br><span style="color:#93A9C3">' + r[0] + ':</span> ' + E(String(r[1])); }).join(''); }

  O.draw = function () {
    if (!O.map) return;
    var g = O.g, unitsBy = {};
    Object.keys(g).forEach(function (k) { if (k !== 'radar') g[k].clearLayers(); });
    O.d.units.forEach(function (f) { var a = f.attributes; if (a.CFSNumber) (unitsBy[a.CFSNumber] = unitsBy[a.CFSNumber] || []).push(a.UnitID); });
    if (O.county && !O._cty) { O._cty = CP.map.esri(O.county, { color: '#FDB833', weight: 2, fill: false, dashArray: '6 4', interactive: false }); O._cty && O._cty.addTo(O.map); }
    O.d.calls.forEach(function (f) {
      var a = f.attributes, gm = f.geometry; if (!gm) return;
      var m = L.marker([gm.y, gm.x], { icon: CP.map.dotIcon(COL[a.callcat] || COL.FIRE, 14) }).bindPopup(pop(a.calltype, [['Call', a.callid], ['Address', a.fulladdr], ['Priority', a.priority], ['Received', t(a.calldate)], ['Units', (unitsBy[a.callid] || []).join(', ')], ['Notes', a.description]]));
      g[cat(a.callcat)].addLayer(m);
    });
    O.d.units.forEach(function (f) {
      var a = f.attributes, gm = f.geometry; if (!gm || gm.x == null) return;
      var law = a.MainTypeDesc === 'LAW';
      g[law ? 'ulaw' : 'ufire'].addLayer(L.marker([gm.y, gm.x], { icon: L.divIcon({ className: '', iconSize: null, html: '<div class="owunit" style="border-color:' + (law ? COL.LAW : COL.FIRE) + '">' + E(a.UnitID) + '</div>' }) }).bindPopup(pop(a.UnitID, [['Status', a.StatusName], ['Type', a.UnitTypeDesc], ['Agency', a.DeptName], ['On call', a.CFSNumber]])));
    });
    O.d.vdot.forEach(function (f) {
      var a = f.attributes, lat = a.latitude || (f.geometry && f.geometry.y), lng = a.longitude || (f.geometry && f.geometry.x); if (lat == null) return;
      g.vdot.addLayer(L.marker([lat, lng], { icon: L.divIcon({ className: '', iconSize: [18, 18], iconAnchor: [9, 9], html: '<div class="owdia" style="background:' + COL.vdot + '"></div>' }) }).bindPopup(pop(a.event_type, [['Road', a.road], ['County', a.county], ['Lanes', a.lane_status], ['Severity', a.severity], ['Since', t(a.start_time)], ['', a.description]])));
    });
    var stale = O.powerStale();
    O.d.power.forEach(function (f) {
      var a = f.attributes, p = stale ? 0 : (a.percent_out || 0) * 100; if (!f.geometry) return;
      var col = stale ? '#93A9C3' : p >= 10 ? '#F0444C' : p >= 2 ? '#F28C28' : p > 0 ? '#ffd27a' : '#2FBF71';
      var lyr = CP.map.esri(f.geometry, { color: col, weight: 1, fillColor: col, fillOpacity: p > 0 ? 0.22 : 0.05 });
      if (lyr) g.power.addLayer(lyr.bindPopup(pop(a.localitylabel || a.name, [['Customers out', (a.customersout || 0).toLocaleString()], ['Tracked', (a.customerstracked || 0).toLocaleString()], ['Percent out', p.toFixed(2) + '%'], ['Updated', t(a.lastupdateddatetime)]])));
    });
    O.d.nws.forEach(function (f) {
      var a = f.attributes, lyr = CP.map.esri(f.geometry, { color: '#ffd27a', weight: 2, fillOpacity: 0.12 });
      if (lyr) g.nws.addLayer(lyr.bindPopup(pop(a.Event, [['Severity', a.Severity], ['Until', t(a.End_)]])));
    });
    O.d.cp.forEach(function (f) {
      var a = f.attributes, gm = f.geometry; if (!gm) return;
      g.cp.addLayer(L.marker([gm.y, gm.x], { icon: L.divIcon({ className: '', iconSize: [20, 20], iconAnchor: [10, 10], html: '<div class="owdia" style="background:' + COL.cp + ';width:16px;height:16px"></div>' }) }).bindPopup(pop(a.incident_name, [['Type', a.incident_type], ['Status', a.status], ['Type level', a.complexity], ['IC', a.ic_name], ['Where', a.location_desc]])));
    });
    LAYERS.forEach(function (l) { var on = O.on[l.k]; if (on && !O.map.hasLayer(g[l.k])) g[l.k].addTo(O.map); if (!on && O.map.hasLayer(g[l.k])) O.map.removeLayer(g[l.k]); });
    if (O.on.radar) O.radar();
    var leg = O.box.querySelector('#owLeg');
    if (leg) leg.innerHTML = '<div class="owlegh">Layers</div>' + LAYERS.map(function (l) { return '<label><input type="checkbox" data-act-change="owLayer" data-a="' + l.k + '"' + (O.on[l.k] ? ' checked' : '') + '><i style="background:' + l.c + '"></i>' + l.n + '</label>'; }).join('');
  };

  O.powerStale = function () { var m = 0; O.d.power.forEach(function (f) { m = Math.max(m, f.attributes.lastupdateddatetime || 0); }); return m && Date.now() - m > 6 * 3600e3 ? m : 0; };
  O.listHtml = function (tab) {
    var h = '';
    if (tab === 'fire' || tab === 'law') {
      var units = {}; O.d.units.forEach(function (f) { var a = f.attributes; if (a.CFSNumber) (units[a.CFSNumber] = units[a.CFSNumber] || []).push(a); });
      var rows = O.d.calls.filter(function (f) { return cat(f.attributes.callcat) === tab; });
      if (!rows.length) return '<div class="owempty">No active ' + (tab === 'law' ? "Sheriff's Office" : 'Fire & EMS') + ' calls.</div>';
      rows.forEach(function (f) {
        var a = f.attributes, u = units[a.callid] || [];
        h += '<div class="owcard" style="border-left-color:' + (COL[a.callcat] || COL.FIRE) + '"><div class="owt"><b>' + E(a.calltype || '') + '</b><span>' + E(a.callcat || '') + (a.priority ? ' · P' + E(a.priority) : '') + ' · ' + ago(a.calldate) + '</span></div>' +
          '<div class="owa">' + E(a.fulladdr || '') + '</div>' + (a.description ? '<div class="owd">' + E(a.description) + '</div>' : '') +
          '<div class="owu">' + (u.length ? u.map(function (x) { return '<span>' + E(x.UnitID) + ' <i>' + E(x.StatusName || '') + '</i></span>'; }).join('') : '<em>No units assigned</em>') +
          (f.geometry ? '<button class="ibtn" data-act="owZoom" data-a="' + f.geometry.y + ',' + f.geometry.x + '" title="Show on map">' + I('pin') + '</button>' : '') + '</div></div>';
      });
      return h;
    }
    if (tab === 'vdot') {
      var v = O.d.vdot.slice().sort(function (x, y) { return (/Botetourt/i.test(y.attributes.county || '') ? 1 : 0) - (/Botetourt/i.test(x.attributes.county || '') ? 1 : 0); });
      if (!v.length) return '<div class="owempty">No VDOT incidents in the Salem District.</div>';
      return '<div class="ownote">VDOT Salem District, Botetourt first.</div>' + v.map(function (f) {
        var a = f.attributes, lat = a.latitude || (f.geometry && f.geometry.y), lng = a.longitude || (f.geometry && f.geometry.x);
        return '<div class="owcard" style="border-left-color:' + COL.vdot + '"><div class="owt"><b>' + E(a.event_type || a.category || '') + '</b><span>' + E(a.county || '') + ' · ' + ago(a.start_time) + '</span></div><div class="owa">' + E(a.road || '') + '</div>' +
          (a.lane_status ? '<div class="owd">' + E(a.lane_status) + '</div>' : '') + '<div class="owu"><em>' + E(a.severity || '') + '</em>' + (lat != null ? '<button class="ibtn" data-act="owZoom" data-a="' + lat + ',' + lng + '" title="Show on map">' + I('pin') + '</button>' : '') + '</div></div>';
      }).join('');
    }
    if (tab === 'power') {
      var p = O.d.power.slice().sort(function (x, y) { return (/^Botetourt/.test(y.attributes.name) ? 1e9 : 0) + (y.attributes.customersout || 0) - (/^Botetourt/.test(x.attributes.name) ? 1e9 : 0) - (x.attributes.customersout || 0); });
      var st = O.powerStale();
      return (st ? '<div class="owcard" style="border-left-color:#F0444C"><b>Outage feed is out of date</b><div class="owd">The VDEM power-outage layer last updated ' + new Date(st).toLocaleString() + '. These numbers are not current; check the utility outage maps directly.</div></div>' : '') + '<div class="ownote">Customers without power, Botetourt and neighbors (VDEM).</div><table class="owtab"><tr><th>Locality</th><th>Out</th><th>%</th><th>Updated</th></tr>' + p.map(function (f) { var a = f.attributes; return '<tr' + (/^Botetourt/.test(a.name) ? ' class="me"' : '') + '><td>' + E(a.localitylabel || a.name) + '</td><td>' + (a.customersout || 0).toLocaleString() + '</td><td>' + ((a.percent_out || 0) * 100).toFixed(2) + '</td><td>' + t(a.lastupdateddatetime) + '</td></tr>'; }).join('') + '</table>';
    }
    if (tab === 'wx') {
      h = '<div class="ownote">Weather warnings for Botetourt County</div>' + (O.d.nws.length ? O.d.nws.map(function (f) { var a = f.attributes; return '<div class="owcard" style="border-left-color:#ffd27a"><div class="owt"><b>' + E(a.Event) + '</b><span>' + E(a.Severity || '') + '</span></div><div class="owa">Until ' + t(a.End_) + '</div></div>'; }).join('') : '<div class="owempty">No active watches or warnings.</div>');
      var r = O.d.rwx.filter(function (f) { return f.attributes.is_stale !== 'Yes'; });
      if (r.length) h += '<div class="ownote" style="margin-top:14px">VDOT road weather stations (I-81 / Salem)</div><table class="owtab"><tr><th>Station</th><th>Air</th><th>Road</th><th>Surface</th></tr>' + r.slice(0, 40).map(function (f) { var a = f.attributes, ice = /ice/i.test(a.black_ice_signal || '') && !/no ice/i.test(a.black_ice_signal || ''); return '<tr' + (ice ? ' class="me"' : '') + '><td>' + E((a.road || '') + ' ' + (a.direction || '')) + '<br><small>' + E(a.station_name || '') + '</small></td><td>' + (a.air_temp_f != null ? Math.round(a.air_temp_f) + '°' : '') + '</td><td>' + (a.surface_temp_f != null ? Math.round(a.surface_temp_f) + '°' : '') + '</td><td>' + E(a.surface_status || '') + (ice ? ' ⚠' : '') + '</td></tr>'; }).join('') + '</table>';
      return h;
    }
    return '';
  };

  CP.extendOwActs = function (act, chg) {
    act.owTab = function (k) { O.tab = k; CP.store.setPref('owTab', k); O.paint(); };
    act.owRefresh = function () { O.asof = ''; O.paint(); O.refresh(); };
    act.owZoom = function (ll) { var p = ll.split(',').map(Number); O.tab = 'map'; O.paint(); setTimeout(function () { O.map.setView(p, 16); }, 80); };
    chg.owLayer = function (el) { var k = el.dataset.a; O.on[k] = el.checked; CP.store.setPref('owOn', O.on); O.draw(); };
  };
})(window.CP);
