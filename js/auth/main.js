/* ==========================================================================
   Lakbay — Welcome, marketing landing + authentication flows
   Renders into index.html #auth-root. Hash routes:
     #/               landing
     #/login?next=    sign in (next = passenger | rider)
     #/register?next= create account (role selectable)
     #/otp            OTP verification (register / reset)
     #/forgot         password reset via OTP
     #/goodbye        signed-out confirmation
   Demo accounts: mika@lakbay.demo / demo1234 (passenger)
                  ronnel@lakbay.demo / demo1234 (rider)
   ========================================================================== */
import { Users, Session, Store, ensureSeeded, seedDemoAccounts, hashPassword } from '../storage.js';
import { RIDE_CATEGORIES, PROMOS } from '../data.js';
import { el, clear, qs, h } from '../shared/dom.js';
import { Icons } from '../shared/icons.js';
import { Toast } from '../shared/toast.js';
import { validate, attachLiveValidation, formatPhoneInput, phoneDisplay, passwordStrength } from '../shared/validation.js';
import { initReveals } from '../shared/motion.js';
import { initSmoothScroll, initParallax, initPointerTilt } from '../shared/motion-plus.js';
import { createInstallButton, maybeShowBanner } from '../shared/install.js';
import { createCarousel } from '../shared/carousel.js';
import { promoRail } from '../shared/promo.js';
import { logoSVG } from '../app.js';

const root = qs('#auth-root');
const state = { otp: null, otpEmail: null, pending: null, reset: null, nextRole: 'passenger' };

/* Landing-only global listeners (scroll spy, scroll-aware header, menu)
   are registered here and torn down before each re-render. */
let landingOff = [];
function track(target, event, fn, opts) {
  target.addEventListener(event, fn, opts);
  landingOff.push(() => target.removeEventListener(event, fn, opts));
}

/* Buttery scroll controller — created per landing render, used by navlinks */
let smoothScroll = null;

/* ---------- router ---------- */
function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [id, q] = raw.split('?');
  return { id: id || 'landing', params: Object.fromEntries(new URLSearchParams(q || '')) };
}

function go(id, params = {}) {
  const q = Object.keys(params).length ? '?' + new URLSearchParams(params).toString() : '';
  location.hash = '/' + id + q;
}

function redirectFor(user) {
  window.location.href = user.role === 'rider' ? 'rider.html' : 'client.html';
}

/* ---------- shared chrome ---------- */
function brandRow(compact = false) {
  return el('a', { class: 'lb-brand' + (compact ? ' lb-brand--sm' : ''), href: '#/', 'aria-label': 'Lakbay home' },
    el('span', { class: 'lb-brand-mark' }, logoSVG()),
    el('span', { class: 'lb-brand-word' }, 'Lak', el('em', {}, 'bay')));
}

function landingHeader(sessionUser) {
  const header = el('header', { class: 'lb-header' },
    el('div', { class: 'container lb-header-in' },
      brandRow(),
      el('nav', { class: 'lb-nav', 'aria-label': 'Landing sections' },
        lbNavLink('Features', 'lb-features'),
        lbNavLink('How it works', 'lb-how'),
        lbNavLink('Fleet & fares', 'lb-fleet'),
        lbNavLink('For riders', 'lb-riders')),
      el('div', { class: 'row', style: 'gap:8px' },
        el('button', { class: 'btn btn--ghost btn--sm', onclick: () => go('login') }, 'Sign in'),
        sessionUser
          ? el('button', { class: 'btn btn--primary btn--sm', onclick: () => redirectFor(sessionUser) },
              el('i', { 'data-lucide': 'arrow-right' }), 'Open app')
          : el('button', { class: 'btn btn--primary btn--sm', onclick: () => go('register') }, 'Get started')),
      mobileMenu()));
  return header;
}

function lbNavLink(label, sectionId) {
  const b = el('button', { class: 'lb-navlink', type: 'button', 'data-section': sectionId }, label);
  b.addEventListener('click', () => {
    const t = qs('#' + sectionId);
    if (!t) return;
    const top = t.getBoundingClientRect().top + window.scrollY - 68;
    if (smoothScroll) smoothScroll.scrollTo(top);
    else t.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  return b;
}

/* Mobile section menu — a midnight dropdown under the sticky header.
   Touch-first rows, closes on selection / Escape / outside click / resize. */
function mobileMenu() {
  const panel = el('div', { class: 'lb-mobile-menu', id: 'lb-mobile-menu' },
    lbNavLink('Features', 'lb-features'),
    lbNavLink('How it works', 'lb-how'),
    lbNavLink('Fleet & fares', 'lb-fleet'),
    lbNavLink('For riders', 'lb-riders'));
  const btn = el('button', {
    class: 'lb-menu-btn', type: 'button',
    'aria-expanded': 'false', 'aria-controls': 'lb-mobile-menu',
    'aria-label': 'Open menu',
  }, el('i', { 'data-lucide': 'menu' }));

  const setOpen = (open) => {
    panel.classList.toggle('open', open);
    btn.setAttribute('aria-expanded', String(open));
    btn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    clear(btn).appendChild(el('i', { 'data-lucide': open ? 'x' : 'menu' }));
    Icons.refresh(btn);
  };

  btn.addEventListener('click', () => setOpen(!panel.classList.contains('open')));
  panel.addEventListener('click', (e) => { if (e.target.closest('.lb-navlink')) setOpen(false); });
  track(document, 'keydown', (e) => { if (e.key === 'Escape' && panel.classList.contains('open')) setOpen(false); });
  track(document, 'click', (e) => {
    if (!panel.classList.contains('open')) return;
    if (e.target.closest('.lb-header')) return;
    setOpen(false);
  });
  track(window, 'resize', () => { if (window.innerWidth >= 900 && panel.classList.contains('open')) setOpen(false); });
  return el('div', { class: 'lb-mobile-wrap' }, btn, panel);
}

/* Scroll spy — lime-lit navlink for the section currently in view.
   Uses a thin band just above the viewport center; clears when the band
   sits on an unmapped area (hero, offers, footer). */
function initScrollSpy(page) {
  const links = [...page.querySelectorAll('.lb-navlink[data-section]')];
  if (!links.length || !('IntersectionObserver' in window)) return;
  const byId = new Map();
  for (const l of links) {
    const id = l.dataset.section;
    if (!byId.has(id)) byId.set(id, []);
    byId.get(id).push(l);
  }
  const sections = [...byId.keys()].map((id) => qs('#' + id, page)).filter(Boolean);
  if (!sections.length) return;
  const setActive = (id) => {
    links.forEach((l) => l.classList.toggle('active', l.dataset.section === id));
  };
  const inBand = new Set();
  const io = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (en.isIntersecting) inBand.add(en.target.id);
      else inBand.delete(en.target.id);
    }
    const current = sections.find((s) => inBand.has(s.id));
    setActive(current ? current.id : '');
  }, { rootMargin: '-42% 0px -52% 0px' });
  sections.forEach((s) => io.observe(s));
  landingOff.push(() => io.disconnect());
}

