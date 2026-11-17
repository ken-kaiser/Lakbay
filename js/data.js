/* ==========================================================================
   Lakbay — Mock data + domain helpers
   Philippine locations, ride categories, fares, drivers, promos, seeds.
   All data is local demonstration data. No network services required.
   ========================================================================== */

/* ---------- Metro Cebu places (approx real coordinates) ----------
   Lakbay launches in Cebu first. Online search (OpenStreetMap) still finds
   places anywhere; this list powers offline search, "Nearby" and demos. */
export const PLACES = [
  { id: 'ayala-cebu', name: 'Ayala Center Cebu', address: 'Cebu Business Park, Cebu City', area: 'Cebu City', category: 'mall', lat: 10.3182, lng: 123.9051, keywords: 'ayala center cebu business park mall shopping' },
  { id: 'sm-cebu', name: 'SM City Cebu', address: 'North Reclamation Area, Cebu City', area: 'Cebu City', category: 'mall', lat: 10.3116, lng: 123.9183, keywords: 'sm city cebu reclamation mall shopping' },
  { id: 'sm-seaside', name: 'SM Seaside City Cebu', address: 'South Road Properties, Cebu City', area: 'Cebu City', category: 'mall', lat: 10.282, lng: 123.8806, keywords: 'sm seaside srp mall shopping' },
  { id: 'il-corso', name: 'Il Corso Lifestyle Mall', address: 'South Road Properties, Cebu City', area: 'Cebu City', category: 'mall', lat: 10.2728, lng: 123.8838, keywords: 'il corso srp filinvest mall' },
  { id: 'robinsons-galleria', name: 'Robinsons Galleria Cebu', address: 'Gen. Maxilom Ave Ext, Cebu City', area: 'Cebu City', category: 'mall', lat: 10.3046, lng: 123.9122, keywords: 'robinsons galleria cebu mall' },
  { id: 'jy-square', name: 'JY Square Mall', address: 'Salinas Dr cor Gorordo Ave, Lahug, Cebu City', area: 'Cebu City', category: 'mall', lat: 10.3296, lng: 123.899, keywords: 'jy square lahug mall' },
  { id: 'banilad-tc', name: 'Banilad Town Centre', address: 'Gov. M. Cuenco Ave, Banilad, Cebu City', area: 'Cebu City', category: 'mall', lat: 10.341, lng: 123.9097, keywords: 'banilad town centre btc mall' },
  { id: 'it-park', name: 'Cebu IT Park', address: 'Lahug, Cebu City', area: 'Cebu City', category: 'office', lat: 10.3301, lng: 123.9058, keywords: 'it park lahug office bpo work ayala central bloc' },
  { id: 'sugbo-mercado', name: 'Sugbo Mercado', address: 'IT Park, Lahug, Cebu City', area: 'Cebu City', category: 'food', lat: 10.3286, lng: 123.905, keywords: 'sugbo mercado food market it park' },
  { id: 'waterfront-lahug', name: 'Waterfront Cebu City Hotel', address: 'Salinas Dr, Lahug, Cebu City', area: 'Cebu City', category: 'landmark', lat: 10.3262, lng: 123.904, keywords: 'waterfront hotel casino lahug' },
  { id: 'marco-polo', name: 'Marco Polo Plaza Cebu', address: 'Nivel Hills, Lahug, Cebu City', area: 'Cebu City', category: 'landmark', lat: 10.3388, lng: 123.8962, keywords: 'marco polo plaza hotel nivel hills' },
  { id: 'up-cebu', name: 'UP Cebu', address: 'Gorordo Ave, Lahug, Cebu City', area: 'Cebu City', category: 'school', lat: 10.3226, lng: 123.8984, keywords: 'up cebu university philippines lahug school' },
  { id: 'usc-talamban', name: 'University of San Carlos (Talamban)', address: 'Nasipit, Talamban, Cebu City', area: 'Cebu City', category: 'school', lat: 10.3527, lng: 123.9131, keywords: 'usc talamban university san carlos school' },
  { id: 'usc-downtown', name: 'University of San Carlos (Downtown)', address: 'P. del Rosario St, Cebu City', area: 'Cebu City', category: 'school', lat: 10.2998, lng: 123.8988, keywords: 'usc downtown university san carlos school' },
  { id: 'fuente', name: 'Fuente Osmeña Circle', address: 'Osmeña Blvd, Cebu City', area: 'Cebu City', category: 'landmark', lat: 10.3106, lng: 123.8932, keywords: 'fuente osmena circle rotunda' },
  { id: 'larsian', name: 'Larsian BBQ', address: 'Fuente Osmeña, Cebu City', area: 'Cebu City', category: 'food', lat: 10.311, lng: 123.8945, keywords: 'larsian bbq food fuente' },
  { id: 'capitol', name: 'Cebu Provincial Capitol', address: 'Osmeña Blvd, Capitol Site, Cebu City', area: 'Cebu City', category: 'office', lat: 10.3168, lng: 123.8908, keywords: 'capitol cebu provincial government' },
  { id: 'cdu-hospital', name: "Cebu Doctors' University Hospital", address: 'Osmeña Blvd, Capitol Site, Cebu City', area: 'Cebu City', category: 'hospital', lat: 10.3117, lng: 123.891, keywords: 'cebu doctors hospital cduh medical' },
  { id: 'chong-hua', name: 'Chong Hua Hospital', address: 'Don Mariano Cui St, Fuente, Cebu City', area: 'Cebu City', category: 'hospital', lat: 10.3092, lng: 123.8912, keywords: 'chong hua hospital medical' },
  { id: 'vsmmc', name: 'Vicente Sotto Memorial Medical Center', address: 'B. Rodriguez St, Cebu City', area: 'Cebu City', category: 'hospital', lat: 10.3076, lng: 123.8929, keywords: 'vicente sotto vsmmc hospital medical' },
  { id: 'colon', name: 'Colon Street', address: 'Colon St, Downtown Cebu City', area: 'Cebu City', category: 'landmark', lat: 10.2965, lng: 123.9005, keywords: 'colon street oldest street downtown' },
  { id: 'carbon', name: 'Carbon Market', address: 'M.C. Briones St, Cebu City', area: 'Cebu City', category: 'market', lat: 10.2921, lng: 123.8985, keywords: 'carbon market palengke downtown' },
  { id: 'santo-nino', name: 'Basilica Minore del Santo Niño', address: 'Osmeña Blvd, Cebu City', area: 'Cebu City', category: 'church', lat: 10.2943, lng: 123.9018, keywords: 'basilica santo nino church sinulog' },
  { id: 'magellan', name: "Magellan's Cross", address: 'Magallanes St, Cebu City', area: 'Cebu City', category: 'landmark', lat: 10.2935, lng: 123.902, keywords: 'magellan cross historical tourist' },
  { id: 'cathedral', name: 'Cebu Metropolitan Cathedral', address: 'P. Burgos St, Cebu City', area: 'Cebu City', category: 'church', lat: 10.2958, lng: 123.9025, keywords: 'cebu metropolitan cathedral church' },
  { id: 'fort-san-pedro', name: 'Fort San Pedro', address: 'A. Pigafetta St, Cebu City', area: 'Cebu City', category: 'landmark', lat: 10.2925, lng: 123.9058, keywords: 'fort san pedro plaza independencia historical' },
  { id: 'city-hall', name: 'Cebu City Hall', address: 'Plaza Sugbo, Cebu City', area: 'Cebu City', category: 'office', lat: 10.293, lng: 123.9015, keywords: 'cebu city hall government' },
  { id: 'south-bus', name: 'Cebu South Bus Terminal', address: 'N. Bacalso Ave, Cebu City', area: 'Cebu City', category: 'landmark', lat: 10.2987, lng: 123.8935, keywords: 'south bus terminal ceres transport' },
  { id: 'temple-leah', name: 'Temple of Leah', address: 'Roosevelt St, Busay, Cebu City', area: 'Cebu City', category: 'landmark', lat: 10.3708, lng: 123.8668, keywords: 'temple of leah busay tourist' },
  { id: 'tops', name: 'Tops Lookout', address: 'Busay, Cebu City', area: 'Cebu City', category: 'park', lat: 10.372, lng: 123.8705, keywords: 'tops lookout busay view park' },
  { id: 'parkmall', name: 'Parkmall', address: 'Ouano Ave, Mandaue City', area: 'Mandaue', category: 'mall', lat: 10.325, lng: 123.9335, keywords: 'parkmall mandaue mall' },
  { id: 'j-centre', name: 'J Centre Mall', address: 'A.S. Fortuna St, Mandaue City', area: 'Mandaue', category: 'mall', lat: 10.3358, lng: 123.9215, keywords: 'j centre mall mandaue' },
  { id: 'north-bus', name: 'Cebu North Bus Terminal', address: 'Subangdaku, Mandaue City', area: 'Mandaue', category: 'landmark', lat: 10.3329, lng: 123.9301, keywords: 'north bus terminal transport' },
  { id: 'mactan-airport', name: 'Mactan-Cebu International Airport', address: 'Lapu-Lapu City', area: 'Lapu-Lapu', category: 'airport', lat: 10.3077, lng: 123.9793, keywords: 'airport mactan mcia terminal flight' },
];

