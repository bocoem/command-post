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
    usgs: 'https://waterservices.usgs.gov/nwis/iv/?format=json&siteStatus=active&period=PT24H&parameterCd=00065,00060,00045&bBox=-80.25,37.20,-79.40,37.95',
    nwsg: 'https://services9.arcgis.com/RHVPKKiFTONKtxq3/arcgis/rest/services/Live_Stream_Gauges_v1/FeatureServer/0',
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
    { k: 'river', n: 'River gauges', c: '#3D9BFF', on: false },
    { k: 'rain', n: 'Rain gauges', c: '#2FBF71', on: false },
    { k: 'air', n: 'Air quality (EPA + PurpleAir)', c: '#9b7bff', on: true },
    { k: 'radar', n: 'Radar (loop)', c: '#7CFC9A', on: true },
    { k: 'cp', n: 'Command Post incidents', c: COL.cp, on: true }
  ];
  var O = CP.ow = { tab: 'map', d: { calls: [], units: [], vdot: [], power: [], nws: [], rwx: [], cp: [], gauges: [], air: [], airnow: [] }, asof: '', err: '', on: {}, timer: null };
  LAYERS.forEach(function (l) { O.on[l.k] = l.on; });
  try { var pr = CP.store.prefs(); if (pr.owOn2) Object.assign(O.on, pr.owOn2); O.tab = pr.owTab || 'map'; } catch (e) {}

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
    jobs.airnow = fetch('https://services.arcgis.com/cJ9YHowT8TU7DUyn/arcgis/rest/services/Air_Now_Current_Monitors_Ozone_and_PM/FeatureServer/0/query?f=json&where=1%3D1&outFields=SiteName,DataSource,OZONEPM_AQI,OZONE_AQI,PM25_AQI,PM10_AQI,ValidTime,ReportingArea_PipeDelimited&returnGeometry=true&outSR=4326&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&geometry=-80.6,37.0,-79.0,38.1').then(function (r) { return r.json(); }).then(function (j) { if (j.error) throw new Error(j.error.message); return j.features || []; });
    var errs = [];
    await Promise.all(Object.keys(jobs).map(function (k) { return jobs[k].then(function (r) { O.d[k] = r; }).catch(function (e) { errs.push(k + ': ' + e.message); }); }));
    if (!O.county) a.query(SRC.county, '1=1', { geom: true, n: 1, fields: 'OBJECTID' }).then(function (r) { O.county = r[0] && r[0].geometry; O.draw(); }).catch(function () {});
    if (O.on.radar && O.map) O.radarValid();
    O.asof = new Date().toTimeString().slice(0, 5); O.err = errs.join(' · ');
    O.paint();
    if (!O.aLoading && (!O.aAt || Date.now() - O.aAt > 15 * 60000)) {
      O.aLoading = true;
      O.loadAir().then(function (x) { O.d.air = x; O.aAt = Date.now(); O.aErr = ''; }).catch(function (e) { O.aErr = e.message; O.aAt = Date.now(); }).then(function () { O.aLoading = false; O.paint(); });
    }
    if (!O.gLoading && (!O.gAt || Date.now() - O.gAt > 5 * 60000)) {
      O.gLoading = true;
      O.loadGauges().then(function (g) { O.d.gauges = g; O.gAt = Date.now(); O.gErr = ''; }).catch(function (e) { O.gErr = e.message; }).then(function () { O.gLoading = false; O.paint(); });
    }
  };

  // ---- river & rain gauges: USGS live readings + NWS flood status ----
  function miles(a, b, c, d) { var R = 3958.8, r = Math.PI / 180, x = Math.sin((c - a) * r / 2), y = Math.sin((d - b) * r / 2); return 2 * R * Math.asin(Math.sqrt(x * x + Math.cos(a * r) * Math.cos(c * r) * y * y)); }
  function inRings(lat, lng, rings) { var ins = false; (rings || []).forEach(function (p) { for (var i = 0, j = p.length - 1; i < p.length; j = i++) { var yi = p[i][1], xi = p[i][0], yj = p[j][1], xj = p[j][0]; if (((yi > lat) !== (yj > lat)) && (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi)) ins = !ins; } }); return ins; }
  function toCounty(lat, lng) {
    var g = O.county, rr = g && (g.rings || g.paths); if (!rr) return null;
    if (inRings(lat, lng, rr)) return 0;
    var best = 1e9; rr.forEach(function (p) { for (var i = 0; i < p.length; i += 3) { var d = miles(lat, lng, p[i][1], p[i][0]); if (d < best) best = d; } }); return best;
  }
  function nice(n) { return String(n || '').toLowerCase().replace(/\b([a-z])/g, function (m) { return m.toUpperCase(); }).replace(/\bVa\b/, 'VA').replace(/\bWv\b/, 'WV').replace(/\b(Nr|Bl|At|Near|Above|Below|In)\b/g, function (m) { return m.toLowerCase(); }).replace(/'S\b/g, "'s").replace(/\s+at\s*,?\s*$/i, '').replace(/\s+/g, ' ').trim(); }
  O.loadGauges = async function () {
    var j = await fetch(SRC.usgs).then(function (r) { return r.json(); });
    var nws = await CP.arc.query(SRC.nwsg, "org='NOAA'", { geom: true, n: 200, fields: 'stationid,name,status,status_24h,status_48h,stage_ft,stationurl,graphurl,lastupdate', extra: { geometry: '-80.25,37.20,-79.40,37.95', geometryType: 'esriGeometryEnvelope', inSR: 4326, spatialRel: 'esriSpatialRelIntersects' } }).catch(function () { return []; });
    var sites = {}, now = Date.now();
    (j.value && j.value.timeSeries || []).forEach(function (ts) {
      var si = ts.sourceInfo, id = si.siteCode[0].value, p = ts.variable.variableCode[0].value;
      var vals = (ts.values[0] && ts.values[0].value || []).map(function (v) { return { t: Date.parse(v.dateTime), v: parseFloat(v.value) }; }).filter(function (v) { return !isNaN(v.v) && v.v > -999; });
      if (!vals.length) return;
      var last = vals[vals.length - 1]; if (now - last.t > 6 * 3600e3) return; // skip gauges not reporting
      var s = sites[id] = sites[id] || { id: id, name: nice(si.siteName), lat: si.geoLocation.geogLocation.latitude, lng: si.geoLocation.geogLocation.longitude, t: 0 };
      s.t = Math.max(s.t, last.t);
      if (p === '00065') { s.stage = last.v; var old = vals.filter(function (v) { return v.t <= last.t - 3 * 3600e3; }).pop(); if (old) s.trend = last.v - old.v; var mx = Math.max.apply(null, vals.map(function (v) { return v.v; })); s.max24 = mx; }
      if (p === '00060') s.flow = last.v;
      if (p === '00045') { var sum = function (h) { return vals.filter(function (v) { return v.t > last.t - h * 3600e3; }).reduce(function (a, v) { return a + v.v; }, 0); }; s.rain = { h1: sum(1), h6: sum(6), h24: sum(24) }; }
    });
    var out = Object.keys(sites).map(function (k) { return sites[k]; });
    nws.forEach(function (f) { // attach NWS flood status to the nearest USGS gauge (within half a mile), else keep it on its own
      var a = f.attributes, g = f.geometry; if (!g) return;
      var near = out.filter(function (s) { return miles(s.lat, s.lng, g.y, g.x) < 0.5; })[0];
      var st = { status: a.status, f24: a.status_24h, f48: a.status_48h, url: a.stationurl, graph: a.graphurl };
      if (near) near.nws = st; else if (a.lastupdate && now - a.lastupdate < 6 * 3600e3) out.push({ id: a.stationid, name: nice(a.name), lat: g.y, lng: g.x, stage: a.stage_ft, t: a.lastupdate, nws: st });
    });
    return out;
  };
  var FLOOD = { 'Major Flooding': ['#c21bd6', 4], 'Moderate Flooding': ['#F0444C', 3], 'Minor Flooding': ['#F28C28', 2], 'Action': ['#ffd27a', 1], 'Near Flood Stage': ['#ffd27a', 1] };
  function flood(s) { var n = s.nws; if (!n) return null; var w = [n.status, n.f24, n.f48].map(function (x) { return FLOOD[x] ? x : null; }).filter(Boolean).sort(function (a, b) { return FLOOD[b][1] - FLOOD[a][1]; })[0]; return { now: n.status || '', worst: w || '', col: w ? FLOOD[w][0] : '#3D9BFF' }; }
  O.gaugeList = function () {
    return O.d.gauges.map(function (s) { s.dc = toCounty(s.lat, s.lng); return s; }).filter(function (s) { return s.dc == null || s.dc <= 12; })
      .sort(function (a, b) { var fa = flood(a), fb = flood(b), wa = fa && fa.worst ? FLOOD[fa.worst][1] : 0, wb = fb && fb.worst ? FLOOD[fb.worst][1] : 0; return (wb - wa) || ((a.dc || 0) - (b.dc || 0)); });
  };

  // ---- air quality: PurpleAir outdoor sensors, EPA US-wide correction, AQI ----
  var AQI_BP = [[0, 9.0, 0, 50], [9.1, 35.4, 51, 100], [35.5, 55.4, 101, 150], [55.5, 125.4, 151, 200], [125.5, 225.4, 201, 300], [225.5, 325.4, 301, 500]];
  var AQI_CAT = [[50, 'Good', '#00e400'], [100, 'Moderate', '#ffff00'], [150, 'Unhealthy for sensitive groups', '#ff7e00'], [200, 'Unhealthy', '#ff0000'], [300, 'Very unhealthy', '#8f3f97'], [1e9, 'Hazardous', '#7e0023']];
  function epa(pm, rh) { if (pm == null) return null; var v = pm <= 343 ? 0.524 * pm - 0.0862 * (rh == null ? 50 : rh) + 5.75 : 0.46 * pm + 3.93e-4 * pm * pm + 2.97; return Math.max(0, v); }
  function aqi(pm) { if (pm == null) return null; pm = Math.floor(pm * 10) / 10; for (var i = 0; i < AQI_BP.length; i++) { var b = AQI_BP[i]; if (pm <= b[1]) return Math.round((b[3] - b[2]) / (b[1] - b[0]) * (pm - b[0]) + b[2]); } return 500; }
  function aqiCat(v) { for (var i = 0; i < AQI_CAT.length; i++) if (v <= AQI_CAT[i][0]) return AQI_CAT[i]; return AQI_CAT[5]; }
  O.airKey = null; // '' = none saved
  O.loadAir = async function () {
    if (O.airKey == null) O.airKey = await CP.arc.settings.get('purpleair_read_key').catch(function () { return ''; });
    if (!O.airKey) return [];
    var u = 'https://api.purpleair.com/v1/sensors?fields=name,latitude,longitude,pm2.5_cf_1,pm2.5_60minute,humidity,last_seen&location_type=0&max_age=7200&nwlng=-80.35&nwlat=37.95&selng=-79.35&selat=37.15';
    var r = await fetch(u, { headers: { 'X-API-Key': O.airKey } });
    var j = await r.json();
    if (!r.ok || j.error) throw new Error((j.description || j.error || ('HTTP ' + r.status)));
    var F = j.fields, ix = function (n) { return F.indexOf(n); };
    return (j.data || []).map(function (d) {
      var rh = d[ix('humidity')], now = epa(d[ix('pm2.5_cf_1')], rh), hr = epa(d[ix('pm2.5_60minute')], rh);
      return { id: d[ix('sensor_index')], name: d[ix('name')], lat: d[ix('latitude')], lng: d[ix('longitude')], pm: now, pm60: hr, aqi: aqi(now), aqi60: aqi(hr), rh: rh, seen: d[ix('last_seen')] * 1000, conf: d[ix('confidence')] };
    }).filter(function (x) { return x.lat != null && x.aqi != null; });
  };
  O.airnowList = function () {
    return O.d.airnow.map(function (f) { var a = f.attributes, g = f.geometry || {}; var dom = [['PM2.5', a.PM25_AQI], ['Ozone', a.OZONE_AQI], ['PM10', a.PM10_AQI != null ? Math.round(+a.PM10_AQI) : null]].filter(function (x) { return x[1] != null && x[1] !== ''; }).sort(function (x, y) { return y[1] - x[1]; });
      return { name: a.SiteName, src: a.DataSource, area: a.ReportingArea_PipeDelimited, aqi: a.OZONEPM_AQI, by: dom.length ? dom[0][0] : '', parts: dom, t: a.ValidTime, lat: g.y, lng: g.x, dc: toCounty(g.y, g.x) };
    }).filter(function (x) { return x.aqi != null && x.lat != null && (x.dc == null || x.dc <= 30); }).sort(function (a, b) { return (a.dc || 0) - (b.dc || 0); });
  };
  O.airList = function () { return O.d.air.map(function (s) { s.dc = toCounty(s.lat, s.lng); return s; }).filter(function (s) { return s.dc == null || s.dc <= 12; }).sort(function (a, b) { return ((a.dc ? 1 : 0) - (b.dc ? 1 : 0)) || (b.aqi - a.aqi); }); };

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
    var tabs = [['map', 'Map', ''], ['fire', 'Fire & EMS', n.fire], ['law', 'Sheriff', n.law], ['vdot', 'VDOT', n.vdot], ['power', 'Power', O.powerStale() ? '!' : (n.pout ? n.pout.toLocaleString() : 0)], ['water', 'Water', O.gAt ? (O.gaugeList().filter(function (x) { var f = flood(x); return f && f.worst; }).length || '') : ''], ['air', 'Air', (function () { var v = O.airnowList().map(function (x) { return x.aqi; }).concat(O.airList().filter(function (x) { return x.dc === 0; }).map(function (x) { return x.aqi; })); return v.length ? Math.max.apply(null, v) : ''; })()], ['wx', 'Weather', n.nws]];
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
    el.innerHTML = '<div id="owLeaf" style="position:absolute;inset:0"></div><div class="owleg" id="owLeg"></div><div class="owrad" id="owRad"></div>';
    O.map = CP.map.create(el.querySelector('#owLeaf'), {});
    O.g = {}; LAYERS.forEach(function (l) { O.g[l.k] = L.layerGroup(); });

  };

  // Animated radar: NEXRAD base reflectivity from the Iowa Environmental Mesonet, last 50 minutes in 5-minute frames.
  var RF = ['-m50m', '-m45m', '-m40m', '-m35m', '-m30m', '-m25m', '-m20m', '-m15m', '-m10m', '-m05m', ''];
  var R = O.rad = { frames: [], i: RF.length - 1, play: true, timer: null, valid: 0 };
  O.radarValid = function () { return fetch('https://mesonet.agron.iastate.edu/data/gis/images/4326/USCOMP/n0q_0.json').then(function (r) { return r.json(); }).then(function (j) { var v = Date.parse(j.meta.valid); if (v && v !== R.valid) { R.valid = v; O.radarBuild(); } }).catch(function () {}); };
  O.radarBuild = function () {
    if (!O.map) return;
    O.g.radar.clearLayers(); R.frames = RF.map(function (f, i) {
      var l = L.tileLayer('https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/nexrad-n0q-900913' + f + '/{z}/{x}/{y}.png?v=' + R.valid, { opacity: i === R.i ? 0.7 : 0, maxNativeZoom: 12, attribution: 'Radar: NWS NEXRAD via Iowa Environmental Mesonet' });
      O.g.radar.addLayer(l); return l;
    });
    O.radarShow(R.i);
  };
  O.radarShow = function (i) {
    R.i = i; R.frames.forEach(function (l, k) { l.setOpacity(k === i ? 0.7 : 0); });
    var el = O.box && O.box.querySelector('#owRad'); if (!el) return;
    var ts = R.valid ? R.valid - (RF.length - 1 - i) * 300000 : 0, ago = (RF.length - 1 - i) * 5;
    el.innerHTML = '<button class="ibtn" data-act="owRadPlay" title="' + (R.play ? 'Pause' : 'Play') + '">' + (R.play ? '❚❚' : '►') + '</button><input type="range" min="0" max="' + (RF.length - 1) + '" value="' + i + '" data-act-change="owRadSeek"><span>' + (ts ? new Date(ts).toTimeString().slice(0, 5) : '') + (ago ? ' <i>−' + ago + ' min</i>' : ' <b>latest</b>') + '</span>';
  };
  O.radarRun = function () {
    clearTimeout(R.timer);
    if (!O.on.radar || !R.play || !O.map) return;
    var last = R.i === RF.length - 1;
    R.timer = setTimeout(function () { if (!O.box || O.box.style.display === 'none' || O.tab !== 'map') { R.timer = setTimeout(O.radarRun, 2000); return; } O.radarShow(last ? 0 : R.i + 1); O.radarRun(); }, last ? 1800 : 550);
  };
  O.radar = function () {
    var el = O.box && O.box.querySelector('#owRad'); if (el) el.style.display = O.on.radar ? 'flex' : 'none';
    if (!O.on.radar) { clearTimeout(R.timer); return; }
    if (!R.frames.length) { if (R.valid) O.radarBuild(); else O.radarValid(); }
    O.radarRun();
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
    O.gaugeList().forEach(function (s) {
      var fl = flood(s), rainOnly = s.stage == null && s.rain, col = rainOnly ? '#2FBF71' : (fl ? fl.col : '#3D9BFF');
      var lbl = rainOnly ? (s.rain.h24 ? s.rain.h24.toFixed(2) + '"' : '0"') : (s.stage != null ? s.stage.toFixed(1) + "'" : '');
      var html = '<div class="owgauge' + (rainOnly ? ' rain' : '') + '" style="border-color:' + col + '">' + lbl + '</div>';
      g[rainOnly ? 'rain' : 'river'].addLayer(L.marker([s.lat, s.lng], { icon: L.divIcon({ className: '', iconSize: null, html: html }) }).bindPopup(pop(s.name, [['Stage', s.stage != null ? s.stage.toFixed(2) + ' ft' + (s.trend != null ? (s.trend > 0.05 ? ' ▲ rising' : s.trend < -0.05 ? ' ▼ falling' : ' steady') : '') : ''], ['Flow', s.flow != null ? Math.round(s.flow).toLocaleString() + ' cfs' : ''], ['NWS status', fl ? fl.now : ''], ['Forecast', fl && fl.worst && fl.worst !== fl.now ? fl.worst : ''], ['Rain 1 h / 6 h / 24 h', s.rain ? s.rain.h1.toFixed(2) + ' / ' + s.rain.h6.toFixed(2) + ' / ' + s.rain.h24.toFixed(2) + ' in' : ''], ['Reading', t(s.t)]]) + '<br><a href="' + (s.nws && s.nws.url || 'https://waterdata.usgs.gov/monitoring-location/' + s.id + '/') + '" target="_blank" rel="noopener">Gauge page ↗</a>'));
    });
    O.airnowList().forEach(function (s) {
      var c = aqiCat(s.aqi);
      g.air.addLayer(L.marker([s.lat, s.lng], { icon: L.divIcon({ className: '', iconSize: [30, 26], iconAnchor: [15, 13], html: '<div class="owaqi epa" style="background:' + c[2] + ';color:' + (s.aqi <= 150 ? '#0B1A2B' : '#fff') + '">' + s.aqi + '</div>' }) })
        .bindPopup(pop(s.name + ' (EPA AirNow monitor)', [['AQI', s.aqi + ' — ' + c[1] + (s.by ? ' (' + s.by + ')' : '')], ['Readings', s.parts.map(function (p) { return p[0] + ' ' + p[1]; }).join(' · ')], ['Operator', s.src], ['Hour', t(s.t)]]) + '<br><a href="https://www.airnow.gov/?city=' + encodeURIComponent(s.area || 'Roanoke') + '&state=VA&country=USA" target="_blank" rel="noopener">AirNow ↗</a>'));
    });
    O.airList().forEach(function (s) {
      var c = aqiCat(s.aqi);
      g.air.addLayer(L.marker([s.lat, s.lng], { icon: L.divIcon({ className: '', iconSize: [26, 26], iconAnchor: [13, 13], html: '<div class="owaqi" style="background:' + c[2] + ';color:' + (s.aqi > 100 && s.aqi <= 150 || s.aqi <= 100 ? '#0B1A2B' : '#fff') + '">' + s.aqi + '</div>' }) })
        .bindPopup(pop(s.name, [['AQI now', s.aqi + ' — ' + c[1]], ['AQI 1-hour avg', s.aqi60 != null ? s.aqi60 + ' — ' + aqiCat(s.aqi60)[1] : ''], ['PM2.5 (EPA-corrected)', s.pm != null ? s.pm.toFixed(1) + ' µg/m³' : ''], ['Humidity', s.rh != null ? s.rh + '%' : ''], ['Last reading', t(s.seen)]]) + '<br><a href="https://map.purpleair.com/?select=' + s.id + '" target="_blank" rel="noopener">PurpleAir page ↗</a>'));
    });
    LAYERS.forEach(function (l) { var on = O.on[l.k]; if (on && !O.map.hasLayer(g[l.k])) g[l.k].addTo(O.map); if (!on && O.map.hasLayer(g[l.k])) O.map.removeLayer(g[l.k]); });
    O.radar();
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
    if (tab === 'air') {
      var an = O.airnowList(), where = function (x) { return x.dc == null ? '' : x.dc === 0 ? '<span class="owin">In county</span>' : Math.round(x.dc) + ' mi out'; };
      h = '<div class="ownote">EPA AirNow monitors (' + an.length + ')</div>';
      h += an.length ? '<table class="owtab"><tr><th>Monitor</th><th>AQI</th><th>Readings</th><th></th></tr>' + an.map(function (x) { var c = aqiCat(x.aqi); return '<tr' + (x.aqi > 100 ? ' class="me"' : '') + '><td>' + E(x.name) + '<br><small>' + where(x) + ' · ' + t(x.t) + '</small></td><td><span class="owaqi sm" style="background:' + c[2] + '">' + x.aqi + '</span> <small>' + c[1] + '</small></td><td><small>' + x.parts.map(function (p) { return p[0] + ' ' + p[1]; }).join('<br>') + '</small></td><td><button class="ibtn" data-act="owZoom" data-a="' + x.lat + ',' + x.lng + '" title="Show on map">' + I('pin') + '</button></td></tr>'; }).join('') + '</table>' : '<div class="owempty">No EPA monitors reporting nearby.</div>';
      h += '<div class="dim" style="font-size:11px;margin:6px 0 16px">Official, regulatory-grade monitors run by Virginia DEQ and EPA. Hourly. There is no official monitor inside Botetourt; these are the nearest (within 30 miles).</div>';
      h += '<div class="ownote">PurpleAir sensors</div>';
      if (O.airKey === '') return h + '<div class="owcard" style="border-left-color:#9b7bff"><div class="owd" style="margin-bottom:8px">Neighborhood sensors such as the one in Fincastle need a PurpleAir READ key. When you have one, paste it here. It is kept in Command Post\'s private ArcGIS service, never in the public code.</div><div class="row"><input class="in" id="paKey" type="password" placeholder="PurpleAir READ key" autocomplete="off" style="flex:1"><button class="btn sm pri" data-act="owAirKey">Save</button></div></div>';
      if (!O.aAt) return h + '<div class="owempty">Loading PurpleAir sensors…</div>';
      if (O.aErr) return h + '<div class="owcard" style="border-left-color:#F0444C"><b>PurpleAir could not load</b><div class="owd">' + E(O.aErr) + '</div><div class="row" style="margin-top:8px"><button class="btn sm" data-act="owAirReset">Enter a different key</button></div></div>';
      var al = O.airList();
      if (!al.length) return h + '<div class="owempty">No outdoor PurpleAir sensors reporting nearby.</div>';
      return h + '<table class="owtab"><tr><th>Sensor</th><th>AQI now</th><th>1 h</th><th>PM2.5</th><th></th></tr>' + al.map(function (x) {
        var c = aqiCat(x.aqi), c60 = x.aqi60 != null ? aqiCat(x.aqi60) : null;
        return '<tr' + (x.aqi > 100 ? ' class="me"' : '') + '><td>' + E(x.name) + '<br><small>' + where(x) + ' · ' + t(x.seen) + '</small></td><td><span class="owaqi sm" style="background:' + c[2] + '">' + x.aqi + '</span> <small>' + c[1] + '</small></td><td>' + (c60 ? '<span class="owaqi sm" style="background:' + c60[2] + '">' + x.aqi60 + '</span>' : '') + '</td><td>' + (x.pm != null ? x.pm.toFixed(1) : '') + '</td><td><button class="ibtn" data-act="owZoom" data-a="' + x.lat + ',' + x.lng + '" title="Show on map">' + I('pin') + '</button></td></tr>';
      }).join('') + '</table><div class="dim" style="font-size:11px;margin-top:6px">Outdoor sensors with the EPA correction applied (as on the AirNow Fire &amp; Smoke Map). Updated ' + new Date(O.aAt).toTimeString().slice(0, 5) + '; checked every 15 minutes while this panel is open.</div>';
    }
    if (tab === 'water') {
      h = '';
      var gl = O.gaugeList(), rivers = gl.filter(function (x) { return x.stage != null || x.flow != null; }), rains = gl.filter(function (x) { return x.rain; });
      var where = function (x) { return x.dc == null ? '' : x.dc === 0 ? '<span class="owin">In county</span>' : Math.round(x.dc) + ' mi out'; };
      if (!O.gAt) h += '<div class="ownote" style="margin-top:14px">River &amp; rain gauges</div><div class="owempty">' + (O.gErr ? 'Gauges could not load: ' + E(O.gErr) : 'Loading gauges from USGS…') + '</div>';
      else {
      h += '<div class="ownote">River gauges (' + rivers.length + ')</div>';
      h += rivers.length ? '<table class="owtab"><tr><th>Gauge</th><th>Stage</th><th>Flow</th><th>Flood</th><th></th></tr>' + rivers.map(function (x) {
        var fl = flood(x), tr = x.trend == null ? '' : x.trend > 0.05 ? ' <span style="color:#F28C28">▲</span>' : x.trend < -0.05 ? ' <span style="color:#93A9C3">▼</span>' : '';
        return '<tr' + (fl && fl.worst ? ' class="me"' : '') + '><td>' + E(x.name) + '<br><small>' + where(x) + ' · ' + t(x.t) + '</small></td><td>' + (x.stage != null ? x.stage.toFixed(2) + ' ft' + tr : '') + '</td><td>' + (x.flow != null ? Math.round(x.flow).toLocaleString() + ' cfs' : '') + '</td><td>' + (fl ? '<span style="color:' + fl.col + '">' + E(fl.worst || fl.now || '') + '</span>' : '<small>no NWS stage</small>') + '</td><td><button class="ibtn" data-act="owZoom" data-a="' + x.lat + ',' + x.lng + '" title="Show on map">' + I('pin') + '</button></td></tr>';
      }).join('') + '</table>' : '<div class="owempty">No river gauges reporting.</div>';
      h += '<div class="ownote" style="margin-top:14px">Rain gauges (' + rains.length + ')</div>';
      h += rains.length ? '<table class="owtab"><tr><th>Gauge</th><th>1 h</th><th>6 h</th><th>24 h</th><th></th></tr>' + rains.sort(function (a, b) { return b.rain.h24 - a.rain.h24; }).map(function (x) {
        return '<tr' + (x.rain.h1 >= 0.5 ? ' class="me"' : '') + '><td>' + E(x.name) + '<br><small>' + where(x) + ' · ' + t(x.t) + '</small></td><td>' + x.rain.h1.toFixed(2) + '"</td><td>' + x.rain.h6.toFixed(2) + '"</td><td>' + x.rain.h24.toFixed(2) + '"</td><td><button class="ibtn" data-act="owZoom" data-a="' + x.lat + ',' + x.lng + '" title="Show on map">' + I('pin') + '</button></td></tr>';
      }).join('') + '</table>' : '<div class="owempty">No rain gauges reporting.</div>';
      h += '<div class="dim" style="font-size:11px;margin-top:6px">USGS live readings, NWS flood status and forecast. Gauges within 12 miles of the county line. Updated ' + new Date(O.gAt).toTimeString().slice(0, 5) + '.</div>';
      }
      return h;
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
    act.owRadPlay = function () { O.rad.play = !O.rad.play; O.radarShow(O.rad.i); O.radarRun(); };
    chg.owRadSeek = function (el) { O.rad.play = false; O.radarShow(+el.value); clearTimeout(O.rad.timer); };
    act.owAirKey = async function () {
      var v = (document.getElementById('paKey') || {}).value || ''; v = v.trim(); if (!v) return CP.ui.toast('Paste the key first.');
      try { await CP.arc.settings.set('purpleair_read_key', v); O.airKey = v; O.aAt = 0; O.aErr = ''; CP.ui.toast('PurpleAir key saved for county users.', 'ok'); O.paint(); O.refresh(); }
      catch (e) { CP.ui.toast('Could not save: ' + E(e.message), 'err', 7000); }
    };
    act.owAirReset = function () { O.airKey = ''; O.aErr = ''; O.paint(); };
    chg.owLayer = function (el) { var k = el.dataset.a; O.on[k] = el.checked; CP.store.setPref('owOn2', O.on); O.draw(); };
  };
})(window.CP);
