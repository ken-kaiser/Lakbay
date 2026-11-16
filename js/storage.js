/* ==========================================================================
   Lakbay — Storage layer
   localStorage persistence + cross-tab event bus (BroadcastChannel with
   storage-event fallback), user accounts, sessions, bookings, notifications.
   ========================================================================== */

const NS = 'lakbay:';
const memory = {};
let storageOk = true;
try {
  localStorage.setItem(NS + 'probe', '1');
  localStorage.removeItem(NS + 'probe');
} catch (e) {
  storageOk = false;
}

export const storageAvailable = storageOk;

/* ---------- Low-level store ---------- */
export const Store = {
  get(key, fallback = null) {
    try {
      const raw = storageOk ? localStorage.getItem(NS + key) : memory[NS + key];
      if (raw == null) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  },
  set(key, value) {
    try {
      const raw = JSON.stringify(value);
      if (storageOk) localStorage.setItem(NS + key, raw);
      else memory[NS + key] = raw;
    } catch (e) {
      /* quota exceeded — drop oldest notifications to survive */
      if (storageOk) {
        try { localStorage.removeItem(NS + 'notifications'); localStorage.setItem(NS + key, JSON.stringify(value)); } catch (e2) {}
      }
    }
    return value;
  },
  remove(key) {
    if (storageOk) localStorage.removeItem(NS + key);
    else delete memory[NS + key];
  },
  update(key, fallback, fn) {
    const next = fn(Store.get(key, fallback));
    Store.set(key, next);
    return next;
  },
};

/* ---------- Cross-tab bus ----------
   Publishes JSON messages on BroadcastChannel; mirrors through localStorage
   storage events when BroadcastChannel is unavailable. */
const listeners = new Map(); // topic -> Set<fn>

function localEmit(topic, payload) {
  const set = listeners.get(topic);
  if (set) set.forEach((fn) => {
    try { fn(payload); } catch (e) { console.error('[bus]', topic, e); }
  });
}

let bc = null;
try {
  if (typeof BroadcastChannel !== 'undefined') {
    bc = new BroadcastChannel('lakbay-sim');
    bc.onmessage = (ev) => {
      if (ev && ev.data && ev.data.topic) localEmit(ev.data.topic, ev.data.payload);
    };
  }
} catch (e) { bc = null; }

// Fallback mirror via storage events (covers iframes / older browsers)
window.addEventListener('storage', (ev) => {
  if (!ev.key || !ev.key.startsWith(NS + 'bus:')) return;
  try {
    const { topic, payload } = JSON.parse(ev.newValue || '{}');
    if (topic) localEmit(topic, payload);
  } catch (e) {}
});

export const Bus = {
  publish(topic, payload = {}) {
    const env = { topic, payload, t: Date.now() };
    if (bc) { try { bc.postMessage(env); } catch (e) {} }
    try { if (storageOk) localStorage.setItem(NS + 'bus:' + topic + ':' + Date.now() + ':' + Math.random().toString(36).slice(2, 7), JSON.stringify(env)); } catch (e) {}
    localEmit(topic, payload);
  },
  subscribe(topic, fn) {
    if (!listeners.has(topic)) listeners.set(topic, new Set());
    listeners.get(topic).add(fn);
    return () => listeners.get(topic).delete(fn);
  },
};

// Periodically clean stale bus keys
setInterval(() => {
  if (!storageOk) return;
  try {
    const now = Date.now();
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(NS + 'bus:')) {
        const ts = Number(k.split(':')[3]);
        if (now - ts > 60000) { localStorage.removeItem(k); i--; }
      }
    }
  } catch (e) {}
}, 30000);

/* ---------- Password hashing (never store plaintext) ---------- */
export async function hashPassword(password) {
  try {
    if (window.crypto && crypto.subtle) {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('lakbay::' + password));
      return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
    }
  } catch (e) {}
  // Non-crypto fallback (demo only)
  let h1 = 0xdeadbeef, h2 = 0x41c6ce6e;
  for (let i = 0; i < password.length; i++) {
    const ch = password.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  return 'f' + (h1 >>> 0).toString(16) + (h2 >>> 0).toString(16);
}