/* ---------- Ride categories & fare model ---------- */
export const RIDE_CATEGORIES = [
  {
    id: 'moto', name: 'Lakbay Moto', vehicle: 'motorcycle', capacity: 1,
    img: 'assets/vehicles/moto.png',
    base: 35, perKm: 6, perMin: 1, platformFee: 8,
    etaMin: [2, 5], desc: 'Beat the traffic on two wheels. Best for solo riders with light bags.',
    luggage: 'Small bag only',
  },
  {
    id: 'car', name: 'Lakbay Car', vehicle: 'sedan', capacity: 4,
    img: 'assets/vehicles/sedan.png',
    base: 45, perKm: 12, perMin: 1.5, platformFee: 10,
    etaMin: [3, 7], desc: 'A comfortable four-door sedan for everyday city trips.',
    luggage: '2 bags',
  },
  {
    id: 'premium', name: 'Lakbay Premium', vehicle: 'premium', capacity: 4,
    img: 'assets/vehicles/premium.png',
    base: 80, perKm: 18, perMin: 2, platformFee: 15,
    etaMin: [5, 10], desc: 'Executive sedans with professional top-rated drivers.',
    luggage: '3 bags',
  },
  {
    id: 'xl', name: 'Lakbay XL', vehicle: 'van', capacity: 6,
    img: 'assets/vehicles/van.png',
    base: 65, perKm: 15, perMin: 1.5, platformFee: 12,
    etaMin: [5, 12], desc: 'Roomy MPVs and vans for groups, families, and big shopping hauls.',
    luggage: '5 bags',
  },
];