function authShell(title, sub, body, footLinks = []) {
  const page = el('div', { class: 'lb-auth-page lb-boot' },
    el('div', { class: 'lb-auth-card' },
      el('a', { class: 'lb-brand lb-brand--sm', href: '#/', style: 'align-self:flex-start' },
        el('span', { class: 'lb-brand-mark' }, logoSVG()),
        el('span', { class: 'lb-brand-word' }, 'Lak', el('em', {}, 'bay'))),
      el('div', { class: 'lb-auth-head' },
        el('h1', { class: 't-title' }, title),
        sub ? el('p', { class: 't-body t-muted' }, sub) : null),
      body,
      footLinks.length ? el('div', { class: 'lb-auth-foot' }, ...footLinks) : null));
  return page;
}

function pwField(id, name, label, placeholder, { hint = null, autocomplete = 'new-password' } = {}) {
  const input = el('input', { class: 'input', id, name, type: 'password', placeholder, autocomplete });
  const toggle = el('button', { class: 'pw-toggle', type: 'button', 'aria-label': 'Show password', tabindex: '-1' }, el('i', { 'data-lucide': 'eye' }));
  toggle.addEventListener('click', () => {
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    toggle.innerHTML = '';
    toggle.appendChild(el('i', { 'data-lucide': show ? 'eye-off' : 'eye' }));
    toggle.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    Icons.refresh(toggle);
  });
  const field = el('div', { class: 'field' },
    el('label', { for: id }, label),
    el('div', { class: 'input-wrap' }, input, toggle));
  if (hint) field.appendChild(el('small', { class: 'input-hint' }, hint));
  return field;
}

function otpRow() {
  const row = el('div', { class: 'otp-row' });
  const inputs = [];
  for (let i = 0; i < 6; i++) {
    const inp = el('input', {
      class: 'otp-input', type: 'text', inputmode: 'numeric', maxlength: '1',
      'aria-label': `Digit ${i + 1}`, autocomplete: 'one-time-code',
    });
    inp.addEventListener('input', () => {
      inp.value = inp.value.replace(/\D/g, '').slice(0, 1);
      if (inp.value && i < 5) inputs[i + 1].focus();
    });
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !inp.value && i > 0) inputs[i - 1].focus();
    });
    inp.addEventListener('paste', (e) => {
      const text = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '');
      if (!text) return;
      e.preventDefault();
      text.slice(0, 6).split('').forEach((ch, j) => { if (inputs[j]) inputs[j].value = ch; });
      if (inputs[Math.min(text.length, 5)]) inputs[Math.min(text.length, 5)].focus();
    });
    inputs.push(inp);
    row.appendChild(inp);
  }
  row.getCode = () => inputs.map((i) => i.value).join('');
  row.fill = (code) => String(code).split('').forEach((ch, i) => { if (inputs[i]) inputs[i].value = ch; });
  return row;
}

const OTP_TTL_MS = 5 * 60000; // verification codes last 5 minutes

function makeOtp(email) {
  const code = String(Math.floor(100000 + Math.random() * 900000));
  Store.set('otp:' + email.toLowerCase(), { code, at: Date.now() });
  return code;
}
function checkOtp(email, code) {
  const rec = Store.get('otp:' + email.toLowerCase(), null);
  if (!rec) return false;
  if (Date.now() - rec.at > OTP_TTL_MS) return false;
  return rec.code === String(code);
}

/* ---------- fan deck card (hero) ----------
   One art-directed ride-class card. Position (`pos`) drives the fan
   transform from CSS; content layers (chips / stats / cta / side rail)
   stack above the studio image like the reference travel-card deck. */
function fanCard(o) {
  const sideLeft = o.pos === 'ol' || o.pos === 'il';
  const side = el('div', { class: 'fan-side fan-side--' + (sideLeft ? 'left' : 'right'), 'aria-hidden': 'true' },
    el('span', { class: 'fan-side-label' }, o.side));
  const tag = o.tag ? el('span', { class: 'fan-tag' }, o.tag) : null;

  const kids = [
    el('img', {
      class: 'fan-img', src: o.img, alt: o.alt || '',
      loading: o.pos === 'c' ? 'eager' : 'lazy', decoding: 'async',
      onerror: (e) => { const card = e.target.closest('.fan-card'); if (card) card.classList.add('fan-card--artless'); e.target.remove(); },
    }),
    el('div', { class: 'fan-shade', 'aria-hidden': 'true' }),
    side,
    tag,
  ];

  if (o.chips) {
    kids.push(el('div', { class: 'fan-chips', 'aria-hidden': 'true' },
      ...o.chips.map(([ic, k, v]) => el('span', { class: 'fan-chip' },
        el('i', { 'data-lucide': ic, 'aria-hidden': 'true' }),
        el('span', { class: 'fan-chip-txt' },
          el('small', {}, k),
          el('strong', {}, v))))));
  }

  if (o.stats || o.cta) {
    const foot = el('div', { class: 'fan-foot' });
    if (o.stats) foot.appendChild(el('div', { class: 'fan-stats', 'aria-hidden': 'true' },
      ...o.stats.map(([n, l]) => el('span', { class: 'fan-stat' },
        el('strong', { class: 't-num' }, n),
        el('small', {}, l)))));
    if (o.cta) {
      const btn = el('button', { class: 'fan-cta', type: 'button' }, o.cta[0], el('i', { 'data-lucide': 'arrow-right', 'aria-hidden': 'true' }));
      btn.addEventListener('click', o.cta[1]);
      foot.appendChild(btn);
    }
    kids.push(foot);
  }

  const card = el('article', { class: `fan-card fan-card--${o.pos}` }, ...kids);
  if (o.tilt) card.setAttribute('data-tilt', '');
  return el('div', { class: `lb-fan-item lb-fan-item--${o.pos}` }, card);
}

