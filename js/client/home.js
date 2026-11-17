/* ==========================================================================
   Lakbay — Passenger Home view
   Booking launcher, active-ride resume, saved places, recents, quick
   actions, promos and service info strip.
   ========================================================================== */
import { App } from '../app.js';
import { Bookings, Notifs, Prefs, SavedPlacesRepo, PaymentRepo } from '../storage.js';
import { Sim } from '../shared/sim.js';
import {
  PROMOS, DEFAULT_SAVED_PLACES, nearbyPlaces, haversineKm, generateRoute,
  estimateDurationMin, estimateFare,
} from '../data.js';
import { el, clear, qs } from '../shared/dom.js';
import { Icons } from '../shared/icons.js';
import { Toast } from '../shared/toast.js';
import { Modal, confirmDialog } from '../shared/modal.js';
import { createMap } from '../shared/map.js';
import { locateUser, getLastLocation } from '../shared/geo.js';
import { peso, dateTime, firstNameOf, statusLabel, statusEl } from '../shared/format.js';
import { promoRail } from '../shared/promo.js';

/* Sample location (Cebu Business Park) — used ONLY when the browser never
   gave us a GPS fix (permission denied / unsupported). */
export const SAMPLE_LOC = {
  name: 'Cebu Business Park area',
  address: 'Cebu Business Park, Cebu City',
  lat: 10.3175, lng: 123.9055,
};

/* Best known pickup: last real GPS fix, else the sample point. */
export function currentLoc() {
  return getLastLocation() || SAMPLE_LOC;
}

export function avatarEl(person, size = '') {
  const span = document.createElement('span');
  span.className = `avatar ${size}`;
  if (person && person.avatar) {
    const img = document.createElement('img');
    img.src = person.avatar; img.alt = '';
    img.style.cssText = 'width:100%;height:100%;border-radius:50%;object-fit:cover;position:absolute;inset:0';
    img.onerror = () => { img.remove(); span.textContent = initials(person.name || person.firstName || '?'); };
    span.style.position = 'relative';
    span.style.background = `hsl(${(person.hue || 152)}, 42%, 38%)`;
    span.appendChild(img);
    if (!person.avatar) span.textContent = initials(person.name || '?');
  } else {
    span.style.background = `hsl(${(person && person.hue) || 152}, 42%, 38%)`;
    span.textContent = initials((person && person.name) || '?');
  }
  return span;
}

function initials(name = '') {
  return String(name).trim().split(/\s+/).slice(0, 2).map((w) => w[0] || '').join('').toUpperCase() || '?';
}

const state = { map: null, located: null };

/* ---------- helpers ---------- */
function encodePoint(p) {
  if (p.placeId) return p.placeId;
  return encodeURIComponent(JSON.stringify({ name: p.name, address: p.address, lat: p.lat, lng: p.lng }));
}

function ensureSavedPlaces(userId) {
  let list = SavedPlacesRepo.list(userId);
  if (!list) {
    // Sample Home/Work (Banilad, IT Park) only for the Cebu demo account;
    // real users start empty and add their own places.
    list = userId === 'demo-passenger' ? DEFAULT_SAVED_PLACES(userId) : [];
    SavedPlacesRepo.save(userId, list);
  }
  return list;
}

function pushRecent(userId, place) {
  const list = Prefs.get(userId, 'recentPlaces', []).filter(
    (r) => !(r.name === place.name && r.address === place.address)
  );
  list.unshift({ ...place, at: Date.now() });
  Prefs.set(userId, 'recentPlaces', list.slice(0, 6));
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch (e) { /* fall through */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch (e) { return false; }
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 18) return 'afternoon';
  return 'evening';
}

