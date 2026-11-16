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
import { RIDE_CATEGORIES, PROMOS, PAYMENT_METHODS, estimateFare, estimateDurationMin, applyPromo, getPromo } from '../data.js';
import { el, clear, qs, h } from '../shared/dom.js';
import { Icons } from '../shared/icons.js';
import { Toast } from '../shared/toast.js';
import { validate, attachLiveValidation, formatPhoneInput, phoneDisplay, passwordStrength } from '../shared/validation.js';
import { initReveals, prefersReducedMotion, withViewTransition } from '../shared/motion.js';
import { createInstallButton, maybeShowBanner } from '../shared/install.js';
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

/* Jump to a landing section below the sticky header. Uses the browser's own
   smooth scroll for clicked links only (instant when reduced motion is on);
   wheel/trackpad scrolling is never intercepted. */
function scrollToSection(selector) {
  const t = qs(selector);
  if (!t) return;
  const top = t.getBoundingClientRect().top + window.scrollY - 68;
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.scrollTo({ top, behavior: reduce ? 'auto' : 'smooth' });
}

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
        ...NAV.map(([l, id]) => lbNavLink(l, id))),
      el('div', { class: 'row', style: 'gap:8px' },
        el('button', { class: 'btn btn--ghost btn--sm', onclick: () => go('login') }, 'Sign in'),
        sessionUser
          ? el('button', { class: 'btn btn--primary btn--sm', onclick: () => redirectFor(sessionUser) },
              el('i', { 'data-lucide': 'arrow-right' }), 'Open app')
          : el('button', { class: 'btn btn--primary btn--sm', onclick: () => go('register') }, 'Get started')),
      mobileMenu()));
  return header;
}

const NAV = [['Product', 'lb-features'], ['Journey', 'lb-journey'], ['Fleet & fares', 'lb-fleet'], ['Drive', 'lb-riders']];

function lbNavLink(label, sectionId) {
  const b = el('button', { class: 'lb-navlink', type: 'button', 'data-section': sectionId }, label);
  b.addEventListener('click', () => scrollToSection('#' + sectionId));
  return b;
}

/* Mobile section menu — a midnight dropdown under the sticky header.
   Touch-first rows, closes on selection / Escape / outside click / resize. */
