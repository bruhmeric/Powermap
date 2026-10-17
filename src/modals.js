/* LK Power Outage Tracker — modals (namespace: LKPM.modals)
   Setup wizard for connecting Supabase + the About/help dialog. */
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
    els = {
      setup: util.$('#setup-modal'), about: util.$('#about-modal'),
      url: util.$('#supa-url'), key: util.$('#supa-key'),
      status: util.$('#setup-status'),
      validate: util.$('#setup-validate'), save: util.$('#setup-save'),
      demo: util.$('#setup-demo'), reset: util.$('#setup-reset'),
      sqlCopy: util.$('#sql-copy')
    };

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

    els.validate.addEventListener('click', validate);
    els.save.addEventListener('click', save);
    els.demo.addEventListener('click', function () {
      close(els.setup);
      util.toast('Demo mode active — data is simulated locally in your browser.', 'info');
    });
    els.reset.addEventListener('click', function () {
      ns.db.resetConfig();
      location.reload();
    });
    els.sqlCopy.addEventListener('click', function () {
      util.copyText(SETUP_SQL).then(function (ok) {
        util.toast(ok
          ? 'Setup SQL copied — paste it into Supabase → SQL Editor → Run.'
          : 'Copy failed — open supabase_setup.sql from the repository instead.',
          ok ? 'success' : 'error');
      });
    });

    var cfg = ns.db.loadConfig();
    if (cfg) {
      els.url.value = cfg.url;
      els.key.value = cfg.key;
      els.reset.hidden = false;
      els.save.disabled = false;
    }

    function inputsOk() {
      return /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(els.url.value.trim()) && els.key.value.trim().length > 20;
    }
    [els.url, els.key].forEach(function (i) {
      i.addEventListener('input', function () {
        els.save.disabled = !inputsOk();
        els.status.textContent = '';
        els.status.className = 'setup-status';
      });
    });
  }

  function open(which) {
    var m = which === 'about' ? els.about : els.setup;
    m.hidden = false;
  }
  function close(m) { m.hidden = true; }
  function closeAll() { util.$$('.modal').forEach(close); }

  function validate() {
    els.validate.disabled = true;
    els.status.className = 'setup-status';
    els.status.textContent = 'Testing connection…';
    ns.db.testConnection(els.url.value, els.key.value).then(function (res) {
      els.validate.disabled = false;
      els.status.className = 'setup-status ' + (res.ok ? 'ok' : 'bad');
      els.status.textContent = res.message;
      els.save.disabled = !res.ok;
    });
  }

  function save() {
    var url = els.url.value.trim().replace(/\/+$/, '');
    var key = els.key.value.trim();
    if (!url || !key) return;
    ns.db.saveConfig(url, key);
    util.toast('Configuration saved — reloading…', 'success');
    setTimeout(function () { location.reload(); }, 650);
  }

  ns.modals = { init: init, open: open, close: close, closeAll: closeAll, SETUP_SQL: SETUP_SQL };
})(window.LKPM = window.LKPM || {});
