/* LK Power Outage Tracker — modals (namespace: LKPM.modals)
   Read-only "Database & connection" info panel + the About/help dialog.

   There is deliberately NO credential input anywhere in this app:
   credentials live only in config.js (set by the administrator).
   This modal just shows the current status and how to go live. */
(function (ns) {
  'use strict';
  var util = ns.util;

  /* Keep in sync with supabase_setup.sql in the repo root. */
  var SETUP_SQL = [
    '-- 1. Enable PostGIS extension for spatial queries',
    'CREATE EXTENSION IF NOT EXISTS postgis;',
    '',
    '-- 2. Create outage reports table',
    'CREATE TABLE public.outage_reports (',
    '    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,',
    '    district TEXT NOT NULL,',
    '    area_name TEXT NOT NULL,',
    '    latitude DOUBLE PRECISION NOT NULL,',
    '    longitude DOUBLE PRECISION NOT NULL,',
    "    status TEXT CHECK (status IN ('outage', 'restored')) NOT NULL,",
    "    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL",
    ');',
    '',
    '-- 3. Indices for fast geographic + recency queries',
    'CREATE INDEX idx_outage_reports_coords ON public.outage_reports (latitude, longitude);',
    'CREATE INDEX idx_outage_reports_created_at ON public.outage_reports (created_at DESC);',
    '',
    '-- 4. Enable Row Level Security',
    'ALTER TABLE public.outage_reports ENABLE ROW LEVEL SECURITY;',
    '',
    '-- 5. RLS policies: anonymous read + insert only (no updates/deletes)',
    'CREATE POLICY "Allow public read access" ON public.outage_reports',
    '    FOR SELECT USING (true);',
    '',
    'CREATE POLICY "Allow public insert access" ON public.outage_reports',
    '    FOR INSERT WITH CHECK (true);',
    '',
    '-- 6. Enable realtime replication',
    'ALTER PUBLICATION supabase_realtime ADD TABLE public.outage_reports;'
  ].join('\n');

  var els = {};

  function init() {
    els = { setup: util.$('#setup-modal'), about: util.$('#about-modal'), sqlCopy: util.$('#sql-copy') };

    util.$$('[data-close-modal]').forEach(function (b) {
      b.addEventListener('click', closeAll);
    });
    util.$$('.modal').forEach(function (m) {
      m.addEventListener('click', function (e) { if (e.target === m) close(m); });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        var open = util.$$('.modal:not([hidden])');
        if (open.length) { open.forEach(close); e.stopImmediatePropagation(); }
      }
    });
    util.$$('[data-open-setup]').forEach(function (b) {
      b.addEventListener('click', function () { closeAll(); open('setup'); });
    });

    els.sqlCopy.addEventListener('click', function () {
      util.copyText(SETUP_SQL).then(function (ok) {
        util.toast(ok
          ? 'Setup SQL copied — paste it into Supabase → SQL Editor → Run.'
          : 'Copy failed — open supabase_setup.sql from the repository instead.',
          ok ? 'success' : 'error');
      });
    });
  }

  function open(which) {
    var m = which === 'about' ? els.about : els.setup;
    if (m === els.setup) renderStatus();
    m.hidden = false;
  }
  function close(m) { m.hidden = true; }
  function closeAll() { util.$$('.modal').forEach(close); }

  /* ---------- read-only connection status ---------- */

  function renderStatus() {
    var box = util.$('#conn-list');
    if (!box) return;

    var cfg = ns.db.loadConfig();
    var c = window.LKPM_CONFIG || {};
    var cartoKey = String(c.CARTO_API_KEY || '').trim();
    var baseUrl = String(c.CARTO_API_BASE_URL || '').trim().replace(/^https?:\/\//, '');

    var host = cfg ? cfg.url.replace(/^https?:\/\//, '') : '';
    var rows = [
      {
        label: 'Data backend',
        ok: !!cfg,
        value: cfg
          ? 'Supabase · <span class="mono">' + util.esc(host) + '</span>'
          : 'Demo mode — <b>not configured</b>, data is simulated in your browser'
      },
      {
        label: 'Basemap tiles',
        ok: !!cartoKey,
        value: cartoKey
          ? 'CARTO · API key active' + (baseUrl ? ' · <span class="mono">' + util.esc(baseUrl) + '</span>' : '')
          : 'CARTO key missing — set <b>CARTO_API_KEY</b> in config.js (tiles show a watermark without it)'
      }
    ];

    box.innerHTML = rows.map(function (r) {
      return '<li class="conn-row' + (r.ok ? ' ok' : '') + '">' +
          '<span class="conn-lbl">' + util.esc(r.label) + '</span>' +
          '<span class="conn-val">' + r.value + '</span>' +
        '</li>';
    }).join('');
  }

  ns.modals = { init: init, open: open, close: close, closeAll: closeAll, SETUP_SQL: SETUP_SQL };
})(window.LKPM = window.LKPM || {});