export const PAYMENT_METHODS = [
  { id: 'cash', name: 'Cash', sub: 'Pay the rider directly at the end of your trip', logo: 'Cash', logoBg: 'var(--c-surface-2)', logoFg: 'var(--c-ink-2)', icon: 'banknote' },
  { id: 'gcash', name: 'GCash', sub: 'Auto-charge your GCash wallet', logo: 'GCash', logoBg: '#DFF3E1', logoFg: '#166534', icon: 'smartphone', mark: 'assets/pay/gcash.svg' },
  { id: 'maya', name: 'Maya', sub: 'Auto-charge your Maya wallet', logo: 'Maya', logoBg: '#E5F1FB', logoFg: '#155E93', icon: 'credit-card', mark: 'assets/pay/maya.svg' },
];

export const PROMOS = [
  { code: 'LAKBAY50', label: '₱50 off your next ride', type: 'flat', value: 50, maxOff: 50, minFare: 150, category: null, note: 'Valid on fares ₱150 and up' },
  { code: 'FIRSTTRIP', label: '20% off, up to ₱100', type: 'percent', value: 20, maxOff: 100, minFare: 100, category: null, note: 'Great for longer trips' },
  { code: 'MOTOPH', label: '₱30 off Lakbay Moto', type: 'flat', value: 30, maxOff: 30, minFare: 80, category: 'moto', note: 'Moto rides only, fares from ₱80' },
  { code: 'PAYDAY10', label: '10% off every payday week', type: 'percent', value: 10, maxOff: 60, minFare: 90, category: null, note: 'Saves up to ₱60' },
];

