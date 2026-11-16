/* ==========================================================================
   Lakbay — App core for client.html and rider.html
   Boots the authenticated shell (sidebar / header / bottom nav), provides
   a hash-based view router with mount/unmount lifecycle, and guards sessions.
   ========================================================================== */
import { Session, Bus, Notifs, ensureSeeded, seedDemoAccounts } from './storage.js';
import { firstNameOf, avatarURI } from './shared/format.js';
import { el, clear, qs, h } from './shared/dom.js';
import { Icons } from './shared/icons.js';
import { NotifCenter } from './shared/notifications.js';
import { confirmDialog, closeAllModals } from './shared/modal.js';
import { Toast } from './shared/toast.js';
import { withViewTransition } from './shared/motion.js';

const views = new Map();
const hooks = { beforeRender: [], afterRender: [] };
let currentView = null;
let currentUser = null;
let shellRefs = {};

export const App = {
  get user() { return currentUser; },

  registerView(def) {
    if (!def || !def.id || typeof def.render !== 'function') throw new Error('[App] invalid view: ' + (def && def.id));
    views.set(def.id, def);
  },
  registerViews(list) { list.forEach(App.registerView); },

  navigate(id, params = {}, { replace = false } = {}) {
    const hash = '#/' + id + (params.restPath ? '/' + params.restPath : '') + (params.query ? '?' + new URLSearchParams(params.query).toString() : '');
    if (replace) { const url = location.pathname + location.search + hash; history.replaceState(null, '', url); renderRoute(); }
    else if (location.hash === hash) renderRoute();
    else location.hash = hash;
  },
  back() { if (history.length > 1) history.back(); else App.navigate(shellRefs.homeView || 'home', {}, { replace: true }); },

  refreshHeader() { paintUserHeader(); },
  setActiveTripIndicator(count) {
    const el2 = shellRefs.tripDot;
    if (!el2) return;
    if (count > 0) { el2.hidden = false; el2.textContent = String(count); }
    else el2.hidden = true;
  },
};

/* ---------- Route parsing ---------- */
function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  const [pathPart, queryPart] = h.split('?');
  const segs = pathPart.split('/').filter(Boolean);
  return {
    id: segs[0] || shellRefs.homeView || 'home',
    restPath: segs.slice(1).join('/'),
    query: Object.fromEntries(new URLSearchParams(queryPart || '')),
  };
}

let booted = false;

function renderRoute() {
  // The very first render after page load skips the view transition:
  // the MPA navigation transition may still be active, and the entrance
  // choreography already animates the shell. Internal navigation uses
  // the View Transitions API (subtle content cross-fade) with a fallback.
  if (!booted) { booted = true; renderRouteNow(); return; }
  withViewTransition(renderRouteNow);
}

function renderRouteNow() {
  closeAllModals(); // never carry dialogs across views (e.g. browser back)
  const route = parseHash();
  const def = views.get(route.id);
  const viewRoot = shellRefs.viewRoot;
  if (!viewRoot) return;

  if (currentView && typeof currentView.def.unmount === 'function') {
    try { currentView.def.unmount(); } catch (e) { console.error('[view unmount]', e); }
  }
  currentView = null;
  clear(viewRoot);

  if (!def) {
    App.navigate(shellRefs.homeView || 'home', {}, { replace: true });
    // #/notifications isn't a page: notifications open as a panel. Go home
    // and open the panel, instead of silently dropping the request.
    if (route.id === 'notifications') {
      setTimeout(() => { const bell = qs('.app-header [aria-label="Notifications"]'); if (bell) bell.click(); }, 80);
    }
    return;
  }

  hooks.beforeRender.forEach((fn) => fn(route, def));
  try {
    def.render(viewRoot, { restPath: route.restPath, query: route.query });
  } catch (e) {
    console.error('[view render]', route.id, e);
    viewRoot.innerHTML = '<div class="empty"><div class="empty-icon"><i data-lucide="triangle-alert"></i></div><h4>Something went wrong</h4><p>This screen failed to render. Please go back to the home screen.</p><button class="btn btn--primary" id="err-home">Back to home</button></div>';
    const btn = qs('#err-home', viewRoot);
    if (btn) btn.addEventListener('click', () => App.navigate(shellRefs.homeView || 'home'));
  }
  Icons.refresh(viewRoot);
  paintActiveNav(route.id);
  hooks.afterRender.forEach((fn) => fn(route, def));
  currentView = { def };

  // scroll main to top
  const main = qs('.app-main');
  if (main) main.scrollTop = 0;
  window.scrollTo(0, 0);
}

