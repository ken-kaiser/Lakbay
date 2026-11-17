/* ==========================================================================
   Lakbay — Passenger booking flow
   Views: search (location picker) -> rides (vehicle selection) -> confirm.
   A per-tab sessionStorage "draft" carries the in-progress booking between
   the three steps so refreshes and back-navigation behave predictably.
   ========================================================================== */
import { App } from '../app.js';
import { Bookings, Notifs, Prefs, PaymentRepo, SavedPlacesRepo } from '../storage.js';
import { Sim } from '../shared/sim.js';
import {
  PLACES, RIDE_CATEGORIES, PAYMENT_METHODS, getPlace, searchPlaces, nearbyPlaces,
  haversineKm, generateRoute, routeLengthKm, estimateDurationMin, estimateFare,
  applyPromo, getPromo,
} from '../data.js';
import { el, clear, qs } from '../shared/dom.js';
import { Icons } from '../shared/icons.js';
import { Toast } from '../shared/toast.js';
import { Modal } from '../shared/modal.js';
import { createMap } from '../shared/map.js';
import { locateUser, searchPlacesOnline, getLastLocation } from '../shared/geo.js';
import { peso } from '../shared/format.js';
import { rollText } from '../shared/motion.js';
import { formatDistanceKm } from '../data.js';
import { SAMPLE_LOC, currentLoc } from './home.js';
import { payMark } from '../shared/ui-lite.js';

const DRAFT_KEY = 'lakbay:draft';

/* ---------- draft helpers ---------- */
function loadDraft() {
  try { return JSON.parse(sessionStorage.getItem(DRAFT_KEY) || '{}') || {}; }
  catch (e) { return {}; }
}
function saveDraft(patch) {
  const next = { ...loadDraft(), ...patch };
  sessionStorage.setItem(DRAFT_KEY, JSON.stringify(next));
  return next;
}
function clearDraft() { sessionStorage.removeItem(DRAFT_KEY); }

/* Encode/decode a place-like point for URL query params (matches home.js) */
function encodePoint(p) {
  if (p && p.placeId && getPlace(p.placeId)) return p.placeId;
  return encodeURIComponent(JSON.stringify({ name: p.name, address: p.address, lat: p.lat, lng: p.lng }));
}
function decodePoint(v) {
  if (!v) return null;
  const direct = getPlace(v);
  if (direct) return { placeId: direct.id, name: direct.name, address: direct.address, lat: direct.lat, lng: direct.lng };
  try {
    const o = JSON.parse(decodeURIComponent(v));
    if (o && typeof o.lat === 'number' && typeof o.lng === 'number') return o;
  } catch (e) { /* not JSON */ }
  return null;
}

function pushRecent(userId, place) {
  const list = Prefs.get(userId, 'recentPlaces', []).filter(
    (r) => !(r.name === place.name && r.address === place.address)
  );
  list.unshift({ ...place, at: Date.now() });
  Prefs.set(userId, 'recentPlaces', list.slice(0, 6));
}

function placeIcon(place) {
  const map = { mall: 'shopping-bag', airport: 'plane', school: 'graduation-cap', hospital: 'cross', park: 'trees', office: 'briefcase', landmark: 'landmark', church: 'church', food: 'utensils', market: 'store', shop: 'wrench' };
  return map[(place && place.category)] || 'map-pin';
}

/* ---------- autocomplete list builder ---------- */
/* Suggestions are ranked around `origin` (the user's real location).
   Search uses the online OpenStreetMap index (any PH city), falling back to
   the built-in Metro Cebu list only when it's offline. Built-in places are
   only offered as "nearby" when they're actually within 25 km. */
