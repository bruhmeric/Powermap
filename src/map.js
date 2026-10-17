/* LK Power Outage Tracker — map layer (namespace: LKPM.map)
   Leaflet with canvas rendering + a tiny custom grid clusterer
   (no clustering library needed — keeps the bundle featherweight). */
(function (ns) {
  'use strict';
  var util = ns.util;

  var COLORS = { outage: '#ef4444', restored: '#10b981', mixed: '#f59e0b' };

  var TILES = {
    dark: {
      url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      light: false
    },
    light: {
      url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
      light: true
    }
  };
  var ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener" title="OpenStreetMap contributors">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions" target="_blank" rel="noopener" title="CARTO">CARTO</a>';

  var CLUSTER_MAX_ZOOM = 12;   // at zoom > 12 every report renders individually
  var CELL = 72;               // cluster grid cell size in screen pixels

  var map = null, baseLayer = null, clusterLayer = null, pinMarker = null;
  var markerIndex = {};        // report id → marker (individual markers only)
  var onSelectCb = null;

  function init(opts) {
    onSelectCb = opts.onSelect || function () {};
    var onMove = util.debounce(opts.onMove || function () {}, 150);

    map = L.map('map', {
      preferCanvas: true,
      zoomControl: false,
      minZoom: 6,
      maxZoom: 19,
      maxBounds: L.latLngBounds([5.2, 78.6], [10.6, 82.6]),
      maxBoundsViscosity: 0.75
    });
    map.setView([7.8731, 80.7718], 8);   // Sri Lanka, per the original implementation guide

    L.control.zoom({ position: 'bottomright' }).addTo(map);
    clusterLayer = L.layerGroup().addTo(map);

    setTheme(ns.store.state.theme);

    map.on('click', function (e) { onSelectCb(e.latlng); });
    map.on('moveend zoomend', onMove);
    window.addEventListener('resize', util.debounce(function () { map.invalidateSize(); }, 200));
  }

  function setTheme(theme) {
    if (!map) return;
    if (baseLayer) map.removeLayer(baseLayer);
    var t = TILES[theme === 'light' ? 'light' : 'dark'];
    baseLayer = L.tileLayer(t.url, { attribution: ATTR, subdomains: 'abcd', maxZoom: 19, detectRetina: true });
    baseLayer.addTo(map);
  }

  /* ---------- rendering ---------- */

  function render(reports) {
    if (!map) return;
    clusterLayer.clearLayers();
    markerIndex = {};

    var zoom = map.getZoom();
    if (zoom > CLUSTER_MAX_ZOOM || reports.length <= 40) {
      for (var i = 0; i < reports.length; i++) addSingle(reports[i]);
      return;
    }

    /* grid clustering in screen space */
    var grid = {};
    var size = map.getSize();
    for (var j = 0; j < reports.length; j++) {
      var r = reports[j];
      var p = map.latLngToContainerPoint([r.latitude, r.longitude]);
      if (p.x < -CELL || p.y < -CELL || p.x > size.x + CELL || p.y > size.y + CELL) continue;  // offscreen
      var k = Math.floor(p.x / CELL) + ':' + Math.floor(p.y / CELL);
      (grid[k] = grid[k] || []).push({ r: r, p: p });
    }
    Object.keys(grid).forEach(function (k) {
      var group = grid[k];
      if (group.length === 1) addSingle(group[0].r);
      else addCluster(group);
    });
  }

  function addSingle(r) {
    var isOut = r.status === 'outage';
    var ageH = (Date.now() - Date.parse(r.created_at)) / 3600e3;
    var stale = isOut && ageH > 24;
    var marker = L.circleMarker([r.latitude, r.longitude], {
      radius: stale ? 5.5 : 8,
      color: '#ffffff', weight: 1.4, opacity: 0.7,
      fillColor: COLORS[r.status] || COLORS.mixed,
      fillOpacity: stale ? 0.3 : Math.max(0.45, 0.92 - ageH / 72),
      interactive: true
    });
    marker.bindPopup(popupHtml(r), { maxWidth: 250, minWidth: 190, autoPan: true });
    clusterLayer.addLayer(marker);
    markerIndex[r.id] = marker;
  }

  function addCluster(group) {
    var lat = 0, lng = 0, outs = 0, n = group.length;
    group.forEach(function (g) {
      lat += g.r.latitude; lng += g.r.longitude;
      if (g.r.status === 'outage') outs++;
    });
    lat /= n; lng /= n;
    var color = outs * 2 > n ? COLORS.outage : (n - outs) * 2 > n ? COLORS.restored : COLORS.mixed;
    var marker = L.circleMarker([lat, lng], {
      radius: Math.min(30, 11 + Math.sqrt(n) * 3.4),
      color: '#ffffff', weight: 2, opacity: 0.85,
      fillColor: color, fillOpacity: 0.85
    });
    marker.bindTooltip(String(n), { permanent: true, direction: 'center', className: 'cluster-tip' });
    marker.on('click', function () {
      var bounds = L.latLngBounds(group.map(function (g) { return [g.r.latitude, g.r.longitude]; }));
      map.fitBounds(bounds.pad(0.4), { maxZoom: CLUSTER_MAX_ZOOM + 1, animate: true });
    });
    clusterLayer.addLayer(marker);
  }

  function popupHtml(r) {
    var isOut = r.status === 'outage';
    var ageH = (Date.now() - Date.parse(r.created_at)) / 3600e3;
    var stale = isOut && ageH > 24;
    var when = util.fmtDateTime(r.created_at);
    return '<div class="pp">' +
        '<div class="pp-head"><span class="pp-dot ' + (isOut ? 'out' : 'res') + '"></span><b>' + util.esc(r.area_name) + '</b></div>' +
        '<div class="pp-sub">' + util.esc(r.district) + ' District</div>' +
        '<div class="pp-status ' + (isOut ? 'out' : 'res') + '">' + (isOut ? 'Power outage' : 'Power restored') +
          (stale ? ' <span class="pp-stale">· may be outdated</span>' : '') + '</div>' +
        '<div class="pp-time" title="' + util.esc(when) + '">' + util.timeAgo(r.created_at) + ' · ' + util.esc(when) + '</div>' +
      '</div>';
  }

  /* ---------- selection pin ---------- */

  var PIN_SVG = '<svg class="pin-svg" width="30" height="42" viewBox="0 0 30 42" aria-hidden="true">' +
    '<path d="M15 0C6.7 0 0 6.7 0 15c0 11 15 27 15 27s15-16 15-27C30 6.7 23.3 0 15 0z" fill="#f59e0b" stroke="#fff" stroke-width="2"/>' +
    '<circle cx="15" cy="15" r="5.5" fill="#1f2937"/></svg>';

  function setPin(latlng) {
    if (pinMarker) {
      pinMarker.setLatLng(latlng);
      return;
    }
    pinMarker = L.marker(latlng, {
      icon: L.divIcon({ className: 'pin-wrap', html: PIN_SVG, iconSize: [30, 42], iconAnchor: [15, 40] }),
      draggable: true,
      keyboard: false,
      zIndexOffset: 1000,
      title: 'Selected report location — drag to adjust'
    }).addTo(map);
    pinMarker.on('dragend', function () { onSelectCb(pinMarker.getLatLng()); });
  }

  function clearPin() {
    if (pinMarker) { map.removeLayer(pinMarker); pinMarker = null; }
  }

  /* ---------- realtime pulse ---------- */

  function pulse(latlng) {
    if (!map || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)) return;
    var m = L.marker(latlng, {
      icon: L.divIcon({ className: 'pulse-wrap', html: '<span class="pulse-ring"></span><span class="pulse-dot"></span>', iconSize: [1, 1] }),
      interactive: false,
      zIndexOffset: 900
    }).addTo(map);
    setTimeout(function () { if (map) map.removeLayer(m); }, 3200);
  }

  function flyToReport(r) {
    if (!map) return;
    map.setView([r.latitude, r.longitude], Math.max(map.getZoom(), 13), { animate: true });
    setTimeout(function () {
      var m = markerIndex[r.id];
      if (m) m.openPopup();
    }, 430);
  }

  function flyTo(latlng, zoom) {
    if (map) map.setView(latlng, zoom || 12, { animate: true });
  }

  ns.map = {
    init: init,
    render: render,
    setTheme: setTheme,
    setPin: setPin,
    clearPin: clearPin,
    hasPin: function () { return !!pinMarker; },
    pulse: pulse,
    flyToReport: flyToReport,
    flyTo: flyTo,
    invalidate: function () { if (map) map.invalidateSize(); }
  };
})(window.LKPM = window.LKPM || {});
