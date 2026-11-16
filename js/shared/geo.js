/* ==========================================================================
   Lakbay — Geo helpers
   Road-aware routing (OSRM public demo API with graceful offline fallback),
   browser geolocation, and reverse geocoding (Nominatim) so the app centers
   on the user's REAL city (Cebu, Davao, Manila — wherever they are) instead
   of a hardcoded sample area.

   Every network helper is fail-soft: if the network is unavailable the rest
   of the app keeps working with local estimates, exactly as before.
   ========================================================================== */

const routeCache = new Map();   // "lat1,lng1|lat2,lng2" -> points[]
const placeCache = new Map();   // "lat,lng" (3dp) -> {name, address, area}

function key(a, b) {
  return `${a.lat.toFixed(4)},${a.lng.toFixed(4)}|${b.lat.toFixed(4)},${b.lng.toFixed(4)}`;
}

function fetchWithTimeout(url, ms = 4500) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { signal: ctrl.signal })
    .finally(() => clearTimeout(t));
}

/* ---------- road route ----------
   Returns a dense polyline that follows real roads, or null when the
   routing service is unreachable (caller then falls back to a local path). */
export async function roadRoute(a, b) {
  if (!a || !b) return null;
  const k = key(a, b);
  if (routeCache.has(k)) return routeCache.get(k);
  const url = `https://router.project-osrm.org/route/v1/driving/`
    + `${a.lng.toFixed(6)},${a.lat.toFixed(6)};${b.lng.toFixed(6)},${b.lat.toFixed(6)}`
    + `?overview=full&geometries=geojson&steps=false`;
  try {
    const res = await fetchWithTimeout(url, 4500);
    if (!res.ok) throw new Error('route http ' + res.status);
    const json = await res.json();
    const coords = json && json.routes && json.routes[0] && json.routes[0].geometry
      && json.routes[0].geometry.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) throw new Error('empty route');
    // Distance sanity check: OSRM may happily route a 300 km detour between
    // two nearby points (islands!). Reject anything wildly off the crow-fly.
    const straight = Math.hypot(b.lat - a.lat, b.lng - a.lng) || 1e-9;
    let prev = coords[0];
    let road = 0;
    const pts = coords.map((c) => {
      const p = { lat: c[1], lng: c[0] };
      road += Math.hypot(p.lat - prev.lat, p.lng - prev.lng);
      prev = p;
      return p;
    });
    if (road / straight > 4.5) throw new Error('implausible detour');
    routeCache.set(k, pts);
    return pts;
  } catch (e) {
    return null; // caller falls back to the local generated path
  }
}

/* Try the road network first, fall back to the local generator. */
export async function bestRoute(a, b, fallbackFn) {
  const road = await roadRoute(a, b);
  if (road && road.length > 1) return road;
  return fallbackFn ? fallbackFn() : [a, b];
}

/* Resample a polyline so segments are at most ~stepKm long, giving the
   vehicle marker smooth, fine-grained motion. */
export function densify(points, stepKm = 0.08) {
  if (!points || points.length < 2) return points || [];
  const out = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const p0 = points[i - 1], p1 = points[i];
    const d = Math.hypot(p1.lat - p0.lat, p1.lng - p0.lng) * 111.32; // approx km
    if (d <= stepKm) { out.push(p1); continue; }
    const n = Math.ceil(d / stepKm);
    for (let j = 1; j <= n; j++) {
      out.push({ lat: p0.lat + (p1.lat - p0.lat) * (j / n), lng: p0.lng + (p1.lng - p0.lng) * (j / n) });
    }
  }
  return out;
}

/* ---------- browser location ---------- */
export function browserLocation(opts = {}) {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) { resolve(null); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      () => resolve(null),
      { timeout: opts.timeout || 7000, maximumAge: 120000, enableHighAccuracy: false, ...opts },
    );
  });
}

/* ---------- reverse geocode (city / area names) ---------- */
export async function reverseGeocode(lat, lng) {
  const ck = `${lat.toFixed(3)},${lng.toFixed(3)}`;
  if (placeCache.has(ck)) return placeCache.get(ck);
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=16&addressdetails=1&lat=${lat.toFixed(6)}&lon=${lng.toFixed(6)}`;
  try {
    const res = await fetchWithTimeout(url, 4500);
    if (!res.ok) throw new Error('geocode http ' + res.status);
    const j = await res.json();
    const a = (j && j.address) || {};
    const road = a.road || a.pedestrian || a.suburb || a.neighbourhood || a.hamlet || '';
    const city = a.city || a.municipality || a.town || a.village || a.county || a.state || '';
    const out = {
      name: road || j.name || city || 'Your location',
      address: [a.suburb || a.neighbourhood, city].filter(Boolean).join(', ') || j.display_name || 'Your area',
      area: city || a.state || '',
      road,
      city,
    };
    placeCache.set(ck, out);
    return out;
  } catch (e) {
    const out = { name: 'Your location', address: 'Your area', area: '', road: '', city: '' };
    placeCache.set(ck, out);
    return out;
  }
}
