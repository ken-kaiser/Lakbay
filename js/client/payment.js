/* ==========================================================================
   Lakbay — Passenger wallet & payments
   Manages the payment method list (Cash / GCash / Maya) and shows payment
   history from completed bookings. Wallet links are stored locally on the
   passenger's device only.
   ========================================================================== */
import { App } from '../app.js';
import { Bookings, PaymentRepo, Prefs, Notifs } from '../storage.js';
import { PAYMENT_METHODS } from '../data.js';
import { el, clear, qs } from '../shared/dom.js';
import { Icons } from '../shared/icons.js';
import { Toast } from '../shared/toast.js';
import { Modal, confirmDialog } from '../shared/modal.js';
import { peso, dateTime } from '../shared/format.js';
import { formatPhoneInput, isValidPhone } from '../shared/validation.js';

const WALLETS = ['gcash', 'maya'];

function repoList(userId) {
  const list = PaymentRepo.list(userId).slice();
  // Always expose cash; wallets appear once they are linked
  if (!list.some((m) => m.id === 'cash')) list.push({ id: 'cash', default: !list.some((m) => m.default) });
  return list;
}

function methodMeta(id) { return PAYMENT_METHODS.find((m) => m.id === id) || PAYMENT_METHODS[0]; }

/* ---------- add / relink wallet modal ---------- */
function openLinkWallet(userId, walletId, existing, onDone) {
  const meta = methodMeta(walletId);
  const input = el('input', {
    class: 'input', id: 'wallet-num', type: 'text', inputmode: 'numeric', maxlength: '14',
    placeholder: '0917 123 4567', value: existing ? (existing.number || '') : '',
    'aria-label': `${meta.name} mobile number`,
  });
  input.addEventListener('input', () => { input.value = formatPhoneInput(input.value); });
  const hint = el('p', { class: 'input-hint' }, `Link the mobile number registered to your ${meta.name} account. It is stored on this device only.`);
  const body = el('div', {},
    el('div', { class: 'row', style: 'gap:10px;margin-bottom:12px' },
      el('span', { class: 'po-logo', style: `background:${meta.logoBg};color:${meta.logoFg};width:42px;height:42px;border-radius:10px;display:inline-flex;align-items:center;justify-content:center` },
        el('i', { 'data-lucide': meta.icon })),
      el('div', {},
        el('div', { class: 't-h3' }, meta.name),
        el('div', { class: 't-xs' }, 'Wallet link'))),
    el('div', { class: 'field' },
      el('label', { for: 'wallet-num' }, 'Mobile number'),
      input, hint));

  const modal = Modal.open({
    title: existing ? `Update ${meta.name}` : `Add ${meta.name}`,
    body,
    onClose: () => { if (onDone) onDone(); },
    actions: [
      { label: 'Cancel', variant: 'outline', onClick: (api) => api.close(null) },
      {
        label: 'Link wallet', variant: 'primary', icon: 'link',
        onClick: (api) => {
          if (!isValidPhone(input.value)) {
            Toast.error('Invalid number', 'Enter a valid PH mobile number like 0917 123 4567.');
            return;
          }
          const list = repoList(userId).filter((m) => m.id !== walletId);
          const display = '+63 ' + input.value.replace(/\D/g, '').slice(1, 4) + ' ' + input.value.replace(/\D/g, '').slice(4, 7) + ' ' + input.value.replace(/\D/g, '').slice(7, 11);
          list.push({ id: walletId, number: display, default: list.every((m) => !m.default) });
          PaymentRepo.save(userId, list);
          Notifs.push({
            userId, role: 'passenger',
            title: `${meta.name} linked`,
            body: `${display} is now available at checkout.`,
            icon: 'wallet', tone: 'primary',
          });
          Toast.success(`${meta.name} linked`, 'You can now pick it when booking a ride.');
          api.close(true);
        },
      },
    ],
  });
  qs('#wallet-num', modal.root); // focused automatically by the modal system
  return modal;
}

