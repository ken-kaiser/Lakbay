/* ==========================================================================
   Lakbay — Passenger ride history (Activity)
   Search, status/service filters, sorting, detail modal with "Book again".
   ========================================================================== */
import { App } from '../app.js';
import { Bookings } from '../storage.js';
import { RIDE_CATEGORIES } from '../data.js';
import { el, clear, qs } from '../shared/dom.js';
import { Icons } from '../shared/icons.js';
import { Toast } from '../shared/toast.js';
import { Modal } from '../shared/modal.js';
import { peso, dateTime, statusEl, initials } from '../shared/format.js';

const filters = { q: '', status: 'all', service: 'all', sort: 'new' };

function decodePoint(v) {
  if (!v) return null;
  try {
    const o = JSON.parse(decodeURIComponent(v));
    if (o && typeof o.lat === 'number') return o;
  } catch (e) { /* not JSON */ }
  return null;
}

function matches(b, f) {
  const hay = `${b.pickup.name} ${b.dropoff.name} ${b.ref} ${b.rider ? b.rider.name : ''}`.toLowerCase();
  if (f.q && !hay.includes(f.q.toLowerCase())) return false;
  if (f.status !== 'all') {
    if (f.status === 'completed' && b.status !== 'completed') return false;
    if (f.status === 'cancelled' && !['cancelled', 'expired'].includes(b.status)) return false;
  }
  if (f.service !== 'all' && b.category !== f.service) return false;
  return true;
}

function rideRow(b) {
  const cat = RIDE_CATEGORIES.find((c) => c.id === b.category) || RIDE_CATEGORIES[1];
  const row = el('button', { class: 'list-item', type: 'button' },
    el('span', { class: 'li-icon' },
      el('img', { src: cat.img, alt: '', style: 'width:100%;height:100%;object-fit:contain', loading: 'lazy',
        onerror: (e) => { const i = el('i', { 'data-lucide': 'car-front' }); e.target.replaceWith(i); } })),
    el('span', { class: 'li-body' },
      el('span', { class: 'li-title clamp-1' }, `${b.pickup.name} → ${b.dropoff.name}`),
      el('span', { class: 'li-sub' }, `${dateTime(b.createdAt)} · ${b.rider ? b.rider.name : cat.name}`),
      el('span', { class: 'row', style: 'gap:6px;margin-top:4px' },
        statusEl(b.status),
        b.rating ? el('span', { class: 'cl-stars-read' }, `${b.rating.stars}`, el('i', { 'data-lucide': 'star' })) : null)),
    el('span', { class: 't-strong t-num nowrap' }, peso(b.fare.total)));
  row.addEventListener('click', () => openDetail(b));
  return row;
}

function openDetail(b) {
  const cat = RIDE_CATEGORIES.find((c) => c.id === b.category) || RIDE_CATEGORIES[1];
  const body = el('div', { class: 'col', style: 'gap:14px' });

  body.appendChild(el('div', {},
    el('div', { class: 'row-between' },
      el('span', { class: 't-xs' }, 'REF ' + b.ref),
      statusEl(b.status)),
    el('p', { class: 't-small', style: 'margin-top:2px' }, dateTime(b.createdAt))));

  body.appendChild(el('div', { class: 'route-line-item' },
    el('span', { class: 'rl-dot' }), el('div', { class: 'grow' },
      el('span', { class: 'rl-label' }, 'From'), el('span', { class: 'rl-value' }, b.pickup.name),
      el('span', { class: 'rl-sub' }, b.pickup.address))));
  body.appendChild(el('div', { class: 'route-line-item' },
    el('span', { class: 'rl-dot rl-dot--end' }), el('div', { class: 'grow' },
      el('span', { class: 'rl-label' }, 'To'), el('span', { class: 'rl-value' }, b.dropoff.name),
      el('span', { class: 'rl-sub' }, b.dropoff.address))));

  const facts = el('div', { class: 'cl-plain-list' });
  [
    ['Ride', cat.name],
    ['Rider', b.rider ? `${b.rider.name} · ${b.rider.vehicle.model} (${b.rider.vehicle.plate})` : 'No rider assigned'],
    ['Distance / time', `${b.distanceKm.toFixed(1)} km · ~${b.durationMin} min`],
    ['Payment', { cash: 'Cash', gcash: 'GCash', maya: 'Maya' }[b.payment.method] || b.payment.method],
    ['Total fare', peso(b.fare.total)],
  ].forEach(([k, v]) => facts.appendChild(el('div', { class: 'row-between' },
    el('span', { class: 't-small' }, k), el('span', { class: 't-strong', style: 'text-align:right' }, v))));
  body.appendChild(facts);

  if (b.status === 'completed') {
    const rr = el('div', { class: 'row-between', style: 'border-top:1px dashed var(--c-line);padding-top:12px' },
      el('span', { class: 't-small' }, 'Your rating'),
      b.rating
        ? el('span', { class: 'cl-stars-read' },
            ...Array.from({ length: 5 }, (_, i) => el('i', { 'data-lucide': 'star', class: i < b.rating.stars ? '' : 'star-off' })),
            el('span', { class: 't-xs', style: 'margin-left:6px' }, b.rating.compliments && b.rating.compliments.length ? b.rating.compliments.join(', ') : ''))
        : el('span', { class: 't-xs' }, 'Not rated yet'));
    body.appendChild(rr);
  }

  const actions = [];
  if (b.status === 'completed') {
    actions.push({ label: 'View receipt', variant: 'outline', icon: 'receipt-text', onClick: (api) => { api.close(true); App.navigate('receipt', { restPath: b.id }); } });
  }
  if (['completed', 'cancelled', 'expired'].includes(b.status)) {
    actions.push({
      label: 'Book again', variant: 'primary', icon: 'rotate-ccw',
      onClick: (api) => {
        api.close(true);
        sessionStorage.removeItem('lakbay:draft');
        App.navigate('rides', { query: {
          from: encodeURIComponent(JSON.stringify({ name: b.pickup.name, address: b.pickup.address, lat: b.pickup.lat, lng: b.pickup.lng })),
          to: encodeURIComponent(JSON.stringify({ name: b.dropoff.name, address: b.dropoff.address, lat: b.dropoff.lat, lng: b.dropoff.lng })),
        } });
      },
    });
  }
  actions.push({ label: 'Close', variant: 'soft', onClick: (api) => api.close(null) });

  Modal.open({ title: 'Ride details', body, actions, wide: true });
}

