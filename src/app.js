/* LK Power Outage Tracker — application orchestrator (namespace: LKPM)
   Wires the data layer, map, and UI together; owns submission flow,
   realtime handling, theme, sharing, export, and keyboard shortcuts. */
(function (ns) {
  'use strict';
  var util = ns.util, store = ns.store;

  var db = null;
  var selfInserted = {};   // ids we inserted ourselves (skip their realtime toast)

  function init() {
    applyTheme(store.state.theme);
    store.loadCached();                       // instant first paint from cache

    ns.map.init({ onSelect: handleMapSelect, onMove: rerenderMap });
    ns.ui.init({
      onFilterChange: rerenderMap,
      onReport: submitReport,
      onGeolocate: geolocate,
      onPickReport: pickReport,
      onExport: exportData,
      onShare: share,
      onThemeToggle: toggleTheme,
      onOpenSetup: function () { ns.modals.open('setup'); },
      onOpenAbout: function () { ns.modals.open('about'); }
    });
    ns.modals.init();
    store.subscribe(scheduleMapRender);
    scheduleMapRender();

    window.addEventListener('online', updateNet);
    window.addEventListener('offline', updateNet);
    document.addEventListener('keydown', onKeydown);

    boot();

    /* tiny debug handle — also used by automated smoke tests */
    window.__LKPM = { store: store, version: '1.0.0' };
    window.addEventListener('error', trackErr);
    window.addEventListener('unhandledrejection', trackErr);
  }

  function trackErr(e) {
    (window.__LKPM_ERRORS = window.__LKPM_ERRORS || []).push(String((e && (e.message || e.reason)) || e));
  }

  /* ---------------- boot ---------------- */

  function boot() {
    db = ns.db.create();
    store.setMode(db.mode);

    if (db.mode === 'demo') {
      store.setConnection('demo');
      store.setReports(db.list());
      store.setLastSync(Date.now());
      db.subscribe(onRealtime, null);
      setTimeout(function () {
        util.toast('<b>Demo mode</b> — showing simulated data. Connect a free Supabase project (⚙) to go live.', 'info', 7000);
      }, 900);
    } else {
      var cfg = ns.db.loadConfig();
      if (cfg) preconnect(cfg.url);
      db.list().then(function (rows) {
        store.setReports(rows);
        store.setLastSync(Date.now());
        util.toast(rows.length
          ? 'Live data loaded — ' + rows.length + ' reports on the map.'
          : 'Connected! No reports yet — be the first to report.',
          'success');
      }).catch(function (err) {
        if (store.state.reports.length) {
          util.toast('Could not refresh — showing cached data. ' + ns.db.humanizeError(err), 'warn', 6500);
        } else {
          util.toast(ns.db.humanizeError(err), 'error', 7000);
          ns.modals.open('setup');
        }
      });
      db.subscribe(onRealtime, function (status) {
        store.setConnection(navigator.onLine ? status : 'offline');
      });
    }

    registerSW();
  }

  function preconnect(url) {
    try {
      var l = document.createElement('link');
      l.rel = 'preconnect';
      l.href = url;
      l.crossOrigin = 'anonymous';
      document.head.appendChild(l);
    } catch (e) { /* noop */ }
  }

  function registerSW() {
    if (!('serviceWorker' in navigator)) return;
    if (location.protocol !== 'https:' && !/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return;
    navigator.serviceWorker.register('sw.js').catch(function () { /* non-fatal */ });
  }

  function updateNet() {
    if (!navigator.onLine) { store.setConnection('offline'); return; }
    if (db && db.mode === 'demo') store.setConnection('demo');
    else store.setConnection('connecting');   // channel will re-confirm with 'live'
  }

  /* ---------------- theme ---------------- */

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#10141f' : '#f3f5f9');
    ns.map.setTheme(theme);
  }
  function toggleTheme() {
    var t = store.state.theme === 'dark' ? 'light' : 'dark';
    store.setTheme(t);
    applyTheme(t);
  }

  /* ---------------- map interactions ---------------- */

  var geoAbort = null;

  function handleMapSelect(latlng) {
    ns.map.setPin(latlng);
    ns.ui.setCoords(latlng.lat, latlng.lng);
    var near = ns.districts.nearest(latlng.lat, latlng.lng);
    if (near && near.km <= 55) ns.ui.autoDistrict(near.name);
    if (!ns.districts.inSriLanka(latlng.lat, latlng.lng)) {
      util.toast('That spot looks outside Sri Lanka — reports should be on the island.', 'warn');
    }
    reverseGeocode(latlng);
  }

  function reverseGeocode(latlng) {
    ns.ui.areaLoading();
    if (geoAbort) geoAbort.abort();
    geoAbort = new AbortController();
    var url = 'https://nominatim.openstreetmap.org/reverse?format=jsonv2' +
      '&lat=' + latlng.lat.toFixed(6) + '&lon=' + latlng.lng.toFixed(6) +
      '&zoom=14&accept-language=en';
    fetch(url, { signal: geoAbort.signal, headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        var a = (j && j.address) || {};
        var name = a.suburb || a.neighbourhood || a.town || a.village || a.city_district || a.city || a.county || '';
        ns.ui.autoArea(String(name).slice(0, 60));
      })
      .catch(function () { ns.ui.autoArea(''); });
  }

  function geolocate() {
    if (!navigator.geolocation) {
      util.toast('Geolocation is not supported by this browser — click the map instead.', 'warn');
      return;
    }
    util.toast('Locating you…', 'info', 2200);
    navigator.geolocation.getCurrentPosition(function (pos) {
      var latlng = L.latLng(pos.coords.latitude, pos.coords.longitude);
      ns.map.flyTo(latlng, Math.max(12, 12));
      handleMapSelect(latlng);
    }, function (err) {
      util.toast(err.code === 1
        ? 'Location permission denied — click the map to pick a spot instead.'
        : 'Could not get your location — click the map to pick a spot instead.', 'warn');
    }, { enableHighAccuracy: true, timeout: 9000, maximumAge: 60000 });
  }

  function pickReport(r) {
    ns.map.flyToReport(r);
    ns.ui.closeSidebar();
  }

  function rerenderMap() { ns.map.render(store.view().reports); }
  var mapRaf = 0;
  function scheduleMapRender() {
    if (mapRaf) return;
    mapRaf = requestAnimationFrame(function () { mapRaf = 0; rerenderMap(); });
  }

  /* ---------------- submission ---------------- */

  function submitReport(v, status) {
    if (!ns.districts.inSriLanka(v.latitude, v.longitude)) {
      util.toast('That location is outside Sri Lanka — pick a spot on the island.', 'warn');
      return;
    }
    if (status === 'outage') {
      var nearby = countNearby(v.latitude, v.longitude);
      if (nearby > 0) {
        util.toast(nearby + ' recent report' + (nearby > 1 ? 's' : '') + ' within ~1.5 km — thanks for confirming.', 'info', 3000);
      }
    }

    ns.ui.setSubmitting(true);
    db.insert({
      district: v.district, area_name: v.area,
      latitude: v.latitude, longitude: v.longitude, status: status
    }).then(function (row) {
      var finalRow = row && row.id && row.created_at ? row : {
        id: util.uuid(),
        district: v.district, area_name: v.area,
        latitude: v.latitude, longitude: v.longitude,
        status: status, created_at: new Date().toISOString()
      };
      selfInserted[finalRow.id] = 1;
      store.addReport(finalRow);
      store.setLastSync(Date.now());
      ns.map.pulse([finalRow.latitude, finalRow.longitude]);
      util.storage.set('lastSubmit', Date.now());
      ns.ui.resetForm();
      ns.map.clearPin();
      util.toast(status === 'outage' ? 'Outage reported — thank you!' : 'Restoration reported — thank you!', 'success');
    }).catch(function (err) {
      console.error('[lkpm] insert failed', err);
      util.toast(ns.db.humanizeError(err), 'error');
    }).then(function () {
      ns.ui.setSubmitting(false);
    });
  }

  function countNearby(lat, lng) {
    var cutoff = Date.now() - 90 * 60e3;
    return store.state.reports.filter(function (r) {
      return Date.parse(r.created_at) >= cutoff &&
             util.haversineKm(lat, lng, r.latitude, r.longitude) <= 1.5;
    }).length;
  }

  /* ---------------- realtime ---------------- */

  function onRealtime(row) {
    if (!row || !row.id || store.has(row.id)) return;
    store.addReport(row);
    ns.map.pulse([row.latitude, row.longitude]);
    if (!selfInserted[row.id] && document.visibilityState === 'visible' && row.area_name) {
      util.toast('<b>' + util.esc(row.area_name) + '</b> · ' + (row.status === 'outage' ? 'new outage reported' : 'power restored'),
        row.status === 'outage' ? 'warn' : 'success', 3400);
    }
  }

  /* ---------------- export & share ---------------- */

  function exportData(kind) {
    var rows = store.view().reports;
    if (!rows.length) {
      util.toast('Nothing to export with the current filters.', 'warn');
      return;
    }
    var stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
    if (kind === 'csv') {
      var data = [['id', 'district', 'area_name', 'latitude', 'longitude', 'status', 'created_at']].concat(
        rows.map(function (r) { return [r.id, r.district, r.area_name, r.latitude, r.longitude, r.status, r.created_at]; })
      );
      util.download('lk-outages-' + stamp + '.csv', util.toCsv(data), 'text/csv;charset=utf-8');
      util.toast(rows.length + ' reports exported as CSV.', 'success');
    } else {
      var payload = JSON.stringify({ exported_at: new Date().toISOString(), count: rows.length, reports: rows }, null, 2);
      util.download('lk-outages-' + stamp + '.json', payload, 'application/json');
      util.toast(rows.length + ' reports exported as JSON.', 'success');
    }
  }

  function share() {
    var v = store.view();
    var url = location.origin + location.pathname;
    var text = 'LK Power Outage Tracker — live community power-cut map for Sri Lanka. ' +
      v.stats.activeAreas + ' active outage area' + (v.stats.activeAreas === 1 ? '' : 's') + ' right now.';
    if (navigator.share) {
      navigator.share({ title: 'LK Power Outage Tracker', text: text, url: url }).catch(function () { /* cancelled */ });
    } else {
      util.copyText(url).then(function (ok) {
        util.toast(ok ? 'Link copied to clipboard.' : 'Copy this link: ' + url, ok ? 'success' : 'info');
      });
    }
  }

  /* ---------------- keyboard shortcuts ---------------- */

  function onKeydown(e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    var k = e.key.toLowerCase ? e.key.toLowerCase() : e.key;
    if (e.key === '/' || k === 'f') { e.preventDefault(); ns.ui.focusSearch(); }
    else if (k === 't') toggleTheme();
    else if (k === 'n') ns.ui.openReport();
    else if (k === 'a') ns.modals.open('about');
    else if (e.key === 'Escape') { ns.modals.closeAll(); ns.ui.closeSidebar(); }
  }

  init();
})(window.LKPM = window.LKPM || {});
