/* ==========================================================================
   Lakbay — Rider trip execution + turn-by-turn style navigation
   accepted -> arriving -> arrived -> in_progress -> completed, each moved
   forward by an explicit rider action. Movement/ETAs are local simulations
   compressed for quick testing.
   ========================================================================== */
import { App } from '../app.js';
import { Bookings, Msgs, Bus, Prefs } from '../storage.js';
import { Sim } from '../shared/sim.js';
import {
  RIDE_CATEGORIES, QUICK_MSGS_RIDER, COMPLIMENTS, nearbyPlaces, generateRoute,
  routeLengthKm, pointAtDistance, navSteps,
} from '../data.js';
import { el, clear, qs } from '../shared/dom.js';
import { Icons } from '../shared/icons.js';
import { Toast } from '../shared/toast.js';
import { Modal, confirmDialog } from '../shared/modal.js';
import { createMap } from '../shared/map.js';
import { roadRoute, densify } from '../shared/geo.js';
import { peso, dateTime, statusLabel, statusEl, refreshStatusEl, statusIcon, initials } from '../shared/format.js';
import { avatarElLite, starsRead } from '../shared/ui-lite.js';

const state = { ticker: null, map: null, unsubs: [] };

function stopTimers() {
  if (state.ticker) { clearInterval(state.ticker); state.ticker = null; }
  state.unsubs.forEach((u) => { try { u(); } catch (e) { /* noop */ } });
  state.unsubs = [];
  if (state.map) { state.map.destroy(); state.map = null; }
}

function myActiveBooking() {
  const me = App.user.id;
  return Bookings.activeFor(me, 'rider').find((b) => b.riderId === me && b.riderSource === 'live')
    || Bookings.activeFor(me, 'rider').find((b) => b.riderId === me) || null;
}

/* Trip just finished in the last 15 minutes — keep showing its summary on
   the Trip tab instead of the empty state, so the rider sees the result. */
function myRecentlyCompleted() {
  const me = App.user.id;
  const cutoff = Date.now() - 15 * 60000;
  return Bookings.all().find((b) => b.riderId === me && b.status === 'completed'
    && ((b.receipt && b.receipt.paidAt) || 0) > cutoff && !b.summaryDismissed) || null;
}

const METHOD_LABEL = { cash: 'Cash', gcash: 'GCash', maya: 'Maya' };

function approachOrigin(pickup, seedId) {
  // Within 6 km only, so a pickup outside Manila doesn't route the driver from Manila
  const near = nearbyPlaces(pickup, 5, 6).filter((p) => p.id !== pickup.placeId);
  const p = near[seedId.length % Math.max(1, near.length)] || near[0];
  return p ? { lat: p.lat, lng: p.lng } : { lat: pickup.lat + 0.011, lng: pickup.lng - 0.009 };
}

/* ==========================================================
   View: trip
   ========================================================== */
