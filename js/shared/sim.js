/* ==========================================================================
   Lakbay — Ride simulation engine
   Drives the booking lifecycle locally so every user journey is testable
   from a single browser. If a real rider (another tab) accepts a booking,
   the automatic simulator stands down and the rider tab drives transitions.

   All movement is a local, time-based simulation compressed for demo
   purposes. It is clearly labeled in the UI and never presented as real
   GPS tracking.
   ========================================================================== */
import { Bookings, Bus, Notifs, Msgs, Session, Prefs } from '../storage.js';
import { DEMO_DRIVERS, DEMO_PASSENGERS, simChatReply, simGreeting, generateRoute, haversineKm, pointAtDistance, routeLengthKm, PLACES, riderShare } from '../data.js';

const rand = (min, max) => min + Math.random() * (max - min);
const randInt = (min, max) => Math.round(rand(min, max));

const timers = new Map(); // bookingId -> [timeoutIds]

function setTimers(id, list) { timers.set(id, list); }
function clearTimers(id) {
  (timers.get(id) || []).forEach((t) => clearTimeout(t));
  timers.delete(id);
}

/* ---------- Passenger side: begin matching ---------- */
export function beginSearch(booking) {
  clearTimers(booking.id);
  const pending = [];

  const t1 = setTimeout(() => {
    const cur = Bookings.byId(booking.id);
    if (!cur || cur.status !== 'searching') return; // a live rider took it
    // Pick the nearest demo driver that serves the category
    const pool = DEMO_DRIVERS.filter((d) => d.vehicle.categoryIds.includes(cur.category));
    const sorted = pool.map((d) => {
      const home = PLACES[(d.id.length * 7 + d.name.length) % PLACES.length];
      return { d, dist: haversineKm(cur.pickup, home) };
    }).sort((a, b) => a.dist - b.dist);
    const chosen = sorted[0] ? sorted[0].d : pool[0] || DEMO_DRIVERS[0];
    assignSimDriver(cur.id, chosen);
  }, randInt(7000, 13000));
  pending.push(t1);
  setTimers(booking.id, pending);
  return booking;
}

function assignSimDriver(bookingId, driver) {
  const b = Bookings.byId(bookingId);
  if (!b || b.status !== 'searching') return;
  const eta = randInt(14, 22); // seconds of simulated approach
  const assigned = Bookings.update(bookingId, {
    status: 'accepted',
    riderId: driver.id,
    riderSource: 'simulation',
    rider: { id: driver.id, name: driver.name, phone: driver.phone, rating: driver.rating, avatar: driver.avatar, vehicle: driver.vehicle, trips: driver.trips },
    pickupEtaSec: eta,
    tripEtaSec: Math.max(22, Math.round((b.durationMin / 60) * 60 * 0.22)), // compressed trip
  }, { by: 'simulation', expect: ['searching'] });
  if (!assigned) return; // a live rider took it (or it was cancelled) first

  Notifs.push({
    userId: b.passengerId, role: 'passenger',
    title: `${driver.firstName} accepted your ride`,
    body: `${driver.vehicle.model} · ${driver.vehicle.plate} is arriving in about ${eta}s.`,
    icon: 'check-circle-2', tone: 'success',
  });

  const pending = timers.get(bookingId) || [];
  // sim driver sends a greeting
  const tMsg = setTimeout(() => {
    const cur = Bookings.byId(bookingId);
    if (!cur || cur.status === 'completed' || cur.status === 'cancelled') return;
    Msgs.append(bookingId, { from: 'rider', fromName: driver.firstName, text: simGreeting(cur) });
  }, 2500);
  pending.push(tMsg);

  // arriving -> arrived
  const tArrived = setTimeout(() => {
    const cur = Bookings.byId(bookingId);
    if (!cur || !['accepted', 'arriving'].includes(cur.status)) return;
    Bookings.update(bookingId, { status: 'arrived' }, { by: 'simulation' });
    Notifs.push({
      userId: cur.passengerId, role: 'passenger',
      title: `${driver.firstName} has arrived`,
      body: `Look for the ${cur.rider.vehicle.color} ${cur.rider.vehicle.model}, plate ${cur.rider.vehicle.plate}.`,
      icon: 'map-pin-check', tone: 'primary',
    });
    const pending2 = timers.get(bookingId) || [];
    // auto board after a short pause
    const tStart = setTimeout(() => {
      const c2 = Bookings.byId(bookingId);
      if (!c2 || !['arrived'].includes(c2.status)) return;
      Bookings.update(bookingId, { status: 'in_progress' }, { by: 'simulation' });
      Notifs.push({
        userId: c2.passengerId, role: 'passenger',
        title: 'Trip started',
        body: `Sit back and relax — heading to ${c2.dropoff.name}.`,
        icon: 'route', tone: 'primary',
      });
      scheduleCompletion(bookingId, driver);
    }, randInt(8000, 12000));
    pending2.push(tStart);
    setTimers(bookingId, pending2);
  }, eta * 1000);
  pending.push(tArrived);
  setTimers(bookingId, pending);
}