let suggestToken = 0;
async function buildSuggestionList({ userId, query, container, onPick, origin }) {
  const token = ++suggestToken;
  const q = (query || '').trim();
  const here = origin || currentLoc();
  const saved = SavedPlacesRepo.list(userId) || [];
  const recents = Prefs.get(userId, 'recentPlaces', []);
  const near = nearbyPlaces(here, 5, 25);

  let results = [];
  if (q) {
    // Built-in list only if those places are close to the user
    const local = searchPlaces(q, 8).filter((p) => haversineKm(here, p) <= 25);
    if (q.length >= 2) {
      clear(container);
      container.appendChild(el('div', { class: 'cl-ac-head' }, el('i', { 'data-lucide': 'loader' }), 'Searching places near you\u2026'));
      Icons.refresh(container);
    }
    const online = await searchPlacesOnline(q, here, 8);
    if (token !== suggestToken) return; // a newer keystroke superseded this one
    // Don't swap the rows out from under a finger that is mid-tap: late results
    // used to replace the row being pressed, so the tap selected nothing.
    if (container.dataset.pressing === '1') return;
    results = online.length ? [...local, ...online].slice(0, 8) : searchPlaces(q, 8).filter((p) => haversineKm(here, p) <= 25 || !getLastLocation());
  }
  clear(container);

  const groups = [];

  if (results.length) {
    groups.push({ head: 'Search results', icon: 'search', items: results.map((p, i) => ({ key: 'pl:' + (p.id || i), title: p.name, sub: p.address, icon: placeIcon(p), place: p })) });
  }
  if (!q && saved.length) {
    groups.push({ head: 'Saved places', icon: 'star', items: saved.map((s) => ({ key: 'sp:' + s.id, title: `${s.label} · ${s.name}`, sub: s.address, icon: s.icon || 'star', place: s })) });
  }
  if (!q && recents.length) {
    groups.push({ head: 'Recent', icon: 'history', items: recents.slice(0, 4).map((r) => ({ key: 'rc:' + r.name, title: r.name, sub: r.address, icon: 'history', place: r })) });
  }
  if (!q) {
    if (near.length) groups.push({ head: 'Nearby', icon: 'map-pin', items: near.map((p) => ({ key: 'nb:' + p.id, title: p.name, sub: p.address, icon: placeIcon(p), place: p })) });
  }

  if (!groups.length) {
    container.appendChild(el('div', { class: 'empty', style: 'padding:24px 16px' },
      el('img', { class: 'empty-img', src: 'assets/illustrations/empty-search.png', alt: '',
        onerror: (e) => e.target.remove() }),
      el('h3', {}, q ? 'No matching places' : 'Where to?'),
      el('p', {}, q
        ? 'Try a mall, terminal, street, or barangay name — or use "Choose on map".'
        : 'Type a mall, street, or barangay to search places near you.'),
    ));
    Icons.refresh(container);
    return;
  }

  groups.forEach((g) => {
    container.appendChild(el('div', { class: 'cl-ac-head' }, el('i', { 'data-lucide': g.icon }), g.head));
    g.items.forEach((item) => {
      const dist = haversineKm(here, item.place);
      const row = el('button', { class: 'cl-ac-item', type: 'button' },
        el('span', { class: 'li-icon' }, el('i', { 'data-lucide': item.icon })),
        el('span', { class: 'li-body' },
          el('span', { class: 'li-title' }, item.title),
          el('span', { class: 'li-sub' }, item.sub),
        ),
        el('span', { class: 'cl-ac-dist' }, el('i', { 'data-lucide': 'navigation' }), formatDistanceKm(dist)),
      );
      row.addEventListener('click', () => onPick(item.place));
      container.appendChild(row);
    });
  });
  Icons.refresh(container);
}

/* ---------- choose-on-map modal ---------- */
function openMapPicker({ onPick, center }) {
  const c = center || currentLoc();
  const mapBox = el('div', { class: 'cl-map-pick' });
  const body = el('div', {},
    mapBox,
    el('p', { class: 'cl-map-pick-hint' }, el('i', { 'data-lucide': 'info' }),
      'Tap anywhere on the map to drop a pin.'),
  );
  let mapApi = null;
  const modal = Modal.open({
    title: 'Choose on map', body, wide: true,
    actions: [
      { label: 'Cancel', variant: 'outline', onClick: (api) => api.close(null) },
      {
        label: 'Use this spot', variant: 'primary', icon: 'check', onClick: (api) => {
          if (!mapApi || !mapApi._picked) { Toast.warn('No pin yet', 'Tap the map first to drop a pin.'); return; }
          onPick(mapApi._picked);
          api.close(true);
        },
      },
    ],
    onClose: () => { if (mapApi) mapApi.destroy(); },
  });
  setTimeout(() => {
    mapApi = createMap(mapBox, { center: [c.lat, c.lng], zoom: 15 });
    if (!mapApi) return;
    mapApi.map.on('click', (e) => {
      const pos = { name: 'Dropped pin', address: 'Custom map location', lat: e.latlng.lat, lng: e.latlng.lng };
      mapApi._picked = pos;
      mapApi.setMarker('pick', pos, 'drop', { label: 'Pickup here' });
    });
  }, 80);
  return modal;
}

/* ==========================================================
   View: search (location picker)
   ========================================================== */