const tripView = {
  id: 'trip',
  render(root) {
    const b = myActiveBooking() || myRecentlyCompleted();
    App.setHeader('Current trip', b ? `Ref ${b.ref}` : 'No active trip');

    const wrap = el('div', { class: 'cl-trip-layout' });

    /* empty state */
    if (!b) {
      root.appendChild(el('div', { class: 'empty', style: 'padding:52px 20px' },
        el('img', { src: 'assets/illustrations/empty-rides.png', alt: '', style: 'width:150px;margin:0 auto 14px', onerror: (e) => e.target.remove() }),
        el('h3', {}, 'No active trip'),
        el('p', {}, 'Go online and wait for a request, or tap a waiting passenger on the dashboard map.'),
        el('button', { class: 'btn btn--primary btn--sm', style: 'margin-top:12px' }, el('i', { 'data-lucide': 'gauge' }), 'Open dashboard')));
      root.querySelector('button').addEventListener('click', () => App.navigate('dashboard'));
      Icons.refresh(root);
      return;
    }

    const cat = RIDE_CATEGORIES.find((c) => c.id === b.category) || RIDE_CATEGORIES[1];
    document.querySelector('.app-view').classList.add('app-view--flush');

    /* ---- map ---- */
    const mapWrap = el('div', { class: 'cl-trip-map-wrap' });
    const etaChip = el('div', { class: 'cl-trip-eta' },
      el('i', { 'data-lucide': 'navigation' }), el('span', { class: 'grow' }, 'Trip tracking'));
    const banner = el('div', { class: 'cl-trip-banner' }, etaChip);
    mapWrap.appendChild(banner);
    wrap.appendChild(mapWrap);

    /* ---- panel ---- */
    const panel = el('div', { class: 'cl-trip-panel' });
    const stPill = statusEl(b.status);
    const head = el('div', { class: 'cl-trip-panel-head' },
      el('h3', {}, 'Trip details'), stPill);
    panel.appendChild(head);
    const body = el('div', { class: 'cl-trip-panel-body' });

    /* passenger card */
    const pc = el('div', { class: 'cl-driver-card' },
      avatarElLite({ name: b.passengerName, avatar: b.passengerAvatar }, 'avatar--lg'),
      el('div', { class: 'cl-driver-info' },
        el('div', { class: 'cl-driver-name' }, b.passengerName,
          el('span', { class: 'rating-pill' }, el('i', { 'data-lucide': 'star' }), Number(b.passengerRating || 5).toFixed(2))),
        el('div', { class: 'cl-driver-vehicle' }, `${cat.name} · ${peso(b.fare.total, { whole: true })} fare · net ${peso(b.fare.total * 0.8, { whole: true })}`),
        el('span', { class: 't-xs' }, b.passengerPhone || '')),
      el('div', { class: 'cl-driver-actions' },
        el('button', { class: 'icon-btn icon-btn--bordered', 'aria-label': 'Call passenger' }, el('i', { 'data-lucide': 'phone' }))),
    );
    pc.querySelector('[aria-label="Call passenger"]').addEventListener('click', () => {
      Modal.open({
        title: 'Call your passenger',
        body: el('div', {},
          el('p', { class: 't-body t-muted' }, 'Passenger number:'),
          el('p', { class: 't-h3 t-num', style: 'margin-top:8px' }, b.passengerPhone || '+63 9XX XXX XXXX')),
        actions: [{ label: 'Done', variant: 'primary', onClick: (api) => api.close(true) }],
      });
    });
    body.appendChild(pc);

    /* route summary */
    body.appendChild(el('div', { class: 'card card--flat card--inset' },
      el('div', { class: 'route-line-item' },
        el('span', { class: 'rl-dot' }), el('div', { class: 'grow' },
          el('span', { class: 'rl-label' }, 'Pickup'), el('span', { class: 'rl-value clamp-1' }, b.pickup.name),
          b.pickup.instructions ? el('span', { class: 'rl-sub' }, 'Note: ' + b.pickup.instructions) : null)),
      el('div', { class: 'route-line-item' },
        el('span', { class: 'rl-dot rl-dot--end' }), el('div', { class: 'grow' },
          el('span', { class: 'rl-label' }, 'Drop-off'), el('span', { class: 'rl-value clamp-1' }, b.dropoff.name))),
    ));

    /* progress */
    const progBar = el('div', { class: 'progress' }, el('div', { class: 'progress-bar' }));
    const progLabel = el('div', { class: 'cl-trip-progress-row' }, el('span', {}, 'Trip progress'), el('span', {}, ''));
    body.appendChild(el('div', { class: 'cl-trip-progress' }, progBar, progLabel));

    /* chat */
    body.appendChild(buildRiderChat(b));

    /* workflow action */
    const actionArea = el('div', { class: 'col rd-trip-actions', style: 'gap:9px' });
    body.appendChild(actionArea);

    panel.appendChild(body);
    wrap.appendChild(panel);
    root.appendChild(wrap);

    /* ---- workflow actions ---- */
    function paintActions() {
      clear(actionArea);
      const cur = Bookings.byId(b.id);
      if (!cur) return;
      const navBtn = el('button', { class: 'btn btn--soft btn--lg' },
        el('i', { 'data-lucide': 'navigation' }),
        cur.status === 'in_progress' ? 'Navigate to destination' : 'Navigate to pickup');
      navBtn.addEventListener('click', () => {
        App.navigate('navigation', { restPath: `${cur.id}/${cur.status === 'in_progress' ? 'dropoff' : 'pickup'}` });
      });

      if (['accepted', 'arriving'].includes(cur.status)) {
        const arriveBtn = el('button', { class: 'btn btn--primary btn--lg' },
          el('i', { 'data-lucide': 'map-pin-check' }), "I've arrived at pickup");
        arriveBtn.addEventListener('click', () => {
          Sim.riderStatusAdvance(cur.id, 'arrived');
          Toast.success('Arrival sent', 'Your passenger has been notified that you are waiting.');
          paintActions();
        });
        actionArea.append(arriveBtn, navBtn);
      } else if (cur.status === 'arrived') {
        const startBtn = el('button', { class: 'btn btn--primary btn--lg' },
          el('i', { 'data-lucide': 'play' }), 'Start trip');
        startBtn.addEventListener('click', async () => {
          const ok = await confirmDialog({
            title: 'Start the trip?',
            message: 'Confirm that your passenger has boarded and you are heading to the destination.',
            confirmLabel: 'Start trip', icon: 'play',
          });
          if (!ok) return;
          Sim.riderStatusAdvance(cur.id, 'in_progress');
          Toast.success('Trip started', 'Navigate safely. Complete the trip on arrival.');
          paintActions();
        });
        actionArea.append(navBtn, startBtn);
      } else if (cur.status === 'in_progress') {
        const doneBtn = el('button', { class: 'btn btn--primary btn--lg' },
          el('i', { 'data-lucide': 'flag' }), 'Complete trip');
        doneBtn.addEventListener('click', async () => {
          // Payment step: cash is collected by the driver; e-wallets are charged in-app
          const isCash = cur.payment.method === 'cash';
          const method = METHOD_LABEL[cur.payment.method] || cur.payment.method;
          const ok = await confirmDialog({
            title: isCash ? `Collect ${peso(cur.fare.total)} cash` : `Confirm ${method} payment`,
            message: isCash
              ? `You arrived at ${cur.dropoff.name}. Collect ${peso(cur.fare.total)} in cash from ${cur.passengerName}, then confirm. Your net is ${peso(cur.fare.total * 0.8, { whole: true })} after 20% commission.`
              : `You arrived at ${cur.dropoff.name}. ${cur.passengerName}'s ${method} wallet will be charged ${peso(cur.fare.total)} (simulated). Your net is ${peso(cur.fare.total * 0.8, { whole: true })} after 20% commission.`,
            confirmLabel: isCash ? 'Cash received · complete' : 'Complete trip', icon: isCash ? 'banknote' : 'flag',
          });
          if (!ok) return;
          Sim.riderStatusAdvance(cur.id, 'completed');
          Toast.success('Payment received', `Net ${peso(cur.fare.total * 0.8, { whole: true })} added to today's earnings.`);
          // re-render shows the trip summary, which also opens the passenger rating
          App.navigate('trip', {}, { replace: true });
        });
        actionArea.append(navBtn, doneBtn);
      } else if (cur.status === 'completed') {
        const gross = cur.fare.total;
        const commission = Math.round(gross * 0.2 * 100) / 100;
        const net = Math.round((gross - commission) * 100) / 100;
        const row = (label, value, strong) => el('div', { class: 'row-between', style: 'padding:4px 0' },
          el('span', { class: strong ? 't-strong' : 't-small' }, label),
          el('span', { class: (strong ? 't-strong ' : '') + 't-num' }, value));
        const summary = el('div', { class: 'card card--flat card--inset' },
          el('div', { class: 'row', style: 'gap:8px;margin-bottom:6px' },
            el('i', { 'data-lucide': 'receipt' }), el('span', { class: 't-strong' }, 'Trip summary')),
          row('Payment', `${METHOD_LABEL[cur.payment.method] || cur.payment.method} · paid`),
          row('Distance', `${Number(cur.distanceKm).toFixed(1)} km`),
          row('Fare collected', peso(gross)),
          row('Lakbay commission (20%)', '\u2212' + peso(commission)),
          row('Your earnings', peso(net), true));
        const nextBtn = el('button', { class: 'btn btn--primary btn--lg' }, el('i', { 'data-lucide': 'radar' }), 'Find next ride');
        nextBtn.addEventListener('click', () => {
          Bookings.update(cur.id, { summaryDismissed: true }, { publish: false });
          App.navigate('dashboard');
        });
        const earnBtn = el('button', { class: 'btn btn--outline btn--lg' }, el('i', { 'data-lucide': 'wallet' }), 'Open earnings');
        earnBtn.addEventListener('click', () => App.navigate('earnings'));
        actionArea.append(
          el('div', { class: 'info-banner info-banner--success' },
            el('i', { 'data-lucide': 'circle-check' }),
            el('span', {}, `Trip completed · ${cur.passengerName} dropped off at ${cur.dropoff.name}`)),
          summary, nextBtn, earnBtn);
      }
      Icons.refresh(actionArea);
    }
    paintActions();

    /* ---- map + ticker ---- */
    let approachRoute = null;
    setTimeout(async () => {
      if (!mapWrap.isConnected) return;
      state.map = createMap(mapWrap, { center: [b.pickup.lat, b.pickup.lng], zoom: 14 });
      if (!state.map) return;
      approachRoute = generateRoute(approachOrigin(b.pickup, b.id), b.pickup);
      state._approachRoute = densify(approachRoute, 0.05);
      state.map.setMarker('pickup', b.pickup, 'pickup', { label: 'Pickup' });
      state.map.setMarker('drop', b.dropoff, 'drop', { label: 'Drop-off' });
      state.map.drawRoute(b.route);
      state.map.fitRoute([...b.route, b.pickup, b.dropoff], { pad: [36, 36], maxZoom: 15 });
      tick();
      // Road-accurate upgrade (fails soft to the local path above)
      const [roadTrip, roadApproach] = await Promise.all([
        roadRoute(b.pickup, b.dropoff),
        roadRoute(approachOrigin(b.pickup, b.id), b.pickup),
      ]);
      if (!mapWrap.isConnected || !state.map) return;
      if (roadTrip && roadTrip.length > 1) {
        state._roadTrip = densify(roadTrip, 0.05);
        state.map.drawRoute(state._roadTrip);
        state.map.fitRoute([...state._roadTrip, b.pickup, b.dropoff], { pad: [36, 36], maxZoom: 15 });
      }
      if (roadApproach && roadApproach.length > 1) state._roadApproach = densify(roadApproach, 0.05);
    }, 60);

    function tick() {
      const cur = Bookings.byId(b.id);
      if (!cur) return;
      const now = Date.now();
      const tl = {}; (cur.timeline || []).forEach((t) => { tl[t.status] = t.at; });
      let pos = null;
      let label = 'Trip tracking';

      if (['accepted', 'arriving'].includes(cur.status)) {
        const route = state._roadApproach || state._approachRoute;
        const started = tl.accepted || cur.createdAt;
        const totalMs = Math.max(10000, (cur.pickupEtaSec || 20) * 1000);
        const pct = Math.min(1, (now - started) / totalMs);
        pos = pointAtDistance(route, routeLengthKm(route) * pct);
        label = `Pickup: ${cur.pickup.name}`;
      } else if (cur.status === 'arrived') {
        pos = { lat: cur.pickup.lat, lng: cur.pickup.lng };
        label = 'Waiting at pickup point';
      } else if (cur.status === 'in_progress') {
        const route = state._roadTrip || cur.route;
        const started = tl.in_progress || now;
        const totalMs = Math.max(15000, (cur.tripEtaSec || 35) * 1000);
        const pct = Math.min(1, (now - started) / totalMs);
        pos = pointAtDistance(route, routeLengthKm(route) * pct);
        label = `Drop-off: ${cur.dropoff.name}`;
        const bar = progBar.querySelector('.progress-bar');
        if (bar) { bar.style.width = `${Math.round(pct * 100)}%`; bar.style.background = 'var(--c-primary)'; }
        progLabel.children[1].textContent = `${Math.round(pct * 100)}% · ${cur.distanceKm * (1 - pct) >= 0 ? (cur.distanceKm * (1 - pct)).toFixed(1) : 0} km left`;
      } else if (cur.status === 'completed') {
        pos = { lat: cur.dropoff.lat, lng: cur.dropoff.lng };
        label = 'Trip completed';
        const bar = progBar.querySelector('.progress-bar');
        if (bar) { bar.style.width = '100%'; bar.style.background = 'var(--c-success)'; }
        progLabel.children[1].textContent = '100%';
      }

      if (state.map && pos) state.map.setMarker('vehicle', pos, 'vehicle', { glide: true });
      const etaText = etaChip.querySelector('.grow');
      if (etaText) etaText.textContent = label;

      refreshStatusEl(stPill, cur.status);
    }
    state.ticker = setInterval(tick, 500);

    const unsub = Bus.subscribe('booking:update', ({ booking }) => {
      if (!booking || booking.id !== b.id) return;
      if (['accepted', 'arriving', 'arrived', 'in_progress', 'completed'].includes(booking.status)) paintActions();
    });
    state.unsubs.push(unsub);

    Icons.refresh(root);

    if (b.status === 'completed' && !b.ratingRider) setTimeout(() => offerPassengerRating(b), 900);
  },
  unmount() {
    stopTimers();
    const v = document.querySelector('.app-view');
    if (v) v.classList.remove('app-view--flush');
  },
};