function mobileMenu() {
  const panel = el('div', { class: 'lb-mobile-menu', id: 'lb-mobile-menu' },
    ...NAV.map(([l, id]) => lbNavLink(l, id)));
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
  const page = el('main', { class: 'lb-auth-page lb-boot' },
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

/* ==========================================================
   Landing — art direction notes
   Midnight hero with a fanned ride-class deck · editorial product
   section built from real interface previews · pinned horizontal
   journey · photo-led fleet rail · individually composed offers ·
   rider recruitment band. Every number shown comes from the same
   fare engine and data the apps use (js/data.js).
   ========================================================== */

/* Sample trip used for every quoted fare on the landing page */
const SAMPLE_KM = 6;
const SAMPLE_MIN = estimateDurationMin(SAMPLE_KM);
const fareFrom = (id) => estimateFare(id, SAMPLE_KM, SAMPLE_MIN).total;

/* Studio-lit campaign photography — one lighting world for the fleet.
   `pos` is the crop focus (the front of each vehicle). */
const RIDE_ART = {
  moto: { src: 'assets/promos/campaign-scooter.webp', pos: '62% 58%', note: 'Fastest in traffic' },
  car: { src: 'assets/promos/campaign-sedan.webp', pos: '60% 60%', note: 'Most booked' },
  premium: { src: 'assets/illustrations/hero.png', pos: '64% 58%', note: 'Top-rated drivers' },
  xl: { src: 'assets/promos/campaign-van.webp', pos: '58% 60%', note: 'Room for the barkada' },
};

const reduceMotion = () => prefersReducedMotion();

/* ---------- fan deck card (hero) ----------
   Photograph first: one quiet caption (class + starting fare) and
   nothing else on the image. Position (`pos`) drives the fan geometry. */
function fanCard(o) {
  return el('div', { class: `lb-fan-item lb-fan-item--${o.pos}` },
    el('figure', { class: 'fan-card' },
      el('img', {
        class: 'fan-img', src: o.img, alt: o.alt,
        style: `object-position:${o.focus}`,
        loading: o.pos === 'c' ? 'eager' : 'lazy', decoding: 'async',
        fetchpriority: o.pos === 'c' ? 'high' : null,
        onerror: (e) => { e.target.closest('.fan-card')?.classList.add('fan-card--artless'); e.target.remove(); },
      }),
      el('figcaption', { class: 'fan-cap' },
        el('span', { class: 'fan-cap-name' }, o.name),
        el('span', { class: 'fan-cap-meta t-num' }, o.meta))));
}

/* ---------- stylised map (shared by every map preview) ----------
   Static SVG streets + a route; `mover` animates a marker along the
   route with SMIL (pauses on its own when the tab is hidden). With
   reduced motion the marker simply sits at its end point. */
let mapSeq = 0;
function mapArt({ theme = 'light', size = 'tall', route, mover = null, travelled = null, pickup = null, dest = null }) {
  const id = `lbmap${++mapSeq}`;
  const [w, hgt] = size === 'wide' ? [560, 380] : [280, 360];
  const c = theme === 'dark'
    ? { bg: '#141F1A', block: '#18251F', park: '#1B2D21', major: '#24342C', minor: '#1E2C25', route: '#B6F500', ghost: 'rgba(182,245,0,0.22)' }
    : { bg: '#E7ECE1', block: '#DEE4D6', park: '#D2E5BD', major: '#FFFFFF', minor: '#F4F6EF', route: '#101A17', ghost: 'rgba(16,26,23,0.18)' };
  const grid = size === 'wide'
    ? { major: 'M0 60H560M0 170H560M0 290H560M70 0V380M210 0V380M350 0V380M490 0V380', minor: 'M0 115H560M0 230H560M140 0V380M280 0V380M420 0V380', avenue: 'M-20 340C140 300 260 120 580 96', parks: [[362, 72, 116, 86], [150, 242, 120, 40]] }
    : { major: 'M0 70H280M0 180H280M0 290H280M50 0V360M150 0V360M235 0V360', minor: 'M0 125H280M0 235H280M100 0V360M195 0V360', avenue: 'M-10 250L290 40', parks: [[160, 80, 66, 90], [60, 300, 80, 50]] };
  const parks = grid.parks.map(([x, y, pw, ph]) => `<rect x="${x}" y="${y}" width="${pw}" height="${ph}" rx="6" fill="${c.park}"/>`).join('');
  let motion = '';
  if (mover) {
    const [from, to, dur] = mover;
    const kp = reduceMotion() ? `${to};${to}` : `${from};${to}`;
    const rep = reduceMotion() ? 'fill="freeze"' : 'repeatCount="indefinite"';
    motion = `<g><circle r="11" fill="${theme === 'dark' ? '#B6F500' : '#101A17'}" stroke="${theme === 'dark' ? '#101A17' : '#FFFFFF'}" stroke-width="3"/><circle r="3.5" fill="${theme === 'dark' ? '#101A17' : '#B6F500'}"/><animateMotion dur="${dur}s" ${rep} calcMode="linear" keyPoints="${kp}" keyTimes="0;1"><mpath href="#${id}-r"/></animateMotion></g>`;
  }
  const done = travelled
    ? `<path d="${route}" pathLength="100" fill="none" stroke="${c.route}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="${reduceMotion() ? travelled[1] : travelled[0]} 100">${reduceMotion() ? '' : `<animate attributeName="stroke-dasharray" values="${travelled[0]} 100;${travelled[1]} 100" dur="${mover ? mover[2] : 8}s" repeatCount="indefinite"/>`}</path>`
    : `<path d="${route}" fill="none" stroke="${c.route}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`;
  const pin = (p, kind) => (!p ? '' : kind === 'pickup'
    ? `<circle cx="${p[0]}" cy="${p[1]}" r="16" fill="${c.route}" opacity="0.14"/><circle cx="${p[0]}" cy="${p[1]}" r="7" fill="${theme === 'dark' ? '#F4F6EF' : '#FFFFFF'}" stroke="${c.route}" stroke-width="4"/>`
    : `<rect x="${p[0] - 8}" y="${p[1] - 8}" width="16" height="16" rx="3" fill="${c.route}"/><rect x="${p[0] - 3}" y="${p[1] - 3}" width="6" height="6" rx="1" fill="${theme === 'dark' ? '#101A17' : '#B6F500'}"/>`);
  const svg = `<svg viewBox="0 0 ${w} ${hgt}" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
    <rect width="${w}" height="${hgt}" fill="${c.bg}"/>${parks}
    <path d="${grid.minor}" stroke="${c.minor}" stroke-width="6" fill="none"/>
    <path d="${grid.major}" stroke="${c.major}" stroke-width="11" fill="none"/>
    <path d="${grid.avenue}" stroke="${c.major}" stroke-width="15" fill="none" stroke-linecap="round"/>
    <path id="${id}-r" d="${route}" fill="none" stroke="${c.ghost}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"${travelled ? '' : ' opacity="0"'}/>
    ${done}${pin(pickup, 'pickup')}${pin(dest, 'dest')}${motion}</svg>`;
  const wrap = el('div', { class: 'lb-map' });
  wrap.innerHTML = svg; // static markup only — no user data is interpolated
  return wrap;
}

/* Small reusable bits for the interface previews */
const uiAvatar = (src, cls = '') => el('img', { class: 'lb-ui-avatar ' + cls, src, alt: '', loading: 'lazy', decoding: 'async' });
const uiIcon = (name) => el('i', { 'data-lucide': name, 'aria-hidden': 'true' });
const featLabel = (num, text) => el('p', { class: 'lb-feat-label' }, el('span', { class: 't-num' }, num), text);

/* ---------- product previews ---------- */
function trackPreview() {
  return el('div', { class: 'lb-track-stage', 'data-reveal': 'media' },
    mapArt({
      theme: 'dark', size: 'wide',
      route: 'M490 330V230H350V170H210V115H140',
      mover: [0, 0.94, 11], pickup: [140, 115],
    }),
    el('span', { class: 'lb-live', 'aria-hidden': 'true' }, el('span', { class: 'lb-live-dot' }), 'Live'),
    el('div', { class: 'lb-eta-sheet' },
      uiAvatar('assets/avatars/d3.png'),
      el('div', { class: 'lb-eta-txt' },
        el('strong', {}, 'Jun is 3 min away'),
        el('span', {}, 'White Toyota Vios · ★ 4.8')),
      el('span', { class: 'lb-ui-plate t-num' }, 'UVX 3310')));
}

function farePreview() {
  const fare = applyPromo(estimateFare('car', SAMPLE_KM, SAMPLE_MIN), getPromo('LAKBAY50'));
  const row = (k, v, cls = '') => el('div', { class: 'lb-rc-row ' + cls }, el('span', {}, k), el('span', { class: 't-num' }, v));
  const receipt = el('div', { class: 'lb-receipt' },
    el('div', { class: 'lb-rc-head' },
      el('div', {}, el('strong', {}, 'Lakbay Car'), el('span', {}, `Ortigas Center → BGC · ${fare.km} km`)),
      el('span', { class: 'lb-rc-eta t-num' }, `${fare.mins} min`)),
    row('Base fare', `₱${fare.base}`),
    row(`Distance · ${fare.km} km`, `₱${fare.distance}`),
    row(`Time · ${fare.mins} min`, `₱${fare.duration}`),
    row('Platform fee', `₱${fare.platformFee}`),
    row(`Promo · ${fare.promoCode}`, `−₱${fare.discount}`, 'lb-rc-promo'),
    row('You pay', `₱${fare.total}`, 'lb-rc-total'),
    el('span', { class: 'lb-ui-btn lb-ui-btn--dark' }, 'Confirm Lakbay Car'));
  const wallet = el('div', { class: 'lb-wallet' },
    el('strong', { class: 'lb-wallet-h' }, 'Pay with'),
    ...PAYMENT_METHODS.map((m) => el('div', { class: 'lb-wallet-row' + (m.id === 'gcash' ? ' is-on' : '') },
      el('span', { class: 'lb-wallet-logo', style: `background:${m.logoBg};color:${m.logoFg}` }, m.logo.slice(0, 1)),
      el('span', { class: 'lb-wallet-txt' }, el('strong', {}, m.name), el('small', {}, m.sub)),
      el('span', { class: 'lb-wallet-radio', 'aria-hidden': 'true' }))));
  return el('div', { class: 'lb-fare-stage', 'data-reveal': 'media' }, receipt, wallet);
}

function verifyPreview() {
  const checks = ['Driver’s license', 'OR / CR vehicle papers', 'NBI clearance', 'Face match'];
  return el('div', { class: 'lb-verify-stage', 'data-reveal': 'media' },
    el('img', { class: 'lb-verify-photo', src: 'assets/promos/campaign-van.webp', alt: 'Grey Lakbay XL van in a dark studio', loading: 'lazy', decoding: 'async' }),
    el('div', { class: 'lb-profile' },
      el('div', { class: 'lb-profile-top' },
        uiAvatar('assets/avatars/d2.png', 'lb-ui-avatar--lg'),
        el('div', {},
          el('strong', {}, 'Aina Villanueva'),
          el('span', { class: 't-num' }, '★ 4.92 · 6,208 trips')),
        el('span', { class: 'lb-verified' }, uiIcon('badge-check'), 'Verified')),
      el('ul', { class: 'lb-checks' },
        ...checks.map((c) => el('li', {}, uiIcon('check'), c))),
      el('div', { class: 'lb-profile-veh' },
        el('span', {}, 'Toyota Innova · Pearl white'),
        el('span', { class: 'lb-ui-plate t-num' }, 'KAA 7732'))));
}

function chatPreview() {
  const msg = (who, text, t) => el('div', { class: `lb-msg lb-msg--${who}` }, el('p', {}, text), el('small', { class: 't-num' }, t));
  return el('div', { class: 'lb-chat', 'data-reveal': 'media' },
    el('div', { class: 'lb-chat-head' },
      uiAvatar('assets/avatars/d3.png'),
      el('div', {}, el('strong', {}, 'Jun · Toyota Vios'), el('span', {}, 'Arriving in 2 min'))),
    el('div', { class: 'lb-chat-thread' },
      msg('them', 'On my way po. Nasa Meralco Ave na ako.', '8:41'),
      msg('me', 'Sa gate po ako, near the guard house.', '8:42'),
      msg('them', 'Copy po, I see you. Black Vios.', '8:43')),
    el('div', { class: 'lb-chat-quick', 'aria-hidden': 'true' },
      el('span', {}, 'I’m at the pickup point.'),
      el('span', {}, 'Please wait a moment.')));
}

function earningsPreview() {
  const days = [['M', 62], ['T', 48], ['W', 74], ['T', 55], ['F', 88], ['S', 100], ['S', 70]];
  return el('div', { class: 'lb-earn', 'data-reveal': 'media' },
    el('div', { class: 'lb-earn-head' },
      el('span', {}, 'This week'),
      el('span', { class: 'lb-earn-up t-num' }, '+12%')),
    el('strong', { class: 'lb-earn-total t-num' }, '₱8,420'),
    el('div', { class: 'lb-earn-bars', 'aria-hidden': 'true' },
      ...days.map(([d, v], i) => el('div', { class: 'lb-earn-col' + (i === 5 ? ' is-today' : '') },
        el('span', { style: `--v:${v};--i:${i}` }), el('small', {}, d)))),
    el('div', { class: 'lb-earn-foot t-num' },
      el('span', {}, el('strong', {}, '₱1,260'), ' today'),
      el('span', {}, el('strong', {}, '9'), ' trips'),
      el('span', {}, el('strong', {}, '6.5 h'), ' online')));
}

/* ---------- journey phone screens ---------- */
function phone(...kids) {
  return el('div', { class: 'lb-phone', 'aria-hidden': 'true' }, el('div', { class: 'lb-phone-screen' }, ...kids));
}
const sheet = (...kids) => el('div', { class: 'lb-ui-sheet' }, ...kids);

function journeyScreens() {
  const carFare = fareFrom('car');
  return [
    phone(
      el('div', { class: 'lb-ui-top' }, el('strong', { class: 'lb-ui-h' }, 'Where to?')),
      el('div', { class: 'lb-ui-fields' },
        el('div', { class: 'lb-ui-field' }, el('span', { class: 'lb-ui-dot' }), el('span', {}, el('small', {}, 'Pickup'), 'Ortigas Center')),
        el('div', { class: 'lb-ui-field is-focus' }, el('span', { class: 'lb-ui-dot lb-ui-dot--sq' }), el('span', {}, el('small', {}, 'Drop-off'), 'Bonifacio High Street'))),
      el('ul', { class: 'lb-ui-list' },
        ...[['house', 'Home', 'Kapitolyo, Pasig'], ['briefcase', 'Work', 'Ayala Ave, Makati'], ['shopping-bag', 'SM Megamall', 'EDSA, Mandaluyong'], ['plane', 'NAIA Terminal 3', 'Andrews Ave, Pasay']]
          .map(([ic, n, a]) => el('li', {}, uiIcon(ic), el('span', {}, el('strong', {}, n), el('small', {}, a))))),
      el('div', { class: 'lb-ui-pad' }, el('span', { class: 'lb-ui-btn lb-ui-btn--dark' }, 'Choose a ride'))),
    phone(
      el('div', { class: 'lb-ui-radar' },
        el('span', { class: 'lb-radar-ring' }), el('span', { class: 'lb-radar-ring' }), el('span', { class: 'lb-radar-ring' }),
        el('span', { class: 'lb-radar-core' }, uiIcon('car-front'))),
      sheet(
        el('small', { class: 'lb-ui-kicker' }, 'Rider found'),
        el('div', { class: 'lb-ui-driver' },
          uiAvatar('assets/avatars/d3.png'),
          el('span', {}, el('strong', {}, 'Jun Soriano'), el('small', { class: 't-num' }, '★ 4.8 · 5,102 trips'))),
        el('div', { class: 'lb-ui-veh' }, el('span', {}, 'White Toyota Vios'), el('span', { class: 'lb-ui-plate t-num' }, 'UVX 3310')),
        el('div', { class: 'lb-ui-fare t-num' }, el('span', {}, 'Lakbay Car'), el('strong', {}, `₱${carFare}`)))),
    phone(
      mapArt({ route: 'M235 360V290H150V235H50', mover: [0, 0.82, 8], pickup: [50, 235] }),
      sheet(
        el('div', { class: 'lb-ui-row' },
          el('span', {}, el('strong', { class: 'lb-ui-h' }, 'Arriving in 3 min'), el('small', {}, 'Meet at the Meralco Ave gate')),
          uiAvatar('assets/avatars/d3.png')),
        el('div', { class: 'lb-ui-actions' },
          el('span', { class: 'lb-ui-chip' }, uiIcon('message-circle'), 'Chat'),
          el('span', { class: 'lb-ui-chip' }, uiIcon('phone'), 'Call'),
          el('span', { class: 'lb-ui-plate t-num' }, 'UVX 3310')))),
    phone(
      mapArt({ route: 'M50 235V180H150V70H235', mover: [0.08, 0.86, 10], travelled: [8, 86], pickup: [50, 235], dest: [235, 70] }),
      sheet(
        el('div', { class: 'lb-ui-row' },
          el('span', {}, el('strong', { class: 'lb-ui-h' }, 'On the way to BGC'), el('small', { class: 't-num' }, '14 min · 4.2 km left')),
          el('span', { class: 'lb-ui-chip' }, uiIcon('share-2'), 'Share')),
        el('div', { class: 'lb-ui-progress' }, el('span', {})))),
    phone(
      el('div', { class: 'lb-ui-done' },
        el('span', { class: 'lb-ui-done-mark' }, uiIcon('check')),
        el('strong', { class: 'lb-ui-h' }, 'You’ve arrived'),
        el('small', {}, 'Bonifacio High Street · 8:59 AM')),
      sheet(
        el('div', { class: 'lb-ui-fare t-num' }, el('span', {}, 'Paid with GCash'), el('strong', {}, `₱${carFare}`)),
        el('div', { class: 'lb-ui-stars' }, ...[1, 2, 3, 4, 5].map(() => uiIcon('star'))),
        el('span', { class: 'lb-ui-btn lb-ui-btn--lime' }, 'Rate Jun & finish'))),
  ];
}

const JOURNEY = [
  ['Book', 'Tell us where.', 'Search a place, tap a saved spot, or drop a pin. Pickup starts from where you are.'],
  ['Match', 'Meet your rider.', 'Nearby riders get your request. You see who accepted — name, rating, vehicle and plate.'],
  ['Pickup', 'Watch them arrive.', 'Follow the approach live and chat if the gate or landmark needs explaining.'],
  ['Ride', 'Follow the road.', 'See the route and time remaining, and share the trip with someone at home in one tap.'],
  ['Arrive', 'Pay, rate, done.', 'The fare you saw is the fare you pay — cash or wallet. Then rate your rider.'],
];

/* ---------- offers — each one composed as its own advertisement ---------- */
function offerAd(code, layout, extra = {}) {
  const p = PROMOS.find((x) => x.code === code);
  if (!p) return null;
  const sp = p.label.indexOf(' ');
  const big = p.label.slice(0, sp);
  const tail = p.label.slice(sp + 1);
  const btnLabel = el('span', {}, 'Copy code');
  const btn = el('button', { class: 'lb-ad-copy', type: 'button', 'aria-label': `Copy promo code ${p.code}` }, uiIcon('copy'), btnLabel);
  btn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(p.code);
      btnLabel.textContent = 'Copied';
      btn.classList.add('is-copied');
      Toast.success('Code copied', `Add ${p.code} before you confirm your ride.`);
      setTimeout(() => { btnLabel.textContent = 'Copy code'; btn.classList.remove('is-copied'); }, 1800);
    } catch (e) {
      Toast.info(`Promo code: ${p.code}`, 'Enter it before you confirm your ride.');
    }
  });
  return el('article', { class: `lb-ad lb-ad--${layout}`, 'data-reveal': '', style: extra.delay ? `--reveal-delay:${extra.delay}ms` : null },
    extra.img ? el('img', { class: 'lb-ad-img', src: extra.img, alt: '', loading: 'lazy', decoding: 'async', 'aria-hidden': 'true' }) : null,
    el('div', { class: 'lb-ad-body' },
      el('span', { class: 'lb-ad-kicker' }, extra.kicker),
      el('h3', { class: 'lb-ad-head' }, el('span', { class: 'lb-ad-num' }, big), el('span', { class: 'lb-ad-tail' }, tail)),
      el('p', { class: 'lb-ad-note' }, p.note),
      el('div', { class: 'lb-ad-code' }, el('span', { class: 'lb-ad-voucher t-num' }, p.code), btn)));
}