function paintActiveNav(id) {
  qsaNav().forEach((a) => {
    const target = a.getAttribute('data-view');
    a.classList.toggle('active', target === id || (target === 'trip' && id === 'trip'));
  });
}
function qsaNav() {
  return [...document.querySelectorAll('.app-sidebar a[data-view], .app-bottomnav a[data-view]')];
}

/* ---------- Shell building ---------- */
function buildShell({ nav, title, role, homeView }) {
  const shell = el('div', { class: 'app-shell' });

  // Sidebar (desktop)
  const sidebar = el('aside', { class: 'app-sidebar' },
    el('div', { class: 'brand' },
      el('span', { class: 'brand-logo' },
        el('span', { class: 'logo-mark' }, logoSVG()),
        el('span', { class: 'logo-word' }, 'Lak', el('em', {}, 'bay')),
      ),
    ),
    (() => { const navWrap = el('nav', { 'aria-label': 'Main navigation' }); nav.forEach((item) => navWrap.appendChild(navLink(item, 'side'))); return navWrap; })(),
    el('div', { class: 'side-foot' },
      el('button', { class: 'nav-item', onclick: askLogout }, el('i', { 'data-lucide': 'log-out' }), 'Log out'),
      el('div', { class: 't-xs', style: 'padding:8px 12px 0' }, 'Lakbay · v1.0'),
    ),
  );

  // Main column
  const main = el('div', { class: 'app-main' });

  const header = el('header', { class: 'app-header' });
  const headerLeft = el('div', { class: 'row grow', style: 'min-width:0' });
  const headerRight = el('div', { class: 'row', style: 'gap:8px' });
  header.appendChild(headerLeft);
  header.appendChild(headerRight);

  const viewRoot = el('main', { class: 'app-view', id: 'view-root', 'aria-label': 'Page content' });
  main.appendChild(header);
  main.appendChild(viewRoot);

  // Bottom nav (mobile)
  const bottomNav = el('nav', { class: 'app-bottomnav', 'aria-label': 'Primary' });
  nav.forEach((item) => bottomNav.appendChild(navLink(item, 'bottom')));

  shell.appendChild(sidebar);
  shell.appendChild(main);
  shell.appendChild(bottomNav);
  document.body.appendChild(shell);

  shellRefs = { shell, sidebar, header, headerLeft, headerRight, viewRoot, homeView };
}

function navLink(item, mode) {
  const a = el('a', {
    class: mode === 'bottom' ? '' : 'nav-item',
    href: '#/' + item.id,
    'data-view': item.id,
    'aria-label': item.label,
  },
    el('i', { 'data-lucide': item.icon }),
    el('span', {}, item.label),
    item.badgeKey ? el('span', { class: 'nav-badge', hidden: true, 'data-badge': item.badgeKey }) : null,
  );
  return a;
}

export function logoSVG() {
  // Lakbay mark — the Electric bolt (brand-kit lakbay-logo-mark, tint-able).
  // Front face follows currentColor; back face at 0.8 + seam line suggest the fold,
  // so containers can tint it (lime on midnight tiles, midnight on lime).
  return el('span', { 'aria-hidden': 'true' }, h`<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M14.25 9.06 21.68 11.24Q23.92 11.9 22.28 13.56L21.01 14.87Q20.25 15.65 19.4 16.32L11.07 22.91Q9.83 23.9 10.05 22.33L10.9 16.05Q11 15.31 11.35 14.65L14.25 9.06Z" fill="currentColor" opacity="0.8"/><path d="M14.25 9.06Q12.23 12.6 11 15.31" fill="none" stroke="rgba(0,0,0,0.32)" stroke-width="1.1" stroke-linecap="round"/><path d="M2.27 13.17Q0.08 12.65 1.69 11.07L11.47 1.45Q12.83 0.1 14.75 0.1L17.25 0.1Q19 0.1 18.18 1.65L14.72 8.18Q14.25 9.06 13.82 9.96L11.23 15.31L2.27 13.17Z" fill="currentColor"/></svg>`);
}

