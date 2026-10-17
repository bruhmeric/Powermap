/* LK Power Outage Tracker — map layer (namespace: LKPM.map)
   MapLibre GL with CARTO vector basemaps and built-in GPU clustering.

   Why not Leaflet raster tiles anymore: since 25 Sept 2026 CARTO requires
   an API key on raster basemap tiles (keyless tiles return an "API KEY
   REQUIRED" watermark), and the CARTO credentials in config.js only
   authenticate the vector endpoints. Vector basemaps render through
   MapLibre GL — crisper at any density, GPU-composited, and the CARTO
   key is appended to the style URL exactly as CARTO's docs recommend. */
(function (ns) {
  'use strict';
  var util = ns.util;

  var COLORS = { outage: '#ef4444', restored: '#10b981', mixed: '#f59e0b' };

  var STYLES = {
    dark: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
    light: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json'
  };
  var ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener" title="OpenStreetMap contributors">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions" target="_blank" rel="noopener" title="CARTO">CARTO</a>';

  var SRC = 'reports';
  var CLUSTER_MAX_ZOOM = 12;   // at zoom > 12 every report renders individually
  var COUNT_FONT = ['Noto Sans Regular'];

  var map = null, pinMarker = null, activePopup = null;
  var reportsById = {};
  var currentReports = [];
  var lastSig = null;
  var onSelectCb = null;

  /* ---------- CARTO config (read-only from config.js — viewers can't change it) ---------- */

  function cartoKey() {
    var c = window.LKPM_CONFIG || {};
    return String(c.CARTO_API_KEY || '').trim();
  }

  function styleUrl(theme) {
    var k = cartoKey();
    return STYLES[theme] + (k ? '?key=' + encodeURIComponent(k) : '');
  }

  /* ---------- lifecycle ---------- */

  function init(opts) {
    onSelectCb = opts.onSelect || function () {};

    try {
      map = new maplibregl.Map({
        container: 'map',
        style: styleUrl((ns.store.state.theme === 'light') ? 'light' : 'dark'),
        center: [80.7718, 7.8731],        // Sri Lanka, per the original implementation guide
        zoom: 8,
        minZoom: 6,
        maxZoom: 19,
        maxBounds: [[78.6, 5.2], [82.6, 10.6]],
        renderWorldCopies: false,
        attributionControl: { compact: true, customAttribution: ATTR }
      });
    } catch (e) {
      webglFail();
      return;
    }

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

    /* re-add data layers after the initial load AND after every basemap/style swap.
       'styledata' can fire before the style reports as loaded (and then not again),
       so 'idle' — which always fires once rendering settles — is the safety net. */
    function ensureLayers() {
      if (!map || map.getSource(SRC) || !map.isStyleLoaded()) return;
      addDataLayers();
      lastSig = null;                 // fresh (empty) source — force a setData
      render(currentReports);
    }
    map.on('styledata', ensureLayers);
    map.on('idle', ensureLayers);

    map.on('error', function (e) { console.warn('[lkpm] map:', e && e.error); });

    /* click on empty map → select report location (pin). Clicks that hit a
       report/cluster are handled by the layer handlers below. */
    map.on('click', function (e) {
      var ids = [SRC + '-clusters', SRC + '-points'].filter(function (id) { return map.getLayer(id); });
      if (ids.length) {
        var feats = map.queryRenderedFeatures(e.point, { layers: ids });
        if (feats && feats.length) return;
      }
      onSelectCb({ lat: e.lngLat.lat, lng: e.lngLat.lng });
    });

    map.on('click', SRC + '-points', function (e) {
      var f = e.features && e.features[0];
      if (!f) return;
      var r = reportsById[f.properties.id];
      if (!r) return;
      popupAt([f.geometry.coordinates[0], f.geometry.coordinates[1]], r);
    });

    map.on('click', SRC + '-clusters', function (e) {
      var f = e.features && e.features[0];
      if (!f) return;
      var src = map.getSource(SRC);
      var target = Math.min((map.getZoom() + 2), CLUSTER_MAX_ZOOM + 1);
      if (src && typeof src.getClusterExpansionZoom === 'function') {
        src.getClusterExpansionZoom(f.properties.cluster_id)
          .then(function (z) { map.easeTo({ center: f.geometry.coordinates, zoom: Math.min(z, CLUSTER_MAX_ZOOM + 1) }); })
          .catch(function () { map.easeTo({ center: f.geometry.coordinates, zoom: target }); });
      } else {
        map.easeTo({ center: f.geometry.coordinates, zoom: target });
      }
    });

    map.on('mouseenter', SRC + '-points', function () { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', SRC + '-points', function () { map.getCanvas().style.cursor = ''; });

    window.addEventListener('resize', util.debounce(function () { if (map) map.resize(); }, 200));
  }

  function webglFail() {
    var el = document.getElementById('map');
    if (el) {
      el.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;padding:24px;text-align:center;color:var(--muted,#8d97ad);font-size:14px;line-height:1.6">' +
        'WebGL is unavailable in this browser, so the map can\'t render.<br>Please try a modern browser (Chrome, Edge, Firefox, Safari).</div>';
    }
    util.toast('Map could not start — WebGL is unavailable.', 'error', 6000);
  }

  /* ---------- data layers ---------- */

  function addDataLayers() {
    if (!map || map.getSource(SRC)) return;

    map.addSource(SRC, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
      cluster: true,
      clusterRadius: 55,
      clusterMaxZoom: CLUSTER_MAX_ZOOM,
      clusterProperties: {
        outs: ['+', ['case', ['==', ['get', 'status'], 'outage'], 1, 0]]
      }
    });

    map.addLayer({
      id: SRC + '-clusters',
      type: 'circle',
      source: SRC,
      filter: ['has', 'point_count'],
      paint: {
        /* majority status wins: red = mostly outages, green = mostly restored, amber = mixed */
        'circle-color': ['case',
          ['>', ['*', 2, ['get', 'outs']], ['get', 'point_count']], COLORS.outage,
          ['>', ['*', 2, ['-', ['get', 'point_count'], ['get', 'outs']]], ['get', 'point_count']], COLORS.restored,
          COLORS.mixed],
        'circle-radius': ['interpolate', ['linear'], ['sqrt', ['get', 'point_count']],
          1, 14.4, 3, 21.2, 4, 24.6, 6, 30],
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 2,
        'circle-stroke-opacity': 0.85,
        'circle-opacity': 0.85
      }
    });

    map.addLayer({
      id: SRC + '-cluster-count',
      type: 'symbol',
      source: SRC,
      filter: ['has', 'point_count'],
      layout: {
        'text-field': ['get', 'point_count'],
        'text-font': COUNT_FONT,
        'text-size': 12.5,
        'text-allow-overlap': true,
        'text-ignore-placement': true
      },
      paint: { 'text-color': '#ffffff' }
    });

    map.addLayer({
      id: SRC + '-points',
      type: 'circle',
      source: SRC,
      filter: ['!', ['has', 'point_count']],
      paint: {
        'circle-color': ['match', ['get', 'status'],
          'outage', COLORS.outage,
          'restored', COLORS.restored,
          COLORS.mixed],
        'circle-radius': ['case', ['==', ['get', '_stale'], 1], 5.5, 8],
        'circle-opacity': ['coalesce', ['get', '_op'], 0.9],
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 1.4,
        'circle-stroke-opacity': 0.7
      }
    });
  }

  function render(reports) {
    currentReports = reports || [];
    var src = map && map.getSource(SRC);
    if (!src) return;

    /* skip redundant setData calls (same data within a 5-minute aging bucket) */
    var n = currentReports.length;
    var sig = n + ':' + (n ? currentReports[0].id + ':' + currentReports[n - 1].id : '') + ':' + Math.floor(Date.now() / 300000);
    if (sig === lastSig) return;
    lastSig = sig;

    var now = Date.now();
    reportsById = {};
    var features = new Array(n);
    for (var i = 0; i < n; i++) {
      var r = currentReports[i];
      reportsById[r.id] = r;
      var ageH = (now - Date.parse(r.created_at)) / 3600e3;
      var isOut = r.status === 'outage';
      var stale = isOut && ageH > 24;
      features[i] = {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [r.longitude, r.latitude] },
        properties: {
          id: r.id,
          status: r.status,
          _stale: stale ? 1 : 0,
          _op: stale ? 0.3 : Math.max(0.45, 0.92 - ageH / 72)
        }
      };
    }
    src.setData({ type: 'FeatureCollection', features: features });
  }

  function setTheme(theme) {
    if (!map) return;
    map.setStyle(styleUrl(theme === 'light' ? 'light' : 'dark'));
    /* data layers + data are re-applied by the 'styledata' handler above */
  }

  /* ---------- popups ---------- */

  function popupAt(lngLat, r) {
    if (!map) return;
    if (activePopup) { activePopup.remove(); activePopup = null; }
    activePopup = new maplibregl.Popup({ maxWidth: '260px', offset: 12 })
      .setLngLat(lngLat)
      .setHTML(popupHtml(r))
      .addTo(map);
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

  function toLngLat(x) {
    if (!x) return null;
    if (Array.isArray(x)) return [Number(x[1]), Number(x[0])];
    if (typeof x.lng === 'number' && typeof x.lat === 'number') return [x.lng, x.lat];
    if (typeof x.lon === 'number' && typeof x.lat === 'number') return [x.lon, x.lat];
    return null;
  }

  function setPin(latlng) {
    var ll = toLngLat(latlng);
    if (!map || !ll) return;
    if (pinMarker) { pinMarker.setLngLat(ll); return; }
    var el = document.createElement('div');
    el.className = 'pin-wrap';
    el.innerHTML = PIN_SVG;
    pinMarker = new maplibregl.Marker({ element: el, anchor: 'bottom', draggable: true })
      .setLngLat(ll)
      .addTo(map);
    pinMarker.on('dragend', function () {
      var p = pinMarker.getLngLat();
      onSelectCb({ lat: p.lat, lng: p.lng });
    });
  }

  function clearPin() {
    if (pinMarker) { pinMarker.remove(); pinMarker = null; }
  }

  /* ---------- realtime pulse ---------- */

  function pulse(latlng) {
    if (!map || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)) return;
    var ll = toLngLat(latlng);
    if (!ll) return;
    var el = document.createElement('div');
    el.className = 'pulse-wrap';
    el.innerHTML = '<span class="pulse-ring"></span><span class="pulse-dot"></span>';
    var m = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat(ll).addTo(map);
    setTimeout(function () { m.remove(); }, 3200);
  }

  /* ---------- navigation ---------- */

  function flyToReport(r) {
    if (!map) return;
    map.flyTo({ center: [r.longitude, r.latitude], zoom: Math.max(map.getZoom(), 13), duration: 550 });
    setTimeout(function () {
      popupAt([r.longitude, r.latitude], reportsById[r.id] || r);
    }, 600);
  }

  function flyTo(latlng, zoom) {
    var ll = toLngLat(latlng);
    if (!map || !ll) return;
    map.flyTo({ center: ll, zoom: zoom || 12, duration: 800 });
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
    invalidate: function () { if (map) map.resize(); },
    _map: function () { return map; }   /* debug/testing handle */
  };
})(window.LKPM = window.LKPM || {});
