/* ==========================================================================
   Lakbay — Passenger live ride views
   matching (radar) -> trip (map tracking, driver card, chat, rating) and
   receipt. Movement is a local time-based simulation driven by the booking
   timeline, so it survives re-renders and mirrors the rider tab's state.
   ========================================================================== */
import { App } from '../app.js';
import { Bookings, Msgs, Bus } from '../storage.js';
import { Sim } from '../shared/sim.js';
import {
  RIDE_CATEGORIES, quickReplies, COMPLIMENTS, nearbyPlaces, generateRoute,
  routeLengthKm, pointAtDistance, bearingDeg,
} from '../data.js';
import { el, clear, qs } from '../shared/dom.js';
import { Icons } from '../shared/icons.js';
import { Toast } from '../shared/toast.js';
import { Modal } from '../shared/modal.js';
import { createMap } from '../shared/map.js';
import { roadRoute, densify } from '../shared/geo.js';
import { peso, dateTime, statusLabel, statusEl, refreshStatusEl, initials } from '../shared/format.js';
import { tickValue } from '../shared/motion.js';
import { avatarEl } from './home.js';
import { tripStepper } from '../shared/ui-lite.js';
import { confettiFrom } from '../shared/confetti.js';

const PAY_LABEL = { cash: 'Cash', gcash: 'GCash', maya: 'Maya' };

const state = {
  ticker: null,
  map: null,
  unsubs: [],
};

function stopTimers() {
  if (state.ticker) { clearInterval(state.ticker); state.ticker = null; }
  state.unsubs.forEach((u) => { try { u(); } catch (e) { /* noop */ } });
  state.unsubs = [];
  if (state.map) { state.map.destroy(); state.map = null; }
}

function getBooking(id) { return Bookings.byId(id); }

/* Deterministic approach origin: a nearby place on the "other side" of pickup */
function approachOrigin(booking) {
  // Only built-in places within 6 km; elsewhere (e.g. Cebu) start the driver
  // from a short offset instead of a Manila landmark hundreds of km away.
  const near = nearbyPlaces(booking.pickup, 5, 6).filter((p) => p.id !== booking.pickup.placeId);
  const idx = booking.id.length % Math.max(1, near.length);
  const p = near[idx] || near[0];
  if (p) return { lat: p.lat, lng: p.lng, name: p.name };
  return { lat: booking.pickup.lat + 0.012, lng: booking.pickup.lng - 0.01, name: 'Nearby area' };
}

function liveStatusText(b, now) {
  const tl = {}; (b.timeline || []).forEach((t) => { tl[t.status] = t.at; });
  if (b.status === 'searching') return 'Finding a rider near you…';
  if (b.status === 'accepted' || b.status === 'arriving') {
    const started = tl.accepted || b.createdAt;
    const totalMs = Math.max(8000, (b.pickupEtaSec || 18) * 1000);
    const remain = Math.max(0, totalMs - (now - started));
    const pct = Math.min(1, (now - started) / totalMs);
    return { text: `Arriving in ${Math.ceil(remain / 1000)}s`, pct };
  }
  if (b.status === 'arrived') return { text: 'Your rider is waiting', pct: 1 };
  if (b.status === 'in_progress') {
    const started = tl.in_progress || now;
    const totalMs = Math.max(15000, (b.tripEtaSec || 35) * 1000);
    const pct = Math.min(1, (now - started) / totalMs);
    const kmLeft = Math.max(0, b.distanceKm * (1 - pct));
    const minLeft = Math.max(1, Math.round(b.durationMin * (1 - pct)));
    return { text: `${minLeft} min to destination · ${kmLeft.toFixed(1)} km left`, pct };
  }
  if (b.status === 'completed') return { text: 'Trip completed', pct: 1 };
  return { text: statusLabel(b.status), pct: 0 };
}

