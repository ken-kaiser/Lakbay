/* ==========================================================================
   Lakbay — Rider earnings
   Aggregates completed bookings into daily/weekly/monthly totals, seeds a
   deterministic 30-day history for charts, and manages cash-outs.
   ========================================================================== */
import { App } from '../app.js';
import { Bookings, Prefs, Notifs } from '../storage.js';
import { seededEarnings } from '../data.js';
import { el, clear, qs } from '../shared/dom.js';
import { Icons } from '../shared/icons.js';
import { Toast } from '../shared/toast.js';
import { Modal, confirmDialog } from '../shared/modal.js';
import { barChart } from '../shared/charts.js';
import { peso, dateShort, dateTime } from '../shared/format.js';
import { tickValue } from '../shared/motion.js';

/* Timestamp of the last cash-out — lets the re-rendered balance tick once */
let lastCashOutAt = 0;

/* ---------- aggregation helpers ---------- */
function midnight(ts) { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); }
function dayKey(ts) { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }

function todayKey() { return dayKey(Date.now()); }

function realTrips(userId) {
  return Bookings.all().filter((b) => b.riderId === userId && b.status === 'completed');
}

/* Returns { daily: Map<dayKey, {gross, commission, net, trips, distanceKm}>, today } */
function earningsFor(userId) {
  const daily = new Map();
  const add = (key, gross, trips, km) => {
    const cur = daily.get(key) || { gross: 0, commission: 0, net: 0, trips: 0, distanceKm: 0, date: key };
    cur.gross += gross; cur.commission += Math.round(gross * 0.2); cur.net += gross - Math.round(gross * 0.2);
    cur.trips += trips; cur.distanceKm += km;
    daily.set(key, cur);
  };
  // seeded history for the previous 29 days
  seededEarnings(30).forEach((d) => {
    add(dayKey(d.date), d.gross, d.trips, d.distanceKm);
  });
  // live activity
  realTrips(userId).forEach((b) => {
    add(dayKey(b.completedAt || b.createdAt), b.fare.total, 1, b.distanceKm);
  });
  return { daily };
}

function sumRange(dailyMap, fromKey, toKey) {
  let gross = 0, commission = 0, net = 0, trips = 0;
  const keys = [...dailyMap.keys()].filter((k) => (!fromKey || k >= fromKey) && (!toKey || k <= toKey));
  keys.forEach((k) => {
    const d = dailyMap.get(k);
    gross += d.gross; commission += d.commission; net += d.net; trips += d.trips;
  });
  return { gross, commission, net, trips };
}

function withdrawalsOf(userId) { return Prefs.get(userId, 'withdrawals', []); }