function renderLanding() {
  clear(root);
  landingOff.forEach((f) => f());
  landingOff = [];
  ensureSeeded();
  seedDemoAccounts().then(() => { /* refresh header CTA once accounts exist */ });
  const session = Session.get();
  const sessionUser = session ? Users.byId(session.userId) : null;
  const book = () => go('login', { next: 'passenger' });
  const drive = () => go('register', { next: 'rider' });

  const page = el('div', { class: 'lb-landing lb-boot' });
  page.appendChild(landingHeader(sessionUser));
  // All sections between the header and footer sit in <main> (a landmark
  // screen readers use to skip straight to the content).
  const main = el('main', { class: 'lb-main', id: 'lb-main' });
  page.appendChild(main);

  /* ---------- hero ---------- */
  main.appendChild(el('section', { class: 'lb-hero', 'aria-labelledby': 'lb-hero-title' },
    el('div', { class: 'lb-hero-bg', 'aria-hidden': 'true' }),
    el('div', { class: 'container lb-hero-grid' },
      el('div', { class: 'lb-hero-copy' },
        el('span', { class: 'lb-eyebrow lb-eyebrow--dark' }, 'Ride-hailing for the Philippines'),
        el('h1', { class: 'lb-hero-title', id: 'lb-hero-title' }, 'Sakay na. ', el('em', {}, 'Lakbay'), ' takes you there.'),
        el('p', { class: 'lb-hero-sub' },
          'Book a car or moto in seconds, watch your rider arrive on the map, and pay your way — cash, GCash or Maya.'),
        el('div', { class: 'lb-hero-cta' },
          el('button', { class: 'btn btn--primary btn--lg lb-cta-go', onclick: book }, 'Book a ride', uiIcon('arrow-right')),
          el('button', { class: 'btn btn--outline-light btn--lg', onclick: drive }, 'Drive with Lakbay'),
          createInstallButton({ variant: 'ghost', size: 'lg' })),
        el('p', { class: 'lb-hero-note' }, 'Fares shown before you book', el('span', { 'aria-hidden': 'true' }, '·'), 'Every rider verified', el('span', { 'aria-hidden': 'true' }, '·'), 'Cash, GCash & Maya')),
      el('div', { class: 'lb-hero-art' },
        el('div', { class: 'lb-fan-frame' },
          el('div', { class: 'lb-fan', role: 'group', 'aria-label': 'Lakbay ride classes' },
            fanCard({ pos: 'ol', img: RIDE_ART.car.src, focus: '64% 60%', name: 'Car', meta: `from ₱${fareFrom('car')}`, alt: 'Silver Lakbay sedan in a dark green studio' }),
            fanCard({ pos: 'il', img: RIDE_ART.moto.src, focus: '64% 55%', name: 'Moto', meta: `from ₱${fareFrom('moto')}`, alt: 'Green Lakbay motorcycle in a dark studio' }),
            fanCard({ pos: 'c', img: RIDE_ART.premium.src, focus: '68% 60%', name: 'Premium', meta: `from ₱${fareFrom('premium')}`, alt: 'Lime Lakbay premium coupe in a dark studio' }),
            fanCard({ pos: 'ir', img: RIDE_ART.xl.src, focus: '66% 60%', name: 'XL', meta: `from ₱${fareFrom('xl')}`, alt: 'Grey Lakbay XL van in a dark studio' }),
            fanCard({ pos: 'or', img: 'assets/promos/campaign-helmet.webp', focus: '52% 50%', name: 'Drive', meta: 'Earn on your hours', alt: 'Green Lakbay rider helmet with lime stripes' })))))));

  /* ---------- product — real interface previews, varied compositions ---------- */
  main.appendChild(el('section', { class: 'lb-section lb-product', id: 'lb-features' },
    el('div', { class: 'container' },
      el('div', { class: 'lb-head-split', 'data-reveal': '' },
        el('div', {},
          el('span', { class: 'lb-eyebrow' }, 'The product'),
          el('h2', { class: 'lb-h2' }, 'Every part of the ride, out in the open.')),
        el('p', { class: 'lb-lead' }, 'Lakbay shows you what is happening at each step — who is coming, what it costs, and when you will get there. Two complete apps, one for passengers and one for riders.')),

      el('div', { class: 'lb-feature lb-feature--track' },
        el('div', { class: 'lb-feat-copy', 'data-reveal': '' },
          featLabel('01', 'Live tracking'),
          el('h3', {}, 'See your rider coming, not just a dot on a map.'),
          el('p', {}, 'From the moment a rider accepts, you get their name, plate and live position, with an ETA that updates as they move through traffic.')),
        trackPreview()),

      el('div', { class: 'lb-feature lb-feature--fare' },
        el('div', { class: 'lb-feat-copy', 'data-reveal': '' },
          featLabel('02', 'Upfront fares & payments'),
          el('h3', {}, 'The fare is settled before the ride starts.'),
          el('p', {}, 'Base, distance, time and fees are itemized up front. Promo codes apply in one tap, and you pay with cash, GCash or Maya.')),
        farePreview()),

      el('div', { class: 'lb-trust-row' },
        el('div', { class: 'lb-trust-a' },
          verifyPreview(),
          el('div', { class: 'lb-feat-copy', 'data-reveal': '' },
            featLabel('03', 'Verified riders'),
            el('h3', {}, 'Every rider is checked before their first trip.'),
            el('p', {}, 'License, vehicle papers and clearances are reviewed, so the name on your screen is the person at the wheel.'))),
        el('div', { class: 'lb-trust-b' },
          el('div', { class: 'lb-feat-copy', 'data-reveal': '' },
            featLabel('04', 'In-ride chat'),
            el('h3', {}, 'Sort out the pickup in a tap.'),
            el('p', {}, 'A chat thread per trip, with quick replies in English and Taglish for the moments that matter.')),
          chatPreview())))));

  /* ---------- journey — pinned horizontal story (native swipe on mobile) ---------- */
  const screens = journeyScreens();
  main.appendChild(el('section', { class: 'lb-journey', id: 'lb-journey', 'aria-labelledby': 'lb-jr-title' },
    el('div', { class: 'lb-jr-pin' },
      el('div', { class: 'container lb-jr-head' },
        el('div', {},
          el('span', { class: 'lb-eyebrow lb-eyebrow--dark' }, 'The Lakbay journey'),
          el('h2', { class: 'lb-h2', id: 'lb-jr-title' }, 'From tap to drop‑off in five moves.')),
        el('ol', { class: 'lb-jr-steps', 'aria-label': 'Journey stages' },
          ...JOURNEY.map(([name], i) => el('li', {},
            el('button', { class: 'lb-jr-step', type: 'button', 'data-i': String(i) },
              el('span', { class: 't-num' }, String(i + 1).padStart(2, '0')), name))))),
      el('div', { class: 'container' }, el('div', { class: 'lb-jr-bar', 'aria-hidden': 'true' })),
      el('div', { class: 'lb-jr-viewport', tabindex: '-1' },
        el('div', { class: 'lb-jr-track' },
          ...JOURNEY.map(([name, title, body], i) => el('article', { class: 'lb-jr-stage', 'aria-label': `Stage ${i + 1} of 5: ${name}` },
            el('div', { class: 'lb-jr-copy' },
              el('span', { class: 'lb-jr-num t-num', 'aria-hidden': 'true' }, String(i + 1).padStart(2, '0')),
              el('p', { class: 'lb-jr-name' }, name),
              el('h3', {}, title),
              el('p', { class: 'lb-jr-body' }, body),
              i === JOURNEY.length - 1
                ? el('button', { class: 'btn btn--primary btn--lg lb-cta-go', onclick: book }, 'Book your first ride', uiIcon('arrow-right'))
                : null),
            screens[i])))))));

  /* ---------- fleet — photo-led horizontal gallery ---------- */
  const rail = el('div', { class: 'lb-fleet-rail', role: 'list', 'aria-label': 'Ride classes' },
    ...RIDE_CATEGORIES.map((c, i) => {
      const art = RIDE_ART[c.id] || { src: c.img, pos: '50% 50%', note: '' };
      return el('article', { class: `lb-ride lb-ride--${c.id}${i % 2 === 1 ? ' lb-ride--wide' : ''}`, role: 'listitem' },
        el('img', { src: art.src, alt: '', style: `object-position:${art.pos}`, loading: 'lazy', decoding: 'async', onerror: (e) => e.target.remove() }),
        el('div', { class: 'lb-ride-top' },
          el('span', {}, art.note),
          el('span', { class: 't-num' }, c.capacity === 1 ? '1 seat' : `${c.capacity} seats`)),
        el('div', { class: 'lb-ride-body' },
          el('div', {},
            el('h3', {}, c.name.replace('Lakbay ', '')),
            el('p', { class: 'lb-ride-desc' }, c.desc)),
          el('div', { class: 'lb-ride-fare' },
            el('small', {}, 'from'),
            el('strong', { class: 't-num' }, `₱${fareFrom(c.id)}`))),
        el('button', { class: 'lb-ride-go', type: 'button', 'aria-label': `Book ${c.name}, from ₱${fareFrom(c.id)}`, onclick: book },
          el('span', { class: 'lb-ride-arrow', 'aria-hidden': 'true' }, uiIcon('arrow-up-right'))));
    }));
  const prev = el('button', { class: 'icon-btn icon-btn--bordered lb-rail-btn', type: 'button', 'aria-label': 'Previous ride class' }, uiIcon('arrow-left'));
  const next = el('button', { class: 'icon-btn icon-btn--bordered lb-rail-btn', type: 'button', 'aria-label': 'Next ride class' }, uiIcon('arrow-right'));
  main.appendChild(el('section', { class: 'lb-section lb-fleet', id: 'lb-fleet' },
    el('div', { class: 'container lb-head-split lb-head-split--rail', 'data-reveal': '' },
      el('div', {},
        el('span', { class: 'lb-eyebrow' }, 'Fleet & fares'),
        el('h2', { class: 'lb-h2' }, 'Four ways to ride.')),
      el('div', { class: 'lb-head-aside' },
        el('p', { class: 'lb-lead' }, `Starting fares for a ${SAMPLE_KM} km trip across the city. Every fare is itemized before you book.`),
        el('div', { class: 'lb-rail-btns' }, prev, next))),
    el('div', { 'data-reveal': 'media' }, rail)));

  /* ---------- offers ---------- */
  main.appendChild(el('section', { class: 'lb-section lb-offers', id: 'lb-promos' },
    el('div', { class: 'container' },
      el('div', { class: 'lb-head-split', 'data-reveal': '' },
        el('div', {},
          el('span', { class: 'lb-eyebrow' }, 'Offers'),
          el('h2', { class: 'lb-h2' }, 'Sakay deals, this week.')),
        el('p', { class: 'lb-lead' }, 'Copy a code and add it before you confirm. The discount shows up in your fare breakdown straight away.')),
      el('div', { class: 'lb-ads' },
        offerAd('LAKBAY50', 'feature', { kicker: 'Flash sale', img: 'assets/promos/campaign-car.webp' }),
        offerAd('FIRSTTRIP', 'poster', { kicker: 'For new riders', delay: 80 }),
        offerAd('MOTOPH', 'window', { kicker: 'Moto week', img: 'assets/promos/campaign-scooter.webp', delay: 140 }),
        offerAd('PAYDAY10', 'strip', { kicker: 'Payday special', img: 'assets/promos/campaign-coins.webp' })))));

  /* ---------- rider recruitment ---------- */
  main.appendChild(el('section', { class: 'lb-section lb-riders', id: 'lb-riders' },
    el('div', { class: 'container lb-riders-grid' },
      el('div', { class: 'lb-riders-media' },
        el('img', { class: 'lb-riders-photo', src: 'assets/promos/campaign-helmet.webp', alt: 'A Lakbay rider helmet, green with lime stripes', loading: 'lazy', decoding: 'async', 'data-reveal': 'media' }),
        earningsPreview()),
      el('div', { class: 'lb-riders-copy', 'data-reveal': '' },
        el('span', { class: 'lb-eyebrow lb-eyebrow--dark' }, 'Drive with Lakbay'),
        el('h2', { class: 'lb-h2' }, 'Your city. Your hours. Your earnings.'),
        el('p', { class: 'lb-lead' }, 'Go online when it suits you, take the trips you want, and watch every peso land on your dashboard.'),
        el('ol', { class: 'lb-steps' },
          ...[['Register', 'Create a rider account in about a minute.'],
            ['Get verified', 'Upload your license and vehicle papers for review.'],
            ['Go online', 'Accept nearby requests and track your earnings daily.']]
            .map(([t, d], i) => el('li', {},
              el('span', { class: 'lb-steps-n t-num' }, String(i + 1).padStart(2, '0')),
              el('span', {}, el('strong', {}, t), el('span', {}, d))))),
        el('div', { class: 'lb-hero-cta' },
          el('button', { class: 'btn btn--primary btn--lg lb-cta-go', onclick: drive }, 'Become a rider', uiIcon('arrow-right')),
          createInstallButton({ variant: 'outline-light', size: 'lg', icon: 'smartphone' })),
        el('button', { class: 'lb-textlink', type: 'button', onclick: () => go('login', { next: 'rider' }) }, 'Already a rider? Sign in')))));

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
  /* Scrolling stays fully native (no wheel hijacking): smoothing is applied
     only to scroll-linked visuals (journey track), never to the page. */
  initJourney(page);
  initRail(rail, prev, next);

  /* fan deck — fit the stage to the art column, then fan the cards out
     from the centre on load. */
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
      setTimeout(() => items.forEach((it) => { it.style.transitionDelay = ''; }), 1200);
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

/* Journey — desktop: the section is made tall and its stage pinned; page
   scroll progress drives the track sideways. The track follows the target
   with frame-rate-independent exponential smoothing (critically damped:
   eases in and out, never overshoots). Mobile / reduced motion: a plain
   horizontal scroller with snap points. Stage buttons jump either way. */
function initJourney(page) {
  const sec = qs('.lb-journey', page);
  if (!sec) return;
  const vp = qs('.lb-jr-viewport', sec);
  const trackEl = qs('.lb-jr-track', sec);
  const stages = [...trackEl.children];
  const steps = [...sec.querySelectorAll('.lb-jr-step')];
  const n = stages.length;
  const mq = window.matchMedia('(min-width: 960px) and (min-height: 640px)');
  let pinned = false; let dist = 0; let x = 0; let target = 0; let raf = 0; let last = 0; let active = -1;

  const setActive = (i) => {
    if (i === active) return;
    active = i;
    stages.forEach((s, k) => s.classList.toggle('is-active', k === i));
    steps.forEach((b, k) => {
      b.classList.toggle('is-active', k === i);
      if (k === i) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
    });
  };
  const paint = () => { trackEl.style.transform = `translate3d(${x.toFixed(2)}px,0,0)`; };
  const frame = (t) => {
    const dt = last ? Math.min(64, t - last) : 16;
    last = t;
    x += (target - x) * (1 - Math.exp(-dt / 85));
    if (Math.abs(target - x) < 0.3) x = target;
    paint();
    if (x !== target) raf = requestAnimationFrame(frame);
    else { raf = 0; last = 0; }
  };
  const update = (snap = false) => {
    if (!pinned) return;
    const p = dist ? Math.min(1, Math.max(0, -sec.getBoundingClientRect().top / dist)) : 0;
    target = -p * dist;
    sec.style.setProperty('--jr-p', p.toFixed(4));
    setActive(Math.round(p * (n - 1)));
    if (snap) { x = target; paint(); return; }
    if (!raf) raf = requestAnimationFrame(frame);
  };
  const onSwipe = () => {
    if (pinned) return;
    const max = vp.scrollWidth - vp.clientWidth;
    const p = max > 0 ? vp.scrollLeft / max : 0;
    sec.style.setProperty('--jr-p', p.toFixed(4));
    setActive(Math.round(p * (n - 1)));
  };
  const measure = () => {
    pinned = mq.matches && !reduceMotion();
    sec.classList.toggle('is-pinned', pinned);
    if (!pinned) {
      sec.style.height = '';
      trackEl.style.transform = '';
      onSwipe();
      return;
    }
    // stages are evenly spaced, so stage i is in place at progress i/(n-1)
    dist = stages[n - 1].offsetLeft - stages[0].offsetLeft;
    const pinH = qs('.lb-jr-pin', sec).offsetHeight;
    sec.style.height = `${pinH + dist}px`;
    update(true);
  };
  const goTo = (i) => {
    const behavior = reduceMotion() ? 'auto' : 'smooth';
    if (pinned) {
      const top = sec.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({ top: top + (i / (n - 1)) * dist, behavior });
    } else {
      vp.scrollTo({ left: stages[i].offsetLeft - stages[0].offsetLeft, behavior });
    }
  };

  steps.forEach((b, i) => b.addEventListener('click', () => goTo(i)));
  // keyboard users tabbing into an off-screen stage get it scrolled into view
  trackEl.addEventListener('focusin', (e) => {
    const i = stages.findIndex((s) => s.contains(e.target));
    if (i >= 0 && pinned) goTo(i);
  });
  vp.addEventListener('scroll', onSwipe, { passive: true });
  track(window, 'scroll', () => update(false), { passive: true });
  track(window, 'resize', measure);
  if (mq.addEventListener) track(mq, 'change', measure);
  const ro = new ResizeObserver(() => measure());
  ro.observe(trackEl);
  landingOff.push(() => { ro.disconnect(); cancelAnimationFrame(raf); });
  measure();
  setActive(0);
}

/* Fleet rail — native horizontal scroll (touch, trackpad, shift+wheel),
   plus prev/next buttons that step one vehicle at a time. */
function initRail(rail, prev, next) {
  const sync = () => {
    const max = rail.scrollWidth - rail.clientWidth - 2;
    prev.disabled = rail.scrollLeft <= 2;
    next.disabled = rail.scrollLeft >= max;
  };
  const step = (dir) => {
    const first = rail.firstElementChild;
    const w = first ? first.getBoundingClientRect().width + 16 : rail.clientWidth * 0.8;
    rail.scrollBy({ left: dir * w, behavior: reduceMotion() ? 'auto' : 'smooth' });
  };
  prev.addEventListener('click', () => step(-1));
  next.addEventListener('click', () => step(1));
  rail.addEventListener('scroll', sync, { passive: true });
  track(window, 'resize', sync);
  requestAnimationFrame(sync);
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
  landingOff.push(() => ro.disconnect());
  track(window, 'resize', apply);
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
  // landing listeners (scroll spy, journey, menu) never outlive the landing
  landingOff.forEach((f) => f());
  landingOff = [];
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

// Route changes cross-fade (View Transitions where supported, instant otherwise)
window.addEventListener('hashchange', () => withViewTransition(renderRoute));
renderRoute();