/* ---------- driver position on the map for the current status ---------- */
function driverPosition(b, now) {
  const tl = {}; (b.timeline || []).forEach((t) => { tl[t.status] = t.at; });
  const approachRoute = state._roadApproach || state._approachRoute;
  if ((b.status === 'accepted' || b.status === 'arriving') && approachRoute) {
    const started = tl.accepted || b.createdAt;
    const totalMs = Math.max(8000, (b.pickupEtaSec || 18) * 1000);
    const pct = Math.min(1, (now - started) / totalMs);
    return pointAtDistance(approachRoute, routeLengthKm(approachRoute) * pct);
  }
  if (b.status === 'in_progress') {
    const tripRoute = state._roadTrip || b.route;
    const started = tl.in_progress || now;
    const totalMs = Math.max(15000, (b.tripEtaSec || 35) * 1000);
    const pct = Math.min(1, (now - started) / totalMs);
    return pointAtDistance(tripRoute, routeLengthKm(tripRoute) * pct);
  }
  if (b.status === 'arrived') return { lat: b.pickup.lat, lng: b.pickup.lng };
  if (b.status === 'completed') return { lat: b.dropoff.lat, lng: b.dropoff.lng };
  return null;
}

/* ==========================================================
   View: matching
   ========================================================== */
const matchingView = {
  id: 'matching',
  render(root, { restPath }) {
    const b = getBooking(restPath);
    if (!b) { App.navigate('home', {}, { replace: true }); return; }
    if (b.status !== 'searching') { App.navigate('trip', { restPath: b.id }, { replace: true }); return; }
    App.setHeader('Finding your rider', `${b.pickup.name} → ${b.dropoff.name}`);

    const wrap = el('div', { class: 'cl-matching' });
    const radar = el('div', { class: 'cl-radar', 'aria-hidden': 'true' },
      el('span', { class: 'cl-radar-ring' }), el('i', { 'data-lucide': 'radar' }));
    wrap.appendChild(radar);
    wrap.appendChild(el('h2', { class: 't-h2' }, 'Looking for riders nearby…'));
    wrap.appendChild(el('p', { class: 't-small', style: 'max-width:340px' },
      `We are contacting ${b.category === 'moto' ? 'moto' : 'vehicle'} drivers around ${b.pickup.name}. This usually takes a few seconds.`));

    const steps = el('div', { class: 'cl-matching-steps' });
    const card = el('div', { class: 'card card-pad' });
    const stepEls = [
      { icon: 'check', text: `Request sent — ${peso(b.fare.total, { whole: true })} estimate` },
      { icon: 'loader-circle', text: 'Contacting nearby drivers…', spin: true },
      { icon: 'user-round', text: 'Matching you with the closest rider' },
    ].map((s) => el('div', { class: 'row', style: 'gap:10px;padding:7px 0' },
      el('i', { 'data-lucide': s.icon, class: s.spin ? 'spin' : '', style: 'width:17px;height:17px;color:var(--c-primary)' }),
      el('span', { class: 't-body' }, s.text)));
    stepEls.forEach((s) => card.appendChild(s));
    steps.appendChild(card);
    wrap.appendChild(steps);

    const cancelBtn = el('button', { class: 'btn btn--ghost-danger btn--lg', style: 'margin-top:14px' },
      el('i', { 'data-lucide': 'circle-x' }), 'Cancel ride');
    cancelBtn.addEventListener('click', async () => {
      const { confirmDialog } = await import('../shared/modal.js');
      const ok = await confirmDialog({
        title: 'Cancel this ride?',
        message: 'Your booking will be withdrawn and no rider will be dispatched. You can rebook anytime.',
        confirmLabel: 'Cancel ride', tone: 'danger', icon: 'circle-x',
      });
      if (!ok) return;
      if (!Sim.passengerCancel(b.id)) {
        // a rider accepted (or the trip moved on) while the dialog was open
        Toast.error('Could not cancel', 'Your ride has already moved on. Opening it now.');
        App.navigate('trip', { restPath: b.id }, { replace: true });
        return;
      }
      Toast.warn('Ride cancelled', 'Your booking was withdrawn.');
      App.navigate('home', {}, { replace: true });
    });
    wrap.appendChild(cancelBtn);

    root.appendChild(wrap);

    const unsub = Bus.subscribe('booking:update', ({ booking }) => {
      if (!booking || booking.id !== b.id) return;
      if (booking.status === 'searching') return;
      if (booking.status === 'cancelled') { Toast.warn('Ride cancelled'); App.navigate('home', {}, { replace: true }); return; }
      if (['accepted', 'arriving', 'arrived', 'in_progress'].includes(booking.status)) {
        Toast.success('Rider found!', `${booking.rider ? booking.rider.name : 'Your rider'} is on the way.`);
        App.navigate('trip', { restPath: b.id }, { replace: true });
      }
    });
    state.unsubs.push(unsub);
    Icons.refresh(root);
  },
  unmount() { stopTimers(); },
};

