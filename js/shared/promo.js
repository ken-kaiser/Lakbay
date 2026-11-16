/* ==========================================================================
   Lakbay — Promo card (shared)
   Miniature advertising campaigns, not ordinary UI cards. One data source,
   four art-directed compositions (the "Electric Mobility" campaign look):
     hero     — full-bleed midnight stage, oversized 3D car, editorial ₱ type
     showcase — floating dark inset panel, vehicle presented like a product
     discount — lime typographic card, giant % numeral, dark object inset
     compact  — ice white card, circular stage, quiet savings mood
   All variants share the same DNA: tracked kicker, Sora display headline
   split into amount + tail, offer note, voucher chip + copy action.
   Copy/CTA behaviour, promo data, and rail API are unchanged.
   ========================================================================== */
import { el } from './dom.js';

/* One cohesive 3D campaign collection — same studio lighting direction,
   deep green-black world, glossy materials (assets/promos). */
export const PROMO_ART = {
  LAKBAY50: 'assets/promos/campaign-car.webp',
  FIRSTTRIP: 'assets/promos/campaign-helmet.webp',
  MOTOPH: 'assets/promos/campaign-scooter.webp',
  PAYDAY10: 'assets/promos/campaign-coins.webp',
};

/* Card type kicker per code — communicates what kind of card it is */
export const PROMO_KICKER = {
  LAKBAY50: 'Flash sale',
  FIRSTTRIP: 'For new riders',
  MOTOPH: 'Moto week',
  PAYDAY10: 'Payday special',
};

/* Variant per code — keep a varied, campaign-like mix in the rail */
export const PROMO_VARIANT = {
  LAKBAY50: 'midnight',
  FIRSTTRIP: 'lime',
  MOTOPH: 'midnight',
  PAYDAY10: 'ice',
};

/* Composition per code — every campaign gets its own layout, never one
   template with a swapped name (see components.css for the geometry). */
export const PROMO_COMPOSITION = {
  LAKBAY50: 'hero',
  FIRSTTRIP: 'discount',
  MOTOPH: 'showcase',
  PAYDAY10: 'compact',
};

/* Editorial headline: the amount leads ("₱50", "20%"), the rest follows.
   Derived from the existing label — no copy is invented here. */
function splitLabel(label) {
  const text = String(label || '');
  const sp = text.indexOf(' ');
  if (sp === -1) return { big: text, tail: '' };
  return { big: text.slice(0, sp), tail: text.slice(sp + 1) };
}

function headNode(p) {
  const { big, tail } = splitLabel(p.label);
  return el('h4', { class: 'pc-head' },
    el('span', { class: 'pc-big' }, big),
    tail ? el('span', { class: 'pc-tail' }, tail) : null);
}

/* Decorative 3D stage — always aria-hidden; the offer lives in the copy.
   If the asset fails to load the stage removes itself, leaving a clean
   typographic card (artless fallback). */
function artNode(src, wrapperClass) {
  return el('div', { class: wrapperClass, 'aria-hidden': 'true' },
    el('img', {
      src, alt: '', loading: 'lazy', decoding: 'async',
      onerror: (e) => { const w = e.target.parentElement; if (w) w.remove(); },
    }));
}

export function promoCard(p, { variant = null, art = null, onCopy = null } = {}) {
  const v = variant || PROMO_VARIANT[p.code] || 'midnight';
  const comp = PROMO_COMPOSITION[p.code] || 'compact';
  const src = art || PROMO_ART[p.code] || null;

  /* stage wrapper class per composition */
  const stageClass = { hero: 'pc-stage', showcase: 'pc-panel', discount: 'pc-panel pc-panel--dark', compact: 'pc-orb' }[comp];

  const card = el('article', { class: `promo-card promo--${v} promo--${comp}`, style: `--pc-code:${p.code}` },
    src && stageClass ? artNode(src, stageClass) : null,
    el('div', { class: 'pc-body' },
      el('span', { class: 'pc-kicker' }, p.kicker || PROMO_KICKER[p.code] || 'Promo'),
      headNode(p),
      p.note ? el('p', { class: 'pc-note' }, p.note) : null,
      el('div', { class: 'pc-row' },
        el('span', { class: 'pc-code t-num' }, p.code),
        el('button', { class: 'pc-btn', type: 'button', 'aria-label': `Copy promo code ${p.code}` },
          el('i', { 'data-lucide': 'copy' }), el('span', {}, 'Copy code')),
      ),
    ),
  );

  const btn = card.querySelector('.pc-btn');
  btn.addEventListener('click', async () => {
    if (onCopy) return onCopy(p, card);
    try {
      await navigator.clipboard.writeText(p.code);
      btn.classList.add('copied');
      const label = btn.querySelector('span');
      if (label) label.textContent = 'Copied';
      setTimeout(() => { btn.classList.remove('copied'); if (label) label.textContent = 'Copy code'; }, 1600);
    } catch (e) { /* clipboard unavailable — caller fallback */ }
  });
  return card;
}

/* Horizontal rail of promo cards (used on landing + client home).
   Each card gets --pc-i for the staggered entrance. */
export function promoRail(promos, opts = {}) {
  const rail = el('div', { class: 'promo-rail', role: 'group', 'aria-label': 'Promotions' });
  promos.forEach((p, i) => {
    const card = promoCard(p, opts);
    card.style.setProperty('--pc-i', String(i));
    rail.appendChild(card);
  });
  return rail;
}
