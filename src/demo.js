/* LK Power Outage Tracker — demo mode (namespace: LKPM.demo)
   Fully functional offline simulation: realistic reports across all 25 districts,
   stored in localStorage, with a live "realtime" event generator. Used when no
   Supabase project is connected yet. */
(function (ns) {
  'use strict';
  var util = ns.util;
  var D = ns.districts;

  var KEY = 'demo.v1';
  var KEEP_MS = 48 * 3600e3;   // prune demo reports older than 48h

  function load() { return util.storage.get(KEY, null); }
  function save(reports) { util.storage.set(KEY, { seededAt: Date.now(), reports: reports.slice(0, 900) }); }

  function pickDistrict() {
    var total = 0;
    D.list.forEach(function (d) { total += d.weight; });
    var r = Math.random() * total;
    for (var i = 0; i < D.list.length; i++) {
      r -= D.list[i].weight;
      if (r <= 0) return D.list[i];
    }
    return D.list[0];
  }

  function makeReport(district, ageMs, status) {
    var area = district.areas[Math.floor(Math.random() * district.areas.length)];
    return {
      id: util.uuid(),
      district: district.name,
      area_name: area,
      latitude: +(district.lat + (Math.random() - 0.5) * 0.09).toFixed(6),
      longitude: +(district.lng + (Math.random() - 0.5) * 0.11).toFixed(6),
      status: status,
      created_at: new Date(Date.now() - ageMs).toISOString()
    };
  }

  function generate() {
    var reports = [];
    var n = 170 + Math.floor(Math.random() * 60);
    for (var i = 0; i < n; i++) {
      var d = pickDistrict();
      var age = Math.pow(Math.random(), 1.7) * 47.5 * 3600e3;   // biased towards recent
      var status = Math.random() < (age < 6 * 3600e3 ? 0.62 : 0.45) ? 'outage' : 'restored';
      reports.push(makeReport(d, age, status));
    }
    /* add "restored" follow-ups for some older outages so resolution stats look real */
    reports.filter(function (r) {
      return r.status === 'outage' && Date.now() - Date.parse(r.created_at) > 3 * 3600e3;
    }).forEach(function (r) {
      if (Math.random() < 0.5) {
        var t = Date.parse(r.created_at) + (0.4 + Math.random()) * 3600e3;
        if (t < Date.now()) {
          reports.push({
            id: util.uuid(), district: r.district, area_name: r.area_name,
            latitude: r.latitude, longitude: r.longitude,
            status: 'restored', created_at: new Date(t).toISOString()
          });
        }
      }
    });
    return reports;
  }

  function seed() {
    var data = load();
    var reports = data && data.reports
      ? data.reports.filter(function (r) { return Date.now() - Date.parse(r.created_at) < KEEP_MS; })
      : [];
    var fresh = data && Date.now() - data.seededAt < 7 * 86400e3;
    if (!fresh || reports.length <= 50) {
      reports = generate();
    }
    save(reports);
    return reports;
  }

  function adapter() {
    var reports = seed();
    var timer = null;

    function persist() { save(reports); }
    var persistSoon = util.throttle(persist, 1500);

    return {
      mode: 'demo',

      list: function () { return reports.slice(); },

      insert: function (row) {
        row.id = row.id || util.uuid();
        row.created_at = row.created_at || new Date().toISOString();
        reports.unshift(row);
        if (reports.length > 900) reports.length = 900;
        persistSoon();
        return Promise.resolve(row);   // promise interface, matching the Supabase adapter
      },

      subscribe: function (onInsert, onStatus) {
        if (onStatus) onStatus('demo');
        timer = setInterval(function () {
          if (document.visibilityState === 'hidden') return;   // save battery / CPU
          var roll = Math.random();
          if (roll < 0.3) {
            /* simulate a restoration following a recent outage */
            var candidates = reports.filter(function (r) {
              var age = Date.now() - Date.parse(r.created_at);
              return r.status === 'outage' && age > 20 * 60e3 && age < 6 * 3600e3;
            });
            if (candidates.length) {
              var src = candidates[Math.floor(Math.random() * candidates.length)];
              var row = {
                id: util.uuid(), district: src.district, area_name: src.area_name,
                latitude: src.latitude, longitude: src.longitude,
                status: 'restored', created_at: new Date().toISOString()
              };
              reports.unshift(row);
              persistSoon();
              onInsert(row);
              return;
            }
          }
          var d = pickDistrict();
          var row2 = makeReport(d, 0, Math.random() < 0.7 ? 'outage' : 'restored');
          reports.unshift(row2);
          persistSoon();
          onInsert(row2);
        }, 9000 + Math.random() * 7000);
        return function () { clearInterval(timer); };
      },

      destroy: function () { if (timer) clearInterval(timer); }
    };
  }

  ns.demo = { adapter: adapter, generate: generate };
})(window.LKPM = window.LKPM || {});
