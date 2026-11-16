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
import { tickValue } from '../shared/motion.js';
import { formatDistanceKm } from '../data.js';
import { SAMPLE_LOC, currentLoc } from './home.js';

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
   the built-in Metro Manila list only when it's offline. Built-in places are
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
      el('h4', {}, q ? 'No matching places' : 'Where to?'),
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
          },
        });
        panel.style.display = 'flex';
        f.block.classList.add('focused');
      };
      f.input.addEventListener('focus', showPanel);
      let typeTimer = null;
      f.input.addEventListener('input', () => { clearTimeout(typeTimer); typeTimer = setTimeout(showPanel, 250); });
      f.input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); const first = panel.querySelector('.cl-ac-item'); if (first) first.click(); } });
      f.block.addEventListener('focusout', () => { hideTimer = setTimeout(() => { panel.style.display = 'none'; f.block.classList.remove('focused'); }, 180); });
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

/* ==========================================================
   View: rides (vehicle selection + booking details)
   ========================================================== */
const ridesView = {
  id: 'rides',
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

    const wrap = el('div', { class: 'cl-rides-wrap' });

    /* route preview */
    const preview = el('div', { class: 'card cl-route-preview' });
    preview.appendChild(el('div', { class: 'route-line-item' },
      el('span', { class: 'rl-dot' }), el('div', { class: 'grow' },
        el('span', { class: 'rl-label' }, 'Pickup'),
        el('span', { class: 'rl-value' }, from.name),
        el('span', { class: 'rl-sub' }, from.address))));
    preview.appendChild(el('div', { class: 'route-line-item' },
      el('span', { class: 'rl-dot rl-dot--end' }), el('div', { class: 'grow' },
        el('span', { class: 'rl-label' }, 'Drop-off'),
        el('span', { class: 'rl-value' }, to.name),
        el('span', { class: 'rl-sub' }, to.address))));
    const mapBox = el('div', { class: 'map-box cl-map-sm', style: 'margin-top:12px' });
    preview.appendChild(mapBox);
    wrap.appendChild(preview);

    /* category list */
    const listCard = el('div', { class: 'card', style: 'padding:14px' });
    listCard.appendChild(el('h3', { class: 'cl-section-title', style: 'margin-bottom:10px' }, 'Ride options'));
    const rideList = el('div', { class: 'cl-ride-list', role: 'radiogroup', 'aria-label': 'Ride category' });
    listCard.appendChild(rideList);
    wrap.appendChild(listCard);

    /* details card (rebuilt on category change) */
    const detailsCard = el('div', { class: 'card cl-ride-details' });
    wrap.appendChild(detailsCard);

    /* sticky foot */
    const foot = el('div', { class: 'cl-sticky-foot' });
    const totalLabel = el('span', { class: 'cl-total-label' }, 'Estimated total');
    const totalValue = el('span', { class: 'cl-total-value t-num' }, '—');
    const footTotal = el('div', { class: 'cl-total' }, totalLabel, totalValue);
    const nextBtn = el('button', { class: 'btn btn--primary btn--lg' }, 'Review booking', el('i', { 'data-lucide': 'arrow-right' }));
    foot.append(footTotal, nextBtn);
    wrap.appendChild(foot);

    root.appendChild(wrap);

    /* ---- rendering helpers ---- */
    let mapApi = null;
    function paintMap() {
      setTimeout(() => {
        if (!mapBox.isConnected) return;
        if (mapApi) { mapApi.destroy(); mapApi = null; }
        mapApi = createMap(mapBox, { center: [from.lat, from.lng], zoom: 13 });
        if (!mapApi) return;
        mapApi.setMarker('pickup', from, 'pickup', { label: 'Pickup' });
        mapApi.setMarker('drop', to, 'drop', { label: 'Drop-off' });
        mapApi.drawRoute(route);
        mapApi.fitRoute(route, { pad: [30, 30], maxZoom: 15 });
      }, 60);
    }

    function currentFare() {
      const base = estimateFare(selectedCat, km, mins);
      return applyPromo(base, promo);
    }

    function paintCategories() {
      clear(rideList);
      RIDE_CATEGORIES.forEach((cat) => {
        const fare = estimateFare(cat.id, km, mins);
        const etaText = `${cat.etaMin[0]}–${cat.etaMin[1]} min away`;
        const row = el('button', {
          class: `ride-opt${cat.id === selectedCat ? ' selected' : ''}`, type: 'button',
          role: 'radio', 'aria-checked': String(cat.id === selectedCat),
        },
          el('span', { class: 'ro-img' },
            el('img', { src: cat.img, alt: `${cat.name} vehicle illustration`, loading: 'lazy' })),
          el('span', { class: 'ro-body' },
            el('span', { class: 'ro-name' }, cat.name,
              el('span', { class: 'cl-cap-chip' }, el('i', { 'data-lucide': 'users-round' }), `${cat.capacity} pax`)),
            el('span', { class: 'ro-desc' }, cat.desc),
            el('span', { class: 'ro-meta' },
              el('span', {}, el('i', { 'data-lucide': 'timer' }), etaText),
              el('span', {}, el('i', { 'data-lucide': 'clock' }), `~${mins} min trip`),
              el('span', {}, el('i', { 'data-lucide': 'briefcase' }), cat.luggage))),
          el('span', { class: 'ro-price' }, peso(fare.total, { whole: true }),
            el('span', { class: 'ro-price-sub' }, 'estimate')),
        );
        row.addEventListener('click', () => {
          if (selectedCat === cat.id) return;
          selectedCat = cat.id; saveDraft({ category: cat.id });
          paintCategories(); paintDetails(); paintFoot();
        });
        rideList.appendChild(row);
      });
      Icons.refresh(rideList);
    }

    function paintDetails() {
      clear(detailsCard);
      const cat = RIDE_CATEGORIES.find((c) => c.id === selectedCat);

      /* payment method */
      const payBlock = el('div', { class: 'cl-details-block' });
      payBlock.appendChild(el('div', { class: 'cl-details-label' }, el('i', { 'data-lucide': 'wallet' }), 'Payment method'));
      const payList = el('div', { class: 'cl-pay-list', role: 'radiogroup', 'aria-label': 'Payment method' });
      const defaults = PaymentRepo.list(userId);
      PAYMENT_METHODS.forEach((m) => {
        const isDefault = defaults.some((d) => d.id === m.id && d.default);
        const opt = el('button', {
          class: `pay-opt${paymentMethod === m.id ? ' selected' : ''}`, type: 'button', role: 'radio',
          'aria-checked': String(paymentMethod === m.id),
        },
          el('span', { class: 'po-logo', style: `background:${m.logoBg};color:${m.logoFg}` },
            el('i', { 'data-lucide': m.icon })),
          el('span', { class: 'po-body' },
            el('span', { class: 'po-name' }, m.name, isDefault ? el('span', { class: 'cl-default-badge' }, 'Default') : null),
            el('span', { class: 'po-sub' }, m.sub)),
          el('span', { class: 'po-check' }, el('i', { 'data-lucide': 'circle-check-big' })),
        );
        opt.addEventListener('click', () => { paymentMethod = m.id; saveDraft({ paymentMethod: m.id }); paintDetails(); });
        payList.appendChild(opt);
      });
      payBlock.appendChild(payList);
      detailsCard.appendChild(payBlock);

      /* promo */
      const promoBlock = el('div', { class: 'cl-details-block' });
      promoBlock.appendChild(el('div', { class: 'cl-details-label' }, el('i', { 'data-lucide': 'ticket-percent' }), 'Promo code'));
      if (promo) {
        const applied = el('div', { class: 'cl-promo-applied' },
          el('span', {}, el('i', { 'data-lucide': 'badge-check' }), `${promo.code} applied — you save ${peso(currentFare().discount, { whole: true })}`),
          el('button', { class: 'icon-btn', 'aria-label': 'Remove promo code' }, el('i', { 'data-lucide': 'trash-2' })));
        applied.querySelector('button').addEventListener('click', () => {
          promo = null; saveDraft({ promoCode: null }); paintDetails(); paintFoot();
        });
        promoBlock.appendChild(applied);
      } else {
        const row = el('div', { class: 'cl-promo-row' });
        const input = el('input', { class: 'input', type: 'text', placeholder: 'e.g. LAKBAY50', 'aria-label': 'Promo code', maxlength: '16' });
        row.appendChild(el('div', { class: 'input-wrap' }, input));
        const applyBtn = el('button', { class: 'btn btn--soft' }, 'Apply');
        row.appendChild(applyBtn);
        const err = el('div', { class: 'cl-inline-error', style: 'display:none' }, el('i', { 'data-lucide': 'circle-alert' }), el('span', {}));
        promoBlock.append(row, err);
        applyBtn.addEventListener('click', () => {
          const code = input.value.trim();
          if (!code) { err.style.display = 'flex'; err.querySelector('span').textContent = 'Enter a promo code first.'; return; }
          const p = getPromo(code);
          const fare = estimateFare(selectedCat, km, mins);
          if (!p) { err.style.display = 'flex'; err.querySelector('span').textContent = `“${code}” is not a valid code. Try LAKBAY50.`; return; }
          if (fare.subtotal < p.minFare) {
            err.style.display = 'flex';
            err.querySelector('span').textContent = `${p.code} needs a minimum fare of ${peso(p.minFare, { whole: true })}.`;
            return;
          }
          if (p.category && p.category !== selectedCat) {
            err.style.display = 'flex';
            err.querySelector('span').textContent = `${p.code} only applies to ${p.category === 'moto' ? 'Lakbay Moto' : 'this'} rides.`;
            return;
          }
          promo = p; saveDraft({ promoCode: p.code });
          Toast.success('Promo applied', `${p.code} — ${p.label}`);
          paintDetails(); paintFoot();
        });
      }
      detailsCard.appendChild(promoBlock);

      /* instructions */
      const insBlock = el('div', { class: 'cl-details-block' });
      insBlock.appendChild(el('div', { class: 'cl-details-label' }, el('i', { 'data-lucide': 'message-square-text' }), 'Pickup instructions'));
      const ta = el('textarea', { class: 'textarea', rows: '2', maxlength: '140', placeholder: 'e.g. Wait at the guard house, Gate 2, beside the coffee shop' });
      ta.value = instructions;
      ta.addEventListener('input', () => { instructions = ta.value.slice(0, 140); saveDraft({ instructions }); });
      insBlock.appendChild(ta);
      insBlock.appendChild(el('p', { class: 'input-hint' }, 'Optional note for your rider. Keep it short and clear.'));
      detailsCard.appendChild(insBlock);

      /* fare breakdown */
      const fareBlock = el('div', { class: 'cl-details-block' });
      fareBlock.appendChild(el('div', { class: 'cl-details-label' }, el('i', { 'data-lucide': 'receipt-text' }), 'Fare breakdown'));
      const f = currentFare();
      const lines = el('div', { class: 'fare-lines' });
      [
        { label: `Base fare (${cat.name})`, value: peso(f.base) },
        { label: `Distance · ${f.km} km`, value: peso(f.distance) },
        { label: `Time · ${f.mins} min`, value: peso(f.duration) },
        { label: 'Platform fee', value: peso(f.platformFee) },
      ].forEach((r) => lines.appendChild(el('div', { class: 'fare-line' },
        el('span', { class: 'fl-label' }, r.label), el('span', { class: 'fl-val t-num' }, r.value))));
      if (f.discount > 0) {
        lines.appendChild(el('div', { class: 'fare-line fare-line--discount' },
          el('span', { class: 'fl-label' }, 'Promo discount'), el('span', { class: 'fl-val t-num' }, '−' + peso(f.discount))));
      }
      lines.appendChild(el('div', { class: 'fare-line fare-line--total' },
        el('span', { class: 'fl-label' }, 'Total'), el('span', { class: 'fl-val t-num' }, peso(f.total))));
      fareBlock.appendChild(lines);
      fareBlock.appendChild(el('p', { class: 'input-hint' }, 'Final fare may adjust slightly with actual route and time.'));
      detailsCard.appendChild(fareBlock);

      Icons.refresh(detailsCard);
    }

    function paintFoot() {
      const f = currentFare();
      totalValue.textContent = peso(f.total, { whole: true });
      tickValue(totalValue); // brief emphasis whenever the estimated total changes
    }

    nextBtn.addEventListener('click', () => {
      saveDraft({ category: selectedCat, promoCode: promo ? promo.code : null, paymentMethod, instructions });
      App.navigate('confirm');
    });

    paintCategories();
    paintDetails();
    paintFoot();
    paintMap();
  },
  unmount() { /* map destroyed with view */ if (typeof this._map !== 'undefined' && this._map) this._map.destroy(); },
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
    let fare = applyPromo(estimateFare(cat.id, km, mins), promo);
    const method = PAYMENT_METHODS.find((m) => m.id === (draft.paymentMethod || 'cash')) || PAYMENT_METHODS[0];

    App.setHeader('Review your booking', 'Confirm the details below');

    const wrap = el('div', { class: 'cl-rides-wrap', style: 'max-width:640px' });
    const card = el('div', { class: 'card cl-confirm-card' });

    /* route */
    card.appendChild(el('div', { class: 'cl-confirm-block' },
      el('span', { class: 'cl-confirm-label' }, el('i', { 'data-lucide': 'route' }), 'Trip'),
      el('div', { class: 'route-line-item' },
        el('span', { class: 'rl-dot' }), el('div', { class: 'grow' },
          el('span', { class: 'rl-label' }, 'Pickup'), el('span', { class: 'rl-value' }, pickup.name),
          pickup.instructions ? el('span', { class: 'rl-sub' }, 'Note: ' + pickup.instructions) : null,
          el('span', { class: 'rl-sub' }, pickup.address))),
      el('div', { class: 'route-line-item' },
        el('span', { class: 'rl-dot rl-dot--end' }), el('div', { class: 'grow' },
          el('span', { class: 'rl-label' }, 'Destination'), el('span', { class: 'rl-value' }, dropoff.name),
          el('span', { class: 'rl-sub' }, dropoff.address))),
    ));

    /* category + eta */
    const catRow = el('div', { class: 'cl-cat-row' },
      el('span', { class: 'ro-img' }, el('img', { src: cat.img, alt: `${cat.name} vehicle illustration` })),
      el('div', { class: 'grow' },
        el('div', { class: 't-h3' }, cat.name),
        el('div', { class: 't-small' }, `${cat.capacity} passenger seat${cat.capacity > 1 ? 's' : ''} · ${cat.luggage}`)));
    const etaRow = el('div', { class: 'cl-eta-row' },
      el('i', { 'data-lucide': 'timer' }),
      el('span', {}, `Estimated trip: ${km} km · about ${mins} min. First available ${cat.vehicle} is ${cat.etaMin[0]}–${cat.etaMin[1]} min from pickup.`));
    card.append(
      el('div', { class: 'cl-confirm-block' }, el('span', { class: 'cl-confirm-label' }, el('i', { 'data-lucide': 'car-front' }), 'Ride category'), catRow),
      etaRow,
    );

    /* payment + fare summary */
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

    card.appendChild(el('div', { class: 'cl-confirm-block' },
      el('span', { class: 'cl-confirm-label' }, el('i', { 'data-lucide': 'wallet' }), 'Payment'),
      el('div', { class: 'pay-opt selected list-item--static' },
        el('span', { class: 'po-logo', style: `background:${method.logoBg};color:${method.logoFg}` }, el('i', { 'data-lucide': method.icon })),
        el('span', { class: 'po-body' },
          el('span', { class: 'po-name' }, method.name),
          el('span', { class: 'po-sub' }, method.sub))),
      fareLines,
    ));

    if (draft.instructions) {
      card.appendChild(el('div', { class: 'cl-confirm-block' },
        el('span', { class: 'cl-confirm-label' }, el('i', { 'data-lucide': 'message-square-text' }), 'Instructions to rider'),
        el('p', { class: 't-body' }, draft.instructions)));
    }

    wrap.appendChild(card);

    /* actions */
    const actions = el('div', { class: 'cl-confirm-actions' });
    const cancelBtn = el('button', { class: 'btn btn--outline btn--lg' }, 'Cancel');
    const editBtn = el('button', { class: 'btn btn--soft btn--lg' }, el('i', { 'data-lucide': 'pencil' }), 'Edit booking');
    const confirmBtn = el('button', { class: 'btn btn--primary btn--lg' }, el('i', { 'data-lucide': 'check' }), 'Confirm booking');
    actions.append(cancelBtn, editBtn, confirmBtn);
    wrap.appendChild(actions);

    root.appendChild(wrap);

    cancelBtn.addEventListener('click', () => { clearDraft(); App.navigate('home', {}, { replace: true }); });
    editBtn.addEventListener('click', () => App.navigate('rides', {
      query: { from: encodePoint(pickup), to: encodePoint(dropoff) }, // eslint-disable-line no-use-before-define
    }));

    let submitting = false;
    confirmBtn.addEventListener('click', () => {
      if (submitting) return; // prevent duplicate submissions
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