/* ---------- view ---------- */
const earningsView = {
  id: 'earnings',
  render(root) {
    const userId = App.user.id;
    App.setHeader('Earnings', 'Your fares, commission, and cash-outs');

    const { daily } = earningsFor(userId);
    const wk = sumRange(daily, dayKey(Date.now() - 6 * 86400000), todayKey());
    const mo = sumRange(daily, dayKey(Date.now() - 29 * 86400000), todayKey());
    const td = sumRange(daily, todayKey(), todayKey());
    const withdrawn = withdrawalsOf(userId).reduce((s, w) => s + w.amount, 0);
    const balance = mo.net - withdrawn;

    const wrap = el('div', { class: 'rd-stack' });

    /* period summary — one divided metrics card (typography, not boxes) */
    const metricsCard = el('div', { class: 'card earn-metrics' });
    let balanceVal = null;
    [
      ['today', 'Today', peso(td.net, { whole: true }), `${td.trips} trip${td.trips === 1 ? '' : 's'}`],
      ['week', 'This week', peso(wk.net, { whole: true }), `${wk.trips} trips`],
      ['month', 'This month', peso(mo.net, { whole: true }), `${mo.trips} trips`],
      ['balance', 'Available balance', peso(Math.max(0, balance), { whole: true }), 'after commission & cash-outs', true],
    ].forEach(([id, label, val, sub, emphasize]) => {
      const metric = el('div', { class: `earn-metric${emphasize ? ' earn-metric--em' : ''}` },
        el('span', { class: 't-overline' }, label),
        el('span', { class: 'earn-metric-value t-num' }, val),
        sub ? el('span', { class: 'earn-metric-sub' }, sub) : null);
      if (id === 'balance') balanceVal = metric.querySelector('.earn-metric-value');
      metricsCard.appendChild(metric);
    });
    wrap.appendChild(metricsCard);
    if (balanceVal && Date.now() - lastCashOutAt < 2500) tickValue(balanceVal);

    /* chart */
    const chartCard = el('div', { class: 'card card-pad' });
    chartCard.appendChild(el('div', { class: 'row-between', style: 'margin-bottom:4px' },
      el('h3', { class: 'cl-section-title' }, el('i', { 'data-lucide': 'chart-column' }), 'Net earnings · last 7 days')));
    const chartBox = el('div', { class: 'chart-wrap' });
    chartCard.appendChild(chartBox);
    wrap.appendChild(chartCard);

    const chartData = [];
    for (let i = 6; i >= 0; i--) {
      const ts = Date.now() - i * 86400000;
      const k = dayKey(ts);
      const d = daily.get(k);
      const trips = d ? d.trips : 0;
      chartData.push({
        label: new Date(ts).toLocaleDateString('en-PH', { weekday: 'short' }),
        value: d ? d.net : 0,
        sub: `${trips} trip${trips === 1 ? '' : 's'}`,
        muted: !d || !d.trips,
      });
    }
    chartCard.appendChild(el('p', { class: 't-xs', style: 'margin-top:2px' }, 'Hover or tap a bar to see that day\u2019s net earnings.'));
    setTimeout(() => barChart(chartBox, chartData, { height: 210, showValues: false }), 50);

    /* monthly breakdown */
    const bd = el('div', { class: 'card card-pad' });
    bd.appendChild(el('h3', { class: 'cl-section-title', style: 'margin-bottom:8px' },
      el('i', { 'data-lucide': 'receipt-text' }), 'This month breakdown'));
    const lines = el('div', { class: 'fare-lines' });
    [
      ['Gross fares', peso(mo.gross)],
      ['Platform commission (20%)', '−' + peso(mo.commission)],
      ['Net earnings', peso(mo.net)],
      ['Distance driven', `${mo.trips > 0 ? Math.round(mo.trips * 6.4) : 0} km (est.)`],
      ['Completed trips', `${mo.trips}`],
    ].forEach(([k, v], i) => lines.appendChild(el('div', { class: `fare-line${i === 2 ? ' fare-line--total' : ''}` },
      el('span', { class: 'fl-label' }, k), el('span', { class: 'fl-val t-num' }, v))));
    bd.appendChild(lines);
    bd.appendChild(el('p', { class: 't-xs', style: 'margin-top:8px' },
      'Daily history beyond today is drawn from your trip records, so charts and totals stay stable across reloads.'));
    wrap.appendChild(bd);

    /* cash out */
    const co = el('div', { class: 'card card-pad' });
    co.appendChild(el('h3', { class: 'cl-section-title', style: 'margin-bottom:4px' },
      el('i', { 'data-lucide': 'banknote' }), 'Cash out'));
    co.appendChild(el('p', { class: 't-small' },
      `Available: ${peso(Math.max(0, balance))}. Minimum cash-out is ₱200. Payouts are sent to your registered account.`));
    const methodSel = el('select', { class: 'select', id: 'co-method', 'aria-label': 'Payout method' },
      el('option', { value: 'gcash' }, 'GCash · ' + ((App.user.payout && App.user.payout.gcash) || '+63 918 ••• 2233')),
      el('option', { value: 'bank' }, 'Bank transfer · ' + ((App.user.payout && App.user.payout.bank) || 'BPI ••4471')));
    const amount = el('input', { class: 'input', id: 'co-amount', type: 'number', min: '200', step: '50', placeholder: 'Amount (min ₱200)', 'aria-label': 'Cash out amount' });
    const coRow = el('div', { class: 'cl-form-2col', style: 'margin-top:10px' },
      el('div', { class: 'field' }, el('label', { for: 'co-method' }, 'Payout method'), methodSel),
      el('div', { class: 'field' }, el('label', { for: 'co-amount' }, 'Amount'), amount));
    const coBtn = el('button', { class: 'btn btn--primary', style: 'margin-top:4px' }, el('i', { 'data-lucide': 'arrow-right-to-line' }), 'Cash out');
    co.append(coRow, coBtn);
    coBtn.addEventListener('click', () => {
      const amt = Math.round(Number(amount.value) || 0);
      if (amt < 200) { Toast.error('Too small', 'Minimum cash-out is ₱200.'); return; }
      if (amt > balance) { Toast.error('Insufficient balance', `You can cash out up to ${peso(Math.max(0, balance), { whole: true })}.`); return; }
      const list = withdrawalsOf(userId);
      list.unshift({ id: 'w_' + Date.now().toString(36), amount: amt, method: methodSel.value, at: Date.now(), status: 'processing' });
      Prefs.set(userId, 'withdrawals', list);
      Notifs.push({ userId, role: 'rider', title: 'Cash-out requested', body: `${peso(amt, { whole: true })} via ${methodSel.value === 'gcash' ? 'GCash' : 'bank transfer'}.`, icon: 'banknote', tone: 'primary' });
      Toast.success('Cash-out requested', `${peso(amt, { whole: true })} is on the way.`);
      lastCashOutAt = Date.now();
      App.navigate('earnings', {}, { replace: true });
    });

    /* withdrawal history */
    const wh = withdrawalsOf(userId);
    if (wh.length) {
      const list = el('div', { class: 'list', style: 'margin-top:10px' });
      wh.slice(0, 8).forEach((w) => {
        list.appendChild(el('div', { class: 'list-item list-item--static' },
          el('span', { class: 'li-icon' }, el('i', { 'data-lucide': w.method === 'gcash' ? 'smartphone' : 'landmark' })),
          el('span', { class: 'li-body' },
            el('span', { class: 'li-title' }, w.method === 'gcash' ? 'GCash payout' : 'Bank transfer'),
            el('span', { class: 'li-sub' }, dateTime(w.at))),
          el('span', { class: 't-strong t-num nowrap' }, '−' + peso(w.amount, { whole: true }))));
      });
      co.appendChild(list);
    }
    wrap.appendChild(co);

    root.appendChild(wrap);
    Icons.refresh(root);
  },
};

export { earningsView, earningsFor, todayKey, sumRange, dayKey };