/* ==========================================================
   View: trip (live tracking)
   ========================================================== */
const tripView = {
  id: 'trip',
  render(root, { restPath }) {
    const b = getBooking(restPath);
    if (!b) { App.navigate('home', {}, { replace: true }); return; }
    if (b.status === 'searching' || b.status === 'scheduled') { App.navigate('matching', { restPath: b.id }, { replace: true }); return; }

    const cat = RIDE_CATEGORIES.find((c) => c.id === b.category) || RIDE_CATEGORIES[1];
    App.setHeader('Your ride', `Ref ${b.ref}`);
    document.querySelector('.app-view').classList.add('app-view--flush');

    const layout = el('div', { class: 'cl-trip-layout' });

    /* ---- map ---- */
    const mapWrap = el('div', { class: 'cl-trip-map-wrap' });
    const etaBanner = el('div', { class: 'cl-trip-banner' });
    const etaChip = el('div', { class: 'cl-trip-eta' },
      el('i', { 'data-lucide': 'navigation' }),
      el('span', { class: 'grow' }, 'Tracking your ride…'));
    etaBanner.appendChild(etaChip);
    mapWrap.appendChild(etaBanner);
    layout.appendChild(mapWrap);

    /* ---- side panel ---- */
    const panel = el('div', { class: 'cl-trip-panel' });

    /* status head — text-style status (dot + label, no pill background) */
    const stPill = statusEl(b.status);
    const head = el('div', { class: 'cl-trip-panel-head' }, stPill);
    const cancelBtn = el('button', { class: 'btn btn--ghost-danger btn--sm' }, 'Cancel');
    head.appendChild(cancelBtn);
    panel.appendChild(head);
    const stepper = tripStepper([
      ['Assigned', ['accepted']],
      ['Arriving', ['arriving', 'arrived']],
      ['On the way', ['in_progress']],
      ['Arrived', ['completed']],
    ], b.status);
    panel.appendChild(stepper);

    const body = el('div', { class: 'cl-trip-panel-body' });

    /* driver card */
    if (b.rider) {
      const dc = el('div', { class: 'cl-driver-card' },
        avatarEl(b.rider, 'avatar--lg'),
        el('div', { class: 'cl-driver-info' },
          el('div', { class: 'cl-driver-name' },
            b.rider.name,
            el('span', { class: 'rating-pill' }, el('i', { 'data-lucide': 'star' }), Number(b.rider.rating || 5).toFixed(2))),
          el('div', { class: 'cl-driver-vehicle' }, `${b.rider.vehicle.color} ${b.rider.vehicle.model} · ${b.rider.trips || 0} trips`),
          el('span', { class: 'cl-plate' }, b.rider.vehicle.plate)),
        el('div', { class: 'cl-driver-actions' },
          el('button', { class: 'icon-btn icon-btn--bordered', 'aria-label': 'Call rider' }, el('i', { 'data-lucide': 'phone' })),
          el('button', { class: 'icon-btn icon-btn--bordered', 'aria-label': 'Message rider' }, el('i', { 'data-lucide': 'message-circle' }))),
      );
      dc.querySelector('[aria-label="Call rider"]').addEventListener('click', () => {
        Modal.open({
          title: 'Call your rider',
          body: el('div', {},
            el('p', { class: 't-body t-muted' }, 'Call the rider directly at:'),
            el('p', { class: 't-h3 t-num', style: 'margin-top:8px' }, b.rider.phone || '+63 9XX XXX XXXX')),
          actions: [{ label: 'Done', variant: 'primary', onClick: (api) => api.close(true) }],
        });
      });
      dc.querySelector('[aria-label="Message rider"]').addEventListener('click', () => {
        const chatPane = qs('.cl-chat-pane', root);
        if (chatPane) { chatPane.scrollIntoView({ behavior: 'smooth', block: 'center' }); const inp = qs('.cl-chat-compose input', root); if (inp) inp.focus(); }
      });
      body.appendChild(dc);
    } else {
      body.appendChild(el('div', { class: 'info-banner info-banner--neutral' },
        el('i', { 'data-lucide': 'radar' }),
        el('span', {}, 'Matching with a rider… you will see driver details here the moment someone accepts.')));
    }

    /* progress */
    const progBar = el('div', { class: 'progress', role: 'progressbar', 'aria-label': 'Trip progress' }, el('div', { class: 'progress-bar' }));
    const progLeft = el('span', {}, 'Pickup');
    const progRight = el('span', {}, 'Destination');
    const progress = el('div', { class: 'cl-trip-progress' },
      progBar,
      el('div', { class: 'cl-trip-progress-row' }, progLeft, progRight));
    body.appendChild(progress);

    /* route summary */
    body.appendChild(el('div', { class: 'cl-trip-route' },
      el('div', { class: 'route-line-item' },
        el('span', { class: 'rl-dot' }), el('div', { class: 'grow' },
          el('span', { class: 'rl-label' }, 'Pickup'), el('span', { class: 'rl-value clamp-1' }, b.pickup.name))),
      el('div', { class: 'route-line-item' },
        el('span', { class: 'rl-dot rl-dot--end' }), el('div', { class: 'grow' },
          el('span', { class: 'rl-label' }, 'Destination'), el('span', { class: 'rl-value clamp-1' }, b.dropoff.name))),
      el('dl', { class: 'cl-trip-facts' },
        el('div', {}, el('dt', {}, 'Ride'), el('dd', {}, cat.name.replace('Lakbay ', ''))),
        el('div', {}, el('dt', {}, 'Fare'), el('dd', { class: 't-num' }, peso(b.fare.total, { whole: true }))),
        el('div', {}, el('dt', {}, 'Payment'), el('dd', {}, PAY_LABEL[b.payment && b.payment.method] || 'Cash'))),
    ));

    /* chat */
    body.appendChild(buildChatPane(b));

    panel.appendChild(body);
    layout.appendChild(panel);
    root.appendChild(layout);

    /* ---- behaviour ---- */
    cancelBtn.addEventListener('click', async () => {
      // check the stored status, not the copy this screen was drawn with
      if ((Bookings.byId(b.id) || b).status === 'in_progress') { Toast.warn('Trip already started', 'You cannot cancel while the trip is in progress. Complete the ride or contact support.'); return; }
      const { confirmDialog } = await import('../shared/modal.js');
      const ok = await confirmDialog({
        title: 'Cancel this ride?',
        message: b.rider ? `${b.rider.name} is already assigned. Cancelling now will notify the rider.` : 'Your booking will be withdrawn.',
        confirmLabel: 'Cancel ride', tone: 'danger', icon: 'circle-x',
      });
      if (!ok) return;
      if (!Sim.passengerCancel(b.id)) { Toast.error('Could not cancel', 'The trip has already started or finished.'); return; }
      Toast.warn('Ride cancelled', 'The rider has been notified.');
      App.navigate('home', {}, { replace: true });
    });

    /* map setup + animation ticker */
    let approachRoute = null;
    setTimeout(async () => {
      if (!mapWrap.isConnected) return;
      state.map = createMap(mapWrap, { center: [b.pickup.lat, b.pickup.lng], zoom: 14 });
      if (!state.map) return;
      approachRoute = generateRoute(approachOrigin(b), b.pickup);
      state._approachRoute = densify(approachRoute, 0.05);
      state.map.setMarker('pickup', b.pickup, 'pickup', { label: 'Pickup' });
      state.map.setMarker('drop', b.dropoff, 'drop', { label: 'Destination' });
      state.map.drawRoute(b.route);
      if (['accepted', 'arriving'].includes(b.status)) {
        state.map.drawRoute(state._approachRoute, 'dashed');
      }
      state.map.fitRoute([...(b.route || []), b.pickup, b.dropoff], { pad: [36, 36], maxZoom: 15 });
      tick(); // paint immediately
      // Upgrade to road-accurate routes when the routing service answers
      const [roadTrip, roadApproach] = await Promise.all([
        roadRoute(b.pickup, b.dropoff),
        roadRoute(approachOrigin(b), b.pickup),
      ]);
      if (!mapWrap.isConnected || !state.map) return;
      if (roadTrip && roadTrip.length > 1) {
        state._roadTrip = densify(roadTrip, 0.05);
        state.map.drawRoute(state._roadTrip);
        state.map.fitRoute([...state._roadTrip, b.pickup, b.dropoff], { pad: [36, 36], maxZoom: 15 });
      }
      if (roadApproach && roadApproach.length > 1) {
        state._roadApproach = densify(roadApproach, 0.05);
        if (['accepted', 'arriving'].includes(getBooking(b.id).status)) {
          state.map.drawRoute(state._roadApproach, 'dashed');
        }
      }
    }, 60);

    function tick() {
      const cur = getBooking(b.id);
      if (!cur) return;
      const now = Date.now();
      const info = liveStatusText(cur, now);
      qs('.cl-trip-eta .grow', etaChip.parentElement) ;
      const etaTextEl = etaChip.querySelector('.grow');
      if (etaTextEl && typeof info === 'object') etaTextEl.textContent = info.text;
      else if (etaTextEl) etaTextEl.textContent = String(info);

      const bar = progBar.querySelector('.progress-bar');
      const pct = (info && typeof info === 'object' && info.pct != null) ? info.pct
        : (cur.status === 'completed' ? 1 : 0);
      if (bar) {
        bar.style.width = `${Math.round(pct * 100)}%`;
        bar.style.background = cur.status === 'in_progress' ? 'var(--c-primary)' : (cur.status === 'completed' ? 'var(--c-success)' : 'var(--c-accent)');
      }
      progLeft.textContent = cur.status === 'in_progress' || cur.status === 'completed' ? 'In transit' : 'Pickup';

      const pos = driverPosition(cur, now);
      if (state.map && pos && cur.rider) {
        state.map.setMarker('vehicle', pos, 'vehicle', { glide: true });
      }
      refreshStatusEl(stPill, cur.status);
      stepper.paint(cur.status);
      cancelBtn.style.display = ['searching', 'accepted', 'arriving', 'arrived'].includes(cur.status) ? '' : 'none';
      if (['accepted', 'arriving'].includes(cur.status) && state.map && state.map.route && cur._routePhase !== 'approach') {
        /* route switched to approach (dashed) */
      }
      if (cur.status === 'completed') {
        clearInterval(state.ticker); state.ticker = null;
        ensureCompletedExtras(cur);
        setTimeout(() => { offerRating(cur); }, 500);
      }
    }

    state.ticker = setInterval(tick, 500);

    const unsub = Bus.subscribe('booking:update', ({ booking }) => {
      if (!booking || booking.id !== b.id) return;
      if (booking.status === 'cancelled') {
        Toast.warn('Ride cancelled', 'This booking was cancelled.');
        App.navigate('home', {}, { replace: true });
      }
    });
    state.unsubs.push(unsub);

    Icons.refresh(root);

    /* if already completed and unrated, prompt right away */
    if (b.status === 'completed' && !b.rating) setTimeout(() => offerRating(b), 600);
    if (b.status === 'completed') ensureCompletedExtras(b); // receipt CTA (added once)
  },
  unmount() {
    stopTimers();
    const v = document.querySelector('.app-view');
    if (v) v.classList.remove('app-view--flush');
  },
};

