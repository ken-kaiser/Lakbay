# Lakbay — Ride-Hailing Web Application (Prototype)

[![CI](https://github.com/ken-kaiser/Lakbay/actions/workflows/ci-cd.yml/badge.svg)](https://github.com/ken-kaiser/Lakbay/actions/workflows/ci-cd.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-B6F500.svg)](LICENSE)

**Live demo:** https://ken-kaiser.github.io/Lakbay/

A complete, interactive ride-hailing prototype with two fully functional user
experiences — **passenger** and **rider** — built with **vanilla HTML, CSS, and
JavaScript (ES modules)**. No frameworks, no build step, no backend: all state
is simulated locally in the browser.

## Brand system — Electric Lime

| Token | Value | Use |
| ----- | ----- | --- |
| Primary | `#B6F500` | Buttons, active states, map routes, location indicators |
| Hover | `#A4DC00` | Primary hover, dot fills |
| Lime ink | `#4C6D04` | Lime-family text/icons on light surfaces |
| Midnight | `#101A17` | Hero, CTA bands, footer, logo tile, dark cards |
| Secondary dark | `#202B25` | Dark surfaces step |
| Ice white | `#F4F6EF` | Page background |
| Card | `#FFFFFF` + border `#E4E9E0` | Light surfaces |
| Secondary text | `#737C73` | Muted copy |

Type: **Sora** (display) / **Manrope** (UI) — self-hosted as variable woff2 in
`assets/fonts/` (declared in `css/fonts.css`, precached by the service worker;
no Google Fonts CDN). Typography scale: hero heading Sora 700 48–64px,
section heading Sora 600 30–36px, card heading Sora 600 20–24px, navigation
Manrope 600 14–15px, body Manrope 400 14–16px, buttons Manrope 700 14–15px,
prices Manrope 700 20–28px (tokens in `global.css`: `--fs-hero`, `--fs-section`,
`--fs-card-h`, `--fs-nav`, `--fs-btn`, `--fs-price`). Radii: buttons 10–14px,
cards 16–24px. Lime is a strategic highlight — never wallpaper, never behind
white text. Reusable brand assets live in `assets/brand/` (bolt mark, route
pattern) plus CSS utilities in `global.css` (`.brand-routes`, `.brand-streaks`,
`.brand-sweep`). Promo cards (`.promo-card`) are miniature advertising
campaigns built by the shared `js/shared/promo.js` — three palette variants
(`promo--lime`, `promo--midnight`, `promo--ice`) crossed with four
art-directed compositions (`promo--hero` full-bleed car stage,
`promo--showcase` framed vehicle panel, `promo--discount` giant-numeral lime
poster, `promo--compact` circular-stage ice card). The 3D campaign art lives
in `assets/promos/` — one cohesive studio-lit collection (car, scooter,
helmet, lime-coin stack) shot in the same deep green-black world.

## Quick start

The app uses ES modules and a service worker, so it must be served over HTTP.
Opening `index.html` directly from disk (`file://`) will not work. From the
project folder, run any static server, for example:

```bash
python -m http.server 8000
# or
npx serve .
```

Then open http://localhost:8000/index.html. In VS Code, the "Live Server"
extension also works.

- Landing / auth: `index.html`
- Passenger app: `client.html`
- Rider app: `rider.html`

## CI/CD

- **CI:** every push and pull request to `main` runs
  `.github/workflows/ci-cd.yml`, which calls `node .github/scripts/check.mjs`.
  It syntax-checks every JS file, confirms every file in the service worker
  precache list exists, and verifies local links in the HTML pages. You can
  run it locally the same way (Node 22+).
- **CD:** GitHub Pages is set to "Deploy from a branch" (`main`, root), so each
  push to `main` is published to https://ken-kaiser.github.io/Lakbay/
  automatically.

When you change cached files, bump `VERSION` in `sw.js` so installed copies
pick up the update.

### Demo accounts (password `demo1234`)

| Role      | Email                | Notes                                  |
| --------- | -------------------- | -------------------------------------- |
| Passenger | `mika@lakbay.demo`   | Seeded ride history, saved places      |
| Rider     | `ronnel@lakbay.demo` | Verified account, car (Toyota Vios)    |

You can also register new passenger/rider accounts (OTP is shown in the UI —
no SMS backend in the demo).

## What works (all simulated locally)

**Passenger:** location search with autocomplete, saved places, ride categories
(moto / car / premium / XL) with itemized fares, promo codes, booking flow,
driver matching, live map tracking (Leaflet + OpenStreetMap), chat with quick
replies, trip completion, star rating + compliments, receipts (downloadable),
wallet (Cash/GCash/Maya — clearly simulated), ride history with filters,
profile/settings, notifications.

**Rider:** dashboard with availability toggle, demand map, verification center
(document upload + simulated review), incoming request cards with countdown,
accept/decline, arrival → start → complete workflow, turn-by-turn style
navigation (demo mode), earnings with charts and cash-outs, trip history,
payout settings.

**Cross-tab:** open `client.html` and `rider.html` in two tabs of the same
browser — passenger bookings appear as live requests on the rider tab via
`BroadcastChannel` (localStorage fallback), and per-role sessions keep both
apps signed in simultaneously. If no rider accepts, a clearly-labelled
simulated driver takes over so every journey is testable solo.

## Structure

```
.
├── index.html            Landing + auth (rendered by js/auth/main.js)
├── client.html           Passenger app shell
├── rider.html            Rider app shell
├── assets/               Generated illustrations, vehicles, avatars, logo
├── css/
│   ├── global.css        Design tokens, reset, typography, app shell
│   ├── components.css    Shared component library
│   ├── client.css        Passenger views (cl-*)
│   ├── rider.css         Rider views (rd-*)
│   └── landing.css       Landing + auth (lb-*)
├── js/
│   ├── app.js            Shell, hash router, session guard (both apps)
│   ├── storage.js        localStorage repos, event bus, seeding
│   ├── data.js           PH places, fare model, drivers, routes (demo)
│   ├── shared/           dom, format, icons (Lucide), modal, toast,
│   │                     notifications, validation, map (Leaflet), sim
│   │                     engine, charts, carousel, promo cards, ui-lite
│   ├── client/           main, home, booking, tracking, payment,
│   │                     history, profile
│   ├── rider/            main, dashboard, requests, trip, earnings,
│   │                     history, profile
│   └── auth/main.js      Landing views + login/register/OTP/reset
├── vendor/               Leaflet 1.9.4, Lucide 0.462 (local copies)
├── sw.js                 Service worker (offline support)
├── manifest.webmanifest  PWA manifest
└── .github/              CI/CD workflow and check script
```

## License

[MIT](LICENSE) © 2026 Ken Kaiser. Bundled third-party libraries keep their own
licenses: Leaflet (BSD-2-Clause) and Lucide (ISC). Map data © OpenStreetMap
contributors (ODbL).

## Honest limitations (by design)

- Rides, GPS tracking, payments, chat delivery, verification, and earnings are
  **simulated on-device** and labelled as such in the UI. No real dispatch,
  money, or network services.
- Location search covers a curated Metro Manila place list (a production build
  would use a geocoding API).
- Route lines blend deterministic demo geometry with real OSRM road geometries
  when the public router is reachable.
- Passwords are SHA-256 hashed before storage; data never leaves the browser.
- Prepared for backend integration: the storage layer isolates all persistence
  behind repos + an event bus, so swapping in REST/WebSocket calls is localized.
