/* LK Power Outage Tracker — data layer (namespace: LKPM.db)
   Chooses between a Supabase adapter (live) and the demo adapter (offline simulation).
   Config precedence: browser localStorage (setup UI) → config.js → demo mode. */
(function (ns) {
  'use strict';
  var util = ns.util;

  var CFG_KEY = 'config';

  function normalize(url) { return String(url || '').trim().replace(/\/+$/, ''); }

  function loadConfig() {
    var saved = util.storage.get(CFG_KEY, null);
    if (saved && saved.url && saved.key) return { url: normalize(saved.url), key: saved.key };
    var c = window.LKPM_CONFIG || {};
    if (c.SUPABASE_URL && c.SUPABASE_ANON_KEY &&
        String(c.SUPABASE_URL).indexOf('YOUR_') === -1 && /^https?:\/\//.test(String(c.SUPABASE_URL))) {
      return { url: normalize(c.SUPABASE_URL), key: c.SUPABASE_ANON_KEY };
    }
    return null;
  }

  function saveConfig(url, key) {
    util.storage.set(CFG_KEY, { url: normalize(url), key: key, savedAt: Date.now() });
  }
  function resetConfig() { util.storage.del(CFG_KEY); }

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
      return 'Table "outage_reports" not found — run the setup SQL in your Supabase SQL editor (⚙ → Copy SQL).';
    }
    if (/JWT|api key|Invalid API key|401|403/i.test(msg)) {
      return 'Invalid Supabase URL or anon key — check Settings → API in your Supabase dashboard.';
    }
    if (/Failed to fetch|NetworkError|fetch failed|Load failed/i.test(msg)) {
      return 'Network error — check your connection and try again.';
    }
    if (code === '23514') return 'Invalid status value.';
    return 'Could not submit report: ' + msg;
  }

  /* used by the setup modal's "Test connection" button */
  function testConnection(url, key) {
    url = normalize(url);
    key = String(key || '').trim();
    return new Promise(function (resolve) {
      if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url)) {
        resolve({ ok: false, message: 'URL should look like https://xxxxxxxxxxxx.supabase.co' });
        return;
      }
      if (!key) {
        resolve({ ok: false, message: 'Enter the anon public key (Settings → API).' });
        return;
      }
      fetch(url + '/rest/v1/outage_reports?select=id&limit=1', {
        headers: { apikey: key, Authorization: 'Bearer ' + key }
      }).then(function (res) {
        if (res.ok) { resolve({ ok: true, message: 'Connected — key works and table found.' }); return null; }
        if (res.status === 401 || res.status === 403) {
          resolve({ ok: false, message: 'Key rejected (' + res.status + ') — copy the “anon public” key from Settings → API.' });
          return null;
        }
        return res.json().catch(function () { return null; }).then(function (body) {
          var bmsg = body && (body.message || body.hint || '') || '';
          if ((body && body.code === 'PGRST205') || /does not exist/i.test(bmsg)) {
            resolve({ ok: false, message: 'Connection works, but the table is missing — run the setup SQL first.' });
          } else if (res.status === 404) {
            resolve({ ok: false, message: 'Project not found (404) — double-check the URL.' });
          } else {
            resolve({ ok: false, message: 'HTTP ' + res.status + ' — check URL and key.' });
          }
        });
      }).catch(function () {
        resolve({ ok: false, message: 'Could not reach ' + url + ' — check the URL and your connection.' });
      });
    });
  }

  ns.db = { loadConfig: loadConfig, saveConfig: saveConfig, resetConfig: resetConfig, create: create, humanizeError: humanizeError, testConnection: testConnection };
})(window.LKPM = window.LKPM || {});
