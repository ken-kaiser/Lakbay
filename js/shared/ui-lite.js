/* ==========================================================================
   Lakbay — Small shared UI atoms (kept dependency-light)
   avatarElLite: photo avatar with graceful initials fallback.
   starsRead: readonly star row.
   ========================================================================== */
import { initials, avatarURI } from './format.js';
import { el } from './dom.js';

export function avatarElLite(person, size = '') {
  const span = el('span', { class: `avatar ${size}`.trim() });
  const name = (person && (person.name || person.firstName)) || '?';
  const bg = person && person.hue ? `hsl(${person.hue}, 42%, 38%)` : 'var(--c-primary)';
  span.style.background = bg;
  if (person && person.avatar) {
    const img = el('img', { src: person.avatar, alt: '' });
    img.style.cssText = 'width:100%;height:100%;border-radius:50%;object-fit:cover;position:absolute;inset:0';
    img.onerror = () => { img.remove(); span.textContent = initials(name); };
    span.style.position = 'relative';
    span.appendChild(img);
  } else {
    span.textContent = initials(name);
  }
  return span;
}

export function starsRead(value = 0) {
  // role="img" makes the aria-label valid on a <span> (screen readers read "4 out of 5 stars")
  const wrap = el('span', { class: 'cl-stars-read', role: 'img', 'aria-label': `${value} out of 5 stars` });
  for (let i = 1; i <= 5; i++) {
    wrap.appendChild(el('i', { 'data-lucide': 'star', class: i <= Math.round(value) ? '' : 'star-off' }));
  }
  return wrap;
}

/* Trip stepper — the ride's progression as four labelled stages.
   steps: [label, statuses[]][]; call .paint(status) whenever it changes.
   The current stage is announced via aria-current. */
export function tripStepper(steps, status) {
  const ol = el('ol', { class: 'trip-steps', 'aria-label': 'Trip progress' });
  const items = steps.map(([label]) => {
    const li = el('li', { class: 'trip-step' }, el('span', { class: 'trip-step-bar' }), el('span', { class: 'trip-step-label' }, label));
    ol.appendChild(li);
    return li;
  });
  ol.paint = (st) => {
    const idx = steps.findIndex(([, sts]) => sts.includes(st));
    items.forEach((li, i) => {
      li.classList.toggle('done', idx >= 0 && i < idx);
      li.classList.toggle('current', i === idx);
      if (i === idx) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
    });
  };
  ol.paint(status);
  return ol;
}

/* Payment method mark: the wallet's own brand mark when it has one (GCash,
   Maya), otherwise its icon on a tinted tile (Cash). */
export function payMark(m, cls = 'po-logo') {
  if (m && m.mark) {
    return el('span', { class: `${cls} po-logo--mark` },
      el('img', { src: m.mark, alt: '', width: '36', height: '36', decoding: 'async' }));
  }
  return el('span', { class: cls, style: `background:${m.logoBg};color:${m.logoFg}` }, el('i', { 'data-lucide': m.icon }));
}
