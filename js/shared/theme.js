/* ==========================================================================
   Lakbay — Theme (light / dark / system) for the passenger and rider apps
   The choice is per device ('lakbay:theme'). An inline script in the HTML
   <head> applies it before first paint; this module keeps it in sync when the
   user switches or the OS preference changes.
   ========================================================================== */
const KEY = 'lakbay:theme';
const META = { light: '#F4F6EF', dark: '#0B1310' };
const mq = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null;
const listeners = new Set();

function read() {
  try { return localStorage.getItem(KEY) || 'system'; } catch (e) { return 'system'; }
}

function resolve(mode) {
  if (mode === 'light' || mode === 'dark') return mode;
  return mq && mq.matches ? 'dark' : 'light';
}

function apply() {
  const t = resolve(read());
  document.documentElement.dataset.theme = t;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', META[t]);
  listeners.forEach((fn) => fn(t));
}

export const Theme = {
  /** 'system' | 'light' | 'dark' */
  get: read,
  /** the theme actually showing right now */
  current() { return resolve(read()); },
  set(mode) {
    try { localStorage.setItem(KEY, mode); } catch (e) { /* storage blocked: still apply */ }
    apply();
  },
  onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
};

/* Called by bootApp only: the landing and sign-in pages also import app.js
   (for the logo) but are art-directed light, so they must never switch. */
let started = false;
export function startTheme() {
  if (started) return;
  started = true;
  if (mq) {
    const onOs = () => { if (read() === 'system') apply(); };
    if (mq.addEventListener) mq.addEventListener('change', onOs); else if (mq.addListener) mq.addListener(onOs);
  }
  apply();
}
