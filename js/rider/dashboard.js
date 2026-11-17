/* ==========================================================================
   Lakbay — Rider dashboard
   Availability toggle, today's stats, demand map, verification banner,
   recent activity, and service zones.
   ========================================================================== */
import { App } from '../app.js';
import { Bookings, Prefs, Notifs, Users } from '../storage.js';
import { RequestManager } from './requests.js';
import { earningsFor, todayKey, sumRange } from './earnings.js';
import { PLACES, nearbyPlaces, DEMO_PASSENGERS } from '../data.js';
import { el, clear, qs } from '../shared/dom.js';
import { Icons } from '../shared/icons.js';
import { Toast } from '../shared/toast.js';
import { confirmDialog } from '../shared/modal.js';
import { createMap } from '../shared/map.js';
import { locateUser, getLastLocation, reverseGeocode } from '../shared/geo.js';
import { peso, timeAgo, firstNameOf } from '../shared/format.js';
import { avatarElLite } from '../shared/ui-lite.js';
import { rollText } from '../shared/motion.js';

const state = { map: null, ticker: null, onlineAt: null, area: '' };

function verificationOf() {
  const me = Users.byId(App.user.id) || App.user;
  return (me && me.verification && me.verification.status) || 'not_submitted';
}

function isVerified() { return verificationOf() === 'verified'; }