function scheduleCompletion(bookingId, driver) {
  const b = Bookings.byId(bookingId);
  if (!b) return;
  const tripSec = Math.max(20, Math.min(55, Math.round((b.distanceKm * 3.2) + 18)));
  const pending = timers.get(bookingId) || [];
  const tDone = setTimeout(() => {
    const cur = Bookings.byId(bookingId);
    if (!cur || cur.status !== 'in_progress') return;
    completeTrip(cur.id, { by: 'simulation' });
  }, tripSec * 1000);
  pending.push(tDone);
  setTimers(bookingId, pending);
}

/* Finalizes a completed trip: receipt, payment, notifications. */
export function completeTrip(bookingId, { by = 'rider' } = {}) {
  const b = Bookings.byId(bookingId);
  if (!b || b.status !== 'in_progress') return null; // only a started trip can be completed (and paid) — once
  const paidNow = Date.now();
  const methodLabel = { cash: 'Cash', gcash: 'GCash', maya: 'Maya' }[b.payment.method] || b.payment.method;
  const updated = Bookings.update(bookingId, {
    status: 'completed',
    payment: { ...b.payment, status: 'paid' },
    receipt: {
      paidAt: paidNow,
      method: methodLabel,
      breakdown: { ...b.fare },
      distanceKm: b.distanceKm,
      durationMin: b.durationMin,
      ref: b.ref,
    },
  }, { by, expect: ['in_progress'] });
  if (!updated) return null;

  clearTimers(bookingId);

  Notifs.push({
    userId: updated.passengerId, role: 'passenger',
    title: 'Trip completed',
    body: `You arrived at ${updated.dropoff.name}. Total fare ₱${updated.fare.total}. Rate your rider.`,
    icon: 'circle-check', tone: 'success', topic: 'rate', data: { bookingId },
  });
  if (updated.riderId) {
    Notifs.push({
      userId: updated.riderId, role: 'rider',
      title: 'Trip completed',
      body: `Fare ₱${updated.fare.total} · net earnings ₱${riderShare(updated.fare.total).net}.`,
      icon: 'circle-check', tone: 'success',
    });
  }

  // Update demo driver/passenger stats if applicable
  if (updated.riderSource === 'simulation') {
    const driver = DEMO_DRIVERS.find((d) => d.id === updated.riderId);
    if (driver) driver.trips += 1;
  }
  Bus.publish('trip:completed', { bookingId, booking: updated });
  return updated;
}

/* ---------- Rider side: accept / decline a live request ---------- */
export function acceptRequest(booking, riderProfile) {
  clearTimers(booking.id); // sim stands down
  const eta = randInt(18, 28);
  const updated = Bookings.update(booking.id, {
    status: 'accepted',
    riderId: riderProfile.id,
    riderSource: 'live',
    rider: {
      id: riderProfile.id, name: `${riderProfile.firstName} ${riderProfile.lastName}`.trim(),
      phone: riderProfile.phone, rating: riderProfile.rating || 5,
      avatar: riderProfile.avatar || null,
      vehicle: riderProfile.vehicle, trips: riderProfile.trips || 0,
    },
    pickupEtaSec: eta,
    tripEtaSec: Math.max(24, Math.round((booking.durationMin / 60) * 60 * 0.24)),
  }, { by: 'rider', expect: ['searching'] });
  if (!updated) return null; // someone else got it first, or the passenger cancelled

  Notifs.push({
    userId: updated.passengerId, role: 'passenger',
    title: `${updated.rider.name} accepted your ride`,
    body: `${updated.rider.vehicle.model} · ${updated.rider.vehicle.plate}`,
    icon: 'check-circle-2', tone: 'success',
  });
  return updated;
}