/* ==========================================================
   Landing view — Electric Lime system.
   Midnight hero with a fanned ride-class deck, drifting route
   pattern, tinted feature carousel, premium how-it-works,
   vehicle fare cards, promo rail, dark CTA band + footer.
   ========================================================== */
function renderLanding() {
  clear(root);
  landingOff.forEach((f) => f());
  landingOff = [];
  ensureSeeded();
  seedDemoAccounts().then(() => { /* refresh header CTA once accounts exist */ });
  const session = Session.get();
  const sessionUser = session ? Users.byId(session.userId) : null;

  const page = el('div', { class: 'lb-landing lb-boot' });
  page.appendChild(landingHeader(sessionUser));

  /* hero — midnight band, drifting route pattern, fanned ride-class deck */
  const hero = el('section', { class: 'lb-hero' },
    el('div', { class: 'lb-hero-bg', 'data-parallax': '0.16', 'aria-hidden': 'true' }),
    el('div', { class: 'lb-hero-glow', 'data-parallax': '-0.08', 'aria-hidden': 'true' }),
    el('div', { class: 'container lb-hero-grid' },
      el('div', { class: 'lb-hero-copy' },
        el('span', { class: 'lb-eyebrow lb-eyebrow--dark' }, 'Ride-hailing for the Philippines'),
        el('h1', { class: 'lb-hero-title' }, 'Sakay na. ', el('em', {}, 'Lakbay'), ' takes you there.'),
        el('p', { class: 'lb-hero-sub' },
          'Book a car or moto, follow your rider live on the map, pay with cash or a wallet, and rate every trip. Two complete apps — passengers and drivers.'),
        el('div', { class: 'lb-hero-cta' },
          el('button', { class: 'btn btn--primary btn--lg', onclick: () => go('login', { next: 'passenger' }) },
            el('i', { 'data-lucide': 'car-front' }), 'Book a ride'),
          el('button', { class: 'btn btn--outline-light btn--lg', onclick: () => go('register', { next: 'rider' }) },
            el('i', { 'data-lucide': 'car-taxi-front' }), 'Drive with Lakbay'),
          createInstallButton({ variant: 'ghost', size: 'lg' })),
        el('div', { class: 'lb-hero-trust' },
          el('span', {}, el('i', { 'data-lucide': 'shield-check' }), 'Verified riders'),
          el('span', {}, el('i', { 'data-lucide': 'map' }), 'OpenStreetMap maps'),
          el('span', {}, el('i', { 'data-lucide': 'database' }), 'Data stays on this device'))),
      el('div', { class: 'lb-hero-art' },
        el('div', { class: 'lb-fan-frame', 'data-parallax': '-0.05' },
          el('div', { class: 'lb-fan', role: 'group', 'aria-label': 'Lakbay ride classes' },
            fanCard({
              pos: 'ol', img: 'assets/promos/campaign-sedan.webp', side: 'Car', tag: 'Most popular',
              alt: 'White Lakbay sedan in a dark studio',
            }),
            fanCard({
              pos: 'il', img: 'assets/promos/campaign-scooter.webp', side: 'Moto', tag: 'Fastest',
              alt: 'Green Lakbay moto in a dark studio',
              chips: [
                ['map-pin', 'Pickup', 'Ortigas Center'],
                ['clock', 'Wait', '2–5 min'],
                ['zap', 'Best for', 'Rush hour'],
              ],
              stats: [['4.8', 'Driver rating'], ['94%', 'Return riders']],
              cta: ['View fares', () => { const t = qs('#lb-fleet'); if (t) smoothScroll.scrollTo(t.getBoundingClientRect().top + window.scrollY - 68); }],
            }),
            fanCard({
              pos: 'c', img: 'assets/illustrations/hero.png', side: 'Premium', tag: 'Editor’s choice',
              alt: 'Lime Lakbay premium car in a dark studio',
              chips: [
                ['map-pin', 'Route', 'Makati → BGC'],
                ['clock', 'Pickup', 'About 4 min'],
                ['user-round', 'Seats', '4 seats'],
                ['briefcase', 'Luggage', '3 bags'],
              ],
              stats: [['4.9', 'Driver rating'], ['96%', 'Return riders'], ['₱153', '6 km fare']],
              cta: ['Book a ride', () => go('login', { next: 'passenger' })],
              tilt: true,
            }),
            fanCard({
              pos: 'ir', img: 'assets/promos/campaign-van.webp', side: 'XL', tag: 'Roomiest',
              alt: 'Silver Lakbay XL van in a dark studio',
            }),
            fanCard({
              pos: 'or', img: 'assets/promos/campaign-coins.webp', side: 'Rewards', tag: 'Payday treats',
              alt: 'Stack of lime reward coins',
            }))))));
  page.appendChild(hero);

  /* features — buttery carousel of tinted capability cards.
     Each card gets its own wash from the brand palette so the rail
     reads like a curated set, not a stack of clones. */
  const feats = [
    ['route', 'lime', 'Live trip tracking', 'Follow your rider approach on an interactive map with a live ETA, from acceptance to drop-off.'],
    ['wallet', 'forest', 'Cash, GCash & Maya', 'Pay how you like with wallets that auto-charge, and get a receipt for every trip.'],
    ['shield-check', 'midnight', 'Verified riders', 'License, vehicle papers, and photos reviewed before a driver can take a single booking.'],
    ['receipt-text', 'amber', 'Fares upfront', 'Base, distance, and time charges itemized before you confirm. Promos apply in one tap.'],
    ['message-circle', 'coral', 'Chat & quick replies', 'Coordinate pickup details with one-tap messages and a full chat thread per ride.'],
    ['chart-column', 'sand', 'Driver earnings', 'A rider dashboard with availability, demand hotspots, daily totals, and cash-outs.'],
  ];
  const featsSec = el('section', { class: 'lb-section', id: 'lb-features' },
    el('div', { class: 'container' },
      el('div', { class: 'lb-sec-head', 'data-reveal': '' },
        el('span', { class: 'lb-eyebrow' }, 'Why Lakbay'),
        el('h2', { class: 'lb-h2' }, 'Everything a ride-hailing app needs'),
        el('p', { class: 'lb-lead' }, 'Both experiences are fully interactive — book, track, pay, and rate a complete journey.')),
      (() => {
        const carRoot = el('div', { class: 'lb-car', 'data-spv': '3' },
          el('div', { class: 'car-viewport' },
            el('div', { class: 'car-track' },
              feats.map(([icon, tone, title, body]) => el('article', { class: 'lb-car-slide' },
                el('article', { class: `lb-feat-card lb-feat--${tone}` },
                  el('span', { class: 'lb-feat-tile', 'aria-hidden': 'true' },
                    el('i', { 'data-lucide': icon })),
                  el('h3', {}, title),
                  el('p', {}, body))))),
          el('div', { class: 'lb-car-foot' },
            el('div', { class: 'car-dots', role: 'tablist', 'aria-label': 'Feature slides' }),
            el('div', { class: 'lb-car-btns' },
              el('button', { class: 'car-prev icon-btn icon-btn--bordered', type: 'button', 'aria-label': 'Previous features' }, el('i', { 'data-lucide': 'arrow-left' })),
              el('button', { class: 'car-next icon-btn icon-btn--bordered', type: 'button', 'aria-label': 'Next features' }, el('i', { 'data-lucide': 'arrow-right' }))))));
        setTimeout(() => {
          createCarousel(carRoot, { slidesPerView: 3, autoplayMs: 4600, label: 'Lakbay features' });
          Icons.refresh(carRoot);
        }, 0);
        return carRoot;
      })()));
  page.appendChild(featsSec);

  /* how it works — paired app columns with a numbered timeline */
  const how = el('section', { class: 'lb-section lb-section--alt', id: 'lb-how' },
    el('div', { class: 'container' },
      el('div', { class: 'lb-sec-head', 'data-reveal': '' },
        el('span', { class: 'lb-eyebrow' }, 'How it works'),
        el('h2', { class: 'lb-h2' }, 'Two apps, one loop'),
        el('p', { class: 'lb-lead' }, 'Book in the passenger app, accept in the rider app — bookings sync live between open tabs.')),
      el('div', { class: 'lb-how-grid' },
        lbHowCol({
          tone: 'light', icon: 'user-round', chip: 'Passenger app', title: 'Ride in three moves',
          cta: ['Book a ride', () => go('login', { next: 'passenger' })],
          steps: [
            ['01', 'map-pin', 'Set your route', 'Pick a saved place, search nearby spots, or drop a pin on the map.'],
            ['02', 'car-front', 'Pick a ride', 'Compare moto, sedan, premium, and XL fares before you book.'],
            ['03', 'star', 'Track & rate', 'Follow your driver live, chat, pay, and rate the trip.'],
          ],
        }),
        lbHowCol({
          tone: 'dark', icon: 'car-taxi-front', chip: 'Rider app', title: 'Earn in three moves', delay: 80,
          cta: ['Become a rider', () => go('register', { next: 'rider' })],
          steps: [
            ['01', 'power', 'Go online', 'Toggle availability and see demand hotspots around you.'],
            ['02', 'bell-ring', 'Accept requests', 'Review pickup, fare, and passenger rating — accept or decline.'],
            ['03', 'banknote', 'Complete & earn', 'Navigate turn by turn, complete trips, and watch daily earnings grow.'],
          ],
        }))));
  page.appendChild(how);

  /* fleet — vehicle fare cards */
  const fleet = el('section', { class: 'lb-section', id: 'lb-fleet' },
    el('div', { class: 'container' },
      el('div', { class: 'lb-sec-head', 'data-reveal': '' },
        el('span', { class: 'lb-eyebrow' }, 'Fleet & fares'),
        el('h2', { class: 'lb-h2' }, 'Four ways to ride'),
        el('p', { class: 'lb-lead' }, 'Sample fares for a typical 6 km run. Every fare is itemized before booking.')),
      el('div', { class: 'lb-fleet-grid' },
        RIDE_CATEGORIES.map((c) => {
          const fare = 45 + Math.round(c.perKm * 6);
          return el('article', { class: 'lb-veh-card', 'data-reveal': '' },
            el('div', { class: 'lb-veh-media' },
              el('img', { src: c.img, alt: `${c.name} vehicle`, loading: 'lazy', onerror: (e) => e.target.remove() })),
            el('div', { class: 'lb-veh-body' },
              el('div', { class: 'lb-veh-top' },
                el('h3', {}, c.name),
                el('span', { class: 'lb-veh-cap' }, el('i', { 'data-lucide': 'user-round' }), c.capacity === 1 ? '1 seat' : `${c.capacity} seats`)),
              el('p', { class: 'lb-veh-desc' }, c.desc),
              el('div', { class: 'lb-veh-foot' },
                el('span', { class: 'lb-veh-fare t-num' }, el('small', {}, 'From '), el('strong', {}, `₱${fare}`)),
                el('button', { class: 'lb-veh-go', type: 'button', 'aria-label': `Book ${c.name}`, onclick: () => go('login', { next: 'passenger' }) },
                  el('i', { 'data-lucide': 'arrow-right' })))));
        }))));
  page.appendChild(fleet);

  /* promos — the expressive campaign rail */
  const promoSec = el('section', { class: 'lb-section lb-section--alt', id: 'lb-promos' },
    el('div', { class: 'container' },
      el('div', { class: 'lb-sec-head', 'data-reveal': '' },
        el('span', { class: 'lb-eyebrow' }, 'Offers'),
        el('h2', { class: 'lb-h2' }, 'Sakay deals, updated weekly'),
        el('p', { class: 'lb-lead' }, 'Copy a code and enter it before confirming your ride — discounts apply instantly at checkout.')),
      el('div', { class: 'lb-promo-wrap', 'data-reveal': '' }, promoRail(PROMOS))));
  page.appendChild(promoSec);

  /* rider CTA — midnight band with bolt watermark */
  const riderCta = el('section', { class: 'lb-section', id: 'lb-riders' },
    el('div', { class: 'container' },
      el('div', { class: 'lb-cta-band brand-routes', 'data-reveal': '' },
        el('span', { class: 'lb-cta-bolt', 'aria-hidden': 'true', html: h`<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M14.25 9.06 21.68 11.24Q23.92 11.9 22.28 13.56L21.01 14.87Q20.25 15.65 19.4 16.32L11.07 22.91Q9.83 23.9 10.05 22.33L10.9 16.05Q11 15.31 11.35 14.65L14.25 9.06Z" fill="currentColor" opacity="0.8"/><path d="M14.25 9.06Q12.23 12.6 11 15.31" fill="none" stroke="rgba(0,0,0,0.32)" stroke-width="1.1" stroke-linecap="round"/><path d="M2.27 13.17Q0.08 12.65 1.69 11.07L11.47 1.45Q12.83 0.1 14.75 0.1L17.25 0.1Q19 0.1 18.18 1.65L14.72 8.18Q14.25 9.06 13.82 9.96L11.23 15.31L2.27 13.17Z" fill="currentColor"/></svg>` }),
        el('div', { class: 'grow' },
          el('h2', { class: 'lb-h2' }, 'Drive when you want. Earn while you move.'),
          el('p', { class: 'lb-lead' }, 'Register as a rider, submit your documents for verification, and run the full request-to-earnings loop — accept bookings from passengers in real time.'),
          el('div', { class: 'lb-hero-cta' },
            el('button', { class: 'btn btn--primary btn--lg', onclick: () => go('register', { next: 'rider' }) }, 'Become a rider'),
            createInstallButton({ variant: 'outline-light', size: 'lg', icon: 'smartphone' }))))));
  page.appendChild(riderCta);

  /* footer — midnight foundation */
  const footer = el('footer', { class: 'lb-footer' },
    el('div', { class: 'container lb-footer-in' },
      el('div', { class: 'lb-footer-brand' },
        brandRow(true),
        el('p', { class: 't-xs' }, 'A ride-hailing app for the Philippines, built with vanilla HTML, CSS, and JavaScript. Maps © OpenStreetMap contributors.')),
      el('div', { class: 'lb-footer-links' },
        el('button', { class: 'lb-navlink', onclick: () => go('login', { next: 'passenger' }) }, 'Passenger sign in'),
        el('button', { class: 'lb-navlink', onclick: () => go('login', { next: 'rider' }) }, 'Rider sign in'),
        el('button', { class: 'lb-navlink', onclick: () => go('register') }, 'Create account')),
      el('div', { class: 'lb-footer-note' },
        el('i', { 'data-lucide': 'smartphone' }),
        el('span', {}, 'Works best on mobile — install Lakbay on your phone for a full-screen app experience.'))));
  page.appendChild(footer);

  root.appendChild(page);
  Icons.refresh(page);
  initReveals(page);
  initScrollSpy(page);

  /* buttery scroll + parallax + pointer tilt (landing only) */
  smoothScroll = initSmoothScroll();
  const parallax = initParallax(page);
  const tilt = initPointerTilt(page);
  landingOff.push(() => { smoothScroll.destroy(); smoothScroll = null; });
  landingOff.push(() => parallax.destroy());
  landingOff.push(() => tilt.destroy());

  /* fan deck — fit the stage to the art column (plus a slice of the page
     margin), then fan the cards out from the centre on load. */
  initFanScale(page);
  const fan = qs('.lb-fan', page);
  if (fan) {
    const items = [...fan.querySelectorAll('.lb-fan-item')];
    items.forEach((it) => {
      const d = getComputedStyle(it).getPropertyValue('--fd').trim();
      if (d) it.style.transitionDelay = d;
    });
    requestAnimationFrame(() => requestAnimationFrame(() => {
      fan.classList.add('is-in');
      setTimeout(() => items.forEach((it) => { it.style.transitionDelay = ''; }), 950);
    }));
  }

  /* scroll-aware header — quiet elevation once the page moves */
  const headerEl = qs('.lb-header', page);
  if (headerEl) {
    const onScroll = () => headerEl.classList.toggle('is-scrolled', window.scrollY > 12);
    track(window, 'scroll', onScroll, { passive: true });
    onScroll();
  }

  maybeShowBanner({ delay: 2600 });
}

