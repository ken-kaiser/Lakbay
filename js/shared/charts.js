/* ==========================================================================
   Lakbay — Tiny SVG charts (no dependencies)
   Charts.barChart(container, [{label, sub, value}], opts)
   Bars respond to hover, tap, and keyboard focus with a floating value
   tooltip; tapping elsewhere clears the selection.
   ========================================================================== */
import { peso } from './format.js';
import { el } from './dom.js';

function svgEl(tag, attrs = {}) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

/* Vertical bar chart with labels + interactive value tooltips. */
export function barChart(container, data, { height = 200, valueFmt = peso, showValues = false } = {}) {
  container.innerHTML = '';
  container.classList.add('chart-interactive');
  if (!data.length) {
    container.innerHTML = '<div class="t-small t-muted" style="text-align:center;padding:30px 0">No data yet</div>';
    return;
  }
  const W = 720, H = height;
  const padL = 62, padR = 14, padT = 30, padB = 26; // left gutter holds the ₱ axis labels, clear of the bars
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const max = Math.max(...data.map((d) => d.value), 1);
  const bw = Math.min(44, (innerW / data.length) * 0.58);
  const gap = innerW / data.length;

  const svg = svgEl('svg', { class: 'chart-svg', viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'xMidYMid meet' });

  // horizontal grid lines (3)
  for (let i = 1; i <= 3; i++) {
    const y = padT + (innerH * (1 - i / 3));
    svg.appendChild(svgEl('line', { x1: padL, x2: W - padR, y1: y, y2: y, class: 'chart-grid-line' }));
    const lbl = svgEl('text', { x: padL - 10, y: y + 4, class: 'chart-label', 'text-anchor': 'end' });
    lbl.textContent = valueFmt(max * (i / 3), { whole: true });
    svg.appendChild(lbl);
  }

  // tooltip element (HTML, positioned over the SVG)
  const tip = el('div', { class: 'chart-tip', role: 'status', 'aria-hidden': 'true' });

  const bars = [];
  const hitRects = [];
  let activeIdx = -1;

  function setActive(i) {
    if (i === activeIdx) return;
    bars.forEach((b, j) => b.classList.toggle('chart-bar--active', j === i));
    activeIdx = i;
    if (i < 0) { tip.classList.remove('show'); tip.setAttribute('aria-hidden', 'true'); return; }
    const d = data[i];
    const rect = hitRects[i];
    const cx = rect.x.baseVal.value + rect.width.baseVal.value / 2;
    const by = bars[i].y.baseVal.value;
    tip.innerHTML = `<span class="chart-tip-value">${valueFmt(d.value, { whole: true })}</span>`
      + `<span class="chart-tip-label">${d.label}${d.sub ? ' · ' + d.sub : ''}</span>`;
    tip.style.left = `${(cx / W) * 100}%`;
    tip.style.top = `calc(${(by / H) * 100}% - 10px)`;
    tip.classList.add('show');
    tip.setAttribute('aria-hidden', 'false');
  }

  data.forEach((d, i) => {
    const x = padL + gap * i + (gap - bw) / 2;
    const h = Math.max(3, (d.value / max) * innerH);
    const y = padT + innerH - h;
    const rect = svgEl('rect', {
      x, y, width: bw, height: h, class: 'chart-bar' + (d.muted ? ' chart-bar--muted' : ''),
      style: `transform-origin:${x + bw / 2}px ${padT + innerH}px`,
    });
    svg.appendChild(rect);
    bars.push(rect);

    // full-column hit area — generous pointer target, also keyboard focusable
    const hit = svgEl('rect', {
      x: padL + gap * i, y: padT, width: gap, height: innerH,
      class: 'chart-hit', tabindex: '0', role: 'button',
      'aria-label': `${d.label}: ${valueFmt(d.value)}${d.sub ? ', ' + d.sub : ''}`,
    });
    // Mouse: hover shows the value. Touch/pen: a tap toggles it. (A tap also
    // fires a synthetic hover, which used to select and then instantly
    // deselect the bar, so hover is limited to real mice.)
    hit.addEventListener('pointerenter', (ev) => { if (ev.pointerType === 'mouse') setActive(i); });
    hit.addEventListener('focus', () => setActive(i));
    hit.addEventListener('click', (ev) => {
      ev.stopPropagation();
      setActive(ev.pointerType === 'mouse' || activeIdx !== i ? i : -1);
    });
    hit.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); setActive(activeIdx === i ? -1 : i); }
      if (ev.key === 'ArrowRight') { ev.preventDefault(); const n = Math.min(data.length - 1, i + 1); setActive(n); hitRects[n].focus(); }
      if (ev.key === 'ArrowLeft') { ev.preventDefault(); const n = Math.max(0, i - 1); setActive(n); hitRects[n].focus(); }
    });
    svg.appendChild(hit);
    hitRects.push(hit);

    if (showValues && d.value > 0) {
      const v = svgEl('text', { x: x + bw / 2, y: y - 6, class: 'chart-value', 'text-anchor': 'middle' });
      v.textContent = Math.round(d.value / 1000) >= 1 ? (d.value / 1000).toFixed(1) + 'k' : Math.round(d.value);
      svg.appendChild(v);
    }
    const lbl = svgEl('text', { x: x + bw / 2, y: H - 8, class: 'chart-label', 'text-anchor': 'middle' });
    lbl.textContent = d.label;
    svg.appendChild(lbl);
  });

  // tap/click outside any bar clears the selection (mobile-friendly)
  const clearOnOutside = () => setActive(-1);
  svg.addEventListener('click', clearOnOutside);
  svg.addEventListener('pointerleave', (ev) => { if (ev.pointerType === 'mouse') setActive(-1); });

  container.appendChild(svg);
  container.appendChild(tip);
}

/* Simple horizontal breakdown rows (fare composition) */
export function breakdownRows(container, rows) {
  container.innerHTML = '';
  rows.forEach((r) => {
    const row = el('div', { class: 'fare-line' + (r.total ? ' fare-line--total' : '') + (r.discount ? ' fare-line--discount' : '') },
      el('span', { class: 'fl-label' },
        r.icon ? el('i', { 'data-lucide': r.icon }) : null,
        r.label,
      ),
      el('span', { class: 'fl-val' }, r.value),
    );
    container.appendChild(row);
  });
}
