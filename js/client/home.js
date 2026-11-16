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
import { browserLocation, reverseGeocode } from '../shared/geo.js';
import { peso, dateTime, firstNameOf, statusLabel, statusEl } from '../shared/format.js';
import { promoRail } from '../shared/promo.js';

/* Sample current location (Makati CBD) — also the geolocation fallback */
export const SAMPLE_LOC = {
  name: 'Makati CBD area',
  address: 'Ayala Ave, Bel-Air, Makati City',
  lat: 14.5587, lng: 121.0196,
};

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
    list = DEFAULT_SAVED_PLACES(userId);
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
      startBtn.disabled = true; startBtn.classList.add('btn--loading');
      const updated = Bookings.update(b.id, { status: 'searching' }, { by: 'passenger' });
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
      Sim.passengerCancel(b.id);
      Toast.warn('Ride cancelled', 'Your scheduled booking was removed.');
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
  const nearby = nearbyPlaces(SAMPLE_LOC, 6);
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
    'Pickup defaults to your current location (Makati CBD area). We will match you with a driver at the scheduled time.');
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
          const km = Math.round(haversineKm(SAMPLE_LOC, dest) * 10) / 10;
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
            pickup: { placeId: null, name: SAMPLE_LOC.name, address: SAMPLE_LOC.address, lat: SAMPLE_LOC.lat, lng: SAMPLE_LOC.lng, instructions: '' },
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
          booking.route = generateRoute(SAMPLE_LOC, dest);
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
    (async () => {
      const geo = await browserLocation({ timeout: 6000 });
      const place = geo ? await reverseGeocode(geo.lat, geo.lng) : null;
      if (geo) {
        state.located = { name: place.name, address: place.address, lat: geo.lat, lng: geo.lng };
        const area = place.city || place.area || place.address;
        chipText.textContent = `Current location · ${area}`;
      } else {
        chipText.textContent = 'Current location · sample area';
      }
      Icons.refresh(chip);
    })();

    const wrap = el('div', { class: 'cl-stack' });

    /* welcome */
    wrap.appendChild(el('div', { class: 'cl-welcome' },
      el('h1', { class: 't-title' }, `Good ${greeting()}, ${firstNameOf(App.user)}`),
      el('p', { class: 'cl-welcome-sub' }, 'Where can we take you today?'),
    ));

    /* active ride resume */
    const active = Bookings.activeFor(userId, 'passenger');
    if (active.length) wrap.appendChild(activeRideCard(active[0]));

    /* booking launcher */
    const launcher = el('section', { class: 'card cl-launcher', 'aria-label': 'Book a ride' });
    const searchbar = el('button', { class: 'cl-searchbar', type: 'button' },
      el('i', { 'data-lucide': 'search' }),
      el('span', { class: 'cl-searchbar-text' }, 'Search destination or enter an address'),
    );
    searchbar.addEventListener('click', () => App.navigate('search'));
    launcher.appendChild(searchbar);

    const routebox = el('div', { class: 'cl-routebox' });
    const pickupRow = el('button', { class: 'cl-route-row', type: 'button' },
      el('span', { class: 'cl-rr-dot' }),
      el('i', { 'data-lucide': 'circle-dot' }),
      el('span', { class: 'cl-rr-body' },
        el('span', { class: 'cl-rr-label' }, 'Pickup'),
        el('span', { class: 'cl-rr-value', 'data-role': 'pickup-value' }, `${SAMPLE_LOC.name}`),
      ),
    );
    const destRow = el('button', { class: 'cl-route-row', type: 'button' },
      el('span', { class: 'cl-rr-dot cl-rr-dot--end' }),
      el('i', { 'data-lucide': 'flag' }),
      el('span', { class: 'cl-rr-body' },
        el('span', { class: 'cl-rr-label' }, 'Destination'),
        el('span', { class: 'cl-rr-value placeholder' }, 'Plan your route'),
      ),
    );
    pickupRow.addEventListener('click', () => App.navigate('search', { query: { focus: 'pickup' } }));
    destRow.addEventListener('click', () => App.navigate('search', { query: { focus: 'dropoff' } }));
    routebox.append(pickupRow, destRow);
    launcher.appendChild(routebox);

    const foot = el('div', { class: 'cl-launcher-foot' });
    const bookBtn = el('button', { class: 'btn btn--primary btn--lg' }, el('i', { 'data-lucide': 'car-front' }), 'Book a ride');
    bookBtn.addEventListener('click', () => App.navigate('search', { query: { focus: 'dropoff' } }));
    const locateBtn = el('button', { class: 'btn btn--ghost btn--sm', type: 'button' },
      el('i', { 'data-lucide': 'locate-fixed' }), 'Locate me');
    locateBtn.addEventListener('click', () => locateMe(root));
    foot.append(bookBtn, locateBtn);
    launcher.appendChild(foot);
    wrap.appendChild(launcher);

    /* map preview */
    const mapBox = el('div', { class: 'map-box cl-map-home' });
    const mapTag = el('span', { class: 'map-tag' }, el('i', { 'data-lucide': 'radar' }), 'Live map');
    const mapFab = el('div', { class: 'cl-map-float' });
    const recenterFab = el('button', { class: 'map-fab', type: 'button', 'aria-label': 'Recenter map on pickup' },
      el('i', { 'data-lucide': 'crosshair' }));
    recenterFab.addEventListener('click', () => {
      const pos = state.located || SAMPLE_LOC;
      if (state.map) { state.map.setView(pos, 15); state.map.setMarker('pickup', pos, 'pickup', { label: 'Pickup' }); }
    });
    mapFab.appendChild(recenterFab);
    mapBox.append(mapTag, mapFab);
    wrap.appendChild(mapBox);

    /* saved places */
    const savedHead = el('div', { class: 'row-between' },
      el('h3', { class: 'cl-section-title' }, 'Saved places'),
      el('a', { class: 'cl-section-more', href: '#/profile?tab=places' }, 'Manage'),
    );
    const chipRow = el('div', { class: 'cl-hscroll', role: 'list' });
    saved.forEach((sp) => {
      const chipBtn = el('button', { class: 'cl-place-chip', type: 'button', role: 'listitem' },
        el('i', { 'data-lucide': sp.icon || 'star' }),
        el('span', { class: 'clamp-1' }, `${sp.label} · ${sp.name}`),
      );
      chipBtn.addEventListener('click', () => {
        pushRecent(userId, sp);
        App.navigate('rides', { query: { from: encodePoint({ ...SAMPLE_LOC, placeId: null }), to: sp.placeId || encodePoint(sp) } });
      });
      chipRow.appendChild(chipBtn);
    });
    const savedWrap = el('div', { class: 'col', style: 'gap:10px' }, savedHead, chipRow);
    wrap.appendChild(savedWrap);

    /* recent destinations */
    const recents = Prefs.get(userId, 'recentPlaces', []);
    const recentCard = el('section', { class: 'card' });
    recentCard.appendChild(el('div', { class: 'card-head' },
      el('h3', {}, 'Recent destinations'),
      recents.length ? el('span', { class: 't-xs' }, 'Tap to book again') : null,
    ));
    if (recents.length) {
      const list = el('div', { class: 'list cl-recent-list' });
      recents.forEach((r) => {
        const item = el('button', { class: 'list-item', type: 'button' },
          el('span', { class: 'li-icon' }, el('i', { 'data-lucide': 'history' })),
          el('span', { class: 'li-body' },
            el('span', { class: 'li-title clamp-1' }, r.name),
            el('span', { class: 'li-sub' }, r.address),
          ),
          el('i', { 'data-lucide': 'chevron-right', style: 'width:16px;height:16px;color:var(--c-ink-4);flex-shrink:0' }),
        );
        item.addEventListener('click', () => {
          App.navigate('rides', { query: { from: encodePoint({ ...SAMPLE_LOC, placeId: null }), to: r.placeId || encodePoint(r) } });
        });
        list.appendChild(item);
      });
      recentCard.appendChild(list);
    } else {
      recentCard.appendChild(el('div', { class: 'empty', style: 'padding:22px' },
        el('div', { class: 'empty-icon' }, el('i', { 'data-lucide': 'history' })),
        el('h4', {}, 'No recent destinations'),
        el('p', {}, 'Places you book to will appear here for one-tap rebooking.'),
      ));
    }
    wrap.appendChild(recentCard);

    /* quick actions — secondary flows only (booking + wallet live in the nav) */
    wrap.appendChild(el('h3', { class: 'cl-section-title' }, 'Quick actions'));
    const quickDefs = [
      { icon: 'calendar-clock', label: 'Schedule a ride', run: () => openScheduleModal(userId, saved) },
      { icon: 'history', label: 'Ride history', run: () => App.navigate('activity') },
      { icon: 'map-pin', label: 'Saved places', run: () => App.navigate('profile', { query: { tab: 'places' } }) },
      { icon: 'life-buoy', label: 'Help & support', run: () => App.navigate('profile', { query: { tab: 'support' } }) },
    ];
    const grid = el('div', { class: 'cl-quick-grid' });
    quickDefs.forEach((q) => {
      const btn = el('button', { class: 'cl-quick', type: 'button' }, el('i', { 'data-lucide': q.icon }), el('span', {}, q.label));
      btn.addEventListener('click', q.run);
      grid.appendChild(btn);
    });
    wrap.appendChild(grid);

    /* promos — expressive campaign cards: art right, offer copy left,
       code chip + copy action pinned bottom. One shared component. */
    const promoHead = el('h3', { class: 'cl-section-title' }, 'Promos for you');
    const promoRow = promoRail(PROMOS, {
      onCopy: async (p, card) => {
        const ok = await copyText(p.code);
        if (ok) Toast.success('Code copied', `${p.code} is ready to paste at checkout.`);
        else Toast.info('Code: ' + p.code, 'Copy it manually and enter it before confirming your ride.');
      },
    });
    promoRow.classList.add('cl-promo-row-rail');
    wrap.appendChild(el('div', { class: 'col', style: 'gap:10px' }, promoHead, promoRow));

    /* info strip */
    const info = el('div', { class: 'cl-info-strip' });
    info.appendChild(el('div', { class: 'cl-avail-strip' },
      el('span', { class: 'pulse-dot', 'aria-hidden': 'true' }),
      el('span', {}, 'Moto and car rides available in your area'),
    ));
    info.appendChild(el('div', { class: 'info-banner info-banner--neutral' },
      el('i', { 'data-lucide': 'shield-check' }),
      el('span', {}, el('strong', {}, 'Safety first. '), 'Check the plate number and driver photo before boarding, and share your trip with someone you trust.'),
    ));
    wrap.appendChild(info);

    root.appendChild(wrap);
    Icons.refresh(root);

    /* map (created after layout so Leaflet measures a real size) —
       centers on the user's real location (GPS) and falls back to the sample */
    setTimeout(async () => {
      if (!mapBox.isConnected) return;
      const geo = await browserLocation({ timeout: 6000 });
      const pos = geo
        ? { lat: geo.lat, lng: geo.lng }
        : { ...SAMPLE_LOC };
      if (geo && !state.located) {
        const place = await reverseGeocode(geo.lat, geo.lng);
        state.located = { name: place.name, address: place.address, lat: geo.lat, lng: geo.lng };
        const pv = qs('[data-role="pickup-value"]', root);
        if (pv && pv.classList.contains('placeholder') !== true) { /* leave pickup text as-is */ }
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
  navigator.geolocation.getCurrentPosition(
    async (p) => {
      const place = await reverseGeocode(p.coords.latitude, p.coords.longitude);
      const pos = { name: place.name || 'Current location (GPS)', address: place.address, lat: p.coords.latitude, lng: p.coords.longitude };
      apply(pos, pos.name);
      Toast.success('Location found', `Map centered on ${place.city || place.address || 'your position'}.`);
    },
    () => {
      apply({ ...SAMPLE_LOC }, `${SAMPLE_LOC.name} (sample)`);
      Toast.info('Location unavailable', 'Using your sample location.');
    },
    { timeout: 6000, maximumAge: 60000, enableHighAccuracy: false },
  );
}