/* ---------- active ride resume card ---------- */
function activeRideCard(b) {
  const scheduled = b.status === 'scheduled';
  const rider = b.rider;
  const card = el('article', { class: `cl-acard${scheduled ? ' cl-acard--accent' : ''}`, 'aria-label': 'Your active ride' });
  const left = el('div', { class: 'cl-acard-body' },
    el('div', { class: 'row-between' },
      statusEl(b.status),
      rider ? el('div', { class: 'row', style: 'gap:8px' },
        avatarEl({ name: rider.name, avatar: rider.avatar }, 'avatar--sm'),
        el('span', { class: 't-small t-strong clamp-1', style: 'max-width:120px' }, rider.name),
      ) : (scheduled ? el('span', { class: 't-xs' }, `Pickup ${dateTime(b.scheduledFor)}`) : null),
    ),
    el('div', { class: 'cl-acard-route' },
      el('i', { 'data-lucide': 'route' }),
      el('span', { class: 'clamp-1' }, `${b.pickup.name} → ${b.dropoff.name}`),
    ),
    el('div', { class: 'cl-acard-meta' },
      scheduled
        ? `Scheduled ride · ${peso(b.fare.total, { whole: true })} est.`
        : `${peso(b.fare.total, { whole: true })} · ${b.distanceKm.toFixed(1)} km trip`),
  );
  const actions = el('div', { class: 'cl-acard-actions' });
  if (scheduled) {
    const startBtn = el('button', { class: 'btn btn--primary btn--sm' }, el('i', { 'data-lucide': 'play' }), 'Start now');
    startBtn.addEventListener('click', () => {
      const live = Bookings.activeFor(App.user.id, 'passenger').find((x) => x.status !== 'scheduled');
      if (live) { Toast.warn('You already have a ride', 'Finish or cancel your current ride first.'); App.navigate('trip', { restPath: live.id }); return; }
      startBtn.disabled = true; startBtn.classList.add('btn--loading');
      const updated = Bookings.update(b.id, { status: 'searching' }, { by: 'passenger', expect: ['scheduled'] });
      if (!updated) { Toast.error('Could not start', 'This scheduled ride is no longer available.'); App.navigate('home', {}, { replace: true }); return; }
      Sim.beginSearch(updated);
      Toast.info('Searching for riders', 'We are matching your scheduled ride with nearby drivers.');
      App.navigate('matching', { restPath: b.id });
    });
    const cancelBtn = el('button', { class: 'btn btn--outline btn--sm' }, 'Cancel');
    cancelBtn.addEventListener('click', async () => {
      const ok = await confirmDialog({
        title: 'Cancel scheduled ride?',
        message: 'This removes the booking from your schedule. You can book again anytime.',
        confirmLabel: 'Cancel ride', tone: 'danger', icon: 'circle-x',
      });
      if (!ok) return;
      if (Sim.passengerCancel(b.id)) Toast.warn('Ride cancelled', 'Your scheduled booking was removed.');
      else Toast.error('Could not cancel', 'This ride can no longer be cancelled.');
      App.navigate('home', {}, { replace: true });
    });
    actions.append(startBtn, cancelBtn);
  } else {
    const trackBtn = el('button', { class: 'btn btn--primary btn--sm' }, el('i', { 'data-lucide': 'radar' }), 'Track ride');
    trackBtn.addEventListener('click', () => App.navigate('trip', { restPath: b.id }));
    actions.appendChild(trackBtn);
  }
  left.appendChild(actions);
  card.appendChild(left);
  return card;
}

