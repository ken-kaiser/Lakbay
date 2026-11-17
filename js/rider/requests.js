/* ==========================================================================
   Lakbay — Incoming ride request manager (rider side)
   Listens for searching bookings, shows a countdown request card, and
   handles accept / decline / expiry. Also generates simulated requests
   so the rider flow is testable without a passenger tab.
   ========================================================================== */
import { Bookings, Notifs, Prefs, Users } from '../storage.js';
import { Sim } from '../shared/sim.js';
import {
  DEMO_PASSENGERS, RIDE_CATEGORIES, getPlace, generateRoute, routeLengthKm,
  estimateDurationMin, estimateFare, PLACES, nearbyPlaces, haversineKm, formatDistanceKm, riderShare,
} from '../data.js';
import { getLastLocation } from '../shared/geo.js';
import { el, qs } from '../shared/dom.js';
import { Icons } from '../shared/icons.js';
import { Modal } from '../shared/modal.js';
import { Toast } from '../shared/toast.js';
import { peso } from '../shared/format.js';
import { avatarElLite } from '../shared/ui-lite.js';
import { prefersReducedMotion } from '../shared/motion.js';

const ACCEPT_WINDOW_SEC = 15;

const RequestManager = {
  cfg: null,
  _modal: null,
  _timer: null,
  _countdown: null,
  _seen: new Set(),
  _online: false,

  init(cfg) { this.cfg = cfg; },
  setOnline(v) { this._online = !!v; },

  hasActiveTrip(userId) {
    return Bookings.activeFor(userId, 'rider').filter((b) => b.riderId === userId).length > 0;
  },

  /* Called for every searching booking seen while online.
     Test requests the rider created themselves bypass the online check. */
  consider(booking) {
    if (!this.cfg || this._modal) return;
    if (!this._online && !(booking && booking.testRequest)) return;
    if (!booking || booking.status !== 'searching' || booking.riderId) return;
    if (this._seen.has(booking.id)) return;
    if (this.hasActiveTrip(this.cfg.getUser().id)) return;
    const me = Users.byId(this.cfg.getUser().id);
    if (!me || !me.vehicle) return;
    this._seen.add(booking.id);

    beepAlert();
    if (navigator.vibrate) { try { navigator.vibrate([120, 60, 120]); } catch (e) { /* noop */ } }
    this.showRequest(booking, me);
  },

  /* ---------- request card ---------- */
  showRequest(booking, me) {
    const cat = RIDE_CATEGORIES.find((c) => c.id === booking.category);
    const match = me.vehicle && me.vehicle.categoryIds && me.vehicle.categoryIds.includes(booking.category);
    const { net } = riderShare(booking.fare.total);

    let secondsLeft = ACCEPT_WINDOW_SEC;
    /* expiry: a draining bar + seconds (the interval below updates both) */
    const ring = el('div', { class: 'rd-expiry', style: '--p:100' },
      el('span', { class: 'rd-expiry-bar', 'aria-hidden': 'true' }),
      el('span', { class: 'rd-expiry-txt' }, 'Expires in ', el('span', { class: 'rd-count-num t-num' }, String(ACCEPT_WINDOW_SEC)), 's'));

    const here = getLastLocation();
    const pickupKm = here ? haversineKm(here, booking.pickup) : null;
    const payLabel = booking.payment.method === 'cash' ? 'Cash' : booking.payment.method === 'gcash' ? 'GCash' : 'Maya';

    const body = el('div', { class: 'rd-req' });
    if (!prefersReducedMotion()) body.classList.add('rd-request-enter');
    body.appendChild(ring);

    /* the money, first and largest */
    body.appendChild(el('div', { class: 'rd-req-fare' },
      el('span', { class: 'rd-req-net t-num' }, peso(net, { whole: true })),
      // what the rider takes home from THIS trip, next to what the passenger pays
      el('span', { class: 'rd-req-net-sub' }, `You earn on this trip · passenger pays ${peso(booking.fare.total, { whole: true })} by ${payLabel}`)));

    /* the three numbers that decide a request */
    body.appendChild(el('dl', { class: 'rd-req-facts' },
      el('div', {}, el('dt', {}, 'Pickup'), el('dd', { class: 't-num' }, pickupKm != null ? `${formatDistanceKm(pickupKm)} away` : 'Nearby')),
      el('div', {}, el('dt', {}, 'Trip'), el('dd', { class: 't-num' }, `${booking.distanceKm.toFixed(1)} km · ${booking.durationMin} min`)),
      el('div', {}, el('dt', {}, 'Ride'), el('dd', {}, cat ? cat.name.replace('Lakbay ', '') : booking.category))));

    /* route */
    body.appendChild(el('div', { class: 'rd-req-route' },
      el('div', { class: 'route-line-item' },
        el('span', { class: 'rl-dot' }), el('div', { class: 'grow' },
          el('span', { class: 'rl-value clamp-1' }, booking.pickup.name),
          booking.pickup.address ? el('span', { class: 'rl-sub clamp-1' }, booking.pickup.address) : null)),
      el('div', { class: 'route-line-item' },
        el('span', { class: 'rl-dot rl-dot--end' }), el('div', { class: 'grow' },
          el('span', { class: 'rl-value clamp-1' }, booking.dropoff.name),
          booking.dropoff.address ? el('span', { class: 'rl-sub clamp-1' }, booking.dropoff.address) : null))));

    /* passenger */
    body.appendChild(el('div', { class: 'rd-req-pax' },
      avatarElLite({ name: booking.passengerName, avatar: booking.passengerAvatar }, ''),
      el('div', { class: 'grow' },
        el('div', { class: 't-strong' }, booking.passengerName),
        el('div', { class: 't-small t-num' }, `★ ${Number(booking.passengerRating || 5).toFixed(2)} passenger rating`))));

    if (!match) body.appendChild(el('span', { class: 'flag-note flag-note--warn' }, el('i', { 'data-lucide': 'triangle-alert' }), 'Outside your vehicle type'));
    if (booking.pickup.instructions) {
      body.appendChild(el('p', { class: 'rd-req-note' }, el('strong', {}, 'Note: '), booking.pickup.instructions));
    }

    /* actions */
    const acceptBtn = el('button', { class: 'btn btn--primary btn--lg', style: 'flex:2' }, el('i', { 'data-lucide': 'check' }), 'Accept');
    const declineBtn = el('button', { class: 'btn btn--outline btn--lg' }, 'Decline');

    const modal = Modal.open({
      title: 'New ride request',
      body,
      dismissible: false,
      actions: [],
      onClose: () => { clearInterval(this._countdown); this._modal = null; },
    });
    this._modal = modal;

    const foot = modal.root.querySelector('.modal-foot') || modal.root.appendChild(el('div', { class: 'modal-foot' }));
    foot.append(declineBtn, acceptBtn);
    Icons.refresh(modal.root);

    const finish = () => { clearInterval(this._countdown); };
    const onExpire = () => {
      finish();
      if (this._modal) modal.close('expired');
      Toast.warn('Request expired', 'The request window elapsed and moved to other nearby riders.');
      this._log('missed', booking);
      if (booking.testRequest && Bookings.byId(booking.id) && Bookings.byId(booking.id).status === 'searching') {
        Bookings.update(booking.id, { status: 'expired' }, { publish: false, expect: ['searching'] });
      }
    };

    this._countdown = setInterval(() => {
      secondsLeft -= 1;
      const num = ring.querySelector('.rd-count-num');
      if (num) num.textContent = String(Math.max(0, secondsLeft));
      ring.style.setProperty('--p', String(Math.max(0, (secondsLeft / ACCEPT_WINDOW_SEC) * 100)));
      if (secondsLeft <= 0) onExpire();
    }, 1000);

    declineBtn.addEventListener('click', () => {
      finish();
      modal.close('declined');
      Sim.declineRequest(booking, me.id);
      Toast.info('Request declined', 'The booking moved back to the passenger pool.');
    });

    acceptBtn.addEventListener('click', () => {
      const cur = Bookings.byId(booking.id);
      // acceptRequest is a compare-and-set on the stored booking: it returns
      // null if another rider (or the passenger's cancel) got there first
      const updated = cur && !this.hasActiveTrip(me.id) ? Sim.acceptRequest(cur, me) : null;
      finish();
      if (!updated) {
        modal.close('gone');
        Toast.error('No longer available', 'This request was taken or cancelled.');
        return;
      }
      modal.close('accepted');
      Notifs.push({
        userId: me.id, role: 'rider',
        title: 'Ride accepted',
        body: `Head to ${updated.pickup.name} — ${updated.passengerName} is waiting.`,
        icon: 'navigation', tone: 'primary',
      });
      this.cfg.onAccepted(updated);
    });
  },

  _log(type, booking) {
    const me = this.cfg.getUser();
    const { RiderActions } = importedRiderActions();
    const log = RiderActions.log(me.id);
    log.unshift({ type, bookingId: booking.id, at: Date.now() });
    if (log.length > 200) log.length = 200;
    Prefs.set(me.id, 'riderActions', log);
  },

  /* ---------- test request generator (engine-internal) ---------- */
  /* opts.pickup / opts.dropoff / opts.passenger: build the request from a
     specific waiting passenger the rider tapped on the demand map. */
  createTestRequest(me, opts = {}) {
    if (this.hasActiveTrip(me.id)) {
      Toast.warn('You have an active trip', 'Finish your current ride before receiving new requests.');
      return null;
    }
    if (this._modal) {
      Toast.info('Request already open', 'Accept or decline the current request first.');
      return null;
    }
    // Test requests happen around the rider's real location. The built-in
    // places are Metro Cebu only, so elsewhere (e.g. Davao) we generate
    // pickup/drop-off points a short drive from the rider instead.
    const here = getLastLocation();
    const localPool = here ? nearbyPlaces(here, 20, 20).filter((p) => p.category !== 'airport') : [];
    let a, b;
    if (localPool.length >= 2 || !here) {
      const fromPool = localPool.length >= 2 ? localPool : PLACES.filter((p) => p.category !== 'airport');
      a = fromPool[Math.floor(Math.random() * fromPool.length)];
      b = fromPool[Math.floor(Math.random() * fromPool.length)];
      if (b.id === a.id) b = fromPool[(fromPool.indexOf(a) + 1) % fromPool.length];
    } else {
      const spot = (minKm, maxKm, label) => {
        const ang = Math.random() * Math.PI * 2;
        const km = minKm + Math.random() * (maxKm - minKm);
        return {
          id: null, name: label, address: here.city ? `Near ${here.city}` : 'Near your area',
          lat: here.lat + (Math.sin(ang) * km) / 111.32,
          lng: here.lng + (Math.cos(ang) * km) / (111.32 * Math.cos(here.lat * Math.PI / 180)),
        };
      };
      a = spot(0.5, 2, 'Passenger pickup');
      b = spot(3, 8, 'Passenger drop-off');
    }
    if (opts.pickup) a = opts.pickup;
    if (opts.dropoff) b = opts.dropoff;
    const catIds = (me.vehicle && me.vehicle.categoryIds && me.vehicle.categoryIds.length) ? me.vehicle.categoryIds : ['car'];
    const cat = RIDE_CATEGORIES.find((c) => c.id === catIds[0]) || RIDE_CATEGORIES[1];
    const pax = opts.passenger || DEMO_PASSENGERS[Math.floor(Math.random() * DEMO_PASSENGERS.length)];
    const route = generateRoute(a, b);
    const km = Math.round(routeLengthKm(route) * 10) / 10;
    const mins = estimateDurationMin(km);
    const now = Date.now();
    const booking = {
      id: 'b_' + now.toString(36) + Math.random().toString(36).slice(2, 7),
      ref: 'LB-' + new Date(now).toISOString().slice(0, 10).replace(/-/g, '') + '-' + Math.floor(1000 + Math.random() * 9000),
      passengerId: pax.id, passengerName: pax.name, passengerPhone: pax.phone,
      passengerAvatar: pax.avatar, passengerRating: pax.rating,
      riderId: null, rider: null, riderSource: null,
      category: cat.id,
      pickup: { placeId: a.id || null, name: a.name, address: a.address, lat: a.lat, lng: a.lng, instructions: ['Wait at the guard house, Gate 2', 'Beside the coffee shop entrance', 'North wing passenger pickup', ''][Math.floor(Math.random() * 4)] },
      dropoff: { placeId: b.id || null, name: b.name, address: b.address, lat: b.lat, lng: b.lng, instructions: '' },
      distanceKm: km, durationMin: mins, route,
      fare: estimateFare(cat.id, km, mins),
      payment: { method: ['cash', 'gcash', 'maya'][Math.floor(Math.random() * 3)], status: 'pending' },
      status: 'searching',
      timeline: [{ status: 'searching', at: now, by: 'simulation' }],
      pickupEtaSec: 0, tripEtaSec: 0,
      createdAt: now, scheduledFor: null,
      messages: [], rating: null, receipt: null,
      testRequest: true,
    };
    Bookings.create(booking);
    // auto-expire the simulated request if ignored
    setTimeout(() => {
      const cur = Bookings.byId(booking.id);
      if (cur && cur.status === 'searching' && !cur.riderId) {
        Bookings.update(booking.id, { status: 'expired' }, { publish: false, expect: ['searching'] });
      }
    }, (ACCEPT_WINDOW_SEC + 6) * 1000);
    this.consider(booking);
    return booking;
  },
};

function importedRiderActions() {
  // storage.js RiderActions (kept local to avoid another import cycle at module top)
  return { RiderActions: {
    log: (uid) => Prefs.get(uid, 'riderActions', []),
  } };
}

/* ---------- alert sound (respects the rider's sound preference) ---------- */
let audioCtx = null;
function beepAlert() {
  try {
    const uid = (window.__lakbay && window.__lakbay.rider && window.__lakbay.rider.App && window.__lakbay.rider.App.user) ? window.__lakbay.rider.App.user.id : null;
    if (uid && Prefs.get(uid, 'notify', { sound: true }).sound === false) return;
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const t0 = audioCtx.currentTime;
    const notes = [[880, 0], [1174.7, 0.16]];
    notes.forEach(([freq, dt]) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine'; osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.001, t0 + dt);
      gain.gain.exponentialRampToValueAtTime(0.12, t0 + dt + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + 0.3);
      osc.connect(gain); gain.connect(audioCtx.destination);
      osc.start(t0 + dt); osc.stop(t0 + dt + 0.32);
    });
  } catch (e) { /* autoplay restrictions — silent fallback */ }
}

export { RequestManager, beepAlert };