/* ---------- Demo drivers & passengers ---------- */
export const DEMO_DRIVERS = [
  { id: 'drv-carlo', name: 'Carlo Reyes', firstName: 'Carlo', avatar: 'assets/avatars/d1.png', phone: '+63 917 312 8845', rating: 4.9, trips: 3214, hue: 152, vehicle: { model: 'Honda Click 125i', color: 'Green', plate: 'NCT-8421', type: 'moto', categoryIds: ['moto'] } },
  { id: 'drv-jun', name: 'Jun Soriano', firstName: 'Jun', avatar: 'assets/avatars/d3.png', phone: '+63 918 554 2013', rating: 4.8, trips: 5102, hue: 96, vehicle: { model: 'Toyota Vios 1.3 XLE', color: 'White', plate: 'UVX-3310', type: 'sedan', categoryIds: ['car'] } },
  { id: 'drv-ben', name: 'Benjie Torres', firstName: 'Benjie', avatar: null, phone: '+63 916 228 7760', rating: 4.7, trips: 2876, hue: 32, vehicle: { model: 'Mitsubishi Mirage G4', color: 'Silver', plate: 'TAV-9917', type: 'sedan', categoryIds: ['car'] } },
  { id: 'drv-ramil', name: 'Ramil Cruz', firstName: 'Ramil', avatar: null, phone: '+63 917 901 3348', rating: 4.85, trips: 4410, hue: 200, vehicle: { model: 'Yamaha Mio i125', color: 'Blue', plate: 'MBG-2214', type: 'moto', categoryIds: ['moto'] } },
  { id: 'drv-aina', name: 'Aina Villanueva', firstName: 'Aina', avatar: 'assets/avatars/d2.png', phone: '+63 919 645 1102', rating: 4.92, trips: 6208, hue: 8, vehicle: { model: 'Toyota Innova 2.8 E', color: 'Pearl White', plate: 'KAA-7732', type: 'van', categoryIds: ['xl', 'car'] } },
  { id: 'drv-dennis', name: 'Dennis Ong', firstName: 'Dennis', avatar: null, phone: '+63 917 556 9870', rating: 4.88, trips: 3987, hue: 264, vehicle: { model: 'Hyundai Accent GL', color: 'Black', plate: 'RSG-5521', type: 'premium', categoryIds: ['premium', 'car'] } },
  { id: 'drv-paolo', name: 'Paolo Mendoza', firstName: 'Paolo', avatar: null, phone: '+63 918 300 4519', rating: 4.75, trips: 1998, hue: 120, vehicle: { model: 'Suzuki Ertiga GL', color: 'Gray', plate: 'NXX-1188', type: 'van', categoryIds: ['xl'] } },
  { id: 'drv-liezel', name: 'Liezel Ramos', firstName: 'Liezel', avatar: null, phone: '+63 915 872 6641', rating: 4.9, trips: 5540, hue: 320, vehicle: { model: 'Toyota Avanza 1.5 G', color: 'Silver', plate: 'CAL-3345', type: 'van', categoryIds: ['xl', 'car'] } },
];

export const DEMO_PASSENGERS = [
  { id: 'psx-bea', name: 'Bea Santos', avatar: 'assets/avatars/p1.png', phone: '+63 917 442 8819', rating: 4.9, hue: 40 },
  { id: 'psx-miguel', name: 'Miguel Cruz', avatar: 'assets/avatars/p2.png', phone: '+63 918 233 5510', rating: 4.8, hue: 145 },
  { id: 'psx-kat', name: 'Kat Lim', avatar: 'assets/avatars/p3.png', phone: '+63 917 890 1123', rating: 4.95, hue: 300 },
  { id: 'psx-jomar', name: 'Jomar Aquino', avatar: null, phone: '+63 916 512 4402', rating: 4.7, hue: 90 },
  { id: 'psx-trisha', name: 'Trisha Reyes', avatar: null, phone: '+63 917 311 9087', rating: 4.85, hue: 200 },
  { id: 'psx-nico', name: 'Nico Dela Cruz', avatar: null, phone: '+63 918 776 3325', rating: 4.8, hue: 20 },
];

