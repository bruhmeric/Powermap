# ⚡ LK Power Outage Tracker

A **zero-cost, community-driven, real-time power outage map for Sri Lanka** — all 25 districts, no accounts, no server fees. Deploy the static site on Vercel, connect a free Supabase project, and you're live.

Built for speed: **no framework, no build step, no webfonts** — a vanilla-JS app that self-hosts everything (MapLibre GL + the Supabase client, ~300 KB gzipped total) and renders vector basemaps + clustered reports on the GPU.

---

## ✨ Features

**Mapping & data**
- 🗺️ Dark/light **vector** map centred on Sri Lanka (MapLibre GL + CARTO basemaps — crisp at any zoom, retina-native)
- 🔴🟢 Outage & restoration reports with popups, age-fading, and stale (>24h) styling
- 🧩 GPU-powered zoom-aware clustering (MapLibre built-in) with majority-status cluster colours — handles thousands of markers smoothly
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
- 🧪 **Demo mode** — if no database is configured, the app runs with realistic simulated data so you can evaluate everything before setting up Supabase
- 🔒 **Config-file credentials only** — Supabase + CARTO keys live in [`config.js`](config.js), set once by the administrator; the app has no credential inputs, so viewers always share the configured database and can never bring their own

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

That's it — the site immediately works in **demo mode** with simulated data. To go live, set your Supabase credentials in `config.js` (below) and push again.

> No build step, no `package.json`, nothing to install. `vercel.json` handles immutable asset caching and security headers automatically.

---

## 🗄️ Connect a real database (Supabase free tier, ~3 minutes)

Credentials are set **only in [`config.js`](config.js)** — the single source of truth. There is no in-app setup form, the app ignores credential-looking URL parameters, and it never reads credentials from browser storage, so **viewers cannot add or substitute their own credentials**: everyone shares the database configured below.

1. Create a project at [supabase.com](https://supabase.com) (free tier is plenty).
2. Open **SQL Editor** → paste the contents of [`supabase_setup.sql`](supabase_setup.sql) → **Run**.
   This creates the `outage_reports` table, indices, public read/insert RLS policies, and enables realtime replication.
3. Copy your **Project URL** and **anon public key** from **Settings → API**.
4. Paste both into `config.js`, commit, and redeploy:

```js
// config.js
window.LKPM_CONFIG = {
  SUPABASE_URL: 'https://xxxxxxxxxxxx.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOi...',
  CARTO_API_KEY: '...',            // basemap key — already set
  CARTO_API_BASE_URL: '...'        // already set
};
```

Every visitor now reads from and reports into that one project. The ⚙ button in the header shows a **read-only** connection status panel (backend + basemap state, plus a *Copy SQL* convenience button for the administrator).

> 🔐 The anon key is *designed* to be public. Row Level Security restricts anonymous users to `SELECT` and `INSERT` only — no edits, no deletes.

---

## 🗺️ Basemap: CARTO vector tiles (key pre-configured)

The map renders **CARTO vector basemaps** through MapLibre GL — `dark-matter` (dark theme) and `positron` (light theme) — loaded from `basemaps.cartocdn.com` with the API key appended to the style URL, exactly as [CARTO's docs](https://docs.carto.com/faqs/carto-basemaps) recommend:

```
https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json?key=YOUR_KEY
```

Why vector instead of raster PNG tiles: since **25 September 2026** CARTO requires an API key on raster tiles, and keyless/unknown keys get an *"API KEY REQUIRED"* watermark. Vector basemaps are key-exempt today, render crisper at every zoom and DPI, and clustering moves to the GPU. Both settings live in `config.js`:

- `CARTO_API_KEY` — your CARTO key, sent with the style request (`?key=…`)
- `CARTO_API_BASE_URL` — your account's regional CARTO endpoint (`gcp-asia-northeast1.api.carto.com`); recorded for reference, tiles themselves come from the global CDN

Notes:
- **Free tier:** 5M tile requests/month (non-commercial) or 1M/month (commercial) — far more than a community map needs.
- **Attribution** (© OpenStreetMap, © CARTO) is displayed on the map and must stay visible.
- **Website restrictions:** if the key is restricted to specific hosts, add your deployment hostname(s), e.g. `*.your-project.vercel.app`, plus `localhost` / `127.0.0.1` for local testing. Preview deployments get new hostnames every push — a wildcard covers them.
- To swap the key later, edit `CARTO_API_KEY` in `config.js` and redeploy — viewers can never change it from the app.

---

## 🖥️ Run locally

Any static file server works:

```bash
python3 -m http.server 8080
# or: npx serve .
```

Open `http://localhost:8080`. Demo mode runs automatically; to go live, set Supabase credentials in `config.js`. (Opening `index.html` directly from disk also works, minus the service worker.)

---

## 🏗️ Architecture

```
+-------------------------------------------------------+
|            MapLibre GL (vector) + vanilla JS           |
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
├── config.js                # THE credentials file — Supabase + CARTO (admin-only)
├── vercel.json              # cache + security headers
├── sw.js                    # service worker (app shell + asset cache)
├── manifest.webmanifest     # PWA manifest
├── supabase_setup.sql       # database bootstrap script
├── assets/v1/               # immutable, self-hosted (cache-forever)
│   ├── css/                 #   app styles + MapLibre GL CSS
│   ├── js/                  #   MapLibre GL 5 + Supabase JS 2 (UMD)
│   └── icons/               #   PWA icons
└── src/                     # app modules (no framework, no bundler)
    ├── app.js               #   orchestrator: boot, submission, realtime, shortcuts
    ├── ui.js                #   stats, filters, search, feed, form
    ├── modals.js            #   read-only connection info + about
    ├── map.js               #   map, CARTO-keyed tiles, clustering, pins, popups
    ├── store.js             #   reactive state + derived stats
    ├── db.js                #   Supabase adapter (config-file credentials only)
    ├── demo.js              #   offline simulation engine
    ├── districts.js         #   25 districts + centroids + area names
    └── utils.js             #   helpers, toasts, storage
```

### Why it's fast
- **Zero build, zero framework** — no hydration, no runtime CSS-in-JS; first paint is plain HTML/CSS.
- **Self-hosted libraries** — MapLibre GL & the Supabase client load same-origin with `Cache-Control: immutable` (no third-party DNS/TLS on the critical path).
- **Vector basemaps + GPU clustering** — tiles are smaller than raster at high zoom, retina-native with no @2x requests, and clustering runs on the GPU in maplibre's worker.
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
| Map tiles | `TILES` + `cartoKey()` in `src/map.js` (template + key come from `config.js`) |

### Hardening ideas (optional, server-side)
Client-side rate limiting can be bypassed with a different browser. If spam becomes an issue consider: a Supabase Edge Function that validates + throttles inserts by IP, per-district report caps, or requiring a magic-link login. The current model intentionally favours frictionless reporting.

---

## 📄 Data & privacy

Reports are anonymous — the table stores only district, area name, coordinates, status, and timestamp. No accounts, cookies, or IP logging. Anyone can read all reports (that's the point of a community map).

**Disclaimer:** this is an unofficial community tool, not affiliated with CEB or LECO. Map tiles © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors & © [CARTO](https://carto.com/attributions). Area names via [Nominatim](https://nominatim.org/). MIT licensed — see [LICENSE](LICENSE).