const activityView = {
  id: 'activity',
  render(root) {
    App.setHeader('Ride history', 'Your past and cancelled trips');

    const wrap = el('div', { class: 'cl-rides-wrap', style: 'max-width:760px' });

    /* filter bar */
    const bar = el('div', { class: 'cl-filter-bar' });
    const searchWrap = el('div', { class: 'input-wrap' },
      el('i', { 'data-lucide': 'search', style: 'position:absolute;left:12px;top:50%;transform:translateY(-50%);width:16px;height:16px;color:var(--c-ink-4);pointer-events:none' }));
    const search = el('input', {
      class: 'input', type: 'search', placeholder: 'Search place, rider, or reference…',
      'aria-label': 'Search ride history', style: 'padding-left:36px',
    });
    searchWrap.appendChild(search);
    bar.appendChild(searchWrap);

    const chipRow = el('div', { class: 'cl-filter-row', role: 'tablist', 'aria-label': 'Filter by status' });
    const svcSel = el('select', { class: 'select', 'aria-label': 'Filter by service type' },
      el('option', { value: 'all' }, 'All services'),
      RIDE_CATEGORIES.map((c) => el('option', { value: c.id }, c.name)));
    const sortSel = el('select', { class: 'select', 'aria-label': 'Sort rides' },
      el('option', { value: 'new' }, 'Newest first'),
      el('option', { value: 'old' }, 'Oldest first'),
      el('option', { value: 'high' }, 'Highest fare'));
    chipRow.append(svcSel, sortSel);
    bar.appendChild(chipRow);
    wrap.appendChild(bar);

    const listWrap = el('div', { class: 'card cl-history-list' });
    wrap.appendChild(listWrap);
    const countNote = el('p', { class: 't-xs', style: 'text-align:center' });
    wrap.appendChild(countNote);

    function paintChips() {
      clear(chipRow);
      [
        ['all', 'All'], ['completed', 'Completed'], ['cancelled', 'Cancelled'],
      ].forEach(([id, label]) => {
        const chip = el('button', {
          class: `chip${filters.status === id ? ' selected' : ''}`, type: 'button', role: 'tab',
          'aria-selected': String(filters.status === id),
        }, label);
        chip.addEventListener('click', () => { filters.status = id; paintChips(); paintList(); });
        chipRow.appendChild(chip);
      });
      chipRow.append(svcSel, sortSel);
    }

    function paintList() {
      clear(listWrap);
      let items = Bookings.all().filter((b) => b.passengerId === App.user.id)
        .filter((b) => ['completed', 'cancelled', 'expired'].includes(b.status))
        .filter((b) => matches(b, filters));
      items.sort((a, b2) => {
        if (filters.sort === 'old') return a.createdAt - b2.createdAt;
        if (filters.sort === 'high') return b2.fare.total - a.fare.total;
        return b2.createdAt - a.createdAt;
      });

      if (!items.length) {
        listWrap.appendChild(el('div', { class: 'empty', style: 'padding:36px 18px' },
          el('img', { src: 'assets/illustrations/empty-rides.png', alt: '', style: 'width:130px;margin:0 auto 12px;opacity:0.9',
            onerror: (e) => e.target.remove() }),
          el('h4', {}, 'No rides here yet'),
          el('p', {}, filters.q || filters.status !== 'all' || filters.service !== 'all'
            ? 'Nothing matches your filters. Try clearing the search or switching the status.'
            : 'Your completed rides will show up here with receipts and quick rebooking.'),
          el('button', { class: 'btn btn--primary btn--sm', style: 'margin-top:12px' }, el('i', { 'data-lucide': 'car-front' }), 'Book a ride'),
        ));
        const bk = listWrap.querySelector('button');
        if (bk) bk.addEventListener('click', () => App.navigate('search', { query: { focus: 'dropoff' } }));
      } else {
        items.forEach((b) => listWrap.appendChild(rideRow(b)));
      }
      countNote.textContent = `${items.length} ride${items.length === 1 ? '' : 's'} shown`;
      Icons.refresh(listWrap);
      Icons.refresh(wrap);
    }

    search.addEventListener('input', () => { filters.q = search.value; paintList(); });
    svcSel.addEventListener('change', () => { filters.service = svcSel.value; paintList(); });
    sortSel.addEventListener('change', () => { filters.sort = sortSel.value; paintList(); });

    root.appendChild(wrap);
    paintChips();
    paintList();
  },
};

export { activityView };
