/* ==========================================================================
   Lakbay — Rider dashboard
   Availability toggle, today's stats, demand map, verification banner,
   recent activity, and service zones.
   ========================================================================== */
import { App } from '../app.js';
import { Bookings, Prefs, Notifs, Users } from '../storage.js';
import { RequestManager } from './requests.js';
import { earningsFor, todayKey, sumRange } from './earnings.js';
import { PLACES, nearbyPlaces } from '../data.js';
import { el, clear, qs } from '../shared/dom.js';
import { Icons } from '../shared/icons.js';
import { Toast } from '../shared/toast.js';
import { confirmDialog } from '../shared/modal.js';
import { createMap } from '../shared/map.js';
import { locateUser, getLastLocation, reverseGeocode } from '../shared/geo.js';
import { peso, timeAgo, firstNameOf } from '../shared/format.js';
import { avatarElLite } from '../shared/ui-lite.js';
import { tickValue } from '../shared/motion.js';

const state = { map: null, ticker: null, onlineAt: null };

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

    const toggleCard = el('div', { class: 'card rd-online-card' });
    const sw = el('button', {
      class: `switch switch--lg${online && isVerified() ? ' on' : ''}`, role: 'switch',
      'aria-checked': String(online && isVerified()), 'aria-label': 'Go online or offline',
    }, el('span', { class: 'knob' }));
    const statusText = el('div', { class: 'grow' });
    const toggleRow = el('div', { class: 'row', style: 'gap:14px' }, statusText, sw);
    toggleCard.appendChild(toggleRow);

    function paintToggle() {
      const on = Prefs.get(userId, 'online', false) && isVerified();
      sw.classList.toggle('on', on);
      sw.setAttribute('aria-checked', String(on));
      clear(statusText);
      const dot = el('span', { class: `rd-status-dot${on ? ' rd-status-dot--online' : ''}` });
      if (isVerified()) {
        statusText.append(
          el('div', { class: 'rd-online-title' }, dot,
            el('span', { class: 't-h3' }, on ? "You're online" : "You're offline")),
          el('div', { class: 't-small' }, on
            ? 'Receiving ride requests around your area.'
            : 'Go online to start receiving ride requests.'),
        );
      } else {
        statusText.append(
          el('div', { class: 'rd-online-title' }, dot,
            el('span', { class: 't-h3' }, 'Verification required')),
          el('div', { class: 't-small' }, 'Submit your documents to activate online mode.'),
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
      const banner = el('button', { class: `card rd-verify-banner ${v === 'pending' ? 'rd-verify-banner--pending' : ''}`, type: 'button' },
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
    const summaryCard = el('div', { class: 'card rd-today-card' });
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
    summaryCard.appendChild(metricsRow);
    wrap.appendChild(summaryCard);

    function setStat(node, text, tick) {
      if (node.textContent === text) return;
      node.textContent = text;
      if (tick) tickValue(node);
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
    const mapCard = el('div', { class: 'card', style: 'padding:14px' });
    mapCard.appendChild(el('div', { class: 'row-between', style: 'margin-bottom:10px' },
      el('h3', { class: 'cl-section-title' }, el('i', { 'data-lucide': 'map' }), 'Demand around you')));
    const mapBox = el('div', { class: 'map-box rd-map-dash' });
    mapCard.appendChild(mapBox);
    const demandNote = el('p', { class: 't-xs', style: 'margin-top:8px' }, 'Finding your location\u2026');
    mapCard.appendChild(demandNote);
    wrap.appendChild(mapCard);

    /* ---- recent activity ---- */
    const acts = Prefs.get(userId, 'riderActions', []).slice(0, 6);
    const actCard = el('div', { class: 'card card-pad' });
    actCard.appendChild(el('h3', { class: 'cl-section-title', style: 'margin-bottom:6px' },
      el('i', { 'data-lucide': 'history' }), 'Recent activity'));
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
        el('h4', {}, 'No activity yet'),
        el('p', {}, 'Your accepts, declines, and completed trips will appear here.')));
    }
    wrap.appendChild(actCard);

    /* ---- service zones strip ---- */
    const zones = el('div', { class: 'card card-pad' });
    zones.appendChild(el('h3', { class: 'cl-section-title', style: 'margin-bottom:8px' },
      el('i', { 'data-lucide': 'map-pinned' }), 'Service zones'));
    const zoneRow = el('div', { class: 'zone-list' });
    ['Makati / BGC', 'QC Diliman-Cubao', 'Ortigas / Pasig', 'Manila / Ermita', 'Pasay / MOA'].forEach((z) => {
      zoneRow.appendChild(el('span', { class: 'zone-item' }, z));
    });
    zones.appendChild(zoneRow);
    zones.appendChild(el('p', { class: 't-xs', style: 'margin-top:8px' }, 'All zones are actively served. Boundary rules are configured per city.'));
    wrap.appendChild(zones);

    root.appendChild(wrap);
    Icons.refresh(root);

    /* map (after layout) — centers on the driver's real location when available */
    let myPos = { lat: 14.5587, lng: 121.0196 };
    setTimeout(async () => {
      if (!mapBox.isConnected) return;
      // locateUser also remembers the fix, so test requests spawn near the rider
      const geo = (await locateUser({ timeout: 5000 })) || getLastLocation();
      if (!mapBox.isConnected) return;
      if (geo) myPos = { lat: geo.lat, lng: geo.lng };
      state.map = createMap(mapBox, { center: [myPos.lat, myPos.lng], zoom: 14 });
      if (!state.map) return;
      // pseudo demand spots scattered around the driver's position
      for (let i = 0; i < 7; i++) {
        const ang = (i / 7) * Math.PI * 2 + (myPos.lat * 100 % 1);
        const dist = 0.004 + ((i * 37) % 10) * 0.0011;
        state.map.setMarker('demand-' + i, { lat: myPos.lat + Math.sin(ang) * dist, lng: myPos.lng + Math.cos(ang) * dist }, 'pulse');
      }
      state.map.setMarker('me', myPos, 'me');
      reverseGeocode(myPos.lat, myPos.lng).then((place) => {
        demandNote.textContent = `Live demand estimates around ${place.city || place.area || 'your area'}.`;
      });
    }, 60);
  },

  unmount() {
    if (state.ticker) { clearInterval(state.ticker); state.ticker = null; }
    if (state.map) { state.map.destroy(); state.map = null; }
  },
};

export { dashboardView };
