/* LK Power Outage Tracker — shared utilities (namespace: LKPM.util) */
(function (ns) {
  'use strict';

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  var ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return ESC_MAP[c]; }); }

  function timeAgo(iso) {
    var ms = Date.now() - Date.parse(iso);
    if (!isFinite(ms) || ms < 0) return 'just now';
    var s = Math.floor(ms / 1000);
    if (s < 45) return 'just now';
    var m = Math.floor(s / 60);
    if (m < 60) return m + 'm ago';
    var h = Math.floor(m / 60);
    if (h < 24) return h + 'h ago';
    return Math.floor(h / 24) + 'd ago';
  }

  var dtf = null;
  try { dtf = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch (e) { /* older engines */ }
  function fmtDateTime(iso) {
    var d = new Date(iso);
    return dtf ? dtf.format(d) : d.toLocaleString();
  }

  function debounce(fn, ms) {
    var t = 0;
    return function () {
      var self = this, args = arguments;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms);
    };
  }

  function throttle(fn, ms) {
    var last = 0, t = 0;
    return function () {
      var now = Date.now(), self = this, args = arguments;
      if (now - last >= ms) { last = now; fn.apply(self, args); }
      else { clearTimeout(t); t = setTimeout(function () { last = Date.now(); fn.apply(self, args); }, ms - (now - last)); }
    };
  }

  /* localStorage wrapper — namespaced, never throws (private mode safe) */
  var store = {
    get: function (key, fallback) {
      try {
        var raw = localStorage.getItem('lkpm.' + key);
        return raw == null ? fallback : JSON.parse(raw);
      } catch (e) { return fallback; }
    },
    set: function (key, val) {
      try { localStorage.setItem('lkpm.' + key, JSON.stringify(val)); return true; } catch (e) { return false; }
    },
    del: function (key) {
      try { localStorage.removeItem('lkpm.' + key); } catch (e) { /* noop */ }
    }
  };

  function uuid() {
    if (window.crypto && window.crypto.randomUUID) {
      try { return window.crypto.randomUUID(); } catch (e) { /* fall through */ }
    }
    return 'r-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  function haversineKm(lat1, lng1, lat2, lng2) {
    var R = 6371, rad = Math.PI / 180;
    var dLat = (lat2 - lat1) * rad, dLng = (lng2 - lng1) * rad;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
             Math.cos(lat1 * rad) * Math.cos(lat2 * rad) *
             Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  function download(filename, text, mime) {
    var blob = new Blob([text], { type: mime || 'text/plain' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 800);
  }

  function toCsv(rows) {
    return rows.map(function (r) {
      return r.map(function (v) {
        var s = String(v == null ? '' : v);
        return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      }).join(',');
    }).join('\r\n');
  }

  var TOAST_ICONS = { success: 'i-check', error: 'i-xc', warn: 'i-alert', info: 'i-info' };
  function toast(msg, type, ms) {
    type = type || 'info';
    var box = $('#toasts');
    if (!box) return;
    while (box.children.length > 4) box.firstElementChild.remove();
    var el = document.createElement('div');
    el.className = 'toast ' + type;
    el.innerHTML = '<svg class="ic"><use href="#' + (TOAST_ICONS[type] || 'i-info') + '"/></svg><div class="toast-msg">' + msg + '</div>';
    el.addEventListener('click', function () { el.remove(); });
    box.appendChild(el);
    setTimeout(function () {
      el.classList.add('out');
      setTimeout(function () { el.remove(); }, 260);
    }, ms || (type === 'error' ? 6000 : 3800));
  }

  function copyText(text) {
    return new Promise(function (resolve) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { resolve(true); }, function () { legacyCopy(text, resolve); });
      } else {
        legacyCopy(text, resolve);
      }
    });
  }
  function legacyCopy(text, resolve) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand('copy');
      ta.remove();
      resolve(ok);
    } catch (e) { resolve(false); }
  }

  function mmss(ms) {
    var s = Math.ceil(ms / 1000);
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  ns.util = { $: $, $$: $$, esc: esc, timeAgo: timeAgo, fmtDateTime: fmtDateTime, debounce: debounce, throttle: throttle, storage: store, uuid: uuid, haversineKm: haversineKm, download: download, toCsv: toCsv, toast: toast, copyText: copyText, mmss: mmss };
})(window.LKPM = window.LKPM || {});