/* Scale the fixed-size fan stage down to its column and slide the overflow
   into the page margin, so the deck never clips or covers the hero copy.
   Below 720px the deck switches to a compact mobile geometry (CSS-only). */
function initFanScale(page) {
  const art = qs('.lb-hero-art', page);
  const fan = qs('.lb-fan', page);
  if (!art || !fan) return;
  const apply = () => {
    if (window.innerWidth < 720) {
      art.style.setProperty('--fan-scale', '1');
      art.style.setProperty('--fan-shift', '0px');
      return;
    }
    const stageW = fan.offsetWidth || 1;
    const colW = art.clientWidth || 1;
    const margin = Math.max(0, (window.innerWidth - Math.min(1128, window.innerWidth)) / 2);
    const bleed = Math.max(0, stageW - colW);
    const shift = Math.min(bleed, margin * 0.72);
    const scale = Math.min(1, (colW + shift) / stageW);
    art.style.setProperty('--fan-scale', scale.toFixed(4));
    art.style.setProperty('--fan-shift', `${Math.round(shift * scale)}px`);
  };
  apply();
  const ro = new ResizeObserver(apply);
  ro.observe(art);
  track(window, 'resize', apply);
}

/* ---------- how-it-works column ----------
   One app experience per card: a chrome header (icon tile + app chip),
   a numbered timeline with icon tiles, and a full-width CTA.
   `tone` flips the whole column between ice-white and midnight. */