/* ---------- Users ---------- */
export const Users = {
  all() { return Store.get('users', []); },
  byEmail(email) { return Users.all().find((u) => u.email.toLowerCase() === String(email).toLowerCase()) || null; },
  byId(id) { return Users.all().find((u) => u.id === id) || null; },
  async create({ role, firstName, lastName, email, phone, password, extra = {} }) {
    if (Users.byEmail(email)) throw new Error('An account with this email already exists.');
    const user = {
      id: 'u_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      role, firstName, lastName, email, phone,
      passwordHash: await hashPassword(password),
      avatar: null, rating: role === 'rider' ? 5.0 : null, trips: 0,
      joinedAt: Date.now(), demo: false, ...extra,
    };
    Store.set('users', [...Users.all(), user]);
    return user;
  },
  async verify(email, password) {
    const u = Users.byEmail(email);
    if (!u) return null;
    const hash = await hashPassword(password);
    return u.passwordHash === hash ? u : null;
  },
  update(id, patch) {
    const users = Users.all();
    const idx = users.findIndex((u) => u.id === id);
    if (idx < 0) return null;
    users[idx] = { ...users[idx], ...patch, id };
    Store.set('users', users);
    return users[idx];
  },
};

/* ---------- Session ----------
   The generic 'session' key tracks the most recent login (used by the
   landing page), while per-role keys let a passenger tab and a rider tab
   stay signed in at the same time — essential for the two-tab demo. */
export const Session = {
  get() { return Store.get('session', null); },
  getFor(role) { return Store.get('session:' + role, null); },
  set(user) {
    const s = { userId: user.id, role: user.role, at: Date.now() };
    Store.set('session', s);
    Store.set('session:' + user.role, s);
  },
  clear() {
    const s = Store.get('session', null);
    Store.remove('session');
    if (s && s.role) Store.remove('session:' + s.role);
  },
};

/* ---------- Booking repo ----------
   Booking shape:
   { id, ref, passengerId, passengerName, passengerPhone, passengerAvatar, passengerRating,
     riderId, rider: {id,name,phone,rating,avatar,vehicle,trips}|null, riderSource: 'simulation'|'live'|null,
     category, pickup:{placeId?,name,address,lat,lng,instructions}, dropoff:{...},
     distanceKm, durationMin, route:[{lat,lng}...],
     fare:{base,distance,duration,platformFee,subtotal,discount,total,promoCode},
     payment:{method,status}, status, timeline:[{status,at,by}],
     pickupEtaSec, tripEtaSec, createdAt, scheduledFor,
     messages:[], rating:{stars,compliments,comment}|null, receipt:null }
   Statuses: scheduled | searching | accepted | arriving | arrived | in_progress | completed | cancelled | expired */
export const Bookings = {
  all() { return Store.get('bookings', []); },
  byId(id) { return Bookings.all().find((b) => b.id === id) || null; },
  activeFor(userId, role) {
    const active = ['scheduled', 'searching', 'accepted', 'arriving', 'arrived', 'in_progress'];
    return Bookings.all().filter((b) =>
      active.includes(b.status) && (role === 'rider' ? b.riderId === userId : b.passengerId === userId));
  },
  anySearching() { return Bookings.all().find((b) => b.status === 'searching') || null; },
  create(booking) {
    const all = Bookings.all();
    all.unshift(booking);
    if (all.length > 120) all.length = 120; // keep storage bounded
    Store.set('bookings', all);
    return booking;
  },
  update(id, patch, { publish = true, by = 'system' } = {}) {
    const all = Bookings.all();
    const idx = all.findIndex((b) => b.id === id);
    if (idx < 0) return null;
    const prevStatus = all[idx].status;
    const next = { ...all[idx], ...patch, id };
    if (patch.status && patch.status !== prevStatus) {
      next.timeline = [...(next.timeline || []), { status: patch.status, at: Date.now(), by }];
    }
    all[idx] = next;
    Store.set('bookings', all);
    if (publish) Bus.publish('booking:update', { bookingId: id, booking: next, prevStatus });
    return next;
  },
};

