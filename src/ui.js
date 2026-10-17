/* LK Power Outage Tracker — UI layer (namespace: LKPM.ui)
   Owns every DOM interaction except modals: header stats, filters, search,
   sparkline, top districts, live feed, report form, rate-limit countdown. */
(function (ns) {
  'use strict';
  var util = ns.util, store = ns.store;

  var RATE_MS = 5 * 60 * 1000;    // one report per 5 minutes (per browser)
  var DEF_AREA_PH = 'e.g. Maharagama, Nugegoda';

  var H = {};
  var els = {};
  var raf = 0;
  var lastFeedRender = 0;
  var areaAuto = '';

  /* ---------------- init ---------------- */

  function init(handlers) {
    H = handlers || {};
    cacheEls();
    populateDistricts();
    bindFilters();
    bindSearch();
    bindForm();
    bindHeader();
    bindPanels();
    store.subscribe(scheduleRender);
    setInterval(tick, 1000);
    renderNow();
  }

  function cacheEls() {
    els = {
      connDot: util.$('#conn-dot'), connLabel: util.$('#conn-label'),
      modeBadge: util.$('#mode-badge'),
      statActive: util.$('#stat-active'), statRestored: util.$('#stat-restored'),
      statDistricts: util.$('#stat-districts'), statReports: util.$('#stat-reports'),
      windowChips: util.$('#filter-window'), statusChips: util.$('#filter-status'),
      districtSelect: util.$('#district-select'), clearFilters: util.$('#clear-filters'),
      searchInput: util.$('#search-input'), searchClear: util.$('#search-clear'), searchResults: util.$('#search-results'),
      spark: util.$('#sparkline'), topDistricts: util.$('#top-districts'), syncedAgo: util.$('#synced-ago'),
      feedList: util.$('#feed-list'), feedEmpty: util.$('#feed-empty'), feedCount: util.$('#feed-count'),
      mapNote: util.$('#map-note'),
      sidebar: util.$('#sidebar'), backdrop: util.$('#sidebar-backdrop'),
      fab: util.$('#fab-report'), reportPanel: util.$('#report-panel'),
      district: util.$('#district'), area: util.$('#area'), lat: util.$('#lat'), lng: util.$('#lng'),
      errDistrict: util.$('#err-district'), errArea: util.$('#err-area'), errCoords: util.$('#err-coords'),
      btnOutage: util.$('#btn-outage'), btnRestored: util.$('#btn-restored'), rateNote: util.$('#rate-note'),
      geolocate: util.$('#geolocate-btn'),
      themeBtn: util.$('#theme-btn'), shareBtn: util.$('#share-btn'),
      exportBtn: util.$('#export-btn'), exportMenu: util.$('#export-menu'),
      settingsBtn: util.$('#settings-btn'), aboutBtn: util.$('#about-btn'),
      menuBtn: util.$('#menu-btn'), rpCollapse: util.$('#rp-collapse')
    };
  }

  function populateDistricts() {
    [els.districtSelect, els.district].forEach(function (sel) {
      if (!sel) return;
      ns.districts.names.forEach(function (n) {
        var o = document.createElement('option');
        o.value = n; o.textContent = n;
        sel.appendChild(o);
      });
    });
  }

  /* ---------------- filters ---------------- */

  function bindFilters() {
    els.windowChips.addEventListener('click', function (e) {
      var b = e.target.closest('.chip'); if (!b) return;
      store.setFilters({ window: b.dataset.window });
      if (H.onFilterChange) H.onFilterChange();
    });
    els.statusChips.addEventListener('click', function (e) {
      var b = e.target.closest('.chip'); if (!b) return;
      store.setFilters({ status: b.dataset.status });
      if (H.onFilterChange) H.onFilterChange();
    });
    els.districtSelect.addEventListener('change', function () {
      store.setFilters({ district: this.value });
    });
    els.clearFilters.addEventListener('click', function () {
      store.clearFilters();
      els.searchInput.value = '';
      updateSearchClear();
      hideResults();
    });
    els.topDistricts.addEventListener('click', function (e) {
      var row = e.target.closest('.td-row'); if (!row) return;
      var name = row.dataset.d;
      store.setFilters({ district: name });
      els.districtSelect.value = name;
      toastFilterHint(name);
    });
  }

  function toastFilterHint(name) {
    util.toast('Filtered to <b>' + util.esc(name) + '</b> district — use “Clear all” to reset.', 'info', 2600);
  }

  /* ---------------- search ---------------- */

  var runSearch = null;
  function bindSearch() {
    runSearch = util.debounce(function () {
      store.setFilters({ search: els.searchInput.value });
      renderSearchResults();
    }, 180);

    els.searchInput.addEventListener('input', function () {
      updateSearchClear();
      runSearch();
    });
    els.searchClear.addEventListener('click', function () {
      els.searchInput.value = '';
      updateSearchClear();
      runSearch();
      els.searchInput.focus();
    });
    els.searchInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        var first = els.searchResults.querySelector('.sr-item');
        /* results are picked via 'mousedown' (beats the blur handler) — dispatch the same event */
        if (first) first.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      } else if (e.key === 'Escape') {
        hideResults();
        els.searchInput.blur();
      }
    });
    els.searchInput.addEventListener('blur', function () { setTimeout(hideResults, 180); });
    els.searchResults.addEventListener('mousedown', function (e) {
      var item = e.target.closest('.sr-item'); if (!item) return;
      e.preventDefault();   // beat the blur handler
      var r = store.get(item.dataset.id);
      hideResults();
      if (r && H.onPickReport) H.onPickReport(r);
    });
  }

  function updateSearchClear() { els.searchClear.hidden = !els.searchInput.value; }

  function showResults(html) {
    els.searchResults.innerHTML = html;
    els.searchResults.hidden = false;
  }
  function hideResults() { els.searchResults.hidden = true; }

  function renderSearchResults() {
    if (els.searchInput !== document.activeElement) return;
    var q = els.searchInput.value.trim();
    if (!q) { hideResults(); return; }
    var rows = store.view().reports.slice(0, 8);
    if (!rows.length) { showResults('<div class="sr-empty">No matches in the current view</div>'); return; }
    showResults(rows.map(function (r) {
      return '<button type="button" class="sr-item" data-id="' + util.esc(r.id) + '">' +
        '<span class="pp-dot ' + (r.status === 'outage' ? 'out' : 'res') + '"></span>' +
        '<span class="sr-txt"><b>' + util.esc(r.area_name) + '</b><span class="sr-sub">' + util.esc(r.district) + '</span></span>' +
        '<span class="sr-time">' + util.timeAgo(r.created_at) + '</span></button>';
    }).join(''));
  }

  /* ---------------- render loop ---------------- */

  function scheduleRender() {
    if (raf) return;
    raf = requestAnimationFrame(function () { raf = 0; renderNow(); });
  }

  function renderNow() {
    var s = store.state;
    var v = store.view();

    els.statActive.textContent = v.stats.activeAreas;
    els.statRestored.textContent = v.stats.restoredAreas;
    els.statDistricts.textContent = v.stats.districtsAffected;
    els.statReports.textContent = v.stats.total;

    syncChips(els.windowChips, 'window', s.filters.window);
    syncChips(els.statusChips, 'status', s.filters.status);
    if (els.districtSelect.value !== s.filters.district) els.districtSelect.value = s.filters.district;

    var hasFilter = !!(s.filters.district || s.filters.search || s.filters.status !== 'all' || s.filters.window !== '24h');
    els.clearFilters.hidden = !hasFilter;

    drawSpark(v.spark);
    renderTopDistricts(v.stats.topDistricts);
    renderFeed(v.reports);
    updateModeBadge();
    updateConn();
    updateEmpty(v);
    updateSearchClear();
    renderSearchResults();
  }

  function syncChips(container, attr, val) {
    util.$$('.chip', container).forEach(function (c) {
      c.classList.toggle('active', c.dataset[attr] === val);
    });
  }

  function updateModeBadge() { els.modeBadge.hidden = store.state.mode !== 'demo'; }

  function updateConn() {
    var c = store.state.connection;
    els.connDot.className = 'conn-dot ' + c;
    els.connLabel.textContent = c === 'live' ? 'Live' : c === 'connecting' ? 'Connecting…' : c === 'offline' ? 'Offline' : c === 'demo' ? 'Demo' : '';
  }

  /* ---------------- sparkline + top districts ---------------- */

  function drawSpark(buckets) {
    var cv = els.spark;
    var w = cv.clientWidth || 280, h = 44;
    var dpr = window.devicePixelRatio || 1;
    if (cv.width !== Math.round(w * dpr)) {
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
    }
    var ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    var max = Math.max.apply(null, buckets.concat([1]));
    var gap = 2, bw = (w - gap * 23) / 24;
    var css = getComputedStyle(document.documentElement);
    var bar = css.getPropertyValue('--spark-bar').trim() || 'rgba(245,158,11,.45)';
    var hot = css.getPropertyValue('--spark-hot').trim() || '#f5a623';
    for (var i = 0; i < 24; i++) {
      var bh = Math.round((buckets[i] / max) * (h - 4));
      if (bh <= 0) continue;
      ctx.fillStyle = i === 23 ? hot : bar;
      ctx.fillRect(Math.round(i * (bw + gap)), h - bh, Math.max(2, Math.round(bw)), bh);
    }
  }

  function renderTopDistricts(top) {
    if (!top.length) {
      els.topDistricts.innerHTML = '<div class="td-empty">No outages in this view.</div>';
      return;
    }
    var max = top[0].count;
    els.topDistricts.innerHTML = top.map(function (t) {
      return '<button type="button" class="td-row" data-d="' + util.esc(t.name) + '" title="Filter to ' + util.esc(t.name) + ' district">' +
        '<span class="td-name">' + util.esc(t.name) + '</span>' +
        '<span class="td-bar"><i style="width:' + Math.max(8, Math.round((t.count / max) * 100)) + '%"></i></span>' +
        '<span class="td-n">' + t.count + '</span></button>';
    }).join('');
  }

  /* ---------------- feed ---------------- */

  function renderFeed(reports) {
    lastFeedRender = Date.now();
    var rows = reports.slice(0, 40);
    els.feedCount.textContent = reports.length ? reports.length + '' : '';
    if (!rows.length) {
      els.feedList.innerHTML = '';
      els.feedEmpty.hidden = false;
      els.feedEmpty.textContent = store.state.reports.length
        ? 'No reports match your filters.'
        : 'No reports yet — be the first to report!';
      return;
    }
    els.feedEmpty.hidden = true;
    els.feedList.innerHTML = rows.map(function (r) {
      return '<li data-id="' + util.esc(r.id) + '" tabindex="0" title="Show on map">' +
        '<span class="pp-dot ' + (r.status === 'outage' ? 'out' : 'res') + '"></span>' +
        '<span class="fd-txt"><b>' + util.esc(r.area_name) + '</b><span class="fd-sub">' + util.esc(r.district) + '</span></span>' +
        '<span class="fd-time">' + util.timeAgo(r.created_at) + '</span></li>';
    }).join('');
  }

  function updateEmpty(v) {
    if (v.reports.length) { els.mapNote.hidden = true; return; }
    els.mapNote.hidden = false;
    els.mapNote.textContent = store.state.reports.length
      ? 'No reports match the current filters'
      : 'No reports yet — click the map to report the first one';
  }

  /* ---------------- report form ---------------- */

  function bindForm() {
    els.btnOutage.addEventListener('click', function () { submit('outage'); });
    els.btnRestored.addEventListener('click', function () { submit('restored'); });
    els.geolocate.addEventListener('click', function () { if (H.onGeolocate) H.onGeolocate(); });
  }

  function submit(status) {
    var v = getFormValues();
    if (!v.ok) {
      showFormErrors(v.errors);
      util.toast('Please complete the highlighted fields to submit.', 'warn');
      return;
    }
    if (rateRemaining() > 0) {
      util.toast('Rate limit: one report every 5 minutes — <b>' + util.mmss(rateRemaining()) + '</b> remaining.', 'warn');
      return;
    }
    if (H.onReport) H.onReport(v, status);
  }

  function getFormValues() {
    var errors = {};
    var district = els.district.value;
    var area = els.area.value.trim();
    var lat = parseFloat(els.lat.value);
    var lng = parseFloat(els.lng.value);
    if (!district) errors.district = true;
    if (!area) errors.area = true;
    if (!isFinite(lat) || !isFinite(lng)) errors.coords = true;
    return { ok: !Object.keys(errors).length, errors: errors, district: district, area: area, latitude: lat, longitude: lng };
  }

  function showFormErrors(errors) {
    errors = errors || {};
    els.errDistrict.hidden = !errors.district;
    els.errArea.hidden = !errors.area;
    els.errCoords.hidden = !errors.coords;
    els.district.classList.toggle('invalid', !!errors.district);
    els.area.classList.toggle('invalid', !!errors.area);
  }

  function resetForm() {
    els.district.value = '';
    els.area.value = '';
    els.lat.value = '';
    els.lng.value = '';
    areaAuto = '';
    showFormErrors({});
  }

  function setSubmitting(busy) {
    els.btnOutage.disabled = busy;
    els.btnRestored.disabled = busy;
    els.btnOutage.classList.toggle('busy', busy);
  }

  /* setters used by app.js when the map pin moves */
  function setCoords(lat, lng) {
    els.lat.value = lat.toFixed(6);
    els.lng.value = lng.toFixed(6);
    els.errCoords.hidden = true;
  }
  function autoDistrict(name) {
    if (name && ns.districts.names.indexOf(name) >= 0) els.district.value = name;
  }
  function areaLoading() {
    els.area.classList.add('loading');
    els.area.placeholder = 'Detecting area name…';
  }
  function autoArea(name) {
    els.area.classList.remove('loading');
    els.area.placeholder = DEF_AREA_PH;
    if (!name) return;
    if (!els.area.value || els.area.value === areaAuto) {
      els.area.value = name;
      areaAuto = name;
    }
  }

  /* ---------------- rate limit + tickers ---------------- */

  function rateRemaining() {
    var last = parseInt(util.storage.get('lastSubmit', '0'), 10) || 0;
    return Math.max(0, last + RATE_MS - Date.now());
  }

  function tick() {
    updateRateNote();
    updateSyncedAgo();
    /* keep relative timestamps fresh even when nothing changes */
    if (Date.now() - lastFeedRender > 60000) renderFeed(store.view().reports);
  }

  function updateRateNote() {
    var rem = rateRemaining();
    if (rem > 0) {
      els.rateNote.hidden = false;
      els.rateNote.textContent = 'Next report available in ' + util.mmss(rem) + ' — to prevent spam.';
      els.btnOutage.disabled = true;
      els.btnRestored.disabled = true;
    } else if (!els.btnOutage.classList.contains('busy')) {
      els.rateNote.hidden = true;
      els.btnOutage.disabled = false;
      els.btnRestored.disabled = false;
    }
  }

  function updateSyncedAgo() {
    var t = store.state.lastSync;
    els.syncedAgo.textContent = t ? 'updated ' + util.timeAgo(new Date(t).toISOString()) : '';
  }

  /* ---------------- header ---------------- */

  function bindHeader() {
    els.themeBtn.addEventListener('click', function () { if (H.onThemeToggle) H.onThemeToggle(); });
    els.shareBtn.addEventListener('click', function () { if (H.onShare) H.onShare(); });
    els.settingsBtn.addEventListener('click', function () { if (H.onOpenSetup) H.onOpenSetup(); });
    els.aboutBtn.addEventListener('click', function () { if (H.onOpenAbout) H.onOpenAbout(); });

    els.exportBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = els.exportMenu.hidden;
      els.exportMenu.hidden = !open;
      els.exportBtn.setAttribute('aria-expanded', String(open));
    });
    els.exportMenu.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      els.exportMenu.hidden = true;
      els.exportBtn.setAttribute('aria-expanded', 'false');
      if (H.onExport) H.onExport(b.dataset.export);
    });
    document.addEventListener('click', function (e) {
      if (!els.exportMenu.hidden && !e.target.closest('.export-wrap')) {
        els.exportMenu.hidden = true;
        els.exportBtn.setAttribute('aria-expanded', 'false');
      }
    });
  }

  /* ---------------- panels ---------------- */

  function bindPanels() {
    els.menuBtn.addEventListener('click', toggleSidebar);
    els.backdrop.addEventListener('click', closeSidebar);

    els.fab.addEventListener('click', function () {
      els.reportPanel.classList.add('open');
      els.fab.classList.add('hide');
      setTimeout(function () { els.district.focus(); }, 260);
    });

    els.rpCollapse.addEventListener('click', function () {
      if (window.matchMedia('(max-width: 719px)').matches) closeSheet();
      else els.reportPanel.classList.toggle('collapsed');
    });

    els.feedList.addEventListener('click', function (e) {
      var li = e.target.closest('li'); if (!li) return;
      var r = store.get(li.dataset.id);
      if (r && H.onPickReport) H.onPickReport(r);
    });
    els.feedList.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      var li = e.target.closest('li'); if (!li || e.target !== li) return;
      var r = store.get(li.dataset.id);
      if (r && H.onPickReport) H.onPickReport(r);
    });
  }

  function toggleSidebar() {
    if (window.matchMedia('(max-width: 1023px)').matches) {
      var open = document.body.classList.toggle('side-open');
      els.backdrop.hidden = !open;
    } else {
      document.body.classList.toggle('side-closed');
    }
    setTimeout(function () { ns.map.invalidate(); }, 290);
  }

  function closeSidebar() {
    document.body.classList.remove('side-open');
    els.backdrop.hidden = true;
    if (window.matchMedia('(max-width: 1023px)').matches) setTimeout(function () { ns.map.invalidate(); }, 290);
  }

  function closeSheet() {
    els.reportPanel.classList.remove('open');
    els.fab.classList.remove('hide');
  }

  function openReport() {
    if (window.matchMedia('(max-width: 719px)').matches) {
      els.reportPanel.classList.add('open');
      els.fab.classList.add('hide');
    } else if (els.reportPanel.classList.contains('collapsed')) {
      els.reportPanel.classList.remove('collapsed');
    }
    setTimeout(function () { els.district.focus(); }, 200);
  }

  function focusSearch() {
    if (window.matchMedia('(max-width: 1023px)').matches && !document.body.classList.contains('side-open')) toggleSidebar();
    if (document.body.classList.contains('side-closed')) toggleSidebar();
    els.searchInput.focus();
  }

  ns.ui = {
    init: init,
    setCoords: setCoords,
    autoDistrict: autoDistrict,
    areaLoading: areaLoading,
    autoArea: autoArea,
    resetForm: resetForm,
    setSubmitting: setSubmitting,
    rateRemaining: rateRemaining,
    focusSearch: focusSearch,
    toggleSidebar: toggleSidebar,
    closeSidebar: closeSidebar,
    closeSheet: closeSheet,
    openReport: openReport
  };
})(window.LKPM = window.LKPM || {});