const searchView = {
  id: 'search',
  render(root, { query }) {
    const userId = App.user.id;
    const draft = loadDraft();
    const draftPickup = draft.pickup || { ...currentLoc(), placeId: null };
    const draftDrop = draft.dropoff || null;
    App.setHeader('Plan your ride', 'Set your pickup and destination');

    const wrap = el('div', { class: 'cl-search-wrap' });
    const fieldsCard = el('div', { class: 'card cl-fields-card' });

    function makeField({ id, label, placeholder, value }) {
      const input = el('input', {
        class: 'input', id, name: id, type: 'text', placeholder,
        autocomplete: 'off', value: value ? value.name : '', 'aria-label': label,
      });
      const wrapInput = el('div', { class: 'input-wrap' }, input,
        el('button', { class: 'cl-input-clear', type: 'button', 'aria-label': 'Clear ' + label, tabindex: '-1' },
          el('i', { 'data-lucide': 'circle-x' })));
      const block = el('div', { class: 'cl-field-block' }, el('label', { for: id }, label), wrapInput);
      return { block, input, clearBtn: wrapInput.querySelector('.cl-input-clear') };
    }

    const pickF = makeField({ id: 'pickup', label: 'Pickup location', placeholder: 'Enter pickup location', value: draftPickup });
    const dropF = makeField({ id: 'dropoff', label: 'Where are you going?', placeholder: 'Search destination or enter an address', value: draftDrop });
    pickF.clearBtn.hidden = !draftPickup;
    dropF.clearBtn.hidden = !draftDrop;

    const swapRow = el('div', { class: 'cl-swap-row' },
      el('button', { class: 'cl-swap-btn', type: 'button', 'aria-label': 'Swap pickup and destination' },
        el('i', { 'data-lucide': 'arrow-up-down' })));
    const pickAc = el('div', { class: 'cl-ac-panel', style: 'display:none' });
    const dropAc = el('div', { class: 'cl-ac-panel', style: 'display:none' });

    fieldsCard.append(pickF.block, swapRow, dropF.block);
    const actionsRow = el('div', { class: 'row', style: 'gap:8px;flex-wrap:wrap' });
    const gpsBtn = el('button', { class: 'btn btn--outline btn--sm', type: 'button' }, el('i', { 'data-lucide': 'locate-fixed' }), 'Use my location');
    const mapBtn = el('button', { class: 'btn btn--outline btn--sm', type: 'button' }, el('i', { 'data-lucide': 'map' }), 'Choose on map');
    actionsRow.append(gpsBtn, mapBtn);
    fieldsCard.appendChild(actionsRow);
    wrap.append(fieldsCard, pickAc, dropAc);

    /* state */
    let pickup = draftPickup;
    let dropoff = draftDrop;

    function paintPickupValue() {
      pickF.input.value = pickup ? pickup.name : '';
      pickF.clearBtn.hidden = !pickup;
    }
    function paintDropValue() {
      dropF.input.value = dropoff ? dropoff.name : '';
      dropF.clearBtn.hidden = !dropoff;
    }

    const findBtn = el('button', { class: 'btn btn--primary btn--lg btn--block' }, el('i', { 'data-lucide': 'search' }), 'Find rides');
    function refreshFindBtn() {
      findBtn.disabled = !(pickup && dropoff);
      findBtn.title = (pickup && dropoff) ? '' : 'Set both pickup and destination first';
    }
    refreshFindBtn();

    findBtn.addEventListener('click', () => {
      if (!pickup || !dropoff) return;
      saveDraft({ pickup, dropoff });
      App.navigate('rides', { query: { from: encodePoint(pickup), to: encodePoint(dropoff) } });
    });

    /* autocomplete behaviour */
    function wireAutocomplete(f, getCurrent, setPoint, panel, { isPickup }) {
      let hideTimer = null;
      const showPanel = () => {
        clearTimeout(hideTimer);
        // When the field still shows the assigned point (user hasn't edited),
        // browse saved / recent / nearby instead of "searching" that text.
        const current = getCurrent();
        const raw = f.input.value.trim();
        const browseQuery = (current && raw === current.name) ? '' : raw;
        [pickAc, dropAc].forEach((p2) => { if (p2 !== panel) p2.style.display = 'none'; });
        buildSuggestionList({
          userId, query: browseQuery, container: panel,
          // rank destinations around the chosen pickup; pickups around the user
          origin: isPickup ? currentLoc() : (pickup || currentLoc()),
          onPick: (place) => {
            const pt = { placeId: place.placeId || place.id || null, name: place.name, address: place.address, lat: place.lat, lng: place.lng };
            setPoint(pt);
            if (!isPickup) pushRecent(userId, pt);
            panel.style.display = 'none';
            f.block.classList.remove('focused');
            refreshFindBtn();
            f.input.blur(); // close the phone keyboard so "Find rides" is in view
          },
        });
        panel.style.display = 'flex';
        f.block.classList.add('focused');
      };
      f.input.addEventListener('focus', showPanel);
      let typeTimer = null;
      f.input.addEventListener('input', () => { clearTimeout(typeTimer); typeTimer = setTimeout(showPanel, 250); });
      f.input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); const first = panel.querySelector('.cl-ac-item'); if (first) first.click(); } });
      // Picking a suggestion must not take focus away from the field. A tap or
      // press used to blur it first, which hid the list 180ms later, and on
      // phones also closed the keyboard and shifted the page, so taps landed
      // on nothing. preventDefault on mousedown keeps focus (and the list) in
      // place; it doesn't block scrolling or the click itself.
      panel.addEventListener('mousedown', (e) => e.preventDefault());
      panel.addEventListener('pointerdown', () => { panel.dataset.pressing = '1'; });
      const released = () => setTimeout(() => { delete panel.dataset.pressing; }, 0);
      panel.addEventListener('pointerup', released);
      panel.addEventListener('pointercancel', released);
      const hideSoon = () => { hideTimer = setTimeout(() => { panel.style.display = 'none'; f.block.classList.remove('focused'); }, 180); };
      // Hide only when focus leaves both the field and its list, so keyboard
      // users can Tab from the field into the suggestions.
      const leaving = (e) => { const to = e.relatedTarget; if (!(to && (f.block.contains(to) || panel.contains(to)))) hideSoon(); };
      f.block.addEventListener('focusout', leaving);
      panel.addEventListener('focusout', leaving);
      panel.addEventListener('focusin', () => clearTimeout(hideTimer));
      f.clearBtn.addEventListener('click', () => {
        f.input.value = ''; setPoint(null); panel.style.display = 'none'; refreshFindBtn(); f.input.focus();
      });
    }

    wireAutocomplete(pickF, () => pickup, (pt) => { pickup = pt; saveDraft({ pickup: pt }); paintPickupValue(); }, pickAc, { isPickup: true });
    wireAutocomplete(dropF, () => dropoff, (pt) => { dropoff = pt; saveDraft({ dropoff: pt }); paintDropValue(); }, dropAc, { isPickup: false });

    swapRow.querySelector('.cl-swap-btn').addEventListener('click', () => {
      const p = pickup, d = dropoff;
      pickup = d || p; dropoff = p || d;
      saveDraft({ pickup, dropoff });
      paintPickupValue(); paintDropValue(); refreshFindBtn();
      Toast.info('Swapped', 'Pickup and destination switched.');
    });

    gpsBtn.addEventListener('click', () => {
      if (!navigator.geolocation) { Toast.info('Location unavailable', 'Your browser does not expose GPS. Pick a place instead.'); return; }
      gpsBtn.disabled = true;
      locateUser({ timeout: 7000, maximumAge: 60000 }).then((loc) => {
        gpsBtn.disabled = false;
        if (loc) {
          pickup = { name: loc.name, address: loc.address, lat: loc.lat, lng: loc.lng };
          saveDraft({ pickup }); paintPickupValue(); refreshFindBtn();
          Toast.success('Location found', `Pickup set to ${loc.city || loc.address || 'your GPS position'}.`);
        } else {
          pickup = { ...SAMPLE_LOC, placeId: null }; saveDraft({ pickup }); paintPickupValue(); refreshFindBtn();
          Toast.info('Using sample location', 'Location permission was denied, so we set the sample point.');
        }
      });
    });

    mapBtn.addEventListener('click', () => {
      openMapPicker({ center: pickup || currentLoc(), onPick: (pt) => { dropoff = pt; saveDraft({ dropoff: pt }); paintDropValue(); refreshFindBtn(); } });
    });

    wrap.appendChild(findBtn);

    root.appendChild(wrap);
    Icons.refresh(root);
    if (query && query.focus === 'dropoff') setTimeout(() => dropF.input.focus(), 80);
    else setTimeout(() => pickF.input.focus(), 80);
  },
};

