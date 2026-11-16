/* ==========================================================================
   Lakbay — Leaflet map wrapper
   One thin API over Leaflet/OpenStreetMap for pins, routes, and vehicle
   animation. All map layers are presentational; tracking movement is
   simulated locally (see sim.js) and is never presented as real GPS.
   ========================================================================== */
import { bearingDeg } from '../data.js';
import { prefersReducedMotion } from './motion.js';

let L = null; // leaflet namespace

export function loadLeaflet() {
  if (L) return L;
  if (typeof window.L !== 'undefined') L = window.L;
  return L;
}

const instances = new Set();

function divIcon(html, size = [34, 34]) {
  return L.divIcon({ html, className: 'div-mark', iconSize: size, iconAnchor: [size[0] / 2, size[1] / 2] });
}

const PIN_SVGS = {
  pickup: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>',
  drop: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3" fill="currentColor" stroke="none"/></svg>',
  place: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>',
  passenger: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M5 21a7 7 0 0 1 14 0"/></svg>',
  flag: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 22V4c4-2.5 8 2.5 12 0v9c-4 2.5-8-2.5-12 0"/><path d="M4 15c4-2.5 8 2.5 12 0"/></svg>',
};

export function createMap(container, { center = [14.5995, 120.9822], zoom = 12, interactive = true } = {}) {
  L = loadLeaflet();
  if (!L) {
    container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--c-ink-3);font-size:13px">Map library failed to load</div>';
    return null;
  }

  const map = L.map(container, {
    center, zoom,
    zoomControl: false,
    attributionControl: true,
    dragging: interactive,
    touchZoom: interactive,
    doubleClickZoom: interactive,
    scrollWheelZoom: interactive,
    keyboard: interactive,
  });

  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);

  if (window.innerWidth >= 1024 && interactive) L.control.zoom({ position: 'bottomleft' }).addTo(map);

  // Detect tile load failures to swap in a graceful offline backdrop
  let tileFailures = 0;
  map.on('tileerror', () => {
    tileFailures++;
    if (tileFailures >= 4) container.classList.add('map-tiles-off');
  });

  const state = {
    map,
    markers: {},   // key -> L.marker
    route: null,
    routeCasing: null,
    animTimers: [],
    animRafs: [],
  };

  const api = {
    map,
    destroy() {
      state.animTimers.forEach((t) => clearInterval(t));
      state.animRafs.forEach((r) => cancelAnimationFrame(r));
      if (map) {
        // Stop any in-flight zoom/pan animation BEFORE removing the map;
        // removing mid-animation makes Leaflet's transitionend handler crash
        // with `_leaflet_pos` of undefined.
        try { map.stop(); } catch (e) {}
        try { map.remove(); } catch (e) {}
      }
      instances.delete(api);
    },
    setView(latlng, zoom = 15, { animate = true } = {}) {
      map.setView([latlng.lat || latlng[0], latlng.lng || latlng[1]], zoom, { animate });
    },
    /* marker types: pickup | drop | place | vehicle | pulse | me */
    setMarker(key, latlng, type = 'pickup', { label = null, bearing = null, glide = false, onClick = null } = {}) {
      const lat = latlng.lat ?? latlng[0];
      const lng = latlng.lng ?? latlng[1];
      let html = '';
      let size = [30, 30];
      let z = 600;
      if (type === 'vehicle') {
        const rot = bearing != null ? `style="transform:rotate(${bearing}deg)"` : '';
        html = `<div class="vehicle-mark"><i data-lucide="navigation" ${rot}></i></div>`;
        size = [34, 34]; z = 800;
      } else if (type === 'me') {
        html = `<div class="me-marker" role="img" aria-label="Your current location"><span class="me-halo"></span><span class="me-dot"></span></div>`;
        size = [26, 26]; z = 900;
      } else if (type === 'pulse') {
        html = `<div class="pulse-dot"></div>`;
        size = [12, 12]; z = 500;
      } else {
        html = `<div class="pin-mark pin-mark--${type}"><div class="pin-bubble">${PIN_SVGS[type] || PIN_SVGS.place}</div></div>`;
      }
      if (label != null) html += `<div style="position:absolute;top:34px;left:50%;transform:translateX(-50%);background:rgba(22,33,28,0.85);color:#fff;font-size:10px;font-weight:600;letter-spacing:0.01em;padding:2.5px 9px;border-radius:99px;white-space:nowrap;font-family:inherit">${label}</div>`;
      const icon = divIcon(html, size);
      icon.options.className = 'div-mark' + (glide ? ' div-mark--glide' : '');
      if (state.markers[key]) {
        state.markers[key].setLatLng([lat, lng]);
        if (bearing != null) {
          const rotEl = state.markers[key].getElement() && state.markers[key].getElement().querySelector('.vehicle-mark i, .vehicle-mark svg');
          if (rotEl) rotEl.style.transform = `rotate(${bearing}deg)`;
        }
        if (window.lucide) window.lucide.createIcons({ nameAttr: 'data-lucide' });
      } else {
        state.markers[key] = L.marker([lat, lng], { icon, zIndexOffset: z, keyboard: !!onClick }).addTo(map);
        if (window.lucide) window.lucide.createIcons({ nameAttr: 'data-lucide' });
      }
      const mk = state.markers[key];
      if (mk._lbClick) { mk.off('click', mk._lbClick); mk._lbClick = null; }
      if (onClick) {
        mk._lbClick = () => onClick(key);
        mk.on('click', mk._lbClick);
        const elm = mk.getElement();
        if (elm) { elm.style.cursor = 'pointer'; elm.setAttribute('role', 'button'); if (label) elm.setAttribute('aria-label', label); }
      }
      return mk;
    },
    removeMarker(key) {
      if (state.markers[key]) { map.removeLayer(state.markers[key]); delete state.markers[key]; }
    },
    /* Draw (or replace) a route polyline. style: solid | dashed.
       Brand: electric lime line with a deep casing so it reads on light tiles. */
    drawRoute(points, style = 'solid') {
      const latlngs = (points || []).map((p) => [p.lat, p.lng]);
      if (!latlngs.length) return;
      if (state.routeCasing) { map.removeLayer(state.routeCasing); state.routeCasing = null; }
      if (state.route) map.removeLayer(state.route);
      if (style === 'solid') {
        state.routeCasing = L.polyline(latlngs, {
          color: '#2E4A0B', weight: 8, opacity: 0.35,
          lineCap: 'round', lineJoin: 'round',
        }).addTo(map);
      }
      state.route = L.polyline(latlngs, {
        color: '#9BD400',
        weight: 5, opacity: style === 'dashed' ? 0.6 : 0.95,
        dashArray: style === 'dashed' ? '2 10' : null,
        lineCap: 'round', lineJoin: 'round',
      }).addTo(map);
      return state.route;
    },
    clearRoute() {
      if (state.routeCasing) { map.removeLayer(state.routeCasing); state.routeCasing = null; }
      if (state.route) { map.removeLayer(state.route); state.route = null; }
    },
    fitRoute(points, { pad = [42, 42], maxZoom = 16 } = {}) {
      const latlngs = (points || []).map((p) => [p.lat, p.lng]);
      if (!latlngs.length) return;
      map.fitBounds(L.latLngBounds(latlngs), { padding: pad, maxZoom, animate: true });
    },
    recenter() {
      const pk = state.markers['me'] || state.markers['pickup'];
      if (pk) map.setView(pk.getLatLng(), Math.max(map.getZoom(), 15), { animate: true });
      else map.setView([14.5995, 120.9822], 12, { animate: true });
    },
    /* Animate a marker along a polyline with requestAnimationFrame.
       Returns a stop() function. */
    animateAlong(key, points, durationMs, { onUpdate = null, bearing = true } = {}) {
      const marker = state.markers[key];
      if (!marker || !points || points.length < 2) return () => {};
      // precompute cumulative distances
      const segs = [];
      let total = 0;
      for (let i = 1; i < points.length; i++) {
        const dx = points[i].lat - points[i - 1].lat;
        const dy = points[i].lng - points[i - 1].lng;
        const d = Math.sqrt(dx * dx + dy * dy);
        segs.push({ d, from: points[i - 1], to: points[i] });
        total += d;
      }
      const reduced = prefersReducedMotion();
      const start = performance.now();
      let raf = 0;
      let lastPos = points[0];
      function frame(now) {
        const t = Math.min(1, (now - start) / durationMs);
        const target = t * total;
        let acc = 0;
        let pos = points[points.length - 1];
        let brg = null;
        for (const s of segs) {
          if (acc + s.d >= target) {
            const f = s.d === 0 ? 0 : (target - acc) / s.d;
            pos = { lat: s.from.lat + (s.to.lat - s.from.lat) * f, lng: s.from.lng + (s.to.lng - s.from.lng) * f };
            brg = bearingDeg(s.from, s.to);
            break;
          }
          acc += s.d;
        }
        lastPos = pos;
        marker.setLatLng([pos.lat, pos.lng]);
        if (bearing && brg != null) {
          const el = marker.getElement() && marker.getElement().querySelector('.vehicle-mark i, .vehicle-mark svg');
          if (el) el.style.transform = `rotate(${brg}deg)`;
        }
        if (onUpdate) onUpdate(t, pos);
        if (t < 1 && !reduced) raf = requestAnimationFrame(frame);
      }
      if (reduced) {
        frame(start);
      } else {
        raf = requestAnimationFrame(frame);
        state.animRafs.push(raf);
      }
      return () => { cancelAnimationFrame(raf); };
    },
    onReady(fn) { setTimeout(fn, 80); },
  };

  instances.add(api);
  setTimeout(() => { try { map.invalidateSize(); } catch (e) {} }, 120);
  return api;
}

export function destroyAllMaps() {
  instances.forEach((i) => i.destroy());
}