const dashboardView = {
  id: 'dashboard',
  render(root) {
    const me = Users.byId(App.user.id) || App.user;
    const userId = me.id;
    App.setHeader(`Kumusta, ${firstNameOf(me)}`, 'Your driver dashboard');

    const wrap = el('div', { class: 'rd-stack' });

    /* ---- availability toggle ---- */
    const online = Prefs.get(userId, 'online', false);
    state.onlineAt = online ? (Prefs.get(userId, 'onlineAt', Date.now())) : null;
    RequestManager.setOnline(online && isVerified());

    /* status console: the working state, the switch and today's numbers in
       one midnight panel — the first thing a rider reads */
    const toggleCard = el('section', { class: 'rd-console', 'aria-label': 'Working status' });
    const sw = el('button', {
      class: `switch switch--lg${online && isVerified() ? ' on' : ''}`, role: 'switch',
      'aria-checked': String(online && isVerified()), 'aria-label': 'Go online or offline',
    }, el('span', { class: 'knob' }));
    const statusText = el('div', { class: 'grow' });
    const toggleRow = el('div', { class: 'rd-console-top' }, statusText, sw);
    toggleCard.appendChild(toggleRow);

    function paintToggle() {
      const on = Prefs.get(userId, 'online', false) && isVerified();
      sw.classList.toggle('on', on);
      sw.setAttribute('aria-checked', String(on));
      toggleCard.classList.toggle('is-online', on);
      toggleCard.classList.toggle('is-locked', !isVerified());
      window.dispatchEvent(new CustomEvent('lakbay:online')); // header status chip
      clear(statusText);
      const dot = el('span', { class: `rd-status-dot${on ? ' rd-status-dot--online' : ''}` });
      if (isVerified()) {
        statusText.append(
          el('div', { class: 'rd-online-title' }, dot,
            el('h2', { class: 'rd-console-title' }, on ? "You're online" : "You're offline")),
          el('p', { class: 'rd-console-sub' }, on
            ? 'Receiving ride requests around your area.'
            : 'Go online to start receiving ride requests.'),
        );
      } else {
        statusText.append(
          el('div', { class: 'rd-online-title' }, dot,
            el('h2', { class: 'rd-console-title' }, 'Verification required')),
          el('p', { class: 'rd-console-sub' }, 'Submit your documents to activate online mode.'),
        );
      }
    }

    sw.addEventListener('click', async () => {
      if (!isVerified()) {
        Toast.warn('Verification needed', 'Complete rider verification before going online.');
        App.navigate('profile', { query: { tab: 'verification' } });
        return;
      }
      const next = !Prefs.get(userId, 'online', false);
      Prefs.set(userId, 'online', next);
      Prefs.set(userId, 'onlineAt', next ? Date.now() : null);
      RequestManager.setOnline(next);
      state.onlineAt = next ? Date.now() : null;
      paintToggle();
      paintStats();
      if (next) {
        Notifs.push({ userId, role: 'rider', title: 'You are online', body: 'Matching is listening for bookings near you.', icon: 'power', tone: 'success' });
        Toast.success('You are online', 'New requests will pop up automatically when a booking searches near you.');
      } else {
        Toast.info('You are offline', 'You will not receive new ride requests.');
        Notifs.push({ userId, role: 'rider', title: 'You are offline', body: 'Online mode paused. Your totals are kept.', icon: 'power', tone: 'neutral' });
      }
    });
    paintToggle();
    wrap.appendChild(toggleCard);

    /* ---- verification banner ---- */
    if (!isVerified()) {
      const v = verificationOf();
      const banner = el('button', { class: `rd-verify-banner ${v === 'pending' ? 'rd-verify-banner--pending' : ''}`, type: 'button' },
        el('span', { class: 'rv-icon' }, el('i', { 'data-lucide': v === 'pending' ? 'hourglass' : 'shield-check' })),
        el('span', { class: 'grow', style: 'text-align:left' },
          el('span', { class: 't-strong' }, v === 'pending' ? 'Verification pending review' : 'Complete your rider verification'),
          el('span', { class: 't-small', style: 'display:block' }, v === 'pending'
            ? 'Our review team is checking your documents — usually ready in a few seconds.'
            : 'Add your license, vehicle papers, and profile photo to unlock online mode.')),
        el('i', { 'data-lucide': 'chevron-right' }));
      banner.addEventListener('click', () => App.navigate('profile', { query: { tab: 'verification' } }));
      wrap.appendChild(banner);
    }

    /* ---- today summary strip ---- */
    const metricsRow = el('div', { class: 'rd-today-metrics' });
    const statEls = {};
    [
      ['today', "Today's net", peso(0, { whole: true })],
      ['rides', 'Rides today', '0'],
      ['online', 'Online time', '0m'],
      ['rating', 'Your rating', Number(me.rating || 5).toFixed(2)],
    ].forEach(([id, label, val]) => {
      const metric = el('div', { class: 'rd-metric' },
        el('span', { class: 't-overline' }, label),
        el('span', { class: 'rd-metric-value t-num' }, val));
      statEls[id] = metric.querySelector('.rd-metric-value');
      metricsRow.appendChild(metric);
    });
    toggleCard.appendChild(metricsRow);

    function setStat(node, text, roll) {
      if (roll) { rollText(node, text); return; }
      if (node.dataset.roll === text) return;
      node.dataset.roll = text;
      node.textContent = text;
    }

    function paintStats() {
      const e = earningsFor(userId);
      setStat(statEls.today, peso(sumRange(e.daily, todayKey(), todayKey()).net, { whole: true }), true);
      const ridesToday = Bookings.all().filter((b) => b.riderId === userId && b.status === 'completed'
        && new Date(b.completedAt || b.createdAt).toDateString() === new Date().toDateString()).length;
      setStat(statEls.rides, String(ridesToday), true);
      if (state.onlineAt) {
        const mins = Math.floor((Date.now() - state.onlineAt) / 60000);
        setStat(statEls.online, mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`, false);
      } else setStat(statEls.online, '0m', false);
    }
    paintStats();
    state.ticker = setInterval(paintStats, 15000);

    /* ---- demand map ---- */
    const grid = el('div', { class: 'rd-dash-grid' });
    const side = el('div', { class: 'rd-dash-side' });
    const mapCard = el('section', { class: 'rd-dash-map', 'aria-labelledby': 'rd-demand-h' });
    mapCard.appendChild(el('div', { class: 'rd-sec-head' },
      el('h2', { class: 'cl-section-title', id: 'rd-demand-h' }, 'Demand around you')));
    const mapBox = el('div', { class: 'map-box rd-map-dash' });
    mapCard.appendChild(mapBox);
    const demandNote = el('p', { class: 't-xs', style: 'margin-top:8px' }, 'Finding your location\u2026');
    mapCard.appendChild(demandNote);
    grid.append(mapCard, side);
    wrap.appendChild(grid);

    /* ---- recent activity ---- */
    const acts = Prefs.get(userId, 'riderActions', []).slice(0, 6);
    const actCard = el('section', { class: 'rd-side-sec' });
    actCard.appendChild(el('h2', { class: 'cl-section-title' }, 'Recent activity'));
    if (acts.length) {
      const list = el('div', { class: 'list' });
      acts.forEach((a) => {
        const b = Bookings.byId(a.bookingId);
        const labelMap = { accepted: 'Accepted request', declined: 'Declined request', missed: 'Missed request', completed: 'Completed trip' };
        const iconMap = { accepted: 'check-circle-2', declined: 'circle-x', missed: 'clock-alert', completed: 'circle-check' };
        list.appendChild(el('div', { class: 'list-item list-item--static' },
          el('span', { class: 'li-icon' }, el('i', { 'data-lucide': iconMap[a.type] || 'circle' })),
          el('span', { class: 'li-body' },
            el('span', { class: 'li-title' }, labelMap[a.type] || a.type),
            el('span', { class: 'li-sub clamp-1' }, b ? `${b.pickup.name} → ${b.dropoff.name}` : 'Booking no longer stored')),
          el('span', { class: 't-xs nowrap' }, timeAgo(a.at))));
      });
      actCard.appendChild(list);
    } else {
      actCard.appendChild(el('div', { class: 'empty', style: 'padding:20px 12px' },
        el('div', { class: 'empty-icon' }, el('i', { 'data-lucide': 'inbox' })),
        el('h3', {}, 'No activity yet'),
        el('p', {}, 'Your accepts, declines, and completed trips will appear here.')));
    }
    side.appendChild(actCard);

    /* ---- service zones strip ---- */
    const zones = el('section', { class: 'rd-side-sec' });
    zones.appendChild(el('h2', { class: 'cl-section-title' }, 'Service zones'));
    const zoneRow = el('div', { class: 'zone-list' });
    // Show the rider's own area once known; Cebu zones only as the no-GPS default
    const lastLoc = getLastLocation();
    const zoneNames = lastLoc && lastLoc.city
      ? [lastLoc.city, lastLoc.name].filter((v, i, a) => v && a.indexOf(v) === i)
      : ['Lahug / IT Park', 'Cebu Business Park', 'Downtown / Colon', 'Mandaue', 'Mactan / Lapu-Lapu'];
    zoneNames.forEach((z) => zoneRow.appendChild(el('span', { class: 'zone-item' }, z)));
    zones.appendChild(zoneRow);
    zones.appendChild(el('p', { class: 't-xs', style: 'margin-top:8px' }, lastLoc && lastLoc.city
      ? `You're in an active service area. Requests come from passengers around ${lastLoc.city}.`
      : 'All zones are actively served. Boundary rules are configured per city.'));
    side.appendChild(zones);

    root.appendChild(wrap);
    Icons.refresh(root);

    /* map (after layout) — centers on the driver's real location when available */
    let myPos = { lat: 10.3175, lng: 123.9055 }; // Cebu Business Park when there's no GPS fix
    setTimeout(async () => {
      if (!mapBox.isConnected) return;
      // locateUser also remembers the fix, so test requests spawn near the rider
      const geo = (await locateUser({ timeout: 5000 })) || getLastLocation();
      if (!mapBox.isConnected) return;
      if (geo) myPos = { lat: geo.lat, lng: geo.lng };
      state.map = createMap(mapBox, { center: [myPos.lat, myPos.lng], zoom: 14 });
      if (!state.map) return;
      try { state.map.map.invalidateSize(); } catch (e) { /* noop */ } // measure the real box before placing pins
      // Waiting passengers scattered around the driver. Tapping one opens
      // its ride request, so the full driver flow can be tested solo.
      const waiting = [];
      // Place pins inside the visible map area (with a margin), so all of them
      // show on narrow phone maps too, not just on wide desktop maps.
      const sz = state.map.map.getSize();
      const centerPt = state.map.map.latLngToContainerPoint([myPos.lat, myPos.lng]);
      const rx = Math.max(40, sz.x / 2 - 34);
      const ry = Math.max(40, sz.y / 2 - 44);
      for (let i = 0; i < 6; i++) {
        const ang = (i / 6) * Math.PI * 2 + (myPos.lat * 100 % 1);
        const frac = 0.45 + ((i * 37) % 10) / 20; // 0.45–0.95 of the safe radius
        const pt = state.map.map.containerPointToLatLng([centerPt.x + Math.cos(ang) * rx * frac, centerPt.y + Math.sin(ang) * ry * frac]);
        const pos = { lat: pt.lat, lng: pt.lng };
        const pax = DEMO_PASSENGERS[i % DEMO_PASSENGERS.length];
        // drop-off 3–7 km away in a different direction
        const dAng = ang + Math.PI * (0.6 + (i % 3) * 0.2);
        const dKm = 3 + (i % 5);
        const drop = {
          lat: pos.lat + (Math.sin(dAng) * dKm) / 111.32,
          lng: pos.lng + (Math.cos(dAng) * dKm) / (111.32 * Math.cos(pos.lat * Math.PI / 180)),
        };
        waiting.push({ key: 'pax-' + i, pos, drop, pax });
      }
      waiting.forEach((w) => {
        state.map.setMarker(w.key, w.pos, 'passenger', {
          label: `${w.pax.name.split(' ')[0]} · tap`,
          onClick: () => openPassenger(w),
        });
      });
      state.map.setMarker('me', myPos, 'me');
      reverseGeocode(myPos.lat, myPos.lng).then((place) => {
        state.area = place.city || place.area || '';
        demandNote.textContent = `${waiting.length} passengers waiting around ${state.area || 'your area'}. Tap one to view their ride request.`;
      });

      async function openPassenger(w) {
        const meNow = Users.byId(userId);
        if (!isVerified()) {
          Toast.warn('Verification needed', 'Complete rider verification before accepting rides.');
          App.navigate('profile', { query: { tab: 'verification' } });
          return;
        }
        if (!meNow || !meNow.vehicle) {
          Toast.warn('Add your vehicle', 'Add your vehicle details in Profile before accepting rides.');
          App.navigate('profile', { query: { tab: 'verification' } });
          return;
        }
        if (openPassenger.busy) return; // ignore double taps while loading
        openPassenger.busy = true;
        demandNote.textContent = `Loading ${w.pax.name.split(' ')[0]}'s ride request\u2026`;
        Toast.info('Opening request', `Getting ${w.pax.name.split(' ')[0]}'s pickup and drop-off\u2026`);
        let pk, dp;
        try {
          [pk, dp] = await Promise.all([
            reverseGeocode(w.pos.lat, w.pos.lng),
            reverseGeocode(w.drop.lat, w.drop.lng),
          ]);
        } finally { openPassenger.busy = false; }
        if (!mapBox.isConnected) return; // rider left the dashboard meanwhile
        demandNote.textContent = `Ride request from ${w.pax.name}.`;
        const created = RequestManager.createTestRequest(meNow, {
          passenger: w.pax,
          // snapped to the geocoded address, so neither end can sit in the sea
          pickup: { id: null, name: pk.name || 'Passenger pickup', address: pk.address, lat: pk.lat, lng: pk.lng },
          dropoff: { id: null, name: dp.name || 'Passenger drop-off', address: dp.address, lat: dp.lat, lng: dp.lng },
        });
        if (created && state.map) state.map.removeMarker(w.key);
      }
    }, 60);
  },

  unmount() {
    if (state.ticker) { clearInterval(state.ticker); state.ticker = null; }
    if (state.map) { state.map.destroy(); state.map = null; }
  },
};

export { dashboardView };