/* ---------- In-app copy ---------- */
/* ---------- Trip chat ----------
   Quick replies follow the trip stage and use the trip's own details (car,
   plate, pickup), so nothing names a road or place the user isn't at. Plain
   English with a little everyday Cebuano, the way riders and passengers text
   in Cebu: polite and practical, never familial (they are strangers). */
const CHAT_PHASE = { accepted: 'approach', arriving: 'approach', arrived: 'pickup', in_progress: 'trip', completed: 'done' };
export function chatPhase(status) { return CHAT_PHASE[status] || 'approach'; }

function carOf(b) {
  const v = (b && b.rider && b.rider.vehicle) || {};
  return { car: [v.color, v.model].filter(Boolean).join(' '), plate: v.plate || '' };
}

export function quickReplies(role, b) {
  const { car, plate } = carOf(b);
  const lines = {
    rider: {
      approach: ['On my way to your pickup now.', 'Padulong na ko. See you soon.', 'Traffic is heavy on the way, I may be a few minutes late.', 'Where exactly are you waiting?', 'Is the pickup pin correct?'],
      pickup: ["I'm here at the pickup.", car ? `I'm in the ${car}${plate ? `, plate ${plate}` : ''}.` : null, "Take your time, I'll wait here.", "I can't stop right here, I'll wait just ahead.", 'Naa na ko sa pickup.'],
      trip: ['Where exactly should I drop you off?', 'Is this route okay with you?', "We're almost there."],
      done: ['Thanks for riding! Please check you have all your things.', 'Salamat! Have a good day.'],
    },
    passenger: {
      approach: ["I'm at the pickup point.", "I'll be there in 2 minutes.", "I'm at the main entrance.", "Please message me when you're near.", 'Can you pick me up at the gate instead?'],
      pickup: ['Coming out now!', 'I can see you.', 'Kadiyot lang, 1 minute please.', 'Where exactly are you parked?'],
      trip: ['Can you drop me off at the entrance?', 'You can drop me here, thanks.', 'Please take the fastest route.'],
      done: ['Thank you!', 'Salamat sa safe ride!'],
    },
  };
  return ((lines[role] || lines.passenger)[chatPhase(b && b.status)] || []).filter(Boolean);
}

/* What the simulated other side writes back: it answers the message it got
   (first matching rule wins, so the order below matters). */
export function simChatReply(from, text, b) {
  const t = String(text || '').toLowerCase();
  // whole words only: "plate" must not count as "late"
  // (the keywords below are plain words, so they need no regex escaping)
  const has = (...words) => words.some((w) => new RegExp(`\\b${w}\\b`).test(t));
  const phase = chatPhase(b && b.status);
  const { car, plate } = carOf(b);
  const pickup = (b && b.pickup && b.pickup.name) || 'the pickup';
  if (from === 'passenger') { // the driver answers the passenger
    if (has('thank', 'salamat')) return "You're welcome!";
    if (phase === 'trip') return has('route', 'fastest') ? "Sure, I'll take the fastest way." : 'Sure, noted.';
    if (phase === 'done') return 'Salamat! Have a good day.';
    if (has('where', 'asa')) {
      return phase === 'pickup'
        ? `I'm parked right at the pickup${car ? `, ${car}` : ''}${plate ? ` (${plate})` : ''}.`
        : `I'm close to ${pickup}. I'll message you when I'm there.`;
    }
    if (has('gate', 'entrance', 'instead')) return "Okay, I'll go there.";
    if (has('minute', 'wait', 'kadiyot')) return "Sure, no rush. I'll wait.";
    if (has('message me', 'call')) return "Sure, I'll message you when I'm close.";
    if (has('see you', 'coming', 'can see')) return 'Okay, see you!';
    return phase === 'approach' ? 'Noted. On my way.' : "Okay, I'm waiting here.";
  }
  // the passenger answers the driver
  if (has('thank', 'salamat')) return 'Thank you too!';
  if (has('drop')) return 'At the main entrance is fine, thanks.';
  if (has('route')) return 'Yes, that route is fine.';
  if (has('almost there')) return 'Okay, thanks!';
  if (has('where')) return `I'm at the main entrance of ${pickup}.`;
  if (has('pin')) return 'Yes, the pin is correct.';
  if (has('late', 'traffic')) return 'No problem, take your time.';
  if (has("i'm here", 'naa na', "i'm in the", 'at the pickup')) return 'Okay, coming out now!';
  if (has('wait', 'stop', 'ahead')) return "Okay, I'll walk over. Thanks!";
  return 'Okay, thanks!';
}