/* After completion, surface a receipt CTA on the open trip panel (once) */
function ensureCompletedExtras(cur) {
  const body = qs('.cl-trip-panel-body');
  if (!body || qs('[data-role="receipt-cta"]', body)) return;
  const goto = el('button', { class: 'btn btn--primary btn--block', style: 'margin-top:2px', 'data-role': 'receipt-cta' },
    el('i', { 'data-lucide': 'receipt-text' }), 'View receipt');
  goto.addEventListener('click', () => App.navigate('receipt', { restPath: cur.id }));
  body.appendChild(goto);
  Icons.refresh(goto);
}

/* ---------- chat pane builder ---------- */
function buildChatPane(b) {
  const thread = el('div', { class: 'chat-thread cl-chat-thread-cl', 'aria-label': 'Chat with your rider', role: 'log' });
  const input = el('input', { class: 'input', type: 'text', placeholder: 'Type a message…', maxlength: '240', 'aria-label': 'Message' });
  const sendBtn = el('button', { class: 'btn btn--primary', 'aria-label': 'Send message' }, el('i', { 'data-lucide': 'send-horizontal' }));

  function paintThread() {
    clear(thread);
    const msgs = Msgs.list(b.id);
    if (!msgs.length) {
      thread.appendChild(el('div', { class: 'center t-small', style: 'padding:26px 16px' },
        'No messages yet. Say hi to your rider or tap a quick reply below.'));
    }
    msgs.forEach((m) => {
      const mine = m.from === 'passenger';
      thread.appendChild(el('div', { class: `msg ${mine ? 'msg--out' : 'msg--in'}` },
        el('div', { class: 'msg-bubble' },
          el('div', { class: 'msg-text' }, m.text),
          el('div', { class: 'msg-meta' }, new Date(m.at).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' }) + (mine && m.read ? ' · Read' : ''))),
      ));
    });
    thread.scrollTop = thread.scrollHeight;
  }
  paintThread();

  function send(text) {
    const t = String(text || '').trim();
    if (!t) return;
    input.value = '';
    Msgs.append(b.id, { from: 'passenger', fromName: 'You', text: t });
    Msgs.markRead(b.id, 'passenger');
  }
  sendBtn.addEventListener('click', () => send(input.value));
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(input.value); });

  // quick replies for the trip's current stage (repainted when it changes)
  const quickRow = el('div', { class: 'chat-quick', role: 'group', 'aria-label': 'Quick replies' });
  function paintQuick() {
    clear(quickRow);
    quickReplies('passenger', Bookings.byId(b.id) || b).forEach((q) => {
      const chip = el('button', { class: 'chip chip--soft', type: 'button' }, q);
      chip.addEventListener('click', () => send(q));
      quickRow.appendChild(chip);
    });
  }
  paintQuick();
  state.unsubs.push(Bus.subscribe('booking:update', ({ booking }) => { if (booking && booking.id === b.id) paintQuick(); }));

  const compose = el('div', { class: 'cl-chat-compose' }, input, sendBtn);
  const pane = el('div', { class: 'cl-chat-pane' },
    el('div', { class: 'cl-chat-head' },
      el('i', { 'data-lucide': 'message-circle' }),
      'Messages with your rider'),
    thread, quickRow, compose);

  const unsub = Bus.subscribe('msg:new', ({ bookingId }) => {
    if (bookingId !== b.id) return;
    paintThread();
    Msgs.markRead(b.id, 'passenger');
  });
  state.unsubs.push(unsub);
  Msgs.markRead(b.id, 'passenger');
  return pane;
}

