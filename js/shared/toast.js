/* ==========================================================================
   Lakbay — Toast notifications
   Toast.success('Saved'), Toast.error(...), Toast.warn(...), Toast.info(...)
   ========================================================================== */
import { el, clear } from './dom.js';
import { Icons } from './icons.js';

let stack = null;

function ensureStack() {
  if (!stack) {
    stack = el('div', { class: 'toast-stack', role: 'status', 'aria-live': 'polite' });
    document.body.appendChild(stack);
  }
  return stack;
}

function show({ title, message = '', tone = 'info', icon = 'bell', duration = 3600 }) {
  const container = ensureStack();
  const node = el('div', { class: `toast toast--${tone}` },
    el('span', { class: 'toast-icon' }, el('i', { 'data-lucide': icon })),
    el('div', { class: 'grow' },
      el('div', { class: 'toast-title' }, title),
      message ? el('div', { class: 'toast-msg' }, message) : null,
    ),
    el('button', {
      class: 'toast-close', 'aria-label': 'Dismiss notification',
      onclick: () => dismiss(),
    }, el('i', { 'data-lucide': 'x' })),
  );

  function dismiss() {
    node.classList.add('leaving');
    setTimeout(() => node.remove(), 220);
  }

  container.appendChild(node);
  Icons.refresh(node);
  if (duration) setTimeout(dismiss, duration);
  // keep stack bounded
  while (container.children.length > 4) container.firstChild.remove();
  return dismiss;
}

export const Toast = {
  success: (title, message, opts = {}) => show({ title, message, tone: 'success', icon: opts.icon || 'circle-check', ...opts }),
  error: (title, message, opts = {}) => show({ title, message, tone: 'error', icon: opts.icon || 'circle-alert', duration: 4600, ...opts }),
  warn: (title, message, opts = {}) => show({ title, message, tone: 'warn', icon: opts.icon || 'triangle-alert', duration: 4600, ...opts }),
  info: (title, message, opts = {}) => show({ title, message, tone: 'info', icon: opts.icon || 'info', ...opts }),
  show,
};