function lbHowCol({ tone = 'light', icon, chip, title, steps, cta, delay = 0 }) {
  const col = el('div', { class: `lb-how-col lb-how-col--${tone}`, 'data-reveal': '' });
  if (delay) col.style.setProperty('--reveal-delay', `${delay}ms`);

  col.appendChild(el('div', { class: 'lb-how-head' },
    el('span', { class: 'lb-how-badge', 'aria-hidden': 'true' },
      el('i', { 'data-lucide': icon })),
    el('div', { class: 'lb-how-head-txt' },
      el('span', { class: 'lb-how-chip' }, chip),
      el('h3', {}, title))));

  const list = el('ol', { class: 'lb-how-steps' });
  steps.forEach(([num, ic, stepTitle, body]) => {
    list.appendChild(el('li', { class: 'lb-how-step' },
      el('span', { class: 'lb-how-num t-num', 'aria-hidden': 'true' }, num),
      el('span', { class: 'lb-how-tile', 'aria-hidden': 'true' },
        el('i', { 'data-lucide': ic })),
      el('div', { class: 'lb-how-body' },
        el('h4', {}, stepTitle),
        el('p', {}, body))));
  });
  col.appendChild(list);

  const ctaBtn = el('button', { class: `btn ${tone === 'dark' ? 'btn--primary' : 'btn--dark'} btn--lg btn--block` },
    cta[0], el('i', { 'data-lucide': 'arrow-right' }));
  ctaBtn.addEventListener('click', cta[1]);
  col.appendChild(el('div', { class: 'lb-how-foot' }, ctaBtn));

  return col;
}

