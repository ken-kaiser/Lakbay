/* ==========================================================================
   Lakbay — Modal system
   Modal.open({ title, body, actions, size, onClose }) -> { close, root }
   Modal.confirm({ title, message, confirmLabel, tone }) -> Promise<boolean>
   ========================================================================== */
import { el, clear } from './dom.js';
import { Icons } from './icons.js';

let openStack = [];
let lastFocused = null;

function lockScroll() {
  document.body.style.overflow = 'hidden';
}
function unlockScroll() {
  if (openStack.length === 0) document.body.style.overflow = '';
}

export function openModal({ title = '', body = null, actions = [], onClose = null, dismissible = true, wide = false, headless = false }) {
  lastFocused = document.activeElement;

  const box = el('div', { class: 'modal-box', role: 'dialog', 'aria-modal': 'true', 'aria-label': title || 'Dialog' });
  if (wide) box.style.maxWidth = '640px';

  const overlay = el('div', { class: 'modal-overlay' }, box);

  function close(result) {
    if (!overlay.isConnected) return;
    overlay.remove();
    openStack = openStack.filter((o) => o !== api);
    unlockScroll();
    if (onClose) onClose(result);
    if (lastFocused && lastFocused.isConnected) lastFocused.focus();
  }

  if (!headless) {
    const head = el('div', { class: 'modal-head' },
      el('h3', {}, title),
      dismissible ? el('button', { class: 'icon-btn', 'aria-label': 'Close dialog', onclick: () => close(null) }, el('i', { 'data-lucide': 'x' })) : null,
    );
    box.appendChild(head);
  }

  const bodyWrap = el('div', { class: 'modal-body' });
  if (body) {
    if (body instanceof Node) bodyWrap.appendChild(body);
    else if (body && body.__safe) bodyWrap.innerHTML = body.__safe;
    else bodyWrap.innerHTML = String(body);
  }
  box.appendChild(bodyWrap);

  if (actions && actions.length) {
    const foot = el('div', { class: 'modal-foot' });
    actions.forEach((a) => {
      const btn = el('button', {
        class: `btn btn--${a.variant || 'primary'}${a.block ? ' btn--block' : ''}${a.loading ? ' btn--loading' : ''}`,
        onclick: () => a.onClick ? a.onClick(api, btn) : close(a.value),
      },
        a.icon ? el('i', { 'data-lucide': a.icon }) : null,
        a.label,
      );
      if (a.id) btn.dataset.actionId = a.id;
      foot.appendChild(btn);
    });
    box.appendChild(foot);
  }

  overlay.addEventListener('mousedown', (e) => {
    if (dismissible && e.target === overlay) close(null);
  });

  document.body.appendChild(overlay);
  lockScroll();
  Icons.refresh(box);

  const api = { close, root: box, overlay, body: bodyWrap };
  openStack.push(api);

  // ESC to close + rudimentary focus containment
  const keyHandler = (e) => {
    if (e.key === 'Escape' && dismissible) { close(null); }
    if (e.key === 'Tab') {
      const focusables = box.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (!focusables.length) return;
      const first = focusables[0], last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { last.focus(); e.preventDefault(); }
      else if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); }
    }
  };
  document.addEventListener('keydown', keyHandler);
  const origOnClose = onClose;
  // wrap close so listener is removed
  api.close = (result) => {
    document.removeEventListener('keydown', keyHandler);
    close(result);
  };

  const autoFocus = box.querySelector('input, button:not(.icon-btn), textarea');
  if (autoFocus) setTimeout(() => autoFocus.focus(), 60);

  return api;
}

export function confirmDialog({ title = 'Are you sure?', message = '', confirmLabel = 'Confirm', cancelLabel = 'Cancel', tone = 'primary', icon = null }) {
  return new Promise((resolve) => {
    const body = el('div', {},
      icon ? el('div', { style: 'margin-bottom:12px' },
        el('span', {
          style: `width:46px;height:46px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;background:${tone === 'danger' ? 'var(--c-danger-soft)' : 'var(--c-primary-soft)'};color:${tone === 'danger' ? 'var(--c-danger)' : 'var(--c-primary-deep)'}`,
        }, el('i', { 'data-lucide': icon || 'triangle-alert', style: 'width:22px;height:22px' }))) : null,
      el('p', { class: 't-body t-muted', style: 'line-height:1.55' }, message),
    );
    openModal({
      title,
      body,
      onClose: () => resolve(false),
      actions: [
        { label: cancelLabel, variant: 'outline', onClick: (api) => { resolve(false); api.close(false); } },
        { label: confirmLabel, variant: tone === 'danger' ? 'danger' : 'primary', onClick: (api) => { resolve(true); api.close(true); } },
      ],
    });
  });
}

export const Modal = { open: openModal, confirm: confirmDialog };

/* Close every open modal (route changes should never leave dialogs behind). */
export function closeAllModals() {
  [...openStack].forEach((m) => { try { m.close(null); } catch (e) { /* noop */ } });
}
