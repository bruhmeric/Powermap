# ⚡ LK Power Outage Tracker

A **zero-cost, community-driven, real-time power outage map for Sri Lanka** — all 25 districts, no accounts, no server fees. Deploy the static site on Vercel, connect a free Supabase project, and you're live.

Built for speed: **no framework, no build step, no webfonts** — a vanilla-JS app that ships ~90 KB of gzipped code (Leaflet + Supabase client included, self-hosted) and renders everything on a canvas.

---

## ✨ Features

**Mapping & data**
- 🗺️ Dark/light Leaflet map centred on Sri Lanka (CARTO tiles, canvas rendering)
- 🔴🟢 Outage & restoration reports with popups, age-fading, and stale (>24h) styling
- 🧩 Custom zoom-aware grid clustering — no clustering library, handles thousands of markers
- ⚡ Realtime WebSocket updates (Supabase Realtime) with pulsing new-report animation
- 🧭 Smart stats: "active outages" de-duplicates by ~1 km grid so restored areas aren't double-counted

**Reporting**
- 📍 Click-to-pin (draggable pin), GPS "use my location", auto district detection from coordinates
- 🏷️ Auto area-name fill via OpenStreetMap reverse geocoding
- 🕐 Rate limiting (1 report / 5 min) with a live countdown
- 👥 Near-duplicate awareness: tells you when recent reports exist within ~1.5 km

**Interface**
- 🔎 Search across areas & districts with instant results dropdown
- ⏱️ Time-window (1h / 6h / 24h / 7d / all), status, and district filters
- 📊 24-hour activity sparkline + top-affected-districts ranking (click to filter)
- 📡 Live activity feed, connection status indicator (live / connecting / offline / demo)
- 🌗 Dark & light themes, keyboard shortcuts (`/`, `T`, `N`, `A`, `Esc`)
- 📤 CSV / JSON export of the filtered view, native share sheet
- 📱 Mobile bottom-sheet report form, slide-over sidebar, safe-area aware
- 📲 Installable PWA with offline app-shell caching (service worker)
- 🧪 **Demo mode** — if no database is connected, the app runs with realistic simulated data so you can evaluate everything before setting up Supabase
- 🛠️ In-browser setup wizard: paste Supabase URL + anon key, test the connection, save — no code edits needed

---

## 🚀 Deploy to Vercel (free)

1. **Push to GitHub**
   ```bash
   git init
   git add .
   git commit -m "LK Power Outage Tracker"
   git branch -M main
   git remote add origin https://github.com/<you>/lk-power-outage-map.git
   git push -u origin main
   ```