/* Studio photography per ride class — the same art direction as the
   landing page, so the vehicle you pick looks like the one you saw. */
export const RIDE_THUMB = {
  moto: { src: 'assets/promos/campaign-scooter.webp', pos: '62% 55%' },
  car: { src: 'assets/promos/campaign-sedan.webp', pos: '58% 62%' },
  premium: { src: 'assets/illustrations/hero.png', pos: '62% 58%' },
  xl: { src: 'assets/promos/campaign-van.webp', pos: '56% 62%' },
};
export function rideThumb(cat, cls = 'ro-img') {
  const art = RIDE_THUMB[cat.id] || { src: cat.img, pos: '50% 50%' };
  return el('span', { class: cls },
    el('img', { src: art.src, alt: '', loading: 'lazy', decoding: 'async', style: `object-position:${art.pos}`, onerror: (e) => { e.target.src = cat.img; } }));
}

/* Trip summary used at the top of the ride and confirm panels */
function tripSummary(from, to, km, mins, onEdit) {
  const box = el('div', { class: 'cl-trip-sum' },
    el('div', { class: 'cl-trip-stops' },
      el('div', { class: 'cl-ts-row' }, el('span', { class: 'cl-rr-dot' }), el('span', { class: 'clamp-1' }, from.name)),
      el('div', { class: 'cl-ts-row' }, el('span', { class: 'cl-rr-dot cl-rr-dot--end' }), el('span', { class: 'clamp-1' }, to.name))),
    el('div', { class: 'cl-trip-meta t-num' }, `${km} km · about ${mins} min`));
  if (onEdit) {
    const edit = el('button', { class: 'cl-link-btn', type: 'button' }, 'Change');
    edit.addEventListener('click', onEdit);
    box.appendChild(edit);
  }
  return box;
}