export function declineRequest(booking, riderId) {
  RiderLogDecline(booking.id, riderId);
  Notifs.push({
    userId: riderId, role: 'rider',
    title: 'Request declined',
    body: `${booking.pickup.name} → ${booking.dropoff.name}`,
    icon: 'circle-x', tone: 'neutral',
  });
}

function RiderLogDecline(bookingId, riderId) {
  const log = Prefs.get(riderId, 'riderActions', []);
  log.unshift({ type: 'declined', bookingId, at: Date.now() });
  if (log.length > 200) log.length = 200;
  Prefs.set(riderId, 'riderActions', log);
}

/* ---------- Rider-driven status transitions ---------- */
export function riderStatusAdvance(bookingId, nextStatus) {
  const b = Bookings.byId(bookingId);
  if (!b) return null;
  // completeTrip sets the status itself (plus payment + receipt). Setting
  // 'completed' first made it exit early, so rider-completed trips were
  // never marked paid and had no receipt.
  if (nextStatus === 'completed') return completeTrip(bookingId, { by: 'rider' });
  const updated = Bookings.update(bookingId, { status: nextStatus }, { by: 'rider' });
  if (!updated) return null; // not a valid next step (e.g. the passenger cancelled meanwhile)

  const notes = {
    arriving: { title: 'Rider is on the way', body: `${b.rider ? b.rider.name : 'Your rider'} is heading to your pickup point.`, icon: 'navigation' },
    arrived: { title: 'Your rider has arrived', body: `Meet ${b.rider ? b.rider.name : 'your rider'} at ${b.pickup.name}.`, icon: 'map-pin-check', tone: 'primary' },
    in_progress: { title: 'Trip started', body: `Heading to ${b.dropoff.name}. Enjoy the ride.`, icon: 'route' },
  };
  const n = notes[nextStatus];
  if (n) {
    Notifs.push({ userId: b.passengerId, role: 'passenger', tone: n.tone || 'primary', ...n });
  }

  if (nextStatus === 'in_progress') {
    // passenger auto-message confirmation
    setTimeout(() => {
      const cur = Bookings.byId(bookingId);
      if (cur && cur.status === 'in_progress' && cur.riderSource === 'live') return; // real chat
    }, 1000);
  }
  return updated;
}

/* ---------- Passenger actions ---------- */
export function passengerCancel(bookingId, reason = '') {
  const b = Bookings.byId(bookingId);
  if (!b) return null;
  // refused once the trip has started or finished (see BOOKING_TRANSITIONS)
  const updated = Bookings.update(bookingId, { status: 'cancelled' }, { by: 'passenger' });
  if (!updated) return null;
  clearTimers(bookingId);
  if (b.riderId) {
    Notifs.push({
      userId: b.riderId, role: 'rider',
      title: 'Ride cancelled by passenger',
      body: `${b.pickup.name} → ${b.dropoff.name}${reason ? ' · ' + reason : ''}`,
      icon: 'circle-x', tone: 'danger',
    });
  }
  return updated;
}

/* ---------- Chat simulation fallbacks ---------- */
Bus.subscribe('msg:new', ({ bookingId, msg }) => {
  const b = Bookings.byId(bookingId);
  if (!b) return;
  const session = Session.get();
  // If the passenger (this user) messaged a SIM driver, auto-reply
  // (a real person answers what was asked, so every message gets a reply)
  if (msg.from === 'passenger' && b.riderSource === 'simulation' && session && session.userId === b.passengerId) {
    const driver = DEMO_DRIVERS.find((d) => d.id === b.riderId);
    setTimeout(() => {
      const cur = Bookings.byId(bookingId);
      if (!cur || cur.status === 'cancelled') return;
      Msgs.append(bookingId, { from: 'rider', fromName: driver ? driver.firstName : 'Rider', text: simChatReply('passenger', msg.text, cur) });
    }, randInt(1800, 3600));
  }
  // If a rider (this user) messaged a SIM passenger, auto-reply
  if (msg.from === 'rider' && session && session.userId === b.riderId) {
    setTimeout(() => {
      const cur = Bookings.byId(bookingId);
      if (!cur || cur.status === 'cancelled') return;
      Msgs.append(bookingId, { from: 'passenger', fromName: cur.passengerName.split(' ')[0], text: simChatReply('rider', msg.text, cur) });
    }, randInt(2000, 4200));
  }
});