/* ==========================================================
   Login view
   ========================================================== */
function renderLogin(params) {
  clear(root);
  state.nextRole = params.next === 'rider' ? 'rider' : 'passenger';
  const body = el('div', { class: 'col', style: 'gap:12px' });

  const form = el('form', { novalidate: true, class: 'col', style: 'gap:12px' });
  const email = el('input', { class: 'input', name: 'email', type: 'email', placeholder: 'name@example.com', autocomplete: 'email', 'aria-label': 'Email address' });
  const emailF = el('div', { class: 'field' }, el('label', { for: 'li-email' }, 'Email address'), email);
  email.id = 'li-email';
  const pw = pwField('li-pw', 'password', 'Password', 'Enter your password', { autocomplete: 'current-password' });
  form.append(emailF, pw);

  const submit = el('button', { class: 'btn btn--primary btn--lg btn--block', type: 'submit' }, el('i', { 'data-lucide': 'log-in' }), 'Sign in');
  form.appendChild(submit);

  const err = el('div', { class: 'cl-inline-error', style: 'display:none' }, el('i', { 'data-lucide': 'circle-alert' }), el('span', {}));
  form.appendChild(err);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.style.display = 'none';
    const res = validate(form, { email: [['required'], ['email']], password: [['required']] });
    if (!res.ok) return;
    submit.disabled = true;
    submit.classList.add('btn--loading');
    try {
      await seedDemoAccounts();
      const user = await Users.verify(res.values.email, res.values.password);
      if (!user) {
        err.style.display = 'flex';
        err.querySelector('span').textContent = 'Email or password is incorrect. Please try again.';
        submit.disabled = false;
        submit.classList.remove('btn--loading');
        return;
      }
      Session.set(user);
      Toast.success(`Welcome back, ${user.firstName}!`, user.role === 'rider' ? 'Opening the rider app…' : 'Opening the passenger app…');
      setTimeout(() => redirectFor(user), 450);
    } catch (ex) {
      Toast.error('Sign-in failed', 'Something went wrong. Please try again.');
      submit.disabled = false;
      submit.classList.remove('btn--loading');
    }
  });

  body.append(form);
  attachLiveValidation(form, { email: [['email']] });

  const page = authShell('Welcome back', 'Sign in to book rides or drive with Lakbay.', body, [
    el('button', { class: 'lb-linkbtn', onclick: () => go('forgot') }, 'Forgot password?'),
    el('span', { class: 't-xs' }, 'New to Lakbay?'),
    el('button', { class: 'lb-linkbtn lb-linkbtn--strong', onclick: () => go('register', { next: state.nextRole }) }, 'Create an account'),
  ]);
  root.appendChild(page);
  Icons.refresh(page);
  setTimeout(() => email.focus(), 60);
}

/* ==========================================================
   Register view
   ========================================================== */
