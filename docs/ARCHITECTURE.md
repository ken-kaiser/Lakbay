# Lakbay — architecture and engineering notes

## What Lakbay is today

A static, client-only web app (vanilla HTML/CSS/ES modules, no build step) deployed on GitHub Pages.
There is **no backend and no database**. Every account, booking, payment record and notification is
stored in the browser's `localStorage`, and the passenger and rider apps stay in sync only between
tabs of the same browser on the same device.

| Area | Files | Role |
|---|---|---|
| Landing + sign-in | `index.html`, `js/auth/main.js` | Marketing page, login, register, OTP, reset |
| Passenger app | `client.html`, `js/client/*` | Home, booking, tracking, wallet, history, profile |
| Rider app | `rider.html`, `js/rider/*` | Dashboard, requests, trip, earnings, history, profile |
| Shell + router | `js/app.js` | Auth guard, hash router, header, navigation |
| **Data layer** | `js/storage.js` | `Store` (localStorage), `Bus` (cross-tab events), `Users`, `Session`, `Bookings`, `Notifs`, `Prefs` |
| Domain data + pricing | `js/data.js` | Places, ride classes, fares, promos, commission |
| Ride engine | `js/shared/sim.js` | Drives the ride lifecycle; simulates a rider when no rider tab accepts |
| Offline | `sw.js` | Service worker (production only) |

## Source of truth

`localStorage['lakbay:bookings']` is the single authoritative copy of every ride. Views never keep
their own status: they read through `Bookings` and react to `booking:update` events.
**All writes go through `Bookings.update`**, which re-reads the stored booking and enforces:

1. **Lifecycle** — a status may only move along `BOOKING_TRANSITIONS`:

   ```
   scheduled → searching → accepted → arriving → arrived → in_progress → completed
        ↘ cancelled   ↘ cancelled/expired   ↘ cancelled (until the trip starts)
   ```

   `completed`, `cancelled` and `expired` are final.
2. **Compare-and-set** — callers pass `expect: [...]`; e.g. a ride can only be accepted while it is
   still `searching`, so when two riders accept, the second gets `null`.
3. **One rider per ride** — an assigned `riderId` can never be replaced.
4. **Frozen records** — once a ride is final, its fare, payment, receipt, parties and places cannot
   change (ratings still can).

`Bookings.update` returns `null` when it refuses a change; callers must handle that.

## Events

`Bus.publish(topic, payload)` delivers to this tab and to other tabs (BroadcastChannel plus a
`storage`-event mirror). Each event has a unique `id`; receivers ignore ids they have already seen,
because other tabs receive every event on both channels. Events are a notification that something
changed — the stored booking is the truth, and views re-read it.

## Money

- Fares: `estimateFare` / `applyPromo` in `js/data.js`.
- Rider commission: `riderShare(total)` in `js/data.js` is the only place it is computed
  (20%, rounded to whole pesos; `gross = commission + net`).
- A ride is marked `paid` exactly once, inside `completeTrip`, and only from `in_progress`.
- Rider balance = all-time net earnings − all-time cash-outs, re-read at the moment of cash-out.

## Retention

`Bookings.create` keeps storage bounded without deleting records that matter: only cancelled and
expired rides are dropped (oldest first); completed rides are never deleted, and only lose their
route and chat once they are older than the 30 most recent.

## Tests

- `node .github/scripts/check.mjs` — syntax, imports, service-worker file list, HTML links.
- `node .github/scripts/test.mjs` — lifecycle, concurrency (double accept), idempotent completion,
  frozen records, commission, retention, event de-duplication. Runs the real modules in Node.

Both run in CI on every push and pull request.

## Known limits of the client-only design

These cannot be fixed in the browser; they need a server:

- **No real security.** Anyone can open DevTools and edit accounts, sessions, roles, fares or
  earnings. Passwords are SHA-256 with a fixed salt, the "verification code" is shown on screen,
  and sessions never expire.
- **No cross-device sync.** A passenger on one phone and a rider on another never see each other.
- **No real payments.** GCash/Maya "charges" and rider cash-outs are records only.
- **Concurrency is best-effort.** `localStorage` has no transactions; the compare-and-set closes the
  practical window between tabs but is not a database lock.
- **Data lives in one browser.** Clearing site data deletes everything; there are no backups.