/* ==========================================================
   View: rides (vehicle selection + booking details)
   ========================================================== */
const ridesView = {
  id: 'rides',
  _map: null,
  render(root, { query }) {
    const userId = App.user.id;
    const from = decodePoint(query.from) || loadDraft().pickup;
    const to = decodePoint(query.to) || loadDraft().dropoff;
    if (!from || !to) { App.navigate('search', {}, { replace: true }); return; }
    saveDraft({ pickup: from, dropoff: to });
    App.setHeader('Choose a ride', `${from.name} → ${to.name}`);

    const route = generateRoute(from, to);
    const km = Math.round(routeLengthKm(route) * 10) / 10;
    const mins = estimateDurationMin(km);
    const draft = loadDraft();
    let selectedCat = draft.category && RIDE_CATEGORIES.find((c) => c.id === draft.category) ? draft.category : 'car';
    let promo = draft.promoCode ? getPromo(draft.promoCode) : null;
    let paymentMethod = draft.paymentMethod || PaymentRepo.defaultMethod(userId);
    let instructions = draft.instructions || '';

    /* map left (desktop) / top (phone), one flat panel beside it */
    const layout = el('div', { class: 'cl-book' });
    const mapBox = el('div', { class: 'map-box cl-book-map' });
    const panel = el('div', { class: 'cl-book-panel' });
    layout.append(mapBox, panel);

    panel.appendChild(tripSummary(from, to, km, mins, () => App.navigate('search')));

    /* category list */
    const rideSec = el('section', { class: 'cl-book-sec', 'aria-labelledby': 'cl-rides-h' },
      el('h2', { class: 'cl-book-h', id: 'cl-rides-h' }, 'Choose a ride'));
    const rideList = el('div', { class: 'cl-ride-list', role: 'radiogroup', 'aria-labelledby': 'cl-rides-h' });
    rideSec.appendChild(rideList);
    panel.appendChild(rideSec);

    /* details (rebuilt on category change) */
    const detailsBox = el('div', { class: 'cl-book-details' });
    panel.appendChild(detailsBox);

    /* sticky foot */
    const foot = el('div', { class: 'cl-sticky-foot' });
    const totalValue = el('span', { class: 'cl-total-value t-num' }, '—');
    const footTotal = el('div', { class: 'cl-total' }, el('span', { class: 'cl-total-label' }, 'Estimated total'), totalValue);
    const nextBtn = el('button', { class: 'btn btn--primary btn--lg' }, 'Review booking', el('i', { 'data-lucide': 'arrow-right' }));
    foot.append(footTotal, nextBtn);
    panel.appendChild(foot);

    root.appendChild(layout);

    /* ---- rendering helpers ---- */
    const view = this;
    function paintMap() {
      setTimeout(() => {
        if (!mapBox.isConnected) return;
        if (view._map) { view._map.destroy(); view._map = null; }
        view._map = createMap(mapBox, { center: [from.lat, from.lng], zoom: 13 });
        if (!view._map) return;
        view._map.setMarker('pickup', from, 'pickup', { label: 'Pickup' });
        view._map.setMarker('drop', to, 'drop', { label: 'Drop-off' });
        view._map.drawRoute(route);
        view._map.fitRoute(route, { pad: [40, 40], maxZoom: 15 });
      }, 60);
    }

    function currentFare() {
      return applyPromo(estimateFare(selectedCat, km, mins), promo);
    }

    function paintCategories() {
      clear(rideList);
      RIDE_CATEGORIES.forEach((cat) => {
        const fare = estimateFare(cat.id, km, mins);
        const on = cat.id === selectedCat;
        const row = el('button', {
          class: `ride-opt${on ? ' selected' : ''}`, type: 'button',
          role: 'radio', 'aria-checked': String(on),
        },
          rideThumb(cat),
          el('span', { class: 'ro-body' },
            el('span', { class: 'ro-name' }, cat.name.replace('Lakbay ', '')),
            el('span', { class: 'ro-meta t-num' }, `${cat.capacity} seat${cat.capacity > 1 ? 's' : ''} · ${cat.etaMin[0]}–${cat.etaMin[1]} min away`),
            on ? el('span', { class: 'ro-desc' }, `${cat.desc} ${cat.luggage}.`) : null),
          el('span', { class: 'ro-price t-num' }, peso(fare.total, { whole: true })),
        );
        row.addEventListener('click', () => {
          if (selectedCat === cat.id) return;
          selectedCat = cat.id; saveDraft({ category: cat.id });
          paintCategories(); paintDetails(); paintFoot();
          const sel = rideList.querySelector('.selected');
          if (sel) sel.focus({ preventScroll: true });
        });
        rideList.appendChild(row);
      });
      Icons.refresh(rideList);
    }

    function paintDetails() {
      clear(detailsBox);
      const cat = RIDE_CATEGORIES.find((c) => c.id === selectedCat);

      /* payment method */
      const paySec = el('section', { class: 'cl-book-sec', 'aria-labelledby': 'cl-pay-h' },
        el('h3', { class: 'cl-book-h', id: 'cl-pay-h' }, 'Pay with'));
      const payList = el('div', { class: 'cl-pay-list', role: 'radiogroup', 'aria-labelledby': 'cl-pay-h' });
      const defaults = PaymentRepo.list(userId);
      PAYMENT_METHODS.forEach((m) => {
        const isDefault = defaults.some((d) => d.id === m.id && d.default);
        const opt = el('button', {
          class: `pay-opt${paymentMethod === m.id ? ' selected' : ''}`, type: 'button', role: 'radio',
          'aria-checked': String(paymentMethod === m.id),
        },
          payMark(m),
          el('span', { class: 'po-body' },
            el('span', { class: 'po-name' }, m.name, isDefault ? el('span', { class: 'cl-default-badge' }, 'Default') : null),
            el('span', { class: 'po-sub' }, m.sub)),
          el('span', { class: 'po-check' }, el('i', { 'data-lucide': 'check' })),
        );
        opt.addEventListener('click', () => { paymentMethod = m.id; saveDraft({ paymentMethod: m.id }); paintDetails(); });
        payList.appendChild(opt);
      });
      paySec.appendChild(payList);
      detailsBox.appendChild(paySec);

      /* promo */
      const promoSec = el('section', { class: 'cl-book-sec', 'aria-labelledby': 'cl-promo-h2' },
        el('h3', { class: 'cl-book-h', id: 'cl-promo-h2' }, 'Promo code'));
      if (promo) {
        const applied = el('div', { class: 'cl-promo-applied' },
          el('span', {}, el('i', { 'data-lucide': 'badge-check' }), `${promo.code} applied — you save ${peso(currentFare().discount, { whole: true })}`),
          el('button', { class: 'icon-btn', 'aria-label': 'Remove promo code' }, el('i', { 'data-lucide': 'x' })));
        applied.querySelector('button').addEventListener('click', () => {
          promo = null; saveDraft({ promoCode: null }); paintDetails(); paintFoot();
        });
        promoSec.appendChild(applied);
      } else {
        const row = el('div', { class: 'cl-promo-row' });
        const input = el('input', { class: 'input', type: 'text', placeholder: 'e.g. LAKBAY50', 'aria-labelledby': 'cl-promo-h2', maxlength: '16', autocapitalize: 'characters' });
        row.appendChild(el('div', { class: 'input-wrap' }, input));
        const applyBtn = el('button', { class: 'btn btn--outline' }, 'Apply');
        row.appendChild(applyBtn);
        const err = el('div', { class: 'cl-inline-error', style: 'display:none', role: 'alert' }, el('i', { 'data-lucide': 'circle-alert' }), el('span', {}));
        promoSec.append(row, err);
        const showErr = (msg) => { err.style.display = 'flex'; err.querySelector('span').textContent = msg; input.classList.add('input--error'); };
        input.addEventListener('input', () => { err.style.display = 'none'; input.classList.remove('input--error'); });
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); applyBtn.click(); } });
        applyBtn.addEventListener('click', () => {
          const code = input.value.trim();
          if (!code) { showErr('Enter a promo code first.'); return; }
          const p = getPromo(code);
          const fare = estimateFare(selectedCat, km, mins);
          if (!p) { showErr(`“${code}” is not a valid code. Try LAKBAY50.`); return; }
          if (fare.subtotal < p.minFare) { showErr(`${p.code} needs a minimum fare of ${peso(p.minFare, { whole: true })}.`); return; }
          if (p.category && p.category !== selectedCat) { showErr(`${p.code} only applies to ${p.category === 'moto' ? 'Lakbay Moto' : 'this'} rides.`); return; }
          promo = p; saveDraft({ promoCode: p.code });
          Toast.success('Promo applied', `${p.code} — ${p.label}`);
          paintDetails(); paintFoot();
        });
      }
      detailsBox.appendChild(promoSec);

      /* instructions */
      const insSec = el('section', { class: 'cl-book-sec' },
        el('label', { class: 'cl-book-h', for: 'cl-ins' }, 'Note for your rider'));
      const ta = el('textarea', { class: 'textarea', id: 'cl-ins', rows: '2', maxlength: '140', placeholder: 'e.g. Gate 2, beside the coffee shop' });
      ta.value = instructions;
      ta.addEventListener('input', () => { instructions = ta.value.slice(0, 140); saveDraft({ instructions }); });
      insSec.append(ta, el('p', { class: 'input-hint' }, 'Optional. Keep it short and clear.'));
      detailsBox.appendChild(insSec);

      /* fare breakdown */
      const f = currentFare();
      const lines = el('div', { class: 'fare-lines' });
      [
        { label: `Base fare · ${cat.name.replace('Lakbay ', '')}`, value: peso(f.base) },
        { label: `Distance · ${f.km} km`, value: peso(f.distance) },
        { label: `Time · ${f.mins} min`, value: peso(f.duration) },
        { label: 'Platform fee', value: peso(f.platformFee) },
      ].forEach((r) => lines.appendChild(el('div', { class: 'fare-line' },
        el('span', { class: 'fl-label' }, r.label), el('span', { class: 'fl-val t-num' }, r.value))));
      if (f.discount > 0) {
        lines.appendChild(el('div', { class: 'fare-line fare-line--discount' },
          el('span', { class: 'fl-label' }, `Promo ${f.promoCode}`), el('span', { class: 'fl-val t-num' }, '−' + peso(f.discount))));
      }
      lines.appendChild(el('div', { class: 'fare-line fare-line--total' },
        el('span', { class: 'fl-label' }, 'Total'), el('span', { class: 'fl-val t-num' }, peso(f.total))));
      detailsBox.appendChild(el('section', { class: 'cl-book-sec', 'aria-labelledby': 'cl-fare-h' },
        el('h3', { class: 'cl-book-h', id: 'cl-fare-h' }, 'Fare breakdown'),
        lines,
        el('p', { class: 'input-hint' }, 'The final fare may adjust slightly with the actual route and time.')));

      Icons.refresh(detailsBox);
    }

    function paintFoot() {
      rollText(totalValue, peso(currentFare().total, { whole: true })); // digits spin to the new total
    }

    nextBtn.addEventListener('click', () => {
      saveDraft({ category: selectedCat, promoCode: promo ? promo.code : null, paymentMethod, instructions });
      App.navigate('confirm');
    });

    paintCategories();
    paintDetails();
    paintFoot();
    paintMap();
    Icons.refresh(root);
  },
  unmount() { if (this._map) { this._map.destroy(); this._map = null; } },
};