export function simGreeting(b) {
  return `Hi! I'm on my way to ${(b && b.pickup && b.pickup.name) || 'your pickup'}.`;
}

export const COMPLIMENTS = [
  'Expert navigation', 'Great conversation', 'Safe driving',
  'Clean vehicle', 'On time', 'Polite & courteous',
];

export const FAQS = [
  { q: 'How is my fare computed?', a: 'Fares combine a base amount, a distance charge per kilometer, and a time charge per minute, plus a small platform fee. You always see the full breakdown before confirming a booking.' },
  { q: 'Can I cancel a ride?', a: 'Yes. You can cancel free of charge while a driver is still on the way to your pickup. Once the driver has arrived and waits for more than 5 minutes, a cancellation fee may apply. Cancellation policies are shown before you confirm.' },
  { q: 'What payment methods are supported?', a: 'Cash, GCash, and Maya. Wallet payments auto-charge your linked account and every trip gets an itemized receipt.' },
  { q: 'How do I redeem a promo code?', a: 'Enter the code on the fare screen before confirming your booking. Try LAKBAY50, FIRSTTRIP, MOTOPH, or PAYDAY10 on your next ride.' },
  { q: 'How do drivers get verified?', a: 'Riders submit a government ID, professional driver’s license, vehicle registration (OR/CR), and profile photo. Verification status is shown on their profile before they can accept rides.' },
  { q: 'Is my location data shared?', a: 'Your location is only used to match you with the nearest driver and to display tracking. Location features use on-device GPS with your permission — nothing is uploaded anywhere.' },
];

export const NAV_STREETS = [
  'Osmeña Boulevard', 'Gorordo Avenue', 'Escario Street', 'N. Bacalso Avenue',
  'Gen. Maxilom Avenue', 'Archbishop Reyes Avenue', 'Juan Luna Avenue',
  'A.S. Fortuna Street', 'M.J. Cuenco Avenue', 'Gov. M. Cuenco Avenue',
  'Salinas Drive', 'Colon Street', 'P. del Rosario Street', 'V. Rama Avenue',
  'UN Avenue', 'Banilad Road', 'Pope John Paul II Avenue', 'Cebu South Coastal Road',
  'Ouano Avenue', 'Mandaue-Mactan Bridge',
];

/* ---------- Geo + pricing helpers ---------- */
const R_EARTH_KM = 6371;

export function haversineKm(a, b) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R_EARTH_KM * Math.asin(Math.sqrt(h));
}

export function estimateDurationMin(km) {
  // Metro Cebu city driving average ~ 18-22 km/h effective + fixed pickup/load time
  return Math.max(6, Math.round(km * 3 + 5));
}

export function estimateFare(categoryId, distanceKm, durationMin) {
  const cat = RIDE_CATEGORIES.find((c) => c.id === categoryId) || RIDE_CATEGORIES[1];
  const km = Math.round(distanceKm * 10) / 10;
  const mins = Math.max(1, Math.round(durationMin));
  const base = cat.base;
  const distance = Math.round(cat.perKm * km);
  const duration = Math.round(cat.perMin * mins);
  const platformFee = cat.platformFee;
  const subtotal = base + distance + duration + platformFee;
  return {
    categoryId: cat.id, km, mins, base, distance, duration, platformFee,
    subtotal, discount: 0, total: subtotal, promoCode: null,
  };
}

/* Platform commission — the ONE place the rider's cut is computed, so the
   request sheet, trip summary, history and earnings ledger always agree. */
