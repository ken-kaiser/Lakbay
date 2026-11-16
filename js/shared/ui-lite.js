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
  const wrap = el('span', { class: 'cl-stars-read', 'aria-label': `${value} out of 5 stars` });
  for (let i = 1; i <= 5; i++) {
    wrap.appendChild(el('i', { 'data-lucide': 'star', class: i <= Math.round(value) ? '' : 'star-off' }));
  }
  return wrap;
}