/* ---------- schedule-a-ride modal ---------- */
function openScheduleModal(userId, saved) {
  const here = state.located || currentLoc();
  const nearby = nearbyPlaces(here, 6, 25);
  const options = [
    ...saved.map((s) => ({ key: 'sp:' + s.id, label: `${s.label} — ${s.name}`, place: s })),
    ...nearby.map((p) => ({ key: 'pl:' + p.id, label: `${p.name} — ${p.address}`, place: p })),
  ];
  const body = el('div', { class: 'col', style: 'gap:12px' });
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const dateField = el('div', { class: 'field' },
    el('label', { for: 'sch-date' }, 'Pickup date'),
    el('input', { class: 'input', id: 'sch-date', name: 'date', type: 'date', min: todayStr, value: todayStr }),
  );
  const timeField = el('div', { class: 'field' },
    el('label', { for: 'sch-time' }, 'Pickup time'),
    el('input', { class: 'input', id: 'sch-time', name: 'time', type: 'time', value: '08:30' }),
  );
  const destField = el('div', { class: 'field' },
    el('label', { for: 'sch-dest' }, 'Destination'),
    el('select', { class: 'select', id: 'sch-dest', name: 'dest' },
      options.map((o) => el('option', { value: o.key }, o.label)),
    ),
  );
  const hint = el('p', { class: 't-xs' },
    `Pickup defaults to your current location (${here.name}). We will match you with a driver at the scheduled time.`);
  if (!options.length) {
    body.appendChild(el('p', { class: 't-small' }, 'No destinations yet. Add a saved place first, or book now from the search screen.'));
  }
  const dateRow = el('div', { class: 'cl-form-2col' }, dateField, timeField);
  body.append(dateRow, destField, hint);

  const modal = Modal.open({
    title: 'Schedule a ride',
    body,
    actions: [
      { label: 'Cancel', variant: 'outline', onClick: (api) => api.close(null) },
      {
        label: 'Schedule ride', variant: 'primary', icon: 'calendar-clock',
        onClick: (api, btn) => {
          const d = qs('[name="date"]', body).value;
          const t = qs('[name="time"]', body).value;
          const key = qs('[name="dest"]', body).value;
          if (!d || !t) { Toast.error('Missing schedule', 'Choose a pickup date and time.'); return; }
          const ts = new Date(`${d}T${t}`).getTime();
          if (!Number.isFinite(ts)) { Toast.error('Invalid schedule', 'That date and time could not be read.'); return; }
          if (ts < Date.now() + 5 * 60000) { Toast.error('Too soon', 'Schedule pickups at least 5 minutes ahead.'); return; }
          const opt = options.find((o) => o.key === key);
          const dest = opt ? opt.place : null;
          if (!dest) { Toast.error('No destination', 'Pick a destination for this ride.'); return; }
          const km = Math.round(haversineKm(here, dest) * 10) / 10;
          const mins = estimateDurationMin(km);
          const cat = 'car';
          const booking = {
            id: 'b_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
            ref: 'LB-' + d.replace(/-/g, '') + '-' + Math.floor(1000 + Math.random() * 9000),
            passengerId: App.user.id,
            passengerName: `${App.user.firstName} ${App.user.lastName}`,
            passengerPhone: App.user.phone,
            passengerAvatar: App.user.avatar,
            passengerRating: App.user.rating || 5,
            riderId: null, rider: null, riderSource: null,
            category: cat,
            pickup: { placeId: null, name: here.name, address: here.address, lat: here.lat, lng: here.lng, instructions: '' },
            dropoff: { placeId: dest.id || null, name: dest.name, address: dest.address, lat: dest.lat, lng: dest.lng, instructions: '' },
            distanceKm: km, durationMin: mins, route: [], // filled below after import-free generateRoute
            fare: estimateFare(cat, km, mins),
            payment: { method: PaymentRepo.defaultMethod(userId), status: 'pending' },
            status: 'scheduled',
            timeline: [{ status: 'scheduled', at: Date.now(), by: 'passenger' }],
            pickupEtaSec: 0, tripEtaSec: 0,
            createdAt: Date.now(), scheduledFor: ts,
            messages: [], rating: null, receipt: null,
          };
          booking.route = generateRoute(here, dest);
          Bookings.create(booking);
          Notifs.push({
            userId, role: 'passenger',
            title: 'Ride scheduled',
            body: `Pickup on ${dateTime(ts)} — ${booking.pickup.name} → ${dest.name}.`,
            icon: 'calendar-clock', tone: 'primary',
          });
          Toast.success('Ride scheduled', `We will match a driver on ${dateTime(ts)}.`);
          api.close(true);
          App.navigate('home', {}, { replace: true });
        },
      },
    ],
  });
  return modal;
}

