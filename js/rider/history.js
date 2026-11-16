/* ==========================================================================
   Lakbay — Rider ride history
   Completed trips (with earnings math), cancelled rides, and declined /
   missed request logs, with search and filters.
   ========================================================================== */
import { App } from '../app.js';
import { Bookings, Prefs } from '../storage.js';
import { RIDE_CATEGORIES } from '../data.js';
import { el, clear } from '../shared/dom.js';
import { Icons } from '../shared/icons.js';
import { Modal } from '../shared/modal.js';
import { peso, dateTime, statusEl, timeAgo } from '../shared/format.js';
import { avatarElLite, starsRead } from '../shared/ui-lite.js';

const filters = { q: '', status: 'all' };

function rideRow(b) {
  const cat = RIDE_CATEGORIES.find((c) => c.id === b.category) || RIDE_CATEGORIES[1];
  const net = b.fare.total - Math.round(b.fare.total * 0.2);
  const row = el('button', { class: 'list-item', type: 'button' },
    el('span', { class: 'li-icon' },
      el('img', { src: cat.img, alt: '', style: 'width:100%;height:100%;object-fit:contain', loading: 'lazy',
        onerror: (e) => { const i = el('i', { 'data-lucide': 'car-front' }); e.target.replaceWith(i); } })),
    el('span', { class: 'li-body' },
      el('span', { class: 'li-title clamp-1' }, `${b.pickup.name} → ${b.dropoff.name}`),
      el('span', { class: 'li-sub' }, `${dateTime(b.createdAt)} · ${b.passengerName}`),
      el('span', { class: 'row', style: 'gap:6px;margin-top:4px' },
        statusEl(b.status),
        b.ratingRider && b.ratingRider.stars ? starsRead(b.ratingRider.stars) : null)),
    el('span', { class: 'col', style: 'align-items:flex-end;gap:2px' },
      el('span', { class: 't-strong t-num' }, peso(b.status === 'completed' ? net : 0, { whole: true })),
      el('span', { class: 't-xs' }, b.status === 'completed' ? 'net' : '—')));
  row.addEventListener('click', () => openDetail(b));
  return row;
}

function openDetail(b) {
  const cat = RIDE_CATEGORIES.find((c) => c.id === b.category) || RIDE_CATEGORIES[1];
  const gross = b.fare.total;
  const commission = Math.round(gross * 0.2);
  const body = el('div', { class: 'col', style: 'gap:13px' });

  body.appendChild(el('div', {},
    el('div', { class: 'row-between' },
      el('span', { class: 't-xs' }, 'REF ' + b.ref),
      statusEl(b.status)),
    el('p', { class: 't-small', style: 'margin-top:2px' }, dateTime(b.createdAt))));

  const paxRow = el('div', { class: 'row', style: 'gap:11px' },
    avatarElLite({ name: b.passengerName, avatar: b.passengerAvatar }),
    el('div', {},
      el('div', { class: 't-strong' }, b.passengerName),
      el('div', { class: 't-xs' }, `${cat.name} · ${b.payment.method === 'cash' ? 'Cash' : b.payment.method === 'gcash' ? 'GCash' : 'Maya'}`)));
  body.appendChild(paxRow);

  body.appendChild(el('div', { class: 'route-line-item' },
    el('span', { class: 'rl-dot' }), el('div', { class: 'grow' },
      el('span', { class: 'rl-label' }, 'Pickup'), el('span', { class: 'rl-value' }, b.pickup.name))));
  body.appendChild(el('div', { class: 'route-line-item' },
    el('span', { class: 'rl-dot rl-dot--end' }), el('div', { class: 'grow' },
      el('span', { class: 'rl-label' }, 'Drop-off'), el('span', { class: 'rl-value' }, b.dropoff.name))));

  const lines = el('div', { class: 'fare-lines' });
  [
    ['Gross fare', peso(gross)],
    ['Platform commission (20%)', '−' + peso(commission)],
    ['Net earnings', peso(gross - commission)],
    ['Distance / time', `${b.distanceKm.toFixed(1)} km · ~${b.durationMin} min`],
  ].forEach(([k, v], i) => lines.appendChild(el('div', { class: `fare-line${i === 2 ? ' fare-line--total' : ''}` },
    el('span', { class: 'fl-label' }, k), el('span', { class: 'fl-val t-num' }, v))));
  body.appendChild(lines);

  Modal.open({ title: 'Trip record', body, actions: [{ label: 'Close', variant: 'soft', onClick: (api) => api.close(null) }] });
}

