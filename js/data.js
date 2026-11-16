/* ==========================================================================
   Lakbay — Mock data + domain helpers
   Philippine locations, ride categories, fares, drivers, promos, seeds.
   All data is local demonstration data. No network services required.
   ========================================================================== */

/* ---------- Metro Manila places (approx real coordinates) ---------- */
export const PLACES = [
  { id: 'moa', name: 'SM Mall of Asia', address: 'Seaside Blvd, Pasay City', area: 'Pasay', category: 'mall', lat: 14.5547, lng: 120.9886, keywords: 'mall of asia moa pasay bay shopping' },
  { id: 'moa-arena', name: 'SM Mall of Asia Arena', address: 'J.W. Diokno Blvd, Mall of Asia Complex, Pasay', area: 'Pasay', category: 'landmark', lat: 14.5536, lng: 120.9860, keywords: 'arena concert mall of asia pasay' },
  { id: 'naia3', name: 'NAIA Terminal 3', address: 'Andrews Ave, Pasay City', area: 'Pasay', category: 'airport', lat: 14.5136, lng: 121.0194, keywords: 'airport naia terminal 3 pasay flight' },
  { id: 'naia1', name: 'NAIA Terminal 1', address: 'Ninoy Aquino Ave, Parañaque', area: 'Parañaque', category: 'airport', lat: 14.5086, lng: 121.0197, keywords: 'airport naia terminal 1 paranaque' },
  { id: 'newport', name: 'Newport City / Resorts World', address: 'Newport Blvd, Pasay City', area: 'Pasay', category: 'landmark', lat: 14.5214, lng: 121.0163, keywords: 'newport resorts world casino hotel pasay' },
  { id: 'ccp', name: 'Cultural Center of the Philippines', address: 'Roxas Blvd, Pasay City', area: 'Pasay', category: 'landmark', lat: 14.5531, lng: 120.9771, keywords: 'ccp cultural center theater pasay' },
  { id: 'starcity', name: 'Star City', address: 'CCP Complex, Roxas Blvd, Pasay', area: 'Pasay', category: 'landmark', lat: 14.5497, lng: 120.9848, keywords: 'star city amusement park pasay' },

  { id: 'bgc-hs', name: 'Bonifacio High Street', address: '5th Ave, Bonifacio Global City, Taguig', area: 'Taguig', category: 'mall', lat: 14.5535, lng: 121.0500, keywords: 'bgc high street taguig bonifacio shopping walk' },
  { id: 'sm-aura', name: 'SM Aura Premier', address: '26th St, Bonifacio Global City, Taguig', area: 'Taguig', category: 'mall', lat: 14.5585, lng: 121.0572, keywords: 'sm aura bgc taguig mall shopping' },
  { id: 'market-market', name: 'Market! Market!', address: '26th St, Bonifacio Global City, Taguig', area: 'Taguig', category: 'mall', lat: 14.5545, lng: 121.0560, keywords: 'market market bgc taguig palengke' },
  { id: 'uptown', name: 'Uptown Mall BGC', address: '9th Ave, Bonifacio Global City, Taguig', area: 'Taguig', category: 'mall', lat: 14.5605, lng: 121.0510, keywords: 'uptown bgc taguig mall' },
  { id: 'venice', name: 'Venice Grand Canal Mall', address: 'McKinley Hill, Taguig City', area: 'Taguig', category: 'mall', lat: 14.5348, lng: 121.0593, keywords: 'venice canal mckinley hill taguig italy' },
  { id: 'stlukes', name: "St. Luke's Medical Center BGC", address: '32nd St, Bonifacio Global City, Taguig', area: 'Taguig', category: 'hospital', lat: 14.5541, lng: 121.0575, keywords: 'st lukes hospital bgc taguig medical' },

  { id: 'greenbelt', name: 'Greenbelt Mall', address: 'Legaspi St, Makati City', area: 'Makati', category: 'mall', lat: 14.5558, lng: 121.0248, keywords: 'greenbelt makati mall ayala shopping' },
  { id: 'glorietta', name: 'Glorietta', address: 'Ayala Center, Makati City', area: 'Makati', category: 'mall', lat: 14.5505, lng: 121.0238, keywords: 'glorietta makati mall ayala shopping' },
  { id: 'ayala-ave', name: 'Ayala Avenue (PBCOM Tower)', address: 'Ayala Ave, Bel-Air, Makati City', area: 'Makati', category: 'office', lat: 14.5587, lng: 121.0196, keywords: 'ayala avenue office makati work pbcom' },
  { id: 'rockwell', name: 'Power Plant Mall, Rockwell', address: 'Rockwell Center, Makati City', area: 'Makati', category: 'mall', lat: 14.5707, lng: 121.0290, keywords: 'rockwell power plant makati mall' },
  { id: 'century', name: 'Century City Mall', address: 'Kalayaan Ave, Makati City', area: 'Makati', category: 'mall', lat: 14.5614, lng: 121.0291, keywords: 'century city makati mall' },
  { id: 'makati-med', name: 'Makati Medical Center', address: '2 Amorsolo St, Legazpi Village, Makati', area: 'Makati', category: 'hospital', lat: 14.5589, lng: 121.0244, keywords: 'makati med hospital medical' },

  { id: 'qmc', name: 'Quezon Memorial Circle', address: 'Elliptical Rd, Diliman, Quezon City', area: 'Quezon City', category: 'park', lat: 14.6489, lng: 121.0494, keywords: 'quezon memorial circle qc park' },
  { id: 'up-diliman', name: 'UP Diliman (Quezon Hall)', address: 'University of the Philippines, Diliman, QC', area: 'Quezon City', category: 'school', lat: 14.6538, lng: 121.0545, keywords: 'up diliman university quezon city school' },
  { id: 'uptc', name: 'UP Town Center', address: 'Katipunan Ave, Diliman, Quezon City', area: 'Quezon City', category: 'mall', lat: 14.6383, lng: 121.0664, keywords: 'up town center katipunan qc mall' },
  { id: 'sm-north', name: 'SM City North EDSA', address: 'North Ave, Quezon City', area: 'Quezon City', category: 'mall', lat: 14.6265, lng: 121.0700, keywords: 'sm north edsa qc mall shopping' },
  { id: 'trinoma', name: 'Trinoma', address: 'North Ave, Quezon City', area: 'Quezon City', category: 'mall', lat: 14.6234, lng: 121.0509, keywords: 'trinoma qc mall north avenue' },
  { id: 'cubao', name: 'Araneta City (Cubao)', address: 'General Aguinaldo Ave, Cubao, QC', area: 'Quezon City', category: 'mall', lat: 14.6167, lng: 121.0500, keywords: 'araneta cubao coliseum gateway qc' },
  { id: 'gateway', name: 'Gateway Mall Araneta City', address: 'Araneta Center, Cubao, Quezon City', area: 'Quezon City', category: 'mall', lat: 14.6197, lng: 121.0537, keywords: 'gateway mall cubao araneta' },
  { id: 'centris', name: 'Eton Centris', address: 'EDSA cor Quezon Ave, Quezon City', area: 'Quezon City', category: 'office', lat: 14.6348, lng: 121.0330, keywords: 'eton centris edsa quezon ave office' },
  { id: 'maginhawa', name: 'Maginhawa Food Strip', address: 'Maginhawa St, Teachers Village, QC', area: 'Quezon City', category: 'food', lat: 14.6395, lng: 121.0663, keywords: 'maginhawa food strip teachers village qc restaurant' },
  { id: 'eastwood', name: 'Eastwood City', address: 'Libis, Quezon City', area: 'Quezon City', category: 'office', lat: 14.6042, lng: 121.0709, keywords: 'eastwood libis qc office bpo' },
  { id: 'banawe', name: 'Banawe Auto Supply Row', address: 'Banawe St, Quezon City', area: 'Quezon City', category: 'shop', lat: 14.6287, lng: 121.0038, keywords: 'banawe auto parts qc' },
  { id: 'fairview', name: 'SM City Fairview', address: 'Quirino Hwy, Novaliches, Quezon City', area: 'Quezon City', category: 'mall', lat: 14.7138, lng: 121.0583, keywords: 'sm fairview novaliches qc mall' },

  { id: 'megamall', name: 'SM Megamall', address: 'EDSA cor Doña Julia Vargas Ave, Mandaluyong', area: 'Mandaluyong', category: 'mall', lat: 14.5846, lng: 121.0597, keywords: 'sm megamall ortigas mandaluyong edsa mall' },
  { id: 'shang', name: 'Shangri-La Plaza', address: 'EDSA cor Shaw Blvd, Mandaluyong', area: 'Mandaluyong', category: 'mall', lat: 14.5849, lng: 121.0585, keywords: 'shangrila plaza ortigas shaw mandaluyong' },
  { id: 'galleria', name: 'Robinsons Galleria', address: 'EDSA cor Ortigas Ave, Quezon City', area: 'Ortigas', category: 'mall', lat: 14.5849, lng: 121.0609, keywords: 'galleria ortigas edsa mall' },
  { id: 'ortigas-center', name: 'Ortigas Center (San Miguel Ave)', address: 'San Miguel Ave, Ortigas Center, Pasig', area: 'Pasig', category: 'office', lat: 14.5859, lng: 121.0567, keywords: 'ortigas center office pasig work' },
  { id: 'capitol-commons', name: 'Capitol Commons', address: 'Meralco Ave, Pasig City', area: 'Pasig', category: 'mall', lat: 14.5775, lng: 121.0693, keywords: 'capitol commons pasig estancia' },
  { id: 'riverbanks', name: 'Riverbanks Center', address: 'A. Bonifacio Ave, Marikina City', area: 'Marikina', category: 'mall', lat: 14.6205, lng: 121.0776, keywords: 'riverbanks marikina mall outlet' },

  { id: 'rizal-park', name: 'Rizal Park (Luneta)', address: 'Roxas Blvd, Ermita, Manila', area: 'Manila', category: 'park', lat: 14.5814, lng: 120.9751, keywords: 'rizal park luneta manila tourist' },
  { id: 'intramuros', name: 'Intramuros (Fort Santiago)', address: 'Sta. Lucia St, Intramuros, Manila', area: 'Manila', category: 'landmark', lat: 14.5888, lng: 120.9750, keywords: 'intramuros fort santiago manila historical walled city' },
  { id: 'manila-cathedral', name: 'Manila Cathedral', address: 'Cabildo St, Intramuros, Manila', area: 'Manila', category: 'church', lat: 14.5924, lng: 120.9733, keywords: 'manila cathedral intramuros church wedding' },
  { id: 'sm-manila', name: 'SM City Manila', address: 'Natividad Lopez St, Ermita, Manila', area: 'Manila', category: 'mall', lat: 14.5929, lng: 120.9812, keywords: 'sm manila mall city hall' },
  { id: 'quiapo', name: 'Quiapo Church (Minor Basilica)', address: 'Plaza Miranda, Quiapo, Manila', area: 'Manila', category: 'church', lat: 14.5995, lng: 120.9822, keywords: 'quiapo church nazareno black nazarene manila' },
  { id: 'binondo', name: 'Binondo Church & Chinatown', address: 'Ongpin St, Binondo, Manila', area: 'Manila', category: 'landmark', lat: 14.5995, lng: 120.9757, keywords: 'binondo chinatown ongpin manila food' },
  { id: 'divisoria', name: 'Divisoria Market (168 Mall)', address: 'Soler St, Binondo, Manila', area: 'Manila', category: 'market', lat: 14.6066, lng: 120.9741, keywords: 'divisoria 168 mall wholesale manila market' },
  { id: 'ust', name: 'University of Santo Tomas', address: 'España Blvd, Sampaloc, Manila', area: 'Manila', category: 'school', lat: 14.6130, lng: 120.9906, keywords: 'ust university santo tomas espana manila school' },
  { id: 'manila-zoo', name: 'Manila Zoo', address: 'M. Orosa St, Malate, Manila', area: 'Manila', category: 'park', lat: 14.5697, lng: 120.9848, keywords: 'manila zoo malate park' },

  { id: 'atc', name: 'Alabang Town Center', address: 'Commerce Ave, Alabang, Muntinlupa', area: 'Muntinlupa', category: 'mall', lat: 14.4167, lng: 121.0298, keywords: 'alabang town center atc muntinlupa mall' },
  { id: 'festival', name: 'Festival Supermall', address: 'Filinvest City, Alabang, Muntinlupa', area: 'Muntinlupa', category: 'mall', lat: 14.4222, lng: 120.9902, keywords: 'festival mall filinvest alabang' },
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
  { id: 'gcash', name: 'GCash', sub: 'Auto-charge your GCash wallet', logo: 'GCash', logoBg: '#DFF3E1', logoFg: '#166534', icon: 'smartphone' },
  { id: 'maya', name: 'Maya', sub: 'Auto-charge your Maya wallet', logo: 'Maya', logoBg: '#E5F1FB', logoFg: '#155E93', icon: 'credit-card' },
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
export const QUICK_MSGS_PASSENGER = [
  "I'm at the pickup location.",
  "I'm wearing a black shirt.",
  'Please wait a moment.',
  "I'm near the entrance.",
  'Sa gate po ako.',
  'Almost done, 1 minute please.',
];

export const QUICK_MSGS_RIDER = [
  "On my way po.",
  "I'm near the pickup point.",
  'Please wait a moment po.',
  'Traffic po sa EDSA, slight delay.',
  "I've arrived. I'm parked on the right side.",
  'Ingat po tayong lahat.',
];

export const SIM_DRIVER_REPLIES = [
  "On my way po.",
  "I'm just around the corner.",
  'Please wait a moment po, traffic is a bit heavy.',
  "I'm here po. I'm wearing a green shirt.",
  'Sige po, noted!',
];

export const SIM_PASSENGER_REPLIES = [
  "I'm at the pickup location.",
  'Please wait a moment.',
  "I'm near the entrance po.",
  'Sige po, thank you!',
];

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
  'Ayala Avenue', 'EDSA', 'C5 Road', 'Commonwealth Avenue', 'Quezon Avenue',
  'España Boulevard', 'Taft Avenue', 'Roxas Boulevard', 'Katipunan Avenue',
  'Shaw Boulevard', 'Bonifacio Drive', 'Jupiter Street', 'Kalayaan Avenue',
  'Meralco Avenue', 'San Miguel Avenue', 'North Avenue', 'Quirino Highway',
  'Chino Roces Avenue', 'Delaware Street', 'Seaside Boulevard',
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
  // Metro Manila city driving average ~ 18-22 km/h effective + fixed pickup/load time
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
   Metro Manila, so callers outside Manila pass a limit to avoid
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
  { id: 'sp-home-' + userId, label: 'Home', icon: 'house', placeId: 'qmc', name: 'Quezon Memorial Circle', address: 'Elliptical Rd, Diliman, Quezon City', lat: 14.6489, lng: 121.0494 },
  { id: 'sp-work-' + userId, label: 'Work', icon: 'briefcase', placeId: 'ayala-ave', name: 'Ayala Avenue (PBCOM Tower)', address: 'Ayala Ave, Bel-Air, Makati City', lat: 14.5587, lng: 121.0196 },
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
      commission: Math.round(gross * 0.2),
      net: Math.round(gross * 0.8),
      onlineMin: Math.round(240 + rand() * 180),
      distanceKm: Math.round(trips * (4.5 + rand() * 4)),
    });
  }
  return out;
}