2. **Import on Vercel** — [vercel.com](https://vercel.com) → *Add New → Project* → import the repo → leave the framework preset as **Other** → **Deploy**.
3. You'll get a free HTTPS URL like `lk-power-outage-map.vercel.app`. Custom domains work too.

That's it — the site immediately works in **demo mode** with simulated data.

> No build step, no `package.json`, nothing to install. `vercel.json` handles immutable asset caching and security headers automatically.

---

## 🗄️ Connect a real database (Supabase free tier, ~3 minutes)

1. Create a project at [supabase.com](https://supabase.com) (free tier is plenty).
2. Open **SQL Editor** → paste the contents of [`supabase_setup.sql`](supabase_setup.sql) → **Run**.
   This creates the `outage_reports` table, indices, public read/insert RLS policies, and enables realtime replication.
3. Copy your **Project URL** and **anon public key** from **Settings → API**.
4. On your deployed site, click the **⚙ settings** button, paste both values, press **Test connection**, then **Save & reload**.

Credentials are stored in your browser's `localStorage` only. If you want *all* visitors to share one database without the wizard, paste them into [`config.js`](config.js) instead — localStorage takes precedence when present.

> 🔐 The anon key is *designed* to be public. Row Level Security restricts anonymous users to `SELECT` and `INSERT` only — no edits, no deletes.

### Optional: bake the config in before deploying
```js
// config.js
window.LKPM_CONFIG = {
  SUPABASE_URL: 'https://xxxxxxxxxxxx.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOi...'
};
```

---

## 🖥️ Run locally

Any static file server works:

```bash
python3 -m http.server 8080
# or: npx serve .
```

Open `http://localhost:8080`. Demo mode runs automatically; connect Supabase via the ⚙ wizard to go live. (Opening `index.html` directly from disk also works, minus the service worker.)

---

## 🏗️ Architecture

```
+-------------------------------------------------------+
|            Leaflet.js (canvas) + vanilla JS           |
|            Interactive Map Frontend (static)          |
+---------------------------+---------------------------+
                            |
          +-----------------+------------------+
          |                                    |
          v                                    v
+------------------+                +-----------------------+
|  Supabase REST   |                |  Supabase Realtime    |
| (fetch reports)  |                |  (WebSocket INSERTs)  |
+------------------+                +-----------------------+
          |                                    |
          +-----------------+------------------+
                            v
                +-----------------------+
                | PostgreSQL + PostGIS  |
                |  (Supabase Free Tier) |
                +-----------------------+
```

```
.
├── index.html               # app shell (all UI + inline SVG sprite)
├── config.js                # optional Supabase credentials
├── vercel.json              # cache + security headers
├── sw.js                    # service worker (app shell + asset cache)
├── manifest.webmanifest     # PWA manifest
├── supabase_setup.sql       # database bootstrap script
├── assets/v1/               # immutable, self-hosted (cache-forever)
│   ├── css/                 #   app styles + Leaflet CSS
│   ├── js/                  #   Leaflet 1.9.4 + Supabase JS 2 (UMD)
│   └── icons/               #   PWA icons
└── src/                     # app modules (no framework, no bundler)
    ├── app.js               #   orchestrator: boot, submission, realtime, shortcuts
    ├── ui.js                #   stats, filters, search, feed, form
    ├── modals.js            #   setup wizard + about
    ├── map.js               #   map, clustering, pins, popups
    ├── store.js             #   reactive state + derived stats
    ├── db.js                #   Supabase adapter / config / connection tester
    ├── demo.js              #   offline simulation engine
    ├── districts.js         #   25 districts + centroids + area names
    └── utils.js             #   helpers, toasts, storage
```

### Why it's fast
- **Zero build, zero framework** — no hydration, no runtime CSS-in-JS; first paint is plain HTML/CSS.
- **Self-hosted libraries** — Leaflet & the Supabase client load same-origin with `Cache-Control: immutable` (no third-party DNS/TLS on the critical path).
- **Canvas markers + custom grid clustering** — smooth with thousands of points; clustering is ~60 lines, not a 30 KB plugin.
- **Instant repeat loads** — reports are cached in `localStorage` and painted before the network responds; the service worker serves the shell offline.
- **rAF-batched rendering**, memoized derived state, debounced search/map re-clustering, throttled persistence.

---

## 🔧 Customization

| What | Where |
|---|---|
| Colors / theme | CSS custom properties at the top of `assets/v1/css/style.css` |
| Districts & demo area names | `src/districts.js` |
| Rate limit | `RATE_MS` in `src/ui.js` |
| Fetch limit / cluster zoom | `src/db.js` (`limit(2000)`) / `src/map.js` (`CLUSTER_MAX_ZOOM`) |
| Map tiles | `TILES` in `src/map.js` |

### Hardening ideas (optional, server-side)
Client-side rate limiting can be bypassed with a different browser. If spam becomes an issue consider: a Supabase Edge Function that validates + throttles inserts by IP, per-district report caps, or requiring a magic-link login. The current model intentionally favours frictionless reporting.

---

## 📄 Data & privacy

Reports are anonymous — the table stores only district, area name, coordinates, status, and timestamp. No accounts, cookies, or IP logging. Anyone can read all reports (that's the point of a community map).

**Disclaimer:** this is an unofficial community tool, not affiliated with CEB or LECO. Map tiles © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors & © [CARTO](https://carto.com/attributions). Area names via [Nominatim](https://nominatim.org/). MIT licensed — see [LICENSE](LICENSE).
