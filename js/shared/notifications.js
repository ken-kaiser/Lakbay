/* ==========================================================================
   Lakbay — Notification center
   Header bell + slide-over panel + unread badge wiring.
   Depends on: storage.js (Notifs, Bus, Session), format.js, dom.js, icons.js
   ========================================================================== */
import { Notifs, Bus } from '../storage.js';
import { timeAgo } from './format.js';
import { el, clear, qs } from './dom.js';
import { Icons } from './icons.js';

const state = { userId: null, panel: null, bellBtn: null };

function toneClass(tone) {
  return `n-icon--${tone || 'primary'}`;
}

export function renderList(container, userId) {
  clear(container);
  const items = Notifs.forUser(userId);
  if (!items.length) {
    container.appendChild(el('div', { class: 'empty', style: 'padding:30px 20px' },
      el('div', { class: 'empty-icon' }, el('i', { 'data-lucide': 'bell-off' })),
      el('h4', {}, 'No notifications yet'),
      el('p', {}, 'Booking updates, promos, and account alerts will show up here.'),
    ));
  } else {
    items.slice(0, 40).forEach((n) => {
      container.appendChild(el('div', {
        class: `notif-item${n.read ? '' : ' unread'}`,
        role: 'button', tabindex: '0',
        onclick: () => { Notifs.markRead(n.id); paint(); },
      },
        el('span', { class: `n-icon ${toneClass(n.tone)}` }, el('i', { 'data-lucide': n.icon })),
        el('div', { class: 'grow' },
          el('div', { class: 'n-title' }, n.title),
          el('div', { class: 'n-body' }, n.body),
          el('div', { class: 'n-time' }, timeAgo(n.at)),
        ),
      ));
    });
  }
  Icons.refresh(container);
}

function paint() {
  if (!state.bellBtn) return;
  const count = state.userId ? Notifs.unreadCount(state.userId) : 0;
  const badge = state.bellBtn.querySelector('.dot-badge');
  if (count > 0) {
    if (badge) badge.textContent = String(count);
    else {
      const b = el('span', { class: 'dot-badge' }, String(count > 99 ? '99+' : count));
      state.bellBtn.appendChild(b);
    }
  } else if (badge) badge.remove();
  if (state.panel) {
    const list = qs('.notif-list', state.panel);
    renderList(list, state.userId);
  }
}

function openPanel() {
  if (state.panel) { closePanel(); return; }
  const list = el('div', { class: 'notif-list' });
  const panel = el('div', { class: 'notif-panel', role: 'dialog', 'aria-label': 'Notifications' },
    el('div', { class: 'notif-head' },
      el('h3', {}, 'Notifications'),
      el('button', {
        class: 'btn btn--ghost btn--sm',
        onclick: () => { Notifs.markAllRead(state.userId); paint(); },
      }, 'Mark all read'),
      el('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: closePanel }, el('i', { 'data-lucide': 'x' })),
    ),
    list,
  );
  state.panel = panel;
  // On <body>, not inside the header: the header's backdrop-filter would make
  // it the containing block for a fixed panel, squeezing the full-screen
  // mobile panel into the 58px header strip.
  document.body.appendChild(panel);
  paint();

  setTimeout(() => {
    const closer = (e) => {
      if (!panel.contains(e.target) && e.target !== state.bellBtn && !state.bellBtn.contains(e.target)) closePanel();
    };
    document.addEventListener('pointerdown', closer, { once: false });
    panel._closer = closer;
  }, 10);
}

function closePanel() {
  if (!state.panel) return;
  if (state.panel._closer) document.removeEventListener('pointerdown', state.panel._closer);
  state.panel.remove();
  state.panel = null;
}

/* Creates the bell icon button for an app header; returns element */
export function createBellButton(userId) {
  state.userId = userId;
  const btn = el('button', { class: 'icon-btn icon-btn--bordered', 'aria-label': 'Notifications', onclick: openPanel },
    el('i', { 'data-lucide': 'bell' }),
  );
  state.bellBtn = btn;
  Icons.refresh(btn);
  paint();
  return btn;
}

/* Live updates for the active user */
Bus.subscribe('notif:new', ({ notif }) => {
  if (notif && notif.userId === state.userId) paint();
});
Bus.subscribe('notif:read', () => paint());

export const NotifCenter = { createBellButton, paint, closePanel };
