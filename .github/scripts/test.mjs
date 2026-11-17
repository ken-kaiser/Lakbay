// Regression tests for the booking core (storage, lifecycle, money, bus).
// No dependencies: runs the real modules in Node against a tiny in-memory
// stand-in for the browser's localStorage. Usage: node .github/scripts/test.mjs
import assert from 'node:assert/strict';

// ---- minimal browser shims (set before the modules load) ----
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => { mem.set(k, String(v)); },
  removeItem: (k) => { mem.delete(k); },
  key: (i) => [...mem.keys()][i] ?? null,
  get length() { return mem.size; },
};
globalThis.window = globalThis;
if (typeof globalThis.addEventListener !== 'function') globalThis.addEventListener = () => {};
// Two "tabs" share one channel name: everything posted is delivered back, which
// is exactly the duplicate-delivery case the bus has to survive.
const channels = [];
globalThis.BroadcastChannel = class {
  constructor() { this.onmessage = null; channels.push(this); }
  postMessage(data) { channels.forEach((c) => c.onmessage && c.onmessage({ data })); }
};

const { Bookings, Bus, Store, BOOKING_TRANSITIONS } = await import('../../js/storage.js');
const { riderShare, estimateFare, quickReplies, simChatReply, simGreeting } = await import('../../js/data.js');
const { Sim } = await import('../../js/shared/sim.js');

let n = 0;
const results = [];
function test(name, fn) {
  try { fn(); results.push(['ok', name]); } catch (e) { results.push(['FAIL', name, e.message]); }
}
function booking(patch = {}) {
  n += 1;
  return Bookings.create({
    id: 'b' + n, ref: 'LB-T-' + n, passengerId: 'pax', passengerName: 'Pat Test', riderId: null, rider: null, riderSource: null,
    category: 'car', pickup: { name: 'A', lat: 10.31, lng: 123.9 }, dropoff: { name: 'B', lat: 10.33, lng: 123.91 },
    distanceKm: 3, durationMin: 14, route: [{ lat: 10.31, lng: 123.9 }, { lat: 10.33, lng: 123.91 }],
    fare: estimateFare('car', 3, 14), payment: { method: 'gcash', status: 'pending' },
    status: 'searching', timeline: [], createdAt: Date.now(), messages: [], rating: null, receipt: null,
    ...patch,
  });
}
const rider = (id) => ({ id, firstName: 'R', lastName: id, phone: '', rating: 5, vehicle: { model: 'Vios', plate: 'X', categoryIds: ['car'] } });
const quiet = (fn) => { const w = console.warn; console.warn = () => {}; try { return fn(); } finally { console.warn = w; } };

// ---------- lifecycle ----------
test('happy path: searching → accepted → arrived → in_progress → completed', () => {
  const b = booking();
  assert.ok(Sim.acceptRequest(b, rider('r1')));
  assert.ok(Sim.riderStatusAdvance(b.id, 'arrived'));
  assert.ok(Sim.riderStatusAdvance(b.id, 'in_progress'));
  const done = Sim.riderStatusAdvance(b.id, 'completed');
  assert.equal(done.status, 'completed');
  assert.equal(done.payment.status, 'paid');
  assert.equal(done.receipt.ref, b.ref);
  assert.deepEqual(done.timeline.map((t) => t.status), ['accepted', 'arrived', 'in_progress', 'completed']);
});

test('a ride that never started cannot be completed', () => quiet(() => {
  const b = booking();
  assert.equal(Sim.completeTrip(b.id), null);
  Sim.acceptRequest(b, rider('r1'));
  assert.equal(Sim.riderStatusAdvance(b.id, 'completed'), null);
  assert.equal(Bookings.byId(b.id).status, 'accepted');
  assert.equal(Bookings.byId(b.id).payment.status, 'pending');
}));

