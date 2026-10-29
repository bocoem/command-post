/* COMMAND POST — map (Leaflet + Esri basemaps), location picking, perimeter drawing, IAP map snapshot */
(function (CP) {
  'use strict';
  var M = CP.map = {};
  var T = 'https://server.arcgisonline.com/ArcGIS/rest/services/';
  function esri(path, o) { return L.tileLayer(T + path + '/MapServer/tile/{z}/{y}/{x}', Object.assign({ maxZoom: 19, crossOrigin: 'anonymous', attribution: 'Esri, HERE, Garmin, USGS, NGA, EPA, NPS' }, o || {})); }
  M.basemaps = function () {
    return {
      'Dark (tactical)': L.layerGroup([esri('Canvas/World_Dark_Gray_Base', { maxZoom: 16, maxNativeZoom: 16 }), esri('Canvas/World_Dark_Gray_Reference', { maxZoom: 16, maxNativeZoom: 16 })]),
      'Topographic': esri('World_Topo_Map'),
      'Imagery': L.layerGroup([esri('World_Imagery', { attribution: 'Esri, Maxar, Earthstar Geographics' }), esri('Reference/World_Boundaries_and_Places')]),
      'Streets': esri('World_Street_Map')
    };
  };
  M.pinIcon = function (color, label, size) {
    size = size || 26;
    return L.divIcon({ className: '', iconSize: [size, size], iconAnchor: [size / 2, size], popupAnchor: [0, -size],
      html: '<div class="pin" style="width:' + size + 'px;height:' + size + 'px;background:' + color + '"><b>' + (label || '') + '</b></div>' });
  };
  M.dotIcon = function (color, s) { s = s || 12; return L.divIcon({ className: '', iconSize: [s, s], iconAnchor: [s / 2, s / 2], html: '<div style="width:' + s + 'px;height:' + s + 'px;border-radius:50%;background:' + color + ';border:2px solid #0B1A2B;box-shadow:0 0 0 1px rgba(255,255,255,.6)"></div>' }); };
  M.FAC_COLOR = { 'Incident Command Post': '#FDB833', 'Staging Area': '#3D7BFF', 'Incident Base': '#2FBF71', 'Camp': '#2FBF71', 'Helibase/Helispot': '#9b7bff', 'EOC': '#FDB833', 'Shelter': '#F0444C', 'Point of Distribution': '#F28C28', 'Medical Aid Station': '#ff6b9a', 'Other': '#93A9C3' };
  M.FAC_CODE = { 'Incident Command Post': 'ICP', 'Staging Area': 'S', 'Incident Base': 'B', 'Camp': 'C', 'Helibase/Helispot': 'H', 'EOC': 'EOC', 'Shelter': 'SH', 'Point of Distribution': 'POD', 'Medical Aid Station': '+', 'Other': '•' };

  M.create = function (el, o) {
    o = o || {};
    var bm = M.basemaps(), pref = CP.store.prefs().basemap || 'Dark (tactical)';
    var map = L.map(el, { zoomControl: true, attributionControl: true, preferCanvas: false }).setView(o.center || CP.COUNTY.center, o.zoom || CP.COUNTY.zoom);
    (bm[pref] || bm['Dark (tactical)']).addTo(map);
    map.on('baselayerchange', function (e) { CP.store.setPref('basemap', e.name); });
    map._cpBase = bm;
    map._cpCtl = L.control.layers(bm, {}, { collapsed: true, position: 'topright' }).addTo(map);
    L.control.scale({ imperial: true, metric: false }).addTo(map);
    setTimeout(function () { map.invalidateSize(); }, 60);
    return map;
  };

  // draw incident, perimeter and facilities; returns bounds
  M.drawIncident = function (map, inc, group) {
    group.clearLayers();
    var pts = [];
    if (inc.perimeter && inc.perimeter.length > 2) { var pg = L.polygon(inc.perimeter, { color: '#F0444C', weight: 2.5, fillColor: '#F0444C', fillOpacity: .12, dashArray: '6 4' }).bindPopup('<b>Incident area</b>'); group.addLayer(pg); pts = pts.concat(inc.perimeter); }
    CP.alive(inc.facilities).forEach(function (f) {
      if (!f.lat) return;
      group.addLayer(L.marker([f.lat, f.lng], { icon: M.pinIcon(M.FAC_COLOR[f.type] || '#93A9C3', M.FAC_CODE[f.type] || '', 24) }).bindPopup('<b>' + CP.esc(f.name) + '</b><br>' + CP.esc(f.type) + (f.address ? '<br>' + CP.esc(f.address) : '')));
      pts.push([f.lat, f.lng]);
    });
    if (inc.location.lat) {
      group.addLayer(L.marker([inc.location.lat, inc.location.lng], { icon: M.pinIcon('#FDB833', '★', 34), zIndexOffset: 1000 }).bindPopup('<b>' + CP.esc(inc.name) + '</b><br>' + CP.esc(inc.location.desc || '')));
      pts.push([inc.location.lat, inc.location.lng]);
    }
    return pts;
  };

  // simple polygon drawing
  M.drawPolygon = function (map, done) {
    var pts = [], line = L.polyline([], { color: '#FDB833', weight: 2, dashArray: '4 4' }).addTo(map), marks = L.layerGroup().addTo(map);
    map.getContainer().style.cursor = 'crosshair';
    function click(e) { pts.push([e.latlng.lat, e.latlng.lng]); line.setLatLngs(pts); marks.addLayer(L.circleMarker(e.latlng, { radius: 4, color: '#FDB833' })); }
    function finish(cancel) { map.off('click', click); map.off('dblclick', dbl); map.getContainer().style.cursor = ''; line.remove(); marks.remove(); map.doubleClickZoom.enable(); done(cancel ? null : pts); }
    function dbl(e) { L.DomEvent.stop(e); finish(false); }
    map.doubleClickZoom.disable();
    map.on('click', click); map.on('dblclick', dbl);
    return { finish: finish, count: function () { return pts.length; } };
  };
  M.pick = function (map, done) {
    map.getContainer().style.cursor = 'crosshair';
    map.once('click', function (e) { map.getContainer().style.cursor = ''; done(e.latlng); });
  };

  // snapshot current view (tiles + incident graphics) to a PNG data URL for the IAP / 201
  M.snapshot = async function (map, inc) {
    var el = map.getContainer(), r = el.getBoundingClientRect(), W = Math.round(r.width), H = Math.round(r.height);
    var c = document.createElement('canvas'); c.width = W * 2; c.height = H * 2; var x = c.getContext('2d'); x.scale(2, 2);
    x.fillStyle = '#0d1b2a'; x.fillRect(0, 0, W, H);
    var tiles = el.querySelectorAll('img.leaflet-tile-loaded'), tainted = false;
    tiles.forEach(function (t) { var b = t.getBoundingClientRect(); try { x.drawImage(t, b.left - r.left, b.top - r.top, b.width, b.height); } catch (e) { tainted = true; } });
    function P(ll) { return map.latLngToContainerPoint(L.latLng(ll[0], ll[1])); }
    if (inc.perimeter && inc.perimeter.length > 2) { x.beginPath(); inc.perimeter.forEach(function (p, i) { var q = P(p); i ? x.lineTo(q.x, q.y) : x.moveTo(q.x, q.y); }); x.closePath(); x.fillStyle = 'rgba(240,68,76,.15)'; x.fill(); x.setLineDash([6, 4]); x.strokeStyle = '#F0444C'; x.lineWidth = 2.5; x.stroke(); x.setLineDash([]); }
    function pin(ll, col, lab) { var q = P(ll); x.beginPath(); x.arc(q.x, q.y, 10, 0, 7); x.fillStyle = col; x.fill(); x.lineWidth = 2; x.strokeStyle = '#fff'; x.stroke(); x.fillStyle = '#0B1A2B'; x.font = 'bold 9px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(lab, q.x, q.y); }
    function tag(ll, txt) { var q = P(ll); x.font = 'bold 11px Arial'; var w = x.measureText(txt).width + 8; x.fillStyle = 'rgba(255,255,255,.9)'; x.fillRect(q.x + 13, q.y - 8, w, 16); x.fillStyle = '#000'; x.textAlign = 'left'; x.fillText(txt, q.x + 17, q.y); }
    CP.alive(inc.facilities).forEach(function (f) { if (f.lat) { pin([f.lat, f.lng], M.FAC_COLOR[f.type] || '#93A9C3', M.FAC_CODE[f.type] || ''); tag([f.lat, f.lng], f.name); } });
    if (inc.location.lat) { pin([inc.location.lat, inc.location.lng], '#FDB833', '★'); tag([inc.location.lat, inc.location.lng], inc.name); }
    // north arrow + legend strip
    x.fillStyle = 'rgba(255,255,255,.92)'; x.fillRect(W - 44, 10, 34, 40); x.fillStyle = '#000'; x.font = 'bold 13px Arial'; x.textAlign = 'center'; x.fillText('N', W - 27, 22); x.beginPath(); x.moveTo(W - 27, 26); x.lineTo(W - 33, 44); x.lineTo(W - 27, 39); x.lineTo(W - 21, 44); x.closePath(); x.fill();
    try { return { url: c.toDataURL('image/jpeg', .88), tainted: tainted }; } catch (e) { return { url: null, tainted: true }; }
  };
})(window.CP);
