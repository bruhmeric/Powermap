/* LK Power Outage Tracker — data layer (namespace: LKPM.db)
   Chooses between a Supabase adapter (live) and the demo adapter (offline simulation).

   CREDENTIALS ARE CONFIG-FILE ONLY (see config.js).
   The app never reads credentials from localStorage, URL parameters,
   or user input — viewers cannot bring their own database or keys.
   Any credentials saved in a browser by older app versions are purged. */
(function (ns) {
  'use strict';
  var util = ns.util;

  var CFG_KEY = 'config';   // legacy key used by the old in-browser setup wizard

  function normalize(url) { return String(url || '').trim().replace(/\/+$/, ''); }

  function loadConfig() {
    /* One-time migration: delete credentials that an older version of this
       app may have saved in this browser, so a viewer's own old credentials
       can never override or leak into the config-file deployment. */
    util.storage.del(CFG_KEY);

    var c = window.LKPM_CONFIG || {};
    if (c.SUPABASE_URL && c.SUPABASE_ANON_KEY &&
        String(c.SUPABASE_URL).indexOf('YOUR_') === -1 && /^https?:\/\//.test(String(c.SUPABASE_URL))) {
      return { url: normalize(c.SUPABASE_URL), key: c.SUPABASE_ANON_KEY };
    }
    return null;
  }

  function create() {
    var cfg = loadConfig();
    if (!cfg) return ns.demo.adapter();

    if (!window.supabase || typeof window.supabase.createClient !== 'function') {
      util.toast('Supabase library failed to load — running in demo mode.', 'warn');
      return ns.demo.adapter();
    }
    var client;
    try {
      client = window.supabase.createClient(cfg.url, cfg.key, {
        auth: { persistSession: false, autoRefreshToken: false }
      });
    } catch (e) {
      util.toast('Invalid Supabase configuration — running in demo mode.', 'warn');
      return ns.demo.adapter();
    }
    return supabaseAdapter(client);
  }

  function supabaseAdapter(client) {
    var channel = null;
    return {
      mode: 'supabase',

      list: function () {
        return client.from('outage_reports')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(2000)
          .then(function (res) {
            if (res.error) throw res.error;
            return res.data || [];
          });
      },

      insert: function (row) {
        return client.from('outage_reports')
          .insert([{ district: row.district, area_name: row.area_name, latitude: row.latitude, longitude: row.longitude, status: row.status }])
          .select()
          .then(function (res) {
            if (res.error) throw res.error;
            return (res.data && res.data[0]) || row;
          });
      },

      subscribe: function (onInsert, onStatus) {
        channel = client.channel('public:outage_reports')
          .on('postgres_changes',
              { event: 'INSERT', schema: 'public', table: 'outage_reports' },
              function (payload) { if (payload && payload.new) onInsert(payload.new); })
          .subscribe(function (status) {
            if (status === 'SUBSCRIBED') onStatus('live');
            else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') onStatus('connecting');
            else if (status === 'CLOSED') onStatus('offline');
          });
      },

      destroy: function () {
        if (channel) {
          try { client.removeChannel(channel); } catch (e) { /* noop */ }
          channel = null;
        }
      }
    };
  }

  function humanizeError(err) {
    var msg = (err && (err.message || err.msg)) || String(err || 'Unknown error');
    var code = err && err.code;
    if (code === 'PGRST205' || /relation .* does not exist/i.test(msg)) {
      return 'Table "outage_reports" not found — the administrator must run the setup SQL in the Supabase SQL editor (⚙ → Copy SQL).';
    }
    if (/JWT|api key|Invalid API key|401|403/i.test(msg)) {
      return 'Supabase rejected the configured credentials — the administrator should check config.js (Settings → API in the Supabase dashboard).';
    }
    if (/Failed to fetch|NetworkError|fetch failed|Load failed/i.test(msg)) {
      return 'Network error — check your connection and try again.';
    }
    if (code === '23514') return 'Invalid status value.';
    return 'Could not submit report: ' + msg;
  }

  ns.db = { loadConfig: loadConfig, create: create, humanizeError: humanizeError };
})(window.LKPM = window.LKPM || {});