export const COMMISSION_RATE = 0.2;
export function riderShare(fareTotal) {
  const gross = Number(fareTotal) || 0;
  const commission = Math.round(gross * COMMISSION_RATE);
  return { gross, commission, net: gross - commission };
}

export function applyPromo(fare, promo) {
  if (!promo || fare.subtotal < (promo.minFare || 0)) return fare;
  let discount = 0;
  if (promo.type === 'flat') discount = Math.min(promo.value, promo.maxOff || promo.value);
  else discount = Math.round((fare.subtotal * promo.value) / 100);
  discount = Math.min(discount, promo.maxOff || discount, fare.subtotal);
  return { ...fare, discount, total: fare.subtotal - discount, promoCode: promo.code };
}

export function getPromo(code) {
  if (!code) return null;
  return PROMOS.find((p) => p.code.toUpperCase() === String(code).trim().toUpperCase()) || null;
}

export function getPlace(id) { return PLACES.find((p) => p.id === id) || null; }

export function searchPlaces(query, limit = 8) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return [];
  const scored = [];
  for (const p of PLACES) {
    const name = p.name.toLowerCase();
    const addr = p.address.toLowerCase();
    const kw = p.keywords;
    let score = -1;
    if (name.startsWith(q)) score = 100;
    else if (name.includes(q)) score = 80;
    else if (kw.includes(q)) score = 55;
    else if (addr.includes(q)) score = 40;
    if (score >= 0) scored.push({ place: p, score });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit).map((s) => s.place);
}

/* maxKm: skip places farther than this. The built-in list only covers
   Metro Cebu, so callers outside Cebu pass a limit to avoid
   "nearby" suggestions hundreds of kilometres away. */
export function nearbyPlaces(latlng, limit = 6, maxKm = Infinity) {
  return PLACES
    .map((p) => ({ p, d: haversineKm(latlng, p) }))
    .filter((x) => x.d <= maxKm)
    .sort((a, b) => a.d - b.d)
    .slice(0, limit)
    .map((x) => x.p);
}

export function formatDistanceKm(km) {
  if (km < 1) return `${Math.max(50, Math.round(km * 1000 / 50) * 50)} m`;
  return `${km.toFixed(1)} km`;
}

/* ---------- Synthetic route generation (demonstration mode) ----------
   Produces a deterministic, road-like polyline between two points so both
   passenger and rider maps render identical routes without a routing API. */
function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedFromCoords(a, b) {
  return ((a.lat * 73856093) ^ (a.lng * 19349663) ^ (b.lat * 83492791) ^ (b.lng * 2971215073)) >>> 0;
}

export function generateRoute(a, b, steps = null) {
  const km = haversineKm(a, b);
  const n = steps || Math.max(6, Math.min(18, Math.round(km * 2.6)));
  const rand = mulberry32(seedFromCoords(a, b));
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const ease = t * t * (3 - 2 * t); // slight easing toward endpoints
    const wobble = (rand() - 0.5) * 0.0009 * Math.min(1, km + 0.2);
    pts.push({
      lat: a.lat + (b.lat - a.lat) * ease + wobble,
      lng: a.lng + (b.lng - a.lng) * ease + wobble,
    });
  }
  pts[0] = { lat: a.lat, lng: a.lng };
  pts[n] = { lat: b.lat, lng: b.lng };
  return pts;
}

export function routeLengthKm(points) {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += haversineKm(points[i - 1], points[i]);
  return total;
}

export function pointAtDistance(points, targetKm) {
  if (!points || points.length < 2) return points ? points[0] : null;
  if (targetKm <= 0) return points[0];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const seg = haversineKm(points[i - 1], points[i]);
    if (total + seg >= targetKm) {
      const t = seg === 0 ? 0 : (targetKm - total) / seg;
      return {
        lat: points[i - 1].lat + (points[i].lat - points[i - 1].lat) * t,
        lng: points[i - 1].lng + (points[i].lng - points[i - 1].lng) * t,
      };
    }
    total += seg;
  }
  return points[points.length - 1];
}

export function bearingDeg(a, b) {
  const toRad = (d) => (d * Math.PI) / 180;
  const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat));
  const x = Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) - Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/* Navigation step generator for the rider navigation view (demonstration data) */