function renderRegister(params) {
  clear(root);
  let role = params.next === 'rider' ? 'rider' : 'passenger';

  const roleSel = el('div', { class: 'lb-role-sel', role: 'radiogroup', 'aria-label': 'Account type' });
  function paintRoles() {
    clear(roleSel);
    [
      ['passenger', 'user-round', 'Passenger', 'Book rides around the metro'],
      ['rider', 'car-taxi-front', 'Rider / Driver', 'Accept bookings and earn'],
    ].forEach(([id, icon, label, sub]) => {
      const b = el('button', {
        class: `lb-role${role === id ? ' selected' : ''}`, type: 'button', role: 'radio',
        'aria-checked': String(role === id),
      },
        el('i', { 'data-lucide': icon }),
        el('span', { class: 'grow' }, el('strong', {}, label), el('span', { class: 't-xs', style: 'display:block' }, sub)),
        el('i', { 'data-lucide': 'circle-check-big', class: 'lb-role-check' }));
      b.addEventListener('click', () => { role = id; paintRoles(); });
      roleSel.appendChild(b);
    });
    Icons.refresh(roleSel);
  }
  paintRoles();

  const form = el('form', { novalidate: true, class: 'col', style: 'gap:11px' });
  const fFirst = el('div', { class: 'field' }, el('label', { for: 'rg-first' }, 'First name'),
    el('input', { class: 'input', id: 'rg-first', name: 'firstName', type: 'text', placeholder: 'Enter your first name', autocomplete: 'given-name', maxlength: '40' }));
  const fLast = el('div', { class: 'field' }, el('label', { for: 'rg-last' }, 'Last name'),
    el('input', { class: 'input', id: 'rg-last', name: 'lastName', type: 'text', placeholder: 'Enter your last name', autocomplete: 'family-name', maxlength: '40' }));
  const fEmail = el('div', { class: 'field' }, el('label', { for: 'rg-email' }, 'Email address'),
    el('input', { class: 'input', id: 'rg-email', name: 'email', type: 'email', placeholder: 'name@example.com', autocomplete: 'email' }));
  const fPhone = el('div', { class: 'field' }, el('label', { for: 'rg-phone' }, 'Mobile number'),
    el('input', { class: 'input', id: 'rg-phone', name: 'phone', type: 'tel', placeholder: '0917 123 4567', autocomplete: 'tel', maxlength: '14', inputmode: 'numeric' }),
    el('small', { class: 'input-hint' }, 'Philippine mobile number'));
  fPhone.querySelector('input').addEventListener('input', (e) => { e.target.value = formatPhoneInput(e.target.value); });
  const fPw = pwField('rg-pw', 'password', 'Password', 'Create a password', { hint: '8+ characters with upper & lowercase and a number' });
  const fPw2 = pwField('rg-pw2', 'confirm', 'Confirm password', 'Repeat your password');
  const meter = el('div', { class: 'cl-meter' }, el('div', { class: 'cl-meter-bar' }));
  const meterLabel = el('span', {}, 'Password strength');
  const meterVal = el('span', {}, '—');
  fPw.querySelector('input').addEventListener('input', (e) => {
    const s = passwordStrength(e.target.value);
    const bar = meter.querySelector('.cl-meter-bar');
    bar.style.width = `${(s.score / 5) * 100}%`;
    bar.style.background = s.color;
    meterVal.textContent = e.target.value ? s.label : '—';
  });
  const meterRow = el('div', { class: 'cl-meter-row' }, meterLabel, meterVal);
  const terms = el('input', { class: 'check-input', id: 'rg-terms', name: 'terms', type: 'checkbox' });
  // Wrapped in .field so validation can show "must be checked" under it
  const fTerms = el('div', { class: 'field' },
    el('div', { class: 'check' }, terms,
      el('label', { for: 'rg-terms' }, 'I agree to the Terms & the Data Privacy notice')));

  const row2a = el('div', { class: 'cl-form-2col' }, fFirst, fLast);
  form.append(row2a, fEmail, fPhone, fPw, meter, meterRow, fPw2, fTerms);
  const submit = el('button', { class: 'btn btn--primary btn--lg btn--block', type: 'submit' }, el('i', { 'data-lucide': 'user-plus' }), 'Create account');
  form.appendChild(submit);
  const err = el('div', { class: 'cl-inline-error', style: 'display:none' }, el('i', { 'data-lucide': 'circle-alert' }), el('span', {}));
  form.appendChild(err);
  attachLiveValidation(form, { email: [['email']], phone: [['phone']] });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.style.display = 'none';
    const res = validate(form, {
      firstName: [['required'], ['minlen', 2]],
      lastName: [['required'], ['minlen', 2]],
      email: [['required'], ['email']],
      phone: [['required'], ['phone']],
      password: [['required'], ['password']],
      confirm: [['required'], ['match', 'password']],
      terms: [['checked']],
    });
    if (!res.ok) return;
    submit.disabled = true;
    submit.classList.add('btn--loading');
    try {
      await seedDemoAccounts();
      if (Users.byEmail(res.values.email)) {
        err.style.display = 'flex';
        err.querySelector('span').textContent = 'An account with this email already exists. Sign in instead.';
        submit.disabled = false; submit.classList.remove('btn--loading');
        return;
      }
      // Don't save the account yet: it's created only after the code is
      // verified, so an abandoned or expired verification doesn't leave a
      // half-made account that blocks signing up again with this email.
      state.reset = null;
      state.pending = {
        role,
        firstName: res.values.firstName.trim(),
        lastName: res.values.lastName.trim(),
        email: res.values.email.trim(),
        phone: phoneDisplay(res.values.phone),
        password: res.values.password,
        extra: role === 'rider' ? { verification: { status: 'not_submitted', docs: {} } } : {},
      };
      state.otpEmail = state.pending.email;
      state.otp = makeOtp(state.pending.email);
      Toast.info('Almost done', 'Verify your mobile number to create your account.');
      submit.disabled = false; submit.classList.remove('btn--loading');
      go('otp');
    } catch (ex) {
      err.style.display = 'flex';
      err.querySelector('span').textContent = ex.message || 'Could not create the account.';
      submit.disabled = false; submit.classList.remove('btn--loading');
    }
  });

  const page = authShell('Create your account', 'Join Lakbay as a passenger or rider — registration takes a minute.', el('div', { class: 'col', style: 'gap:12px' }, roleSel, form), [
    el('span', { class: 't-xs' }, 'Already have an account?'),
    el('button', { class: 'lb-linkbtn lb-linkbtn--strong', onclick: () => go('login', { next: params.next || '' }) }, 'Sign in'),
  ]);
  root.appendChild(page);
  Icons.refresh(page);
}

/* ==========================================================
   OTP view (register verification + shared with reset)
   ========================================================== */
function renderOtp() {
  clear(root);
  const email = state.otpEmail;
  if (!email) { go('login'); return; }

  const body = el('div', { class: 'col', style: 'gap:14px' });
  body.appendChild(el('p', { class: 't-body t-muted', style: 'text-align:center' },
    h`We sent a 6-digit code to ${email}. Enter it below to verify your account.`));

  const demoBox = el('div', { class: 'lb-demo-box' },
    el('div', { class: 'row', style: 'gap:6px' }, el('i', { 'data-lucide': 'message-square-text' }), el('strong', {}, 'Verification code')),
    el('p', { class: 't-xs' }, h`Your 6-digit code is `, el('strong', { class: 't-num' }, state.otp), '. It expires in 5 minutes.'));
  const autofill = el('button', { class: 'btn btn--soft btn--sm', type: 'button' }, el('i', { 'data-lucide': 'wand-2' }), 'Autofill code');
  autofill.addEventListener('click', () => { row.fill(state.otp); Toast.info('Code filled', 'Press verify to continue.'); });
  demoBox.appendChild(autofill);

  const row = otpRow();
  const verify = el('button', { class: 'btn btn--primary btn--lg btn--block' }, el('i', { 'data-lucide': 'shield-check' }), 'Verify');
  const resend = el('button', { class: 'lb-linkbtn', type: 'button' }, 'Resend code');
  resend.addEventListener('click', () => {
    state.otp = makeOtp(email);
    demoBox.querySelector('strong.t-num').textContent = state.otp;
    Toast.info('New code sent', 'A fresh verification code was generated.');
  });
  const err = el('div', { class: 'cl-inline-error', style: 'display:none;justify-content:center' }, el('i', { 'data-lucide': 'circle-alert' }), el('span', {}));

  verify.addEventListener('click', async () => {
    const code = row.getCode();
    if (code.length < 6) { err.style.display = 'flex'; err.querySelector('span').textContent = 'Enter all six digits.'; return; }
    if (!checkOtp(email, code)) { err.style.display = 'flex'; err.querySelector('span').textContent = 'That code is invalid or expired. Resend a new one.'; return; }
    if (state.pending) {
      verify.disabled = true;
      let user;
      try {
        user = await Users.create({ ...state.pending, extra: { ...state.pending.extra, phoneVerified: true } });
      } catch (ex) {
        verify.disabled = false;
        err.style.display = 'flex';
        err.querySelector('span').textContent = ex.message || 'Could not create the account.';
        return;
      }
      state.pending = null;
      Store.remove('otp:' + email.toLowerCase());
      Session.set(user);
      Toast.success('Account created!', 'Welcome to Lakbay.');
      setTimeout(() => redirectFor(user), 400);
    } else if (state.reset) {
      go('reset');
    }
  });

  body.append(demoBox, row, err, verify, resend);
  const page = authShell('Verify your account', 'One last step before you ride.', body, [
    el('button', { class: 'lb-linkbtn', onclick: () => go('login') }, 'Back to sign in'),
  ]);
  root.appendChild(page);
  Icons.refresh(page);
  setTimeout(() => row.querySelector('input').focus(), 60);
}