test('two riders accept the same request: exactly one wins', () => quiet(() => {
  const b = booking();
  const first = Sim.acceptRequest(b, rider('r1'));
  const second = Sim.acceptRequest(b, rider('r2')); // stale copy, like a second tab
  assert.ok(first);
  assert.equal(second, null);
  assert.equal(Bookings.byId(b.id).riderId, 'r1');
}));

test('the assigned rider cannot be swapped later', () => quiet(() => {
  const b = booking();
  Sim.acceptRequest(b, rider('r1'));
  assert.equal(Bookings.update(b.id, { riderId: 'r2' }), null);
  assert.equal(Bookings.byId(b.id).riderId, 'r1');
}));

test('a cancelled request cannot be accepted', () => quiet(() => {
  const b = booking();
  assert.ok(Sim.passengerCancel(b.id));
  assert.equal(Sim.acceptRequest(b, rider('r1')), null);
  assert.equal(Bookings.byId(b.id).status, 'cancelled');
}));

test('passenger cannot cancel once the trip started or finished', () => quiet(() => {
  const b = booking();
  Sim.acceptRequest(b, rider('r1'));
  Sim.riderStatusAdvance(b.id, 'arrived');
  Sim.riderStatusAdvance(b.id, 'in_progress');
  assert.equal(Sim.passengerCancel(b.id), null);
  Sim.riderStatusAdvance(b.id, 'completed');
  assert.equal(Sim.passengerCancel(b.id), null);
  assert.equal(Bookings.byId(b.id).status, 'completed');
}));

test('rider cannot advance a ride the passenger cancelled', () => quiet(() => {
  const b = booking();
  Sim.acceptRequest(b, rider('r1'));
  Sim.passengerCancel(b.id);
  assert.equal(Sim.riderStatusAdvance(b.id, 'arrived'), null);
  assert.equal(Sim.riderStatusAdvance(b.id, 'completed'), null);
  assert.equal(Bookings.byId(b.id).status, 'cancelled');
}));

test('completion is idempotent: one payment, one receipt', () => quiet(() => {
  const b = booking();
  Sim.acceptRequest(b, rider('r1'));
  Sim.riderStatusAdvance(b.id, 'arrived');
  Sim.riderStatusAdvance(b.id, 'in_progress');
  const once = Sim.completeTrip(b.id);
  const twice = Sim.completeTrip(b.id);
  assert.ok(once);
  assert.equal(twice, null);
  assert.equal(Bookings.byId(b.id).receipt.paidAt, once.receipt.paidAt);
  assert.equal(Bookings.byId(b.id).timeline.filter((t) => t.status === 'completed').length, 1);
}));

test('a finished trip keeps its fare and payment; ratings still save', () => quiet(() => {
  const b = booking();
  Sim.acceptRequest(b, rider('r1'));
  Sim.riderStatusAdvance(b.id, 'arrived');
  Sim.riderStatusAdvance(b.id, 'in_progress');
  const done = Sim.completeTrip(b.id);
  assert.equal(Bookings.update(b.id, { fare: { ...done.fare, total: 1 } }), null);
  assert.equal(Bookings.update(b.id, { payment: { method: 'cash', status: 'pending' } }), null);
  assert.ok(Bookings.update(b.id, { rating: { stars: 5 } }));
  assert.equal(Bookings.byId(b.id).fare.total, done.fare.total);
}));

test('every status in the transition table only points at known statuses', () => {
  const known = Object.keys(BOOKING_TRANSITIONS);
  known.forEach((s) => BOOKING_TRANSITIONS[s].forEach((t) => assert.ok(known.includes(t), `${s} → ${t}`)));
});

// ---------- money ----------
test('commission: one formula, gross = commission + net, whole pesos', () => {
  [0, 1, 45, 112, 163, 999, 1234].forEach((g) => {
    const s = riderShare(g);
    assert.equal(s.commission + s.net, g);
    assert.equal(s.commission, Math.round(g * 0.2));
    assert.ok(Number.isInteger(s.net));
  });
  assert.deepEqual(riderShare(163), { gross: 163, commission: 33, net: 130 });
});