/* ---------- view ---------- */
export const homeView = {
  id: 'home',
  render(root) {
    const userId = App.user.id;
    state.map = null;
    state.located = null;
    const saved = ensureSavedPlaces(userId);

    /* header location chip — resolves the user's real area when possible */
    const chipText = el('span', { class: 'loc-text' }, 'Locating you\u2026');
    const chip = el('button', { class: 'loc-chip', type: 'button', 'aria-label': 'Change pickup location' },
      el('i', { 'data-lucide': 'map-pin' }),
      chipText,
    );
    chip.addEventListener('click', () => App.navigate('search', { query: { focus: 'pickup' } }));
    App.setHeaderLeft(chip);
    Icons.refresh(chip);
    const known = getLastLocation();
    if (known) {
      state.located = known;
      chipText.textContent = `Current location · ${known.city || known.address}`;
    }
    (async () => {
      const loc = await locateUser({ timeout: 6000 });
      if (loc) {
        state.located = loc;
        chipText.textContent = `Current location · ${loc.city || loc.address}`;
        // show the real place as the pickup instead of the sample text
        const pv = qs('[data-role="pickup-value"]', root);
        if (pv) pv.textContent = loc.name;
      } else if (!known) {
        chipText.textContent = 'Current location · sample area';
      }
      Icons.refresh(chip);
    })();

    /* Layout: the map is the stage. Desktop — booking panel left, sticky map
       right. Phone — map on top, the panel rises over it like a sheet. */
    const home = el('div', { class: 'cl-home' });
    const panel = el('div', { class: 'cl-home-panel' });

    /* map */
    const mapBox = el('div', { class: 'map-box cl-home-map' });
    const locateFab = el('button', { class: 'map-fab', type: 'button', 'aria-label': 'Center the map on my location' },
      el('i', { 'data-lucide': 'locate-fixed' }));
    locateFab.addEventListener('click', () => locateMe(root));
    mapBox.appendChild(el('div', { class: 'cl-map-float' }, locateFab));

    /* welcome */
    panel.appendChild(el('div', { class: 'cl-welcome' },
      el('h1', { class: 'cl-welcome-title' }, `Good ${greeting()}, ${firstNameOf(App.user)}`),
      el('p', { class: 'cl-welcome-sub' }, 'Where can we take you today?'),
    ));

    /* active ride resume */
    const active = Bookings.activeFor(userId, 'passenger');
    if (active.length) panel.appendChild(activeRideCard(active[0]));

    /* booking composer — pickup + destination, one primary action */
    const launcher = el('section', { class: 'cl-compose', 'aria-label': 'Book a ride' });
    const pickupRow = el('button', { class: 'cl-route-row', type: 'button' },
      el('span', { class: 'cl-rr-dot' }),
      el('span', { class: 'cl-rr-body' },
        el('span', { class: 'cl-rr-label' }, 'Pickup'),
        el('span', { class: 'cl-rr-value', 'data-role': 'pickup-value' }, known ? known.name : 'Locating you…'),
      ),
      el('i', { 'data-lucide': 'pencil-line' }),
    );
    const destRow = el('button', { class: 'cl-route-row cl-route-row--dest', type: 'button' },
      el('span', { class: 'cl-rr-dot cl-rr-dot--end' }),
      el('span', { class: 'cl-rr-body' },
        el('span', { class: 'cl-rr-label' }, 'Destination'),
        el('span', { class: 'cl-rr-value placeholder' }, 'Where to?'),
      ),
      el('i', { 'data-lucide': 'search' }),
    );
    pickupRow.addEventListener('click', () => App.navigate('search', { query: { focus: 'pickup' } }));
    destRow.addEventListener('click', () => App.navigate('search', { query: { focus: 'dropoff' } }));
    launcher.append(el('div', { class: 'cl-routebox' }, pickupRow, destRow));

    const bookBtn = el('button', { class: 'btn btn--primary btn--lg' }, 'Book a ride', el('i', { 'data-lucide': 'arrow-right' }));
    bookBtn.addEventListener('click', () => App.navigate('search', { query: { focus: 'dropoff' } }));
    const scheduleBtn = el('button', { class: 'btn btn--outline btn--lg', type: 'button' },
      el('i', { 'data-lucide': 'calendar-clock' }), 'Schedule');
    scheduleBtn.addEventListener('click', () => openScheduleModal(userId, saved));
    launcher.appendChild(el('div', { class: 'cl-launcher-foot' }, bookBtn, scheduleBtn));
    panel.appendChild(launcher);

    /* saved places — a plain list: icon, label, place */
    const savedSec = el('section', { class: 'cl-home-sec', 'aria-labelledby': 'cl-saved-h' },
      el('div', { class: 'cl-sec-head' },
        el('h2', { class: 'cl-section-title', id: 'cl-saved-h' }, 'Saved places'),
        el('a', { class: 'cl-section-more', href: '#/profile?tab=places' }, 'Manage')));
    const savedList = el('div', { class: 'cl-place-list' });
    if (!saved.length) {
      const addRow = el('button', { class: 'cl-place-item', type: 'button' },
        el('i', { 'data-lucide': 'plus' }),
        el('span', { class: 'cl-pi-body' },
          el('span', { class: 'cl-pi-title' }, 'Add Home or Work'),
          el('span', { class: 'cl-pi-sub' }, 'Book your usual trips in one tap')));
      addRow.addEventListener('click', () => App.navigate('profile', { query: { tab: 'places' } }));
      savedList.appendChild(addRow);
    }
    saved.forEach((sp) => {
      const row = el('button', { class: 'cl-place-item', type: 'button', 'aria-label': `Book a ride to ${sp.label}, ${sp.name}` },
        el('i', { 'data-lucide': sp.icon || 'star' }),
        el('span', { class: 'cl-pi-body' },
          el('span', { class: 'cl-pi-title' }, sp.label),
          el('span', { class: 'cl-pi-sub' }, sp.name)),
        el('i', { 'data-lucide': 'arrow-up-right', class: 'cl-pi-go' }),
      );
      row.addEventListener('click', () => {
        pushRecent(userId, sp);
        App.navigate('rides', { query: { from: encodePoint({ ...(state.located || currentLoc()), placeId: null }), to: sp.placeId || encodePoint(sp) } });
      });
      savedList.appendChild(row);
    });
    savedSec.appendChild(savedList);
    panel.appendChild(savedSec);

    /* recent destinations */
    const recents = Prefs.get(userId, 'recentPlaces', []);
    const recentSec = el('section', { class: 'cl-home-sec', 'aria-labelledby': 'cl-recent-h' },
      el('div', { class: 'cl-sec-head' },
        el('h2', { class: 'cl-section-title', id: 'cl-recent-h' }, 'Recent'),
        recents.length ? el('span', { class: 't-xs' }, 'Tap to book again') : null));
    if (recents.length) {
      const list = el('div', { class: 'cl-place-list' });
      recents.forEach((r) => {
        const item = el('button', { class: 'cl-place-item', type: 'button' },
          el('i', { 'data-lucide': 'history' }),
          el('span', { class: 'cl-pi-body' },
            el('span', { class: 'cl-pi-title' }, r.name),
            el('span', { class: 'cl-pi-sub' }, r.address)),
          el('i', { 'data-lucide': 'arrow-up-right', class: 'cl-pi-go' }),
        );
        item.addEventListener('click', () => {
          App.navigate('rides', { query: { from: encodePoint({ ...(state.located || currentLoc()), placeId: null }), to: r.placeId || encodePoint(r) } });
        });
        list.appendChild(item);
      });
      recentSec.appendChild(list);
    } else {
      recentSec.appendChild(el('p', { class: 'cl-quiet' }, 'Places you book will show up here for one-tap rebooking.'));
    }
    panel.appendChild(recentSec);

    home.append(panel, mapBox);

    /* promos — expressive campaign cards (shared component) */
    const promoRow = promoRail(PROMOS, {
      onCopy: async (p) => {
        const ok = await copyText(p.code);
        if (ok) Toast.success('Code copied', `${p.code} is ready to paste at checkout.`);
        else Toast.info('Code: ' + p.code, 'Copy it manually and enter it before confirming your ride.');
      },
    });
    promoRow.classList.add('cl-promo-row-rail');
    const promoSec = el('section', { class: 'cl-home-promos', 'aria-labelledby': 'cl-promo-h' },
      el('div', { class: 'cl-sec-head' }, el('h2', { class: 'cl-section-title', id: 'cl-promo-h' }, 'Promos for you')),
      promoRow);

    /* one quiet safety line + help, instead of a stack of banners */
    const helpLink = el('a', { href: '#/profile?tab=support' }, 'Help & support');
    const foot = el('p', { class: 'cl-home-foot' },
      el('i', { 'data-lucide': 'shield-check' }),
      el('span', {}, 'Check the plate and driver photo before boarding, and share your trip with someone you trust. '),
      helpLink);

    const wrap = el('div', { class: 'cl-stack cl-home-wrap' }, home, promoSec, foot);
    root.appendChild(wrap);
    Icons.refresh(root);

    /* map (created after layout so Leaflet measures a real size) —
       centers on the user's real location (GPS) and falls back to the sample */
    setTimeout(async () => {
      if (!mapBox.isConnected) return;
      const geo = (await locateUser({ timeout: 6000 })) || getLastLocation();
      if (!mapBox.isConnected) return;
      const pos = geo ? { lat: geo.lat, lng: geo.lng } : { ...SAMPLE_LOC };
      if (geo) state.located = geo;
      else {
        const pv = qs('[data-role="pickup-value"]', root);
        if (pv) pv.textContent = `${SAMPLE_LOC.name} (sample)`;
      }
      try {
        const m = createMap(mapBox, { center: [pos.lat, pos.lng], zoom: geo ? 15 : 14, interactive: true });
        state.map = m;
        if (m) {
          if (geo) {
            // real GPS fix: a single location dot carries the position
            m.setMarker('me', pos, 'me', { label: 'You are here' });
          } else {
            m.setMarker('pickup', pos, 'pickup', { label: 'Pickup (sample)' });
          }
          m.onReady(() => { try { m.invalidateSize(); } catch (e) { /* noop */ } });
        }
      } catch (e) {
        mapBox.appendChild(el('div', { class: 'empty', style: 'padding:20px' },
          el('div', { class: 'empty-icon' }, el('i', { 'data-lucide': 'map' })),
          el('p', {}, 'Map preview unavailable right now.')));
      }
      Icons.refresh(mapBox);
    }, 60);
  },

  unmount() {
    if (state.map) { state.map.destroy(); state.map = null; }
  },
};

/* ---------- locate me ---------- */
function locateMe(root) {
  const valueEl = qs('[data-role="pickup-value"]', root);
  const apply = (pos, label) => {
    state.located = pos;
    if (valueEl) valueEl.textContent = label;
    if (state.map) {
      state.map.setView(pos, 16);
      state.map.setMarker('me', pos, 'me', { label: 'You are here' });
      state.map.removeMarker('pickup');
    }
  };
  if (!navigator.geolocation) {
    apply(SAMPLE_LOC, `${SAMPLE_LOC.name} (sample)`);
    Toast.info('Location unavailable', 'Using your sample location.');
    return;
  }
  locateUser({ timeout: 6000, maximumAge: 60000 }).then((loc) => {
    if (loc) {
      apply(loc, loc.name);
      Toast.success('Location found', `Map centered on ${loc.city || loc.address || 'your position'}.`);
    } else {
      apply({ ...SAMPLE_LOC }, `${SAMPLE_LOC.name} (sample)`);
      Toast.info('Location unavailable', 'Allow location access in your browser to use your real position.');
    }
  });
}
