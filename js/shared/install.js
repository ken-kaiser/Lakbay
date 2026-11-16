/* ==========================================================================
   Lakbay — Install app (PWA)
   Central helper for the "Install app" experience:
   - createInstallButton(): button that prompts native install when available,
     or shows Add-to-Home-Screen instructions on iOS.
   - maybeShowBanner(): lightweight mobile bottom banner on the landing page
     (dismissed state is remembered for 7 days).
   - isStandalone(): true when running as an installed app (buttons hide).
   ========================================================================== */
import { el, clear } from './dom.js';
import { Icons } from './icons.js';
import { openModal } from './modal.js';
import { Toast } from './toast.js';

let deferredPrompt = null;
const DISMISS_KEY = 'lakbay:install:dismissedAt';
const listeners = new Set();

export function isStandalone() {
  return (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches)
    || window.navigator.standalone === true;
}

export function isIOS() {
  const ua = window.navigator.userAgent || '';
  const iOSLike = /iphone|ipod|ipad/i.test(ua)
    || (ua.includes('Macintosh') && typeof window.navigator.maxTouchPoints === 'number' && window.navigator.maxTouchPoints > 1);
  return iOSLike;
}

function dismissedRecently() {
  const at = Number(localStorage.getItem(DISMISS_KEY) || 0);
  return at && (Date.now() - at < 7 * 24 * 60 * 60 * 1000);
}

/* Capture the native install prompt as early as possible. */
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    listeners.forEach((fn) => { try { fn(); } catch (err) { /* noop */ } });
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    listeners.forEach((fn) => { try { fn(); } catch (err) { /* noop */ } });
  });
}

function refreshButtons() {
  document.querySelectorAll('[data-install-btn]').forEach((btn) => {
    btn.hidden = isStandalone();
  });
}

async function promptInstall() {
  if (!deferredPrompt) return 'unavailable';
  try {
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null;
    return outcome || 'dismissed';
  } catch (e) {
    return 'dismissed';
  }
}

function showIOSInstructions() {
  const body = el('div', { class: 'col', style: 'gap:12px' },
    el('p', { class: 't-body t-muted' }, 'Install Lakbay on your iPhone or iPad in three steps:'),
    el('div', { class: 'lb-how-col', style: 'padding:16px 16px 6px' },
      iosStep('1', 'Open the Share menu', 'Tap the Share icon in Safari\'s toolbar.'),
      iosStep('2', 'Choose "Add to Home Screen"', 'Scroll if needed — it sits below Copy and Print.'),
      iosStep('3', 'Tap add', 'Lakbay appears on your home screen like any app.')),
  );
  openModal({
    title: 'Add Lakbay to your home screen',
    body,
    actions: [{ label: 'Got it', variant: 'primary', onClick: (api) => api.close(true) }],
  });
}

function iosStep(num, title, sub) {
  return el('div', { class: 'lb-step' },
    el('span', { class: 'lb-step-num t-num' }, num),
    el('div', { class: 'lb-step-body' },
      el('h4', {}, title),
      el('p', {}, sub)));
}

/* Button factory — hide when already installed. */
export function createInstallButton({ label = 'Install app', variant = 'ghost', size = 'lg', icon = 'smartphone' } = {}) {
  const btn = el('button', { class: `btn btn--${variant} btn--${size}`, 'data-install-btn': '' },
    el('i', { 'data-lucide': icon }), label);
  btn.hidden = isStandalone();
  btn.addEventListener('click', async () => {
    if (isStandalone()) return;
    if (deferredPrompt) {
      const outcome = await promptInstall();
      if (outcome === 'accepted') Toast.success('Lakbay installed', 'Find it on your home screen.');
      return;
    }
    if (isIOS()) showIOSInstructions();
    else {
      Toast.info('Install from your browser menu', 'Look for "Install app" or "Add to Home Screen" in the address bar menu.');
    }
  });
  listeners.add(refreshButtons);
  Icons.refresh(btn);
  return btn;
}

/* Mobile bottom banner for the landing page. */
export function maybeShowBanner({ delay = 2600 } = {}) {
  if (isStandalone() || dismissedRecently()) return;
  const isSmallScreen = window.matchMedia('(max-width: 820px)').matches || isIOS();
  if (!isSmallScreen) return;

  setTimeout(() => {
    if (isStandalone() || dismissedRecently()) return;
    if (document.querySelector('.install-banner')) return;

    const overlay = el('div', { class: 'install-banner' });
    const card = el('div', { class: 'install-banner-card', role: 'dialog', 'aria-label': 'Install Lakbay' },
      el('span', { class: 'install-banner-icon', 'aria-hidden': 'true' },
        el('img', { src: 'assets/logo/icon-192.png', alt: '' })),
      el('div', { class: 'install-banner-body' },
        el('strong', {}, 'Install Lakbay'),
        el('span', {}, isIOS()
          ? 'Add it to your home screen for a full-screen app.'
          : 'Get the full-screen app experience on your phone.')),
      el('button', { class: 'btn btn--primary btn--sm', 'data-install-btn': '' }, 'Install'),
      el('button', { class: 'icon-btn', 'aria-label': 'Dismiss install suggestion' }, el('i', { 'data-lucide': 'x' })),
    );
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    Icons.refresh(card);

    const close = (remember) => {
      if (remember) { try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch (e) { /* noop */ } }
      overlay.classList.add('leaving');
      setTimeout(() => overlay.remove(), 240);
    };

    card.querySelector('[data-install-btn]').addEventListener('click', async () => {
      if (deferredPrompt) {
        const outcome = await promptInstall();
        if (outcome === 'accepted') Toast.success('Lakbay installed', 'Find it on your home screen.');
        close(true);
      } else if (isIOS()) {
        close(true);
        showIOSInstructions();
      } else {
        close(true);
        Toast.info('Install from your browser menu', 'Look for "Install app" in the address bar menu.');
      }
    });
    card.querySelector('.icon-btn').addEventListener('click', () => close(true));
    // light backdrop tap dismiss
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(false); });
    requestAnimationFrame(() => overlay.classList.add('shown'));
  }, delay);
}