const riderHistoryView = {
  id: 'activity',
  render(root) {
    App.setHeader('Trip history', 'Completed, cancelled, and missed requests');

    const wrap = el('div', { class: 'cl-rides-wrap', style: 'max-width:760px' });

    const bar = el('div', { class: 'cl-filter-bar' });
    const search = el('input', { class: 'input', type: 'search', placeholder: 'Search passenger, place, or reference…', 'aria-label': 'Search trips' });
    bar.appendChild(search);
    const chipRow = el('div', { class: 'cl-filter-row' });
    bar.appendChild(chipRow);
    wrap.appendChild(bar);

    const listWrap = el('div', { class: 'card cl-history-list' });
    wrap.appendChild(listWrap);
    const note = el('p', { class: 't-xs center' });
    wrap.appendChild(note);

    function paintChips() {
      clear(chipRow);
      [['all', 'All'], ['completed', 'Completed'], ['cancelled', 'Cancelled'], ['declined', 'Declined']].forEach(([id, label]) => {
        const chip = el('button', { class: `chip${filters.status === id ? ' selected' : ''}`, type: 'button' }, label);
        chip.addEventListener('click', () => { filters.status = id; paintChips(); paintList(); });
        chipRow.appendChild(chip);
      });
      Icons.refresh(chipRow);
    }

    function paintList() {
      clear(listWrap);
      const me = App.user.id;
      const trips = Bookings.all().filter((b) => b.riderId === me && ['completed', 'cancelled'].includes(b.status));
      const actions = Prefs.get(me, 'riderActions', [])
        .filter((a) => ['declined', 'missed'].includes(a.type));

      let items = [];
      if (['all', 'completed', 'cancelled'].includes(filters.status)) {
        items.push(...trips.filter((b) => filters.status === 'all' || b.status === filters.status));
      }
      if (['all', 'declined'].includes(filters.status)) {
        actions.forEach((a) => {
          const b = Bookings.byId(a.bookingId);
          items.push({ __action: a.type, booking: b, at: a.at, pickup: b ? b.pickup : null, dropoff: b ? b.dropoff : null });
        });
      }
      if (filters.q) {
        const q = filters.q.toLowerCase();
        items = items.filter((it) => {
          const b = it.booking || it;
          const hay = `${b.pickup ? b.pickup.name : ''} ${b.dropoff ? b.dropoff.name : ''} ${b.ref || ''} ${b.passengerName || ''}`.toLowerCase();
          if (hay.includes(q)) return true;
          if (it.__action && it.__action.includes(q)) return true;
          return false;
        });
      }
      items.sort((a, b2) => (b2.at || b2.createdAt) - (a.at || a.createdAt));

      if (!items.length) {
        listWrap.appendChild(el('div', { class: 'empty', style: 'padding:36px 18px' },
          el('div', { class: 'empty-icon' }, el('i', { 'data-lucide': 'history' })),
          el('h4', {}, 'No records yet'),
          el('p', {}, 'Completed trips and request decisions will be listed here.')));
      } else {
        items.forEach((it) => {
          if (it.__action) {
            const b = it.booking;
            const row = el('div', { class: 'list-item list-item--static' },
              el('span', { class: 'li-icon' }, el('i', { 'data-lucide': it.__action === 'declined' ? 'circle-x' : 'clock-alert' })),
              el('span', { class: 'li-body' },
                el('span', { class: 'li-title' }, it.__action === 'declined' ? 'Declined request' : 'Missed request'),
                el('span', { class: 'li-sub clamp-1' }, b ? `${b.pickup.name} → ${b.dropoff.name}` : 'Booking no longer stored')),
              el('span', { class: 't-xs nowrap' }, timeAgo(it.at)));
            listWrap.appendChild(row);
          } else {
            listWrap.appendChild(rideRow(it));
          }
        });
      }
      const tripsCount = items.filter((i) => !i.__action).length;
      note.textContent = `${tripsCount} trip${tripsCount === 1 ? '' : 's'} · ${items.length - tripsCount} request decision${items.length - tripsCount === 1 ? '' : 's'}`;
      Icons.refresh(listWrap);
    }

    search.addEventListener('input', () => { filters.q = search.value; paintList(); });
    root.appendChild(wrap);
    paintChips();
    paintList();
  },
};

export { riderHistoryView };