/* ==========================================================
   View: confirm (final review + submit)
   ========================================================== */
const confirmView = {
  id: 'confirm',
  render(root) {
    const userId = App.user.id;
    const draft = loadDraft();
    const { pickup, dropoff } = draft;
    if (!pickup || !dropoff) { App.navigate('search', {}, { replace: true }); return; }
    const cat = RIDE_CATEGORIES.find((c) => c.id === (draft.category || 'car'));
    const promo = draft.promoCode ? getPromo(draft.promoCode) : null;
    const route = generateRoute(pickup, dropoff);
    const km = Math.round(routeLengthKm(route) * 10) / 10;
    const mins = estimateDurationMin(km);
    const fare = applyPromo(estimateFare(cat.id, km, mins), promo);
    const method = PAYMENT_METHODS.find((m) => m.id === (draft.paymentMethod || 'cash')) || PAYMENT_METHODS[0];

    App.setHeader('Review your booking', 'Confirm the details below');

    const wrap = el('div', { class: 'cl-confirm' });
    const card = el('div', { class: 'cl-confirm-card' });

    /* the ride, photo-led */
    card.appendChild(el('div', { class: 'cl-confirm-hero' },
      rideThumb(cat, 'cl-confirm-img'),
      el('div', { class: 'cl-confirm-hero-txt' },
        el('span', { class: 'cl-book-h' }, 'Your ride'),
        el('strong', {}, cat.name),
        el('span', { class: 't-small' }, `${cat.capacity} seat${cat.capacity > 1 ? 's' : ''} · ${cat.luggage} · rider ${cat.etaMin[0]}–${cat.etaMin[1]} min away`))));

    /* route */
    card.appendChild(el('section', { class: 'cl-book-sec' },
      el('h2', { class: 'cl-book-h' }, 'Trip'),
      el('div', { class: 'route-line-item' },
        el('span', { class: 'rl-dot' }), el('div', { class: 'grow' },
          el('span', { class: 'rl-value' }, pickup.name),
          el('span', { class: 'rl-sub' }, pickup.address),
          draft.instructions ? el('span', { class: 'rl-sub' }, 'Note: ' + draft.instructions) : null)),
      el('div', { class: 'route-line-item' },
        el('span', { class: 'rl-dot rl-dot--end' }), el('div', { class: 'grow' },
          el('span', { class: 'rl-value' }, dropoff.name),
          el('span', { class: 'rl-sub' }, dropoff.address))),
      el('p', { class: 't-small t-num' }, `${km} km · about ${mins} min`)));

    /* payment + fare */
    const fareLines = el('div', { class: 'fare-lines' });
    [
      { label: 'Base fare', value: peso(fare.base) },
      { label: `Distance · ${fare.km} km`, value: peso(fare.distance) },
      { label: `Time · ${fare.mins} min`, value: peso(fare.duration) },
      { label: 'Platform fee', value: peso(fare.platformFee) },
    ].forEach((r) => fareLines.appendChild(el('div', { class: 'fare-line' },
      el('span', { class: 'fl-label' }, r.label), el('span', { class: 'fl-val t-num' }, r.value))));
    if (fare.discount > 0) fareLines.appendChild(el('div', { class: 'fare-line fare-line--discount' },
      el('span', { class: 'fl-label' }, `Promo ${fare.promoCode}`), el('span', { class: 'fl-val t-num' }, '−' + peso(fare.discount))));
    fareLines.appendChild(el('div', { class: 'fare-line fare-line--total' },
      el('span', { class: 'fl-label' }, 'Total'), el('span', { class: 'fl-val t-num' }, peso(fare.total))));

    card.appendChild(el('section', { class: 'cl-book-sec' },
      el('h2', { class: 'cl-book-h' }, 'Payment'),
      el('div', { class: 'cl-pay-line' },
        payMark(method),
        el('span', { class: 'po-body' },
          el('span', { class: 'po-name' }, method.name),
          el('span', { class: 'po-sub' }, method.sub))),
      fareLines));

    wrap.appendChild(card);

    /* actions — one primary, two quiet */
    const actions = el('div', { class: 'cl-confirm-actions' });
    const confirmBtn = el('button', { class: 'btn btn--primary btn--lg' }, 'Confirm booking', el('i', { 'data-lucide': 'arrow-right' }));
    const editBtn = el('button', { class: 'btn btn--outline btn--lg' }, 'Edit');
    const cancelBtn = el('button', { class: 'btn btn--ghost-danger btn--lg' }, 'Cancel');
    actions.append(confirmBtn, editBtn, cancelBtn);
    wrap.appendChild(actions);

    root.appendChild(wrap);

    cancelBtn.addEventListener('click', () => { clearDraft(); App.navigate('home', {}, { replace: true }); });
    editBtn.addEventListener('click', () => App.navigate('rides', {
      query: { from: encodePoint(pickup), to: encodePoint(dropoff) },
    }));

    let submitting = false;
    confirmBtn.addEventListener('click', () => {
      if (submitting) return; // prevent duplicate submissions
      // one live ride per passenger (another tab may already have booked)
      const live = Bookings.activeFor(userId, 'passenger').find((x) => x.status !== 'scheduled');
      if (live) {
        Toast.warn('You already have a ride', 'Finish or cancel your current ride before booking another.');
        App.navigate('trip', { restPath: live.id }, { replace: true });
        return;
      }
      submitting = true;
      confirmBtn.disabled = true;
      confirmBtn.classList.add('btn--loading');

      const now = Date.now();
      const booking = {
        id: 'b_' + now.toString(36) + Math.random().toString(36).slice(2, 7),
        ref: 'LB-' + new Date(now).toISOString().slice(0, 10).replace(/-/g, '') + '-' + Math.floor(1000 + Math.random() * 9000),
        passengerId: userId,
        passengerName: `${App.user.firstName} ${App.user.lastName}`.trim(),
        passengerPhone: App.user.phone,
        passengerAvatar: App.user.avatar,
        passengerRating: App.user.rating || 5,
        riderId: null, rider: null, riderSource: null,
        category: cat.id,
        pickup: { placeId: pickup.placeId || null, name: pickup.name, address: pickup.address, lat: pickup.lat, lng: pickup.lng, instructions: draft.instructions || '' },
        dropoff: { placeId: dropoff.placeId || null, name: dropoff.name, address: dropoff.address, lat: dropoff.lat, lng: dropoff.lng, instructions: '' },
        distanceKm: km, durationMin: mins, route,
        fare: { ...fare },
        payment: { method: method.id, status: 'pending' },
        status: 'searching',
        timeline: [{ status: 'searching', at: now, by: 'passenger' }],
        pickupEtaSec: 0, tripEtaSec: 0,
        createdAt: now, scheduledFor: null,
        messages: [], rating: null, receipt: null,
      };
      Bookings.create(booking);
      saveDraft({ bookingId: booking.id });
      Sim.beginSearch(booking);
      Notifs.push({
        userId, role: 'passenger',
        title: 'Booking confirmed',
        body: `Finding you a ${cat.name.replace('Lakbay ', '')} driver — ${booking.pickup.name} → ${booking.dropoff.name}.`,
        icon: 'circle-check', tone: 'primary',
      });
      Toast.success('Booking confirmed', 'Matching you with a nearby rider…');
      App.navigate('matching', { restPath: booking.id }, { replace: true });
    });

    Icons.refresh(root);
  },
};

export const bookingViews = [searchView, ridesView, confirmView];