/* ---------- Header content ---------- */
function paintUserHeader() {
  const { headerLeft, headerRight, header } = shellRefs;
  if (!headerRight || !currentUser) return;
  clear(headerRight);
  // drop any previous account menu + its document listener
  const prevMenu = header.querySelector('.menu');
  if (prevMenu) prevMenu.remove();
  if (header._menuCloser) { document.removeEventListener('click', header._menuCloser); header._menuCloser = null; }

  // notification bell
  headerRight.appendChild(NotifCenter.createBellButton(currentUser.id));

  // account menu
  const menuBtn = el('button', { class: 'icon-btn', 'aria-label': 'Account menu' },
    el('span', {
      class: 'avatar avatar--sm',
      style: `background-image:url("${currentUser.avatar ? currentUser.avatar : avatarURI(currentUser.firstName + ' ' + currentUser.lastName)}")`,
    }),
  );
  headerRight.appendChild(menuBtn);

  const menu = el('div', { class: 'menu', style: 'top:52px;right:12px;display:none' },
    el('div', { class: 'menu-head' },
      el('div', { class: 'mh-name' }, `${currentUser.firstName} ${currentUser.lastName}`),
      el('div', { class: 'mh-sub' }, currentUser.email),
    ),
    el('div', { class: 'menu-sep' }),
    el('a', { class: 'menu-item', href: '#/profile' }, el('i', { 'data-lucide': 'user-round' }), 'My profile'),
    el('a', { class: 'menu-item', href: '#/settings' }, el('i', { 'data-lucide': 'settings' }), 'Settings'),
    el('div', { class: 'menu-sep' }),
    el('button', { class: 'menu-item menu-item--danger', onclick: () => { menu.style.display = 'none'; askLogout(); } },
      el('i', { 'data-lucide': 'log-out' }), 'Log out'),
  );
  header.appendChild(menu);

  menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.style.display = menu.style.display === 'none' ? 'flex' : 'none';
  });
  header._menuCloser = (e) => {
    if (!menu.contains(e.target) && !menuBtn.contains(e.target)) menu.style.display = 'none';
  };
  document.addEventListener('click', header._menuCloser);
  Icons.refresh(menu);
}

/* Views can set the header title via App.setHeader(title, sub) */
App.setHeader = (title, sub) => {
  const { headerLeft } = shellRefs;
  if (!headerLeft) return;
  clear(headerLeft);
  if (title) {
    headerLeft.appendChild(el('div', {},
      // The view title is the page's main heading (screen readers jump to h1)
      el('h1', { class: 'hdr-title' }, title),
      sub ? el('div', { class: 'hdr-sub' }, sub) : null,
    ));
  }
};

/* Views can add custom left header content (e.g. location chip) */
App.setHeaderLeft = (node) => {
  const { headerLeft } = shellRefs;
  if (!headerLeft) return;
  clear(headerLeft);
  if (node) headerLeft.appendChild(node);
};

/* ---------- Logout ---------- */
async function askLogout() {
  const ok = await confirmDialog({
    title: 'Log out?',
    message: 'You will need to sign in again to continue. Your data stays on this device.',
    confirmLabel: 'Log out', icon: 'log-out',
  });
  if (!ok) return;
  Session.clear();
  window.location.href = 'index.html#goodbye';
}

/* ---------- Boot ---------- */
export async function bootApp({ role, nav, homeView = 'home', views: viewList }) {
  await ensureSeeded();
  await seedDemoAccounts();

  const session = Session.getFor(role) || Session.get();
  if (!session) { window.location.replace('index.html#login?next=' + role); return; }
  const { Users } = await import('./storage.js');
  currentUser = Users.byId(session.userId);
  if (!currentUser) { Session.clear(); window.location.replace('index.html#login'); return; }
  if (session.role !== role) {
    window.location.replace(session.role === 'rider' ? 'rider.html' : 'client.html');
    return;
  }

  document.title = `${role === 'rider' ? 'Lakbay Rider' : 'Lakbay'} — ${currentUser.firstName} ${currentUser.lastName}`;
  buildShell({ nav, role, homeView });
  App.registerViews(viewList);

  // Revive simulated rides whose timers died with the previous page load
  try {
    const { resumeSimTrips } = await import('./shared/sim.js');
    resumeSimTrips();
  } catch (e) { /* simulation is optional */ }

  // entrance choreography runs once per page load; internal navigation
  // is handled by view transitions instead of replaying the entrance.
  document.body.classList.add('app-boot');
  setTimeout(() => document.body.classList.add('app-ready'), 900);

  window.addEventListener('hashchange', renderRoute);
  renderRoute();
  paintUserHeader(); // bell + account menu (also refreshed by App.refreshHeader)

  // live booking badge on nav (client: home; rider: dashboard)
  Bus.subscribe('booking:update', ({ booking }) => {
    const active = ['searching', 'accepted', 'arriving', 'arrived', 'in_progress'];
    const mine = role === 'rider' ? booking.riderId === currentUser.id : booking.passengerId === currentUser.id;
    const dot = document.querySelector('.app-bottomnav [data-badge="active"], .app-sidebar [data-badge="active"]');
    if (dot) {
      const isActive = mine && active.includes(booking.status);
      dot.hidden = !isActive;
    }
    if (role === 'rider' && mine && booking.status === 'searching' && !booking.riderId) {
      // a new request arrived while rider app open (handled by requests.js too)
    }
  });
  Bus.subscribe('trip:completed', ({ booking }) => {
    Toast.success('Trip completed', 'Tap to rate your ride.');
  });
}

/* expose for debugging */
window.__lakbay = { App };