// ---------- retention ----------
test('storage cap never deletes completed or active rides', () => quiet(() => {
  Store.set('bookings', []);
  const keep = [];
  for (let i = 0; i < 70; i++) {
    const b = booking();
    Sim.acceptRequest(b, rider('r1'));
    Sim.riderStatusAdvance(b.id, 'arrived');
    Sim.riderStatusAdvance(b.id, 'in_progress');
    Sim.completeTrip(b.id);
    keep.push(b.id);
  }
  const live = booking(); keep.push(live.id);
  for (let i = 0; i < 90; i++) Sim.passengerCancel(booking().id);
  const all = Bookings.all();
  keep.forEach((id) => assert.ok(all.some((b) => b.id === id), `lost ${id}`));
  assert.equal(all.filter((b) => b.status === 'completed').length, 70);
  assert.ok(all.length <= 121, `kept ${all.length}`);
  // old completed trips are compacted, but their money is intact
  const oldest = all.filter((b) => b.status === 'completed').pop();
  assert.equal(oldest.route.length, 0);
  assert.equal(oldest.payment.status, 'paid');
  assert.ok(oldest.receipt.breakdown.total > 0);
}));

// ---------- trip chat ----------
const chatTrip = (status) => ({ status, pickup: { name: 'Cebu IT Park' }, rider: { vehicle: { color: 'White', model: 'Toyota Vios', plate: 'UVX-3310' } } });
const allLines = (role) => ['accepted', 'arriving', 'arrived', 'in_progress', 'completed'].flatMap((st) => quickReplies(role, chatTrip(st)));

test('chat lines name no Manila roads and stay professional', () => {
  const lines = [...allLines('rider'), ...allLines('passenger')].join(' | ').toLowerCase();
  ['edsa', 'tayong lahat', 'c5', 'ortigas', 'makati'].forEach((w) => assert.ok(!lines.includes(w), `found "${w}"`));
});

test('chat suggestions follow the trip stage', () => {
  const approach = quickReplies('rider', chatTrip('accepted')).join(' ');
  const pickup = quickReplies('rider', chatTrip('arrived')).join(' ');
  const trip = quickReplies('passenger', chatTrip('in_progress')).join(' ');
  assert.ok(!/i'm here|naa na ko/i.test(approach), 'rider claims arrival while still driving');
  assert.ok(/I'm in the White Toyota Vios, plate UVX-3310\./.test(pickup), 'pickup line uses the real car + plate');
  assert.ok(!/at the pickup point/i.test(trip), 'passenger still says "at the pickup" mid-trip');
});

test('simulated replies answer what was asked', () => {
  assert.match(simChatReply('passenger', 'Where exactly are you parked?', chatTrip('arrived')), /UVX-3310/);
  assert.match(simChatReply('passenger', 'Can you pick me up at the gate instead?', chatTrip('accepted')), /go there/);
  assert.match(simChatReply('rider', 'Where exactly should I drop you off?', chatTrip('in_progress')), /entrance/);
  assert.match(simChatReply('rider', "I'm in the White Toyota Vios, plate UVX-3310.", chatTrip('arrived')), /coming out/);
  assert.match(simChatReply('rider', 'Traffic is heavy on the way, I may be a few minutes late.', chatTrip('accepted')), /take your time/);
  assert.match(simGreeting(chatTrip('accepted')), /Cebu IT Park/);
});

// ---------- bus ----------
test('an event delivered twice (channel + storage mirror) is handled once', () => {
  let got = 0;
  const off = Bus.subscribe('probe', () => { got += 1; });
  Bus.publish('probe', { x: 1 }); // local emit + echoed back by the shim channel
  off();
  assert.equal(got, 1);
});

const failed = results.filter((r) => r[0] === 'FAIL');
results.forEach((r) => console.log(`${r[0] === 'ok' ? '  ok  ' : '  FAIL'} ${r[1]}${r[2] ? '\n        ' + r[2] : ''}`));
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0); // storage.js keeps a cleanup interval alive