/* ---------- rating modal ---------- */
function offerRating(b) {
  const cur = Bookings.byId(b.id);
  if (!cur || cur.status !== 'completed' || cur.rating) return;
  // one prompt per trip: render and the first tick can both ask for it
  if (offerRating.openFor === cur.id) return;
  offerRating.openFor = cur.id;
  let stars = 0;
  const chosen = new Set();

  const starRow = el('div', { class: 'cl-stars-row', role: 'radiogroup', 'aria-label': 'Rate your rider from 1 to 5 stars' });
  for (let i = 5; i >= 1; i--) {
    const s = el('button', { class: 'cl-star', type: 'button', role: 'radio', 'aria-checked': 'false', 'aria-label': `${i} star${i > 1 ? 's' : ''}` },
      el('i', { 'data-lucide': 'star' }));
    s.addEventListener('click', () => {
      stars = i;
      [...starRow.children].forEach((btn, idx) => {
        const value = 5 - idx; // row is reversed
        btn.classList.toggle('is-on', value <= stars);
        btn.setAttribute('aria-checked', String(value === stars));
      });
      hint.textContent = ['Terrible', 'Poor', 'Okay', 'Good', 'Excellent'][stars - 1] + ' — thanks for the feedback!';
    });
    starRow.appendChild(s);
  }
  const hint = el('p', { class: 't-small center', style: 'margin-top:6px' }, 'Tap a star to rate');

  const compWrap = el('div', { class: 'cl-star-set', style: 'margin-top:12px' });
  COMPLIMENTS.forEach((c) => {
    const chip = el('button', { class: 'chip chip--soft', type: 'button', 'aria-pressed': 'false' }, c);
    chip.addEventListener('click', () => {
      if (chosen.has(c)) { chosen.delete(c); chip.classList.remove('selected'); chip.setAttribute('aria-pressed', 'false'); }
      else { chosen.add(c); chip.classList.add('selected'); chip.setAttribute('aria-pressed', 'true'); }
    });
    compWrap.appendChild(chip);
  });

  const ta = el('textarea', { class: 'textarea', rows: '2', maxlength: '200', placeholder: 'Anything else? (optional)', 'aria-label': 'Feedback comment' });

  const body = el('div', {},
    el('div', { class: 'center', style: 'margin-bottom:10px' },
      el('div', { class: 't-h3' }, `How was your ride with ${cur.rider ? cur.rider.name.split(' ')[0] : 'your rider'}?`),
      el('p', { class: 't-small' }, `${cur.pickup.name} → ${cur.dropoff.name} · ${peso(cur.fare.total)}`)),
    starRow, hint, compWrap, ta);

  const modal = Modal.open({
    title: 'Rate your rider',
    body,
    dismissible: false,
    onClose: () => { offerRating.openFor = null; },
    actions: [
      { label: 'Later', variant: 'outline', onClick: (api) => api.close(null) },
      {
        label: 'Submit rating', variant: 'primary', icon: 'star',
        onClick: (api) => {
          if (!stars) { Toast.warn('Pick a rating', 'Choose 1 to 5 stars before submitting.'); return; }
          Bookings.update(cur.id, {
            rating: { stars, compliments: [...chosen], comment: ta.value.trim(), at: Date.now() },
          }, { publish: false });
          NotifThanks(cur, stars);
          if (stars >= 4) confettiFrom(starRow); // celebrate a good ride; low ratings get a calm thank-you
          api.close(true);
          Toast.success('Thanks for rating!', 'Your feedback helps keep Lakbay safe and friendly.');
          App.refreshHeader();
          ensureCompletedExtras(Bookings.byId(cur.id) || cur);
          App.navigate('receipt', { restPath: cur.id });
        },
      },
    ],
  });
  return modal;
}

