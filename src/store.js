/* LK Power Outage Tracker — reactive state store (namespace: LKPM.store) */
(function (ns) {
  'use strict';
  var util = ns.util;

  var WINDOWS = { '1h': 3600e3, '6h': 21600e3, '24h': 86400e3, '7d': 604800e3, 'all': Infinity };

  var state = {
    reports: [],                                            // sorted newest-first
    filters: { window: '24h', status: 'all', district: '', search: '' },
    theme: util.storage.get('theme', 'dark') === 'light' ? 'light' : 'dark',
    mode: 'loading',                                        // loading | demo | supabase
    connection: 'connecting',                               // connecting | live | offline | demo
    lastSync: null,
    dataStale: false                                        // true while showing cached data
  };

  var listeners = [];
  var version = 0;
  var viewCache = { version: -1, view: null };

  function subscribe(fn) {
    listeners.push(fn);
    return function () {
      var i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    };
  }
  function emit() {
    version++;
    listeners.forEach(function (fn) {
      try { fn(); } catch (e) { console.error('[lkpm] listener error', e); }
    });
  }

  function byDesc(a, b) { return Date.parse(b.created_at) - Date.parse(a.created_at); }

  function persist() {
    util.storage.set('cache', { savedAt: Date.now(), reports: state.reports.slice(0, 800) });
  }
  var persistThrottled = util.throttle(persist, 2500);

  function setReports(reports) {
    state.reports = (reports || []).slice().sort(byDesc);
    state.dataStale = false;
    persist();
    emit();
  }

  function has(id) {
    for (var i = 0; i < state.reports.length; i++) if (state.reports[i].id === id) return true;
    return false;
  }
  function get(id) {
    for (var i = 0; i < state.reports.length; i++) if (state.reports[i].id === id) return state.reports[i];
    return null;
  }

  function addReport(r) {
    if (!r || !r.id || !r.created_at) return;
    var i = state.reports.findIndex(function (x) { return x.id === r.id; });
    if (i >= 0) { state.reports[i] = r; emit(); return; }
    state.reports.unshift(r);
    if (state.reports.length > 1 && Date.parse(state.reports[1].created_at) < Date.parse(r.created_at)) {
      state.reports.sort(byDesc);
    }
    if (state.reports.length > 1500) state.reports.length = 1500;
    persistThrottled();
    emit();
  }

  function setFilters(patch) {
    var f = state.filters, changed = false;
    Object.keys(patch).forEach(function (k) {
      if (f[k] !== patch[k]) { f[k] = patch[k]; changed = true; }
    });
    if (changed) emit();
  }
  function clearFilters() { setFilters({ window: '24h', status: 'all', district: '', search: '' }); }

  function setTheme(t) { state.theme = t; util.storage.set('theme', t); emit(); }
  function setMode(m) { if (state.mode !== m) { state.mode = m; emit(); } }
  function setConnection(c) { if (state.connection !== c) { state.connection = c; emit(); } }
  function setLastSync(t) { state.lastSync = t; state.dataStale = t == null; emit(); }

  function loadCached() {
    var cache = util.storage.get('cache', null);
    if (cache && Array.isArray(cache.reports) && cache.reports.length) {
      state.reports = cache.reports.filter(function (r) { return r && r.id && r.created_at; });
      state.lastSync = cache.savedAt;
      state.dataStale = true;
      emit();
    }
  }

  /* memoized derived view — recomputed at most once per state version */
  function view() {
    if (viewCache.version === version) return viewCache.view;
    var f = state.filters;
    var cutoff = Date.now() - WINDOWS[f.window];
    var q = f.search.trim().toLowerCase();
    var reports = state.reports.filter(function (r) {
      if (f.window !== 'all' && Date.parse(r.created_at) < cutoff) return false;
      if (f.status !== 'all' && r.status !== f.status) return false;
      if (f.district && r.district !== f.district) return false;
      if (q && (r.area_name + ' ' + r.district).toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
    var v = { reports: reports, stats: computeStats(reports), spark: sparkline() };
    viewCache = { version: version, view: v };
    return v;
  }

  function computeStats(reports) {
    var outages = 0, restored = 0;
    var districtsMap = {};
    reports.forEach(function (r) {
      if (r.status === 'outage') { outages++; districtsMap[r.district] = (districtsMap[r.district] || 0) + 1; }
      else restored++;
    });

    /* de-duplicate by ~1km grid cell: the newest report in a cell decides its state,
       so "report outage → later restored" isn't counted as an active outage */
    var cells = {};
    for (var i = reports.length - 1; i >= 0; i--) {   // oldest → newest, newest wins
      var r = reports[i];
      cells[r.latitude.toFixed(2) + ',' + r.longitude.toFixed(2)] = r.status;
    }
    var activeAreas = 0, restoredAreas = 0;
    Object.keys(cells).forEach(function (k) {
      if (cells[k] === 'outage') activeAreas++;
      else restoredAreas++;
    });
    if (state.filters.status === 'outage') { activeAreas = outages; restoredAreas = 0; }
    if (state.filters.status === 'restored') { restoredAreas = restored; activeAreas = 0; }

    var top = Object.keys(districtsMap)
      .map(function (d) { return { name: d, count: districtsMap[d] }; })
      .sort(function (a, b) { return b.count - a.count; })
      .slice(0, 5);

    var affected = {};
    reports.forEach(function (r) { if (r.status === 'outage') affected[r.district] = 1; });

    return {
      outages: outages, restored: restored,
      activeAreas: activeAreas, restoredAreas: restoredAreas,
      districtsAffected: Object.keys(affected).length,
      total: reports.length,
      topDistricts: top
    };
  }

  /* hourly report counts for the last 24h (ignores filters) */
  function sparkline() {
    var buckets = new Array(24).fill(0);
    var now = Date.now();
    state.reports.forEach(function (r) {
      var age = now - Date.parse(r.created_at);
      if (age >= 0 && age < 86400e3) buckets[23 - Math.floor(age / 3600e3)]++;
    });
    return buckets;
  }

  ns.store = {
    state: state, WINDOWS: WINDOWS,
    subscribe: subscribe, setReports: setReports, addReport: addReport, has: has, get: get,
    setFilters: setFilters, clearFilters: clearFilters,
    setTheme: setTheme, setMode: setMode, setConnection: setConnection,
    setLastSync: setLastSync, loadCached: loadCached, view: view
  };
})(window.LKPM = window.LKPM || {});