/* ---------- Messages ---------- */
export const Msgs = {
  list(bookingId) { return (Bookings.byId(bookingId) || {}).messages || []; },
  append(bookingId, msg) {
    const b = Bookings.byId(bookingId);
    if (!b) return null;
    const full = {
      id: 'm_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      at: Date.now(), ...msg,
    };
    const next = Bookings.update(bookingId, { messages: [...(b.messages || []), full] }, { publish: false });
    Bus.publish('msg:new', { bookingId, msg: full });
    return { booking: next, msg: full };
  },
  markRead(bookingId, reader) {
    const b = Bookings.byId(bookingId);
    if (!b) return;
    const msgs = (b.messages || []).map((m) => (m.from !== reader ? { ...m, read: true } : m));
    Bookings.update(bookingId, { messages: msgs }, { publish: false });
    Bus.publish('msg:read', { bookingId, reader });
  },
};

/* ---------- Notifications ---------- */
export const Notifs = {
  all() { return Store.get('notifications', []); },
  forUser(userId) { return Notifs.all().filter((n) => n.userId === userId); },
  push({ userId, role, title, body, icon = 'bell', tone = 'primary', topic = null, data = null }) {
    const n = { id: 'n_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), userId, role, title, body, icon, tone, topic, data, at: Date.now(), read: false };
    Store.set('notifications', [n, ...Notifs.all()].slice(0, 80));
    Bus.publish('notif:new', { notif: n });
    return n;
  },
  markAllRead(userId) {
    Store.set('notifications', Notifs.all().map((n) => (n.userId === userId ? { ...n, read: true } : n)));
    Bus.publish('notif:read', { userId });
  },
  markRead(id) {
    Store.set('notifications', Notifs.all().map((n) => (n.id === id ? { ...n, read: true } : n)));
    Bus.publish('notif:read', { userId: null });
  },
  unreadCount(userId) { return Notifs.forUser(userId).filter((n) => !n.read).length; },
  clearAll(userId) {
    Store.set('notifications', Notifs.all().filter((n) => n.userId !== userId));
    Bus.publish('notif:read', { userId });
  },
};

/* ---------- Per-user preferences / collections ---------- */
export const Prefs = {
  get(userId, key, fallback) { return Store.get(`prefs:${userId}:${key}`, fallback); },
  set(userId, key, value) { Store.set(`prefs:${userId}:${key}`, value); },
};

export const SavedPlacesRepo = {
  list(userId) { return Prefs.get(userId, 'savedPlaces', null); },
  save(userId, places) { Prefs.set(userId, 'savedPlaces', places); Bus.publish('places:update', { userId }); },
};

export const PaymentRepo = {
  list(userId) { return Prefs.get(userId, 'paymentMethods', [{ id: 'cash', default: true }]); },
  save(userId, methods) { Prefs.set(userId, 'paymentMethods', methods); Bus.publish('payments:update', { userId }); },
  defaultMethod(userId) {
    const list = PaymentRepo.list(userId);
    return (list.find((m) => m.default) || list[0] || { id: 'cash' }).id;
  },
  setDefault(userId, methodId) {
    const list = PaymentRepo.list(userId).map((m) => ({ ...m, default: m.id === methodId }));
    PaymentRepo.save(userId, list);
  },
};

export const RiderActions = {
  log(userId) { return Prefs.get(userId, 'riderActions', []); },
  push(userId, entry) {
    const log = RiderActions.log(userId);
    log.unshift(entry);
    if (log.length > 200) log.length = 200;
    Prefs.set(userId, 'riderActions', log);
  },
};

/* ---------- First-run seeding ---------- */
export function ensureSeeded() {
  if (Store.get('seeded', false)) return;
  if (!Users.byEmail('mika@lakbay.demo')) {
    const p = { ...{} };
    const passenger = { ...{} };
    // create demo accounts with known demo passwords (hashed on save)
    Users.all();
    Store.set('users', [...Users.all()]);
  }
  // Seed demo accounts synchronously-ish; hashing is async so store a marker and hash later
  Store.set('seeded', true);
}

/* Async first-run seeding (call once from app.js boot) */
export async function seedDemoAccounts() {
  if (Store.get('demoAccountsReady', false)) return;
  const users = Users.all().filter((u) => u.id !== 'demo-passenger' && u.id !== 'demo-rider');
  Store.set('users', users);

  const { DEFAULT_DEMO_PASSENGER_PROFILE, DEFAULT_DEMO_RIDER_PROFILE } = await import('./data.js');
  const pHash = await hashPassword('demo1234');
  const rHash = await hashPassword('demo1234');
  const passengers = Users.all().filter((u) => u.id !== 'demo-passenger');
  passengers.push({ ...DEFAULT_DEMO_PASSENGER_PROFILE, passwordHash: pHash });
  Store.set('users', passengers);

  const riders = Users.all().filter((u) => u.id !== 'demo-rider');
  riders.push({ ...DEFAULT_DEMO_RIDER_PROFILE, passwordHash: rHash });
  Store.set('users', riders);

  // Pre-seed a couple of completed bookings for the demo passenger history
  if (Bookings.all().length === 0) {
    const data = await import('./data.js');
    const { generateRoute, estimateDurationMin, estimateFare, getPlace, haversineKm, DEMO_DRIVERS } = data;
    const now = Date.now();
    const seeds = [
      { from: 'qmc', to: 'bgc-hs', cat: 'car', daysAgo: 6, driver: 'drv-jun' },
      { from: 'greenbelt', to: 'moa', cat: 'premium', daysAgo: 13, driver: 'drv-dennis' },
      { from: 'sm-north', to: 'uptc', cat: 'moto', daysAgo: 21, driver: 'drv-carlo' },
    ];
    const seeded = seeds.map((s, i) => {
      const a = getPlace(s.from), b = getPlace(s.to);
      const dm = DEMO_DRIVERS.find((d) => d.id === s.driver);
      const km = Math.round(haversineKm(a, b) * 10) / 10;
      const mins = estimateDurationMin(km);
      const fare = estimateFare(s.cat, km, mins);
      const at = now - s.daysAgo * 86400000;
      return {
        id: 'seed-' + i, ref: 'LB-' + new Date(at).toISOString().slice(0, 10).replace(/-/g, '') + '-' + (1200 + i),
        passengerId: 'demo-passenger', passengerName: 'Mika De Guzman', passengerPhone: '+63 917 822 4510',
        passengerAvatar: 'assets/avatars/p1.png', passengerRating: 4.9,
        riderId: dm.id, riderSource: 'simulation',
        rider: { id: dm.id, name: dm.name, phone: dm.phone, rating: dm.rating, avatar: dm.avatar, vehicle: dm.vehicle, trips: dm.trips },
        category: s.cat,
        pickup: { placeId: a.id, name: a.name, address: a.address, lat: a.lat, lng: a.lng, instructions: '' },
        dropoff: { placeId: b.id, name: b.name, address: b.address, lat: b.lat, lng: b.lng, instructions: '' },
        distanceKm: km, durationMin: mins, route: generateRoute(a, b),
        fare: { ...fare }, payment: { method: i === 0 ? 'gcash' : 'cash', status: 'paid' },
        status: 'completed',
        timeline: [
          { status: 'searching', at: at }, { status: 'accepted', at: at + 120000 },
          { status: 'arrived', at: at + 300000 }, { status: 'in_progress', at: at + 360000 },
          { status: 'completed', at: at + mins * 60000 },
        ],
        createdAt: at, pickupEtaSec: 20, tripEtaSec: 40,
        messages: [], rating: { stars: 5, compliments: ['Safe driving'], comment: '' },
        receipt: { paidAt: at + mins * 60000, method: i === 0 ? 'GCash' : 'Cash' },
      };
    });
    Store.set('bookings', seeded);
  }
  Store.set('demoAccountsReady', true);
}