const walletView = {
  id: 'wallet',
  render(root) {
    const userId = App.user.id;
    App.setHeader('Wallet & payments', 'Manage how you pay for rides');

    const wrap = el('div', { class: 'cl-wallet-grid' });

    /* ---- methods card ---- */
    const methodsCard = el('div', { class: 'card card-pad cl-pay-manage' });
    methodsCard.appendChild(el('div', { class: 'card-head', style: 'padding:0;margin-bottom:2px' },
      el('h2', { class: 'cl-section-title' }, 'Payment methods')));

    function paintMethods() {
      clear(methodsCard);
      methodsCard.appendChild(el('div', { class: 'card-head', style: 'padding:0;margin-bottom:2px' },
        el('h2', { class: 'cl-section-title' }, 'Payment methods')));
      const list = repoList(userId);
      list.forEach((m) => {
        const meta = methodMeta(m.id);
        const row = el('div', { class: 'pay-opt list-item--static' },
          el('span', { class: 'po-logo', style: `background:${meta.logoBg};color:${meta.logoFg}` }, el('i', { 'data-lucide': meta.icon })),
          el('span', { class: 'po-body' },
            el('span', { class: 'po-name' }, meta.name,
              m.default ? el('span', { class: 'cl-default-badge' }, 'Default') : null),
            el('span', { class: 'po-sub' }, m.number ? `${meta.name} · ${m.number}` : meta.sub)),
          el('div', { class: 'row', style: 'gap:2px' },
            !m.default ? el('button', { class: 'icon-btn', 'aria-label': `Set ${meta.name} as default`, title: 'Set default' }, el('i', { 'data-lucide': 'star' })) : null,
            WALLETS.includes(m.id) ? el('button', { class: 'icon-btn', 'aria-label': `Edit ${meta.name}`, title: 'Edit' }, el('i', { 'data-lucide': 'pencil' })) : null,
          ));
        const setDef = row.querySelector('[aria-label$="default"]');
        if (setDef) setDef.addEventListener('click', () => {
          PaymentRepo.setDefault(userId, m.id);
          Toast.success('Default updated', `${meta.name} is now your default payment method.`);
          paintMethods();
        });
        const editBtn = row.querySelector('[aria-label$="Edit"]');
        if (editBtn) editBtn.addEventListener('click', () => {
          openLinkWallet(userId, m.id, m, paintMethods);
        });
        methodsCard.appendChild(row);
      });

      /* add wallet tiles */
      const choice = el('div', { class: 'cl-method-choice' });
      WALLETS.filter((w) => !list.some((m) => m.id === w)).forEach((w) => {
        const meta = methodMeta(w);
        const tile = el('button', { class: 'cl-method-tile', type: 'button' },
          el('span', { class: 'po-logo', style: `background:${meta.logoBg};color:${meta.logoFg}` }, el('i', { 'data-lucide': 'plus' })),
          `Add ${meta.name}`);
        tile.addEventListener('click', () => {
          openLinkWallet(userId, w, null, paintMethods);
        });
        choice.appendChild(tile);
      });
      if (choice.children.length) methodsCard.appendChild(choice);

      methodsCard.appendChild(el('div', { class: 'info-banner info-banner--neutral' },
        el('i', { 'data-lucide': 'info' }),
        el('span', {}, 'Wallet connections are stored on this device only.'),
      ));
      Icons.refresh(methodsCard);
    }
    paintMethods();
    wrap.appendChild(methodsCard);

    /* ---- transactions card ---- */
    const txCard = el('div', { class: 'card card-pad' });
    txCard.appendChild(el('h2', { class: 'cl-section-title', style: 'margin-bottom:8px' }, 'Payment history'));

    const paid = Bookings.all()
      .filter((b) => b.passengerId === userId && b.status === 'completed')
      .slice(0, 12);
    if (paid.length) {
      const list = el('div', { class: 'list cl-scroll-y' });
      paid.forEach((b) => {
        const meta = methodMeta(b.payment.method);
        const item = el('button', { class: 'list-item', type: 'button' },
          el('span', { class: 'li-icon' }, el('i', { 'data-lucide': meta.icon })),
          el('span', { class: 'li-body' },
            el('span', { class: 'li-title' }, `${b.pickup.name} → ${b.dropoff.name}`),
            el('span', { class: 'li-sub' }, `${dateTime(b.receipt ? b.receipt.paidAt : b.createdAt)} · ${meta.name} · ${b.ref}`)),
          el('span', { class: 't-strong t-num nowrap' }, peso(b.fare.total)));
        item.addEventListener('click', () => App.navigate('receipt', { restPath: b.id }));
        list.appendChild(item);
      });
      txCard.appendChild(list);
    } else {
      txCard.appendChild(el('div', { class: 'empty', style: 'padding:24px 16px' },
        el('img', { class: 'empty-img', src: 'assets/illustrations/empty-rides.png', alt: '',
          onerror: (e) => e.target.remove() }),
        el('h3', {}, 'No payments yet'),
        el('p', {}, 'Completed rides with their fare receipts will appear here.')));
    }
    wrap.appendChild(txCard);

    /* ---- promo / credits info ---- */
    const infoCard = el('div', { class: 'card card-pad' });
    infoCard.appendChild(el('h2', { class: 'cl-section-title', style: 'margin-bottom:6px' }, 'Promos & credits'));
    infoCard.appendChild(el('p', { class: 't-small' },
      'Lakbay credits and vouchers are applied per ride at checkout. Explore today\'s promo codes on your home screen — try LAKBAY50 on your next booking.'));
    wrap.appendChild(infoCard);

    root.appendChild(wrap);
    Icons.refresh(root);
  },
};

export { walletView };