/* ---------- rider chat pane ---------- */
function buildRiderChat(b) {
  const thread = el('div', { class: 'chat-thread cl-chat-thread-cl', role: 'log', 'aria-label': 'Chat with passenger' });
  const input = el('input', { class: 'input', type: 'text', placeholder: 'Type a message…', maxlength: '240', 'aria-label': 'Message' });
  const sendBtn = el('button', { class: 'btn btn--primary', 'aria-label': 'Send message' }, el('i', { 'data-lucide': 'send-horizontal' }));

  function paint() {
    clear(thread);
    const msgs = Msgs.list(b.id);
    if (!msgs.length) {
      thread.appendChild(el('div', { class: 'center t-small', style: 'padding:26px 16px' },
        'No messages yet. Quick replies appear below.'));
    }
    msgs.forEach((m) => {
      const mine = m.from === 'rider';
      thread.appendChild(el('div', { class: `msg ${mine ? 'msg--out' : 'msg--in'}` },
        el('div', { class: 'msg-bubble' },
          el('div', { class: 'msg-text' }, m.text),
          el('div', { class: 'msg-meta' }, new Date(m.at).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' }) + (mine && m.read ? ' · Read' : '')))));
    });
    thread.scrollTop = thread.scrollHeight;
  }
  paint();

  function send(text) {
    const t = String(text || '').trim();
    if (!t) return;
    input.value = '';
    Msgs.append(b.id, { from: 'rider', fromName: 'You', text: t });
    Msgs.markRead(b.id, 'rider');
  }
  sendBtn.addEventListener('click', () => send(input.value));
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(input.value); });

  const quick = el('div', { class: 'chat-quick' });
  QUICK_MSGS_RIDER.forEach((q) => {
    const chip = el('button', { class: 'chip chip--soft', type: 'button' }, q);
    chip.addEventListener('click', () => send(q));
    quick.appendChild(chip);
  });

  const pane = el('div', { class: 'cl-chat-pane' },
    el('div', { class: 'cl-chat-head' },
      el('i', { 'data-lucide': 'message-circle' }),
      'Messages with your passenger'),
    thread, quick,
    el('div', { class: 'cl-chat-compose' }, input, sendBtn));

  const unsub = Bus.subscribe('msg:new', ({ bookingId }) => {
    if (bookingId !== b.id) return;
    paint();
    Msgs.markRead(b.id, 'rider');
  });
  state.unsubs.push(unsub);
  Msgs.markRead(b.id, 'rider');
  return pane;
}

/* ---------- rate passenger ---------- */
let ratingOpenFor = null;
function offerPassengerRating(b) {
  const cur = Bookings.byId(b.id);
  if (!cur || cur.status !== 'completed' || cur.ratingRider) return;
  if (ratingOpenFor === cur.id) return; // already showing for this trip
  ratingOpenFor = cur.id;
  setTimeout(() => { if (ratingOpenFor === cur.id) ratingOpenFor = null; }, 60000);
  let stars = 0;
  const starRow = el('div', { class: 'cl-stars-row' });
  for (let i = 5; i >= 1; i--) {
    const s = el('button', { class: 'cl-star', type: 'button', 'aria-label': `${i} stars` }, el('i', { 'data-lucide': 'star' }));
    s.addEventListener('click', () => {
      stars = i;
      [...starRow.children].forEach((btn, idx) => btn.classList.toggle('is-on', (5 - idx) <= stars));
      hint.textContent = ['Terrible', 'Poor', 'Okay', 'Good', 'Excellent'][stars - 1];
    });
    starRow.appendChild(s);
  }
  const hint = el('p', { class: 't-small center', style: 'margin-top:6px' }, 'Rate your passenger');
  const compWrap = el('div', { class: 'cl-star-set', style: 'margin-top:10px' });
  const picked = new Set();
  ['Punctual', 'Polite', 'Easy pickup', 'Clean'].forEach((c) => {
    const chip = el('button', { class: 'chip chip--soft', type: 'button' }, c);
    chip.addEventListener('click', () => {
      if (picked.has(c)) { picked.delete(c); chip.classList.remove('selected'); }
      else { picked.add(c); chip.classList.add('selected'); }
    });
    compWrap.appendChild(chip);
  });
  Modal.open({
    title: 'Rate your passenger',
    body: el('div', {},
      el('div', { class: 'center', style: 'margin-bottom:8px' },
        el('div', { class: 't-h3' }, `How was ${cur.passengerName.split(' ')[0]}?`),
        el('p', { class: 't-small' }, `${cur.pickup.name} → ${cur.dropoff.name}`)),
      starRow, hint, compWrap),
    dismissible: false,
    actions: [
      { label: 'Skip', variant: 'outline', onClick: (api) => { Bookings.update(cur.id, { ratingRider: { skipped: true } }, { publish: false }); api.close(null); } },
      {
        label: 'Submit', variant: 'primary', icon: 'star',
        onClick: (api) => {
          if (!stars) { Toast.warn('Pick a rating', 'Choose 1 to 5 stars, or Skip.'); return; }
          Bookings.update(cur.id, { ratingRider: { stars, compliments: [...picked] } }, { publish: false });
          api.close(true);
          Toast.success('Thanks!', 'Your passenger rating was recorded.');
        },
      },
    ],
  });
}

/* ==========================================================
   View: navigation
   ========================================================== */
const navigationView = {
  id: 'navigation',
  render(root, { restPath }) {
    const [bookingId, phase] = (restPath || '').split('/');
    const b = Bookings.byId(bookingId);
    if (!b) { App.navigate('trip', {}, { replace: true }); return; }
    const dest = phase === 'dropoff' ? b.dropoff : b.pickup;
    const origin = phase === 'dropoff' ? b.pickup : approachOrigin(b.pickup, b.id);
    let route = phase === 'dropoff' ? b.route : generateRoute(origin, b.pickup);
    App.setHeader('Navigation', `${phase === 'dropoff' ? 'To drop-off' : 'To pickup'} · ${dest.name}`);
    document.querySelector('.app-view').classList.add('app-view--flush');

    const wrap = el('div', { class: 'cl-trip-layout' });
    const mapWrap = el('div', { class: 'cl-trip-map-wrap' });

    const navChip = el('div', { class: 'cl-trip-eta' },
      el('i', { 'data-lucide': 'navigation' }),
      el('span', { class: 'grow' }, 'Calculating route…'),
      el('span', { class: 't-num t-strong' }, ''));
    const banner = el('div', { class: 'cl-trip-banner' }, navChip);
    const fab = el('button', { class: 'map-fab', style: 'position:absolute;top:12px;right:12px;z-index:500', 'aria-label': 'Recenter map' },
      el('i', { 'data-lucide': 'crosshair' }));
    mapWrap.append(banner, fab);
    wrap.appendChild(mapWrap);

    const panel = el('div', { class: 'cl-trip-panel' });
    panel.appendChild(el('div', { class: 'cl-trip-panel-head' },
      el('h3', {}, phase === 'dropoff' ? 'Directions to drop-off' : 'Directions to pickup')));
    const body = el('div', { class: 'cl-trip-panel-body' });
    const stepsBox = el('div', { class: 'card card-pad cl-scroll-y', style: 'max-height:320px' });
    body.appendChild(stepsBox);
    body.appendChild(el('button', { class: 'btn btn--outline btn--lg btn--block' }, el('i', { 'data-lucide': 'arrow-left' }), 'Exit navigation'));
    body.querySelector('button').addEventListener('click', () => App.navigate('trip'));
    panel.appendChild(body);
    wrap.appendChild(panel);
    root.appendChild(wrap);

    /* steps */
    const steps = navSteps(route, dest.name);
    let stepIdx = 0;
    function paintSteps() {
      clear(stepsBox);
      steps.forEach((s, i) => {
        const active = i === stepIdx;
        const done = i < stepIdx;
        stepsBox.appendChild(el('div', {
          class: `row rd-nav-step${active ? ' active' : ''}${done ? ' done' : ''}`,
          style: 'padding:10px 4px;border-bottom:1px solid var(--c-line)',
        },
          el('i', { 'data-lucide': s.icon, style: 'width:18px;height:18px;flex-shrink:0' }),
          el('span', { class: 'grow', style: done ? 'text-decoration:line-through;color:var(--c-ink-4)' : '' }, s.text),
          el('span', { class: 't-xs t-num nowrap' }, s.km >= 0.1 ? s.km.toFixed(1) + ' km' : 'now')));
      });
      Icons.refresh(stepsBox);
    }
    paintSteps();

    setTimeout(() => {
      if (!mapWrap.isConnected) return;
      state.map = createMap(mapWrap, { center: [origin.lat, origin.lng], zoom: 15 });
      if (!state.map) return;
      state.map.setMarker('me', origin, 'vehicle');
      state.map.setMarker('dest', dest, 'drop', { label: dest.name });
      state.map.drawRoute(route);
      state.map.fitRoute([...route, dest], { pad: [40, 40], maxZoom: 16 });
      fab.addEventListener('click', () => { const p = pointAtDistance(route, routeLengthKm(route) * progress()); state.map.setView(p, 16); });

      const totalKm = routeLengthKm(route);
      const startedAt = Date.now();
      const totalMs = 20000; // compressed simulated drive
      function progress() { return Math.min(1, (Date.now() - startedAt) / totalMs); }

      state.ticker = setInterval(() => {
        const pct = progress();
        const p = pointAtDistance(route, totalKm * pct);
        if (state.map) state.map.setMarker('me', p, 'vehicle', { glide: true });
        const remainKm = Math.max(0, totalKm * (1 - pct));
        const remainMin = Math.max(1, Math.round((remainKm / Math.max(1, totalKm)) * (b.durationMin || 12)));
        navChip.querySelector('.grow').textContent = pct >= 1
          ? 'You have arrived'
          : `${dest.name}`;
        navChip.querySelector('.t-num').textContent = pct >= 1 ? 'Arrived' : `${remainKm.toFixed(1)} km · ${remainMin} min`;
        const targetStep = Math.min(steps.length - 1, Math.floor(pct * steps.length));
        if (targetStep !== stepIdx) { stepIdx = targetStep; paintSteps(); }
        if (pct >= 1) { clearInterval(state.ticker); state.ticker = null; }
      }, 400);

      // Swap in the road-accurate polyline once the routing service answers
      roadRoute(origin, dest).then((road) => {
        if (!mapWrap.isConnected || !state.map || !road || road.length < 2) return;
        route = densify(road, 0.05);
        state.map.drawRoute(route);
        state.map.fitRoute([...route, dest], { pad: [40, 40], maxZoom: 16 });
      });
    }, 60);

    Icons.refresh(root);
  },
  unmount() {
    stopTimers();
    const v = document.querySelector('.app-view');
    if (v) v.classList.remove('app-view--flush');
  },
};

export { tripView, navigationView };