function NotifThanks(cur, stars) {
  import('../storage.js').then(({ Notifs }) => {
    Notifs.push({
      userId: cur.passengerId, role: 'passenger',
      title: 'Rating submitted',
      body: `You rated ${cur.rider ? cur.rider.name : 'your rider'} ${stars} star${stars > 1 ? 's' : ''}.`,
      icon: 'star', tone: 'accent',
    });
  });
}

/* ==========================================================
   View: receipt
   ========================================================== */
const receiptView = {
  id: 'receipt',
  render(root, { restPath }) {
    const b = getBooking(restPath);
    if (!b || b.status !== 'completed') { App.navigate('activity', {}, { replace: true }); return; }
    App.setHeader('Trip receipt', b.ref);

    const wrap = el('div', { class: 'cl-receipt' });

    const head = el('div', { class: 'cl-receipt-head' },
      el('div', {},
        el('h2', { class: 't-h2' }, 'Ride complete'),
        el('p', { class: 't-small' }, dateTime(b.receipt ? b.receipt.paidAt : b.createdAt))),
      el('span', { class: 'paid-flag' }, el('i', { 'data-lucide': 'circle-check' }), 'Paid'));
    wrap.appendChild(head);

    const card = el('div', { class: 'card card-pad' });
    card.appendChild(el('div', { class: 'cl-receipt-ref' }, 'REF ' + b.ref));
    card.appendChild(el('div', { class: 'route-line-item', style: 'margin-top:10px' },
      el('span', { class: 'rl-dot' }), el('div', { class: 'grow' },
        el('span', { class: 'rl-label' }, 'From'), el('span', { class: 'rl-value clamp-1' }, b.pickup.name))));
    card.appendChild(el('div', { class: 'route-line-item' },
      el('span', { class: 'rl-dot rl-dot--end' }), el('div', { class: 'grow' },
        el('span', { class: 'rl-label' }, 'To'), el('span', { class: 'rl-value clamp-1' }, b.dropoff.name))));

    const f = b.receipt && b.receipt.breakdown ? b.receipt.breakdown : b.fare;
    const lines = el('div', { class: 'fare-lines', style: 'margin-top:12px' });
    [
      { label: 'Base fare', value: f.base },
      { label: `Distance · ${f.km} km`, value: f.distance },
      { label: `Time · ${f.mins} min`, value: f.duration },
      { label: 'Platform fee', value: f.platformFee },
    ].forEach((r) => lines.appendChild(el('div', { class: 'fare-line' },
      el('span', { class: 'fl-label' }, r.label), el('span', { class: 'fl-val t-num' }, peso(r.value)))));
    if (f.discount > 0) lines.appendChild(el('div', { class: 'fare-line fare-line--discount' },
      el('span', { class: 'fl-label' }, `Promo ${f.promoCode || ''}`), el('span', { class: 'fl-val t-num' }, '−' + peso(f.discount))));
    lines.appendChild(el('div', { class: 'fare-line fare-line--total' },
      el('span', { class: 'fl-label' }, 'Total paid'), el('span', { class: 'fl-val t-num' }, peso(f.total))));
    card.appendChild(lines);

    const plain = el('div', { class: 'cl-plain-list', style: 'margin-top:12px;border-top:1px dashed var(--c-line);padding-top:12px' });
    [
      ['Payment method', (b.receipt ? b.receipt.method : b.payment.method).replace(' (simulated)', '')],
      ['Rider', b.rider ? `${b.rider.name} · ${b.rider.vehicle.model} (${b.rider.vehicle.plate})` : '—'],
      ['Distance / time', `${b.distanceKm.toFixed(1)} km · about ${b.durationMin} min`],
      ['Status', 'Paid'],
    ].forEach(([k, v]) => plain.appendChild(el('div', { class: 'row-between' },
      el('span', { class: 't-small' }, k), el('span', { class: 't-strong', style: 'text-align:right' }, v))));
    card.appendChild(plain);
    wrap.appendChild(card);

    /* rating display / CTA */
    if (b.rating) {
      const rr = el('div', { class: 'card card-pad row-between' },
        el('span', { class: 't-h3' }, 'Your rating'),
        el('span', { class: 'cl-stars-read' },
          ...Array.from({ length: 5 }, (_, i) => el('i', { 'data-lucide': 'star', class: i < b.rating.stars ? '' : 'star-off' }))));
      wrap.appendChild(rr);
    }

    const actions = el('div', { class: 'cl-receipt-actions' });
    const dlBtn = el('button', { class: 'btn btn--outline' }, el('i', { 'data-lucide': 'download' }), 'Download receipt');
    dlBtn.addEventListener('click', () => downloadReceipt(b));
    const againBtn = el('button', { class: 'btn btn--soft' }, el('i', { 'data-lucide': 'rotate-ccw' }), 'Book again');
    againBtn.addEventListener('click', () => {
      sessionStorage.removeItem('lakbay:draft');
      App.navigate('search', { query: { focus: 'dropoff' } });
    });
    const homeBtn = el('button', { class: 'btn btn--primary' }, el('i', { 'data-lucide': 'house' }), 'Back home');
    homeBtn.addEventListener('click', () => App.navigate('home', {}, { replace: true }));
    actions.append(dlBtn, againBtn, homeBtn);
    wrap.appendChild(actions);

    root.appendChild(wrap);
    Icons.refresh(root);
  },
};