export function cleanupBookingTimers(bookingId) { clearTimers(bookingId); }

/* ---------- Resume interrupted simulations ----------
   A page reload destroys the pending setTimeout chains that drive simulated
   rides, which would strand bookings in accepted/arriving/in_progress forever.
   Called once at app boot: any simulation-owned booking gets its remaining
   timeline rescheduled from the stored timestamps. */
export function resumeSimTrips(user = null) {
  // A ride still `searching` has no rider yet (riderSource is null), so it is
  // matched on status + owner instead: only the passenger's own tab restarts
  // the search, and rider-created test requests are never auto-assigned.
  const me = user && user.role === 'passenger' ? user.id : null;
  const simActive = Bookings.all().filter((b) =>
    (b.status === 'searching' && !b.riderId && !b.testRequest && b.passengerId === me)
    || (b.riderSource === 'simulation' && ['accepted', 'arriving', 'in_progress'].includes(b.status)));
  simActive.forEach((b) => {
    clearTimers(b.id);
    if (b.status === 'searching') {
      // Restart the matching countdown (picks up where beginSearch left off)
      const t = setTimeout(() => {
        const cur = Bookings.byId(b.id);
        if (!cur || cur.status !== 'searching') return;
        const pool = DEMO_DRIVERS.filter((d) => d.vehicle.categoryIds.includes(cur.category));
        const sorted = pool.map((d) => {
          const home = PLACES[(d.id.length * 7 + d.name.length) % PLACES.length];
          return { d, dist: haversineKm(cur.pickup, home) };
        }).sort((x, y) => x.dist - y.dist);
        assignSimDriver(cur.id, sorted[0] ? sorted[0].d : pool[0] || DEMO_DRIVERS[0]);
      }, randInt(4000, 8000));
      setTimers(b.id, [t]);
      return;
    }
    const tl = {};
    (b.timeline || []).forEach((t) => { tl[t.status] = t.at; });
    const driver = DEMO_DRIVERS.find((d) => d.id === b.riderId) || DEMO_DRIVERS[0];

    if (b.status === 'accepted' || b.status === 'arriving') {
      const started = tl.accepted || b.createdAt;
      const totalMs = Math.max(8000, (b.pickupEtaSec || 18) * 1000);
      const remain = Math.max(1500, totalMs - (Date.now() - started));
      const t = setTimeout(() => {
        const cur = Bookings.byId(b.id);
        if (!cur || !['accepted', 'arriving'].includes(cur.status)) return;
        Bookings.update(cur.id, { status: 'arrived' }, { by: 'simulation' });
        Notifs.push({
          userId: cur.passengerId, role: 'passenger',
          title: `${driver.firstName} has arrived`,
          body: `Look for the ${cur.rider.vehicle.color} ${cur.rider.vehicle.model}, plate ${cur.rider.vehicle.plate}.`,
          icon: 'map-pin-check', tone: 'primary',
        });
        const t2 = setTimeout(() => {
          const c2 = Bookings.byId(cur.id);
          if (!c2 || c2.status !== 'arrived') return;
          Bookings.update(c2.id, { status: 'in_progress' }, { by: 'simulation' });
          Notifs.push({
            userId: c2.passengerId, role: 'passenger',
            title: 'Trip started', body: `Sit back and relax — heading to ${c2.dropoff.name}.`,
            icon: 'route', tone: 'primary',
          });
          scheduleCompletion(c2.id, driver);
        }, randInt(8000, 12000));
        setTimers(cur.id, [t2]);
      }, remain);
      setTimers(b.id, [t]);
      return;
    }

    if (b.status === 'in_progress') {
      const started = tl.in_progress || Date.now();
      const totalMs = Math.max(20000, (b.tripEtaSec || 35) * 1000);
      const remain = Math.max(3000, totalMs - (Date.now() - started));
      const t = setTimeout(() => {
        const cur = Bookings.byId(b.id);
        if (!cur || cur.status !== 'in_progress') return;
        completeTrip(cur.id, { by: 'simulation' });
      }, remain);
      setTimers(b.id, [t]);
    }
  });
  return simActive.length;
}

/* Aggregate facade — views import `Sim` for a single stable surface */
export const Sim = {
  beginSearch,
  completeTrip,
  acceptRequest,
  declineRequest,
  riderStatusAdvance,
  passengerCancel,
  cleanup: cleanupBookingTimers,
  resume: resumeSimTrips,
};