/* ==========================================================
   Forgot + reset views
   ========================================================== */
function renderForgot() {
  clear(root);
  const form = el('form', { novalidate: true, class: 'col', style: 'gap:12px' });
  const email = el('input', { class: 'input', id: 'fg-email', name: 'email', type: 'email', placeholder: 'name@example.com', autocomplete: 'email' });
  form.appendChild(el('div', { class: 'field' }, el('label', { for: 'fg-email' }, 'Email address'), email));
  const submit = el('button', { class: 'btn btn--primary btn--lg btn--block', type: 'submit' }, el('i', { 'data-lucide': 'send' }), 'Send reset code');
  form.appendChild(submit);
  const err = el('div', { class: 'cl-inline-error', style: 'display:none' }, el('i', { 'data-lucide': 'circle-alert' }), el('span', {}));
  form.appendChild(err);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const res = validate(form, { email: [['required'], ['email']] });
    if (!res.ok) return;
    await seedDemoAccounts();
    const user = Users.byEmail(res.values.email);
    if (!user) {
      err.style.display = 'flex';
      err.querySelector('span').textContent = 'No account uses that email. Check the address or create a new account.';
      return;
    }
    state.pending = null; // so the shared OTP screen runs the reset, not a sign-up
    state.reset = user.email;
    state.otpEmail = user.email;
    state.otp = makeOtp(user.email);
    Toast.info('Reset code generated', 'Your verification code will be shown on the next screen.');
    go('otp');
  });

  const page = authShell('Reset your password', 'Enter your account email and we will issue a verification code.', form, [
    el('button', { class: 'lb-linkbtn', onclick: () => go('login') }, 'Back to sign in'),
  ]);
  root.appendChild(page);
  Icons.refresh(page);
}

function renderReset() {
  clear(root);
  const email = state.reset;
  if (!email) { go('forgot'); return; }
  const form = el('form', { novalidate: true, class: 'col', style: 'gap:12px' });
  const fPw = pwField('rs-pw', 'password', 'New password', 'Create a new password', { hint: '8+ characters with upper & lowercase and a number' });
  const fPw2 = pwField('rs-pw2', 'confirm', 'Confirm new password', 'Repeat your new password');
  const meter = el('div', { class: 'cl-meter' }, el('div', { class: 'cl-meter-bar' }));
  fPw.querySelector('input').addEventListener('input', (e) => {
    const s = passwordStrength(e.target.value);
    const bar = meter.querySelector('.cl-meter-bar');
    bar.style.width = `${(s.score / 5) * 100}%`; bar.style.background = s.color;
  });
  form.append(fPw, meter, fPw2);
  const submit = el('button', { class: 'btn btn--primary btn--lg btn--block', type: 'submit' }, el('i', { 'data-lucide': 'key-round' }), 'Set new password');
  form.appendChild(submit);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const vals = {
      password: form.querySelector('#rs-pw').value,
      confirm: form.querySelector('#rs-pw2').value,
    };
    if (!vals.password || vals.password.length < 8 || !/[A-Z]/.test(vals.password) || !/[a-z]/.test(vals.password) || !/\d/.test(vals.password)) {
      Toast.error('Weak password', 'Use 8+ characters with upper, lower, and a number.'); return;
    }
    if (vals.password !== vals.confirm) { Toast.error('Mismatch', 'Passwords do not match.'); return; }
    const user = Users.byEmail(email);
    if (!user) { go('login'); return; }
    const hash = await hashPassword(vals.password);
    Users.update(user.id, { passwordHash: hash });
    Store.remove('otp:' + email.toLowerCase());
    state.reset = null;
    Toast.success('Password updated', 'Sign in with your new password.');
    go('login');
  });

  const page = authShell('Set a new password', `You're resetting the password for ${email}.`, form, [
    el('button', { class: 'lb-linkbtn', onclick: () => go('login') }, 'Cancel'),
  ]);
  root.appendChild(page);
  Icons.refresh(page);
}

/* ==========================================================
   Goodbye view
   ========================================================== */
function renderGoodbye() {
  clear(root);
  const page = authShell('Signed out', 'You have been logged out safely. Your data stays on this device.',
    el('div', { class: 'col', style: 'gap:10px' },
      el('button', { class: 'btn btn--primary btn--lg btn--block', onclick: () => go('login') }, el('i', { 'data-lucide': 'log-in' }), 'Sign in again'),
      el('button', { class: 'btn btn--outline btn--lg btn--block', onclick: () => go('landing') }, 'Back to home')));
  root.appendChild(page);
  Icons.refresh(page);
}

/* ---------- router wiring ---------- */
function renderRoute() {
  const { id, params } = parseHash();
  window.scrollTo(0, 0);
  switch (id) {
    case 'login': return renderLogin(params);
    case 'register': return renderRegister(params);
    case 'otp': return renderOtp();
    case 'forgot': return renderForgot();
    case 'reset': return renderReset();
    case 'goodbye': return renderGoodbye();
    default: return renderLanding();
  }
}

window.addEventListener('hashchange', renderRoute);
renderRoute();