export function navSteps(route, destName) {
  const total = routeLengthKm(route);
  const dirs = ['corner-up-left', 'corner-up-right', 'corner-up-left', 'corner-up-right'];
  const steps = [];
  let acc = 0;
  const n = Math.max(3, Math.min(6, Math.round(total * 1.4)));
  for (let i = 0; i < n; i++) {
    const segKm = Math.max(0.3, (total / n) * (0.8 + Math.random() * 0.5));
    acc += segKm;
    const street = NAV_STREETS[(route.length * (i + 3) * 7) % NAV_STREETS.length];
    if (i === 0) steps.push({ icon: 'navigation', text: `Head out and merge onto ${street}`, km: segKm });
    else if (i === n - 1) steps.push({ icon: 'flag', text: `Arrive at ${destName}`, km: Math.max(0.1, total - acc) });
    else steps.push({ icon: dirs[i % dirs.length], text: `Turn ${dirs[i % dirs.length].replace('corner-up-', '')} onto ${street}`, km: segKm });
  }
  return steps;
}

/* ---------- Default passenger seed data ---------- */
export const DEFAULT_SAVED_PLACES = (userId) => [
  { id: 'sp-home-' + userId, label: 'Home', icon: 'house', placeId: 'banilad-tc', name: 'Banilad Town Centre', address: 'Gov. M. Cuenco Ave, Banilad, Cebu City', lat: 10.3410, lng: 123.9097 },
  { id: 'sp-work-' + userId, label: 'Work', icon: 'briefcase', placeId: 'it-park', name: 'Cebu IT Park', address: 'Lahug, Cebu City', lat: 10.3301, lng: 123.9058 },
];

export const DEFAULT_DEMO_PASSENGER_PROFILE = {
  id: 'demo-passenger',
  role: 'passenger',
  firstName: 'Mika',
  lastName: 'De Guzman',
  email: 'mika@lakbay.demo',
  phone: '+63 917 822 4510',
  avatar: 'assets/avatars/p1.png',
  rating: 4.9,
  trips: 127,
  joinedAt: Date.now() - 300 * 86400000,
  demo: true,
};

export const DEFAULT_DEMO_RIDER_PROFILE = {
  id: 'demo-rider',
  role: 'rider',
  firstName: 'Ronnel',
  lastName: 'Diaz',
  email: 'ronnel@lakbay.demo',
  phone: '+63 918 445 2233',
  avatar: 'assets/avatars/d1.png',
  rating: 4.86,
  trips: 2841,
  joinedAt: Date.now() - 540 * 86400000,
  demo: true,
  vehicle: { model: 'Toyota Vios 1.3 XLE', color: 'White', plate: 'TRV-9184', type: 'car', categoryIds: ['car'] },
  verification: {
    status: 'verified',
    govId: { name: 'Drivers License (NBC-Q-1812345)', ok: true },
    license: { name: 'Professional License L-08-22-119834', ok: true },
    vehicleReg: { name: 'OR/CR Toyota Vios TRV-9184', ok: true },
    profilePhoto: { name: 'ronnel-profile.png', ok: true },
    reviewedAt: Date.now() - 200 * 86400000,
  },
};

/* Deterministic pseudo-random earnings seed (stable across reloads) */
export function seededEarnings(days = 30) {
  const out = [];
  const today = new Date(); today.setHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 1; i--) {
    const d = new Date(today.getTime() - i * 86400000);
    const rand = mulberry32(d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate());
    const dow = d.getDay();
    const weekendBoost = dow === 5 || dow === 6 ? 1.45 : 1;
    const trips = Math.max(3, Math.round((5 + rand() * 7) * weekendBoost));
    const gross = trips * (145 + rand() * 90);
    out.push({
      date: d.getTime(),
      trips,
      gross: Math.round(gross),
      commission: riderShare(gross).commission,
      net: riderShare(gross).net,
      onlineMin: Math.round(240 + rand() * 180),
      distanceKm: Math.round(trips * (4.5 + rand() * 4)),
    });
  }
  return out;
}