function downloadReceipt(b) {
  const f = b.receipt && b.receipt.breakdown ? b.receipt.breakdown : b.fare;
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const rows = [
    ['Reference', b.ref], ['Date', dateTime(b.receipt ? b.receipt.paidAt : b.createdAt)],
    ['From', b.pickup.name], ['To', b.dropoff.name],
    ['Rider', b.rider ? `${b.rider.name} (${b.rider.vehicle.plate})` : '—'],
    ['Base fare', peso(f.base)], ['Distance', peso(f.distance)], ['Time', peso(f.duration)],
    ['Platform fee', peso(f.platformFee)],
    ['Discount', f.discount ? '−' + peso(f.discount) : peso(0)],
    ['Total paid', peso(f.total)], ['Method', (b.receipt ? b.receipt.method : b.payment.method).replace(' (simulated)', '')],
    ['Note', 'Paid via Lakbay'],
  ];
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Lakbay receipt ${esc(b.ref)}</title>
<style>body{font-family:Segoe UI,system-ui,sans-serif;max-width:480px;margin:40px auto;color:#16211C}
h1{font-size:20px}table{width:100%;border-collapse:collapse;margin-top:16px}td{padding:7px 4px;border-bottom:1px solid #E3E9E5;font-size:14px}
td:last-child{text-align:right;font-weight:600}</style></head>
<body><h1>Lakbay — trip receipt</h1><table>${rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table>
<p style="margin-top:18px;font-size:12px;color:#64716A">Thank you for riding with Lakbay.</p></body></html>`;
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `lakbay-receipt-${b.ref}.html`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  Toast.success('Receipt downloaded', 'Check your downloads folder.');
}

export const tripViews = [matchingView, tripView, receiptView];
