/* ==========================================================================
   Lakbay — Rider profile, vehicle & verification center
   Personal info, vehicle details, document uploads (simulated review),
   payout settings, notification preferences, security, logout.
   ========================================================================== */
import { App } from '../app.js';
import { Users, Prefs, Notifs } from '../storage.js';
import { RIDE_CATEGORIES } from '../data.js';
import { el, clear } from '../shared/dom.js';
import { Icons } from '../shared/icons.js';
import { Toast } from '../shared/toast.js';
import { Modal, confirmDialog } from '../shared/modal.js';
import { avatarURI, dateShort, firstNameOf } from '../shared/format.js';
import { formatPhoneInput, phoneDisplay, passwordStrength } from '../shared/validation.js';
import { starsRead } from '../shared/ui-lite.js';

const DOC_DEFS = [
  { key: 'govId', label: 'Government-issued ID', hint: 'PhilSys ID, Passport, UMID, or Driver\'s License front', icon: 'id-card' },
  { key: 'license', label: 'Driver\'s license', hint: 'Professional or Non-professional PDL', icon: 'credit-card' },
  { key: 'vehicleReg', label: 'Vehicle registration (OR/CR)', hint: 'Latest Official Receipt / Certificate of Registration', icon: 'file-text' },
  { key: 'profilePhoto', label: 'Profile photograph', hint: 'Clear photo of your face', icon: 'camera' },
];

function verificationOf() {
  const me = Users.byId(App.user.id) || App.user;
  return (me && me.verification) || { status: 'not_submitted', docs: {}, vehicle: me && me.vehicle };
}

const riderProfileView = {
  id: 'profile',
  render(root, { query }) {
    const me = Users.byId(App.user.id) || App.user;
    const userId = me.id;
    App.setHeader('Rider profile', 'Account, vehicle, and verification');

    const wrap = el('div', { class: 'cl-profile-grid' });

    /* ---- personal info ---- */
    const pc = el('div', { class: 'card cl-profile-card cl-tab-target', 'data-tab': 'account' });
    const avRow = el('div', { class: 'cl-profile-avatar-row' },
      el('span', { class: 'avatar avatar--xl', style: `background-image:url("${me.avatar || avatarURI(me.firstName + ' ' + me.lastName)}")` }),
      el('div', { class: 'grow' },
        el('h2', { class: 't-h2' }, `${me.firstName} ${me.lastName}`),
        el('p', { class: 't-small' }, me.email),
        el('p', { class: 't-xs' }, `Rider since ${dateShort(me.joinedAt)} · rating ${Number(me.rating || 5).toFixed(2)}`)));
    pc.appendChild(avRow);
    pc.appendChild(starsRead(me.rating || 5));

    const pf = el('div', { class: 'cl-form-2col' });
    const mkField = (label, name, value, opts = {}) => {
      const input = el('input', { class: 'input', name, type: opts.type || 'text', value: value || '', placeholder: opts.ph || '', maxlength: opts.max || '60', disabled: !!opts.disabled });
      if (opts.phone) input.addEventListener('input', () => { input.value = formatPhoneInput(input.value); });
      return el('div', { class: 'field' }, el('label', {}, label), input);
    };
    const firstName = mkField('First name', 'firstName', me.firstName);
    const lastName = mkField('Last name', 'lastName', me.lastName);
    const phone = mkField('Mobile number', 'phone', me.phone, { phone: true, ph: '0917 123 4567' });
    const email = mkField('Email', 'email', me.email, { disabled: true, ph: 'name@example.com' });
    pf.append(firstName, lastName, phone, email);
    pc.appendChild(pf);
    const saveBtn = el('button', { class: 'btn btn--primary btn--sm', style: 'align-self:flex-start' }, el('i', { 'data-lucide': 'save' }), 'Save changes');
    saveBtn.addEventListener('click', () => {
      const fv = (f) => f.querySelector('input').value.trim();
      if (!fv(firstName) || !fv(lastName)) { Toast.error('Missing name', 'First and last name are required.'); return; }
      const digits = fv(phone).replace(/\D/g, '');
      if (!/^(09\d{9}|639\d{9})$/.test(digits)) { Toast.error('Invalid number', 'Use the format 0917 123 4567.'); return; }
      Users.update(userId, {
        firstName: fv(firstName), lastName: fv(lastName), phone: phoneDisplay(fv(phone)),
      });
      Toast.success('Saved', 'Your profile was updated.');
      Notifs.push({ userId, role: 'rider', title: 'Profile updated', body: 'Your personal details were changed.', icon: 'user-round', tone: 'primary' });
      App.refreshHeader();
    });
    pc.appendChild(saveBtn);
    wrap.appendChild(pc);

    /* ---- verification center ---- */
    const vc = el('div', { class: 'card cl-profile-card cl-tab-target', 'data-tab': 'verification' });
    const ver = verificationOf();
    const statusMeta = {
      not_submitted: ['Not submitted', 'flag-note', 'circle-dot'],
      pending: ['Pending review', 'flag-note flag-note--warn', 'hourglass'],
      verified: ['Verified', 'flag-note flag-note--ok', 'shield-check'],
      rejected: ['Rejected', 'flag-note flag-note--danger', 'circle-x'],
    };
    const [stLabel, stClass, stIcon] = statusMeta[ver.status] || statusMeta.not_submitted;
    vc.appendChild(el('div', { class: 'row-between' },
      el('h3', { class: 'cl-section-title' }, el('i', { 'data-lucide': 'shield-check' }), 'Verification'),
      el('span', { class: stClass }, el('i', { 'data-lucide': stIcon }), stLabel)));

    vc.appendChild(el('p', { class: 't-small' },
      ver.status === 'verified'
        ? 'Your account passed the review. Documents below are kept on file.'
        : ver.status === 'pending'
          ? 'Documents received. Review usually finishes within a few seconds — keep this page open.'
          : 'Upload the four requirements below, complete your vehicle details, then submit for review.'));

    /* doc tiles */
    const docs = ver.docs || {};
    const docGrid = el('div', { class: 'rd-doc-grid' });
    DOC_DEFS.forEach((d) => {
      const has = docs[d.key] && docs[d.key].name;
      const fileInput = el('input', { type: 'file', accept: 'image/*,.pdf', class: 'sr-only', 'aria-label': `Upload ${d.label}` });
      const tile = el('button', { class: `rd-doc-tile${has ? ' ok' : ''}`, type: 'button' },
        el('i', { 'data-lucide': has ? 'circle-check' : d.icon }),
        el('span', { class: 'rd-doc-label' }, d.label),
        el('span', { class: 'rd-doc-sub clamp-1' }, has ? docs[d.key].name : d.hint));
      tile.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', () => {
        const f = fileInput.files && fileInput.files[0];
        if (!f) return;
        const nextVer = { ...(Users.byId(userId).verification || { status: ver.status }), docs: { ...(Users.byId(userId).verification || { docs: {} }).docs, [d.key]: { name: f.name, ok: false } } };
        Users.update(userId, { verification: nextVer });
        Toast.success('Document attached', `${f.name} — added to your verification.`);
        fileInput.value = '';
        App.navigate('profile', { query: { tab: 'verification' } }, { replace: true });
      });
      docGrid.append(tile, fileInput);
    });
    vc.appendChild(docGrid);

    /* vehicle fields */
    const veh = me.vehicle || {};
    const vGrid = el('div', { class: 'cl-form-2col', style: 'margin-top:4px' });
    const typeSel = el('select', { class: 'select', id: 'v-type', name: 'vtype' },
      el('option', { value: '' }, 'Vehicle type…'),
      RIDE_CATEGORIES.map((c) => el('option', { value: c.id, selected: veh.type === c.id }, `${c.name} (${c.capacity} pax)`)));
    const model = el('input', { class: 'input', id: 'v-model', placeholder: 'e.g. Toyota Vios 1.3 XLE', value: veh.model || '' });
    const color = el('input', { class: 'input', id: 'v-color', placeholder: 'e.g. White', value: veh.color || '' });
    const plate = el('input', { class: 'input', id: 'v-plate', placeholder: 'e.g. NCT-8421', value: veh.plate || '', style: 'text-transform:uppercase' });
    plate.addEventListener('input', () => { plate.value = plate.value.toUpperCase(); });
    vGrid.append(
      el('div', { class: 'field' }, el('label', { for: 'v-type' }, 'Vehicle type'), typeSel),
      el('div', { class: 'field' }, el('label', { for: 'v-model' }, 'Model'), model),
      el('div', { class: 'field' }, el('label', { for: 'v-color' }, 'Color'), color),
      el('div', { class: 'field' }, el('label', { for: 'v-plate' }, 'Plate number'), plate),
    );
    vc.appendChild(vGrid);

    if (ver.status !== 'verified') {
      const submitBtn = el('button', { class: 'btn btn--primary btn--block' }, el('i', { 'data-lucide': 'send' }), 'Submit for review');
      submitBtn.addEventListener('click', () => {
        const curVer = (Users.byId(userId).verification || { docs: {} });
        const docs2 = curVer.docs || {};
        const missing = DOC_DEFS.filter((d) => !docs2[d.key] || !docs2[d.key].name);
        if (missing.length) { Toast.error('Documents incomplete', `Missing: ${missing.map((m) => m.label).join(', ')}`); return; }
        if (!typeSel.value || !model.value.trim() || !color.value.trim() || !plate.value.trim()) {
          Toast.error('Vehicle details incomplete', 'Fill in type, model, color, and plate number.'); return;
        }
        const vehicle = {
          model: model.value.trim(), color: color.value.trim(), plate: plate.value.trim(),
          type: typeSel.value, categoryIds: [typeSel.value],
        };
        Users.update(userId, { vehicle, verification: { ...curVer, status: 'pending', submittedAt: Date.now() } });
        Notifs.push({ userId, role: 'rider', title: 'Documents submitted', body: 'Our review team is checking your submission.', icon: 'hourglass', tone: 'primary' });
        Toast.success('Submitted for review', 'Verification usually completes in a few seconds.');
        App.navigate('profile', { query: { tab: 'verification' } }, { replace: true });
      });
      vc.appendChild(submitBtn);
      vc.appendChild(el('p', { class: 't-xs', style: 'margin-top:6px' },
        'Submissions are reviewed within seconds of submitting. Only file names are stored with your application.'));
    } else {
      vc.appendChild(el('div', { class: 'info-banner info-banner--success' },
        el('i', { 'data-lucide': 'badge-check' }),
        el('span', {}, `Verified on ${dateShort(ver.reviewedAt || Date.now())}. You can go online anytime from the dashboard.`)));
    }
    wrap.appendChild(vc);

    /* ---- payout ---- */
    const pay = el('div', { class: 'card cl-profile-card cl-tab-target', 'data-tab': 'payout' });
    pay.appendChild(el('h3', { class: 'cl-section-title' }, el('i', { 'data-lucide': 'wallet' }), 'Payout account'));
    pay.appendChild(el('p', { class: 't-small' }, 'Where your weekly earnings are sent. Payouts go to your registered account.'));
    const payGrid = el('div', { class: 'cl-form-2col' });
    const gcash = el('input', { class: 'input', id: 'po-gcash', placeholder: '0918 445 2233', value: (me.payout && me.payout.gcash) || '' });
    gcash.addEventListener('input', () => { gcash.value = formatPhoneInput(gcash.value); });
    const bank = el('input', { class: 'input', id: 'po-bank', placeholder: 'BPI ••4471', value: (me.payout && me.payout.bank) || '' });
    payGrid.append(
      el('div', { class: 'field' }, el('label', { for: 'po-gcash' }, 'GCash number'), gcash),
      el('div', { class: 'field' }, el('label', { for: 'po-bank' }, 'Bank account'), bank));
    pay.appendChild(payGrid);
    const paySave = el('button', { class: 'btn btn--outline btn--sm', style: 'align-self:flex-start' }, el('i', { 'data-lucide': 'save' }), 'Save payout account');
    paySave.addEventListener('click', () => {
      Users.update(userId, { payout: { gcash: gcash.value.trim(), bank: bank.value.trim() } });
      Toast.success('Payout saved', 'Your cash-out options were updated.');
    });
    pay.appendChild(paySave);
    wrap.appendChild(pay);

    /* ---- preferences + security ---- */
    const pref = el('div', { class: 'card cl-profile-card cl-tab-target', 'data-tab': 'notifications' });
    pref.appendChild(el('h3', { class: 'cl-section-title' }, el('i', { 'data-lucide': 'bell' }), 'Notification preferences'));
    const savedN = Prefs.get(userId, 'notify', { sound: true, booking: true });
    [
      ['booking', 'Ride requests & trip alerts', 'Pop-ups while the app is open'],
      ['sound', 'Request alert sound', 'Chime when a new request arrives'],
    ].forEach(([key, label, sub]) => {
      const sw = el('button', { class: `switch${savedN[key] !== false ? ' on' : ''}`, role: 'switch', 'aria-checked': String(savedN[key] !== false), 'aria-label': label }, el('span', { class: 'knob' }));
      sw.addEventListener('click', () => {
        savedN[key] = savedN[key] === false ? true : false;
        sw.classList.toggle('on', savedN[key] !== false);
        sw.setAttribute('aria-checked', String(savedN[key] !== false));
        Prefs.set(userId, 'notify', savedN);
        Toast.info(label, savedN[key] !== false ? 'Enabled.' : 'Disabled.');
      });
      pref.appendChild(el('div', { class: 'row-between' },
        el('div', {}, el('div', { class: 't-strong' }, label), el('div', { class: 't-xs' }, sub)), sw));
    });
    wrap.appendChild(pref);

    const sec = el('div', { class: 'card cl-profile-card cl-tab-target', 'data-tab': 'security' });
    sec.appendChild(el('h3', { class: 'cl-section-title' }, el('i', { 'data-lucide': 'shield-check' }), 'Password & security'));
    sec.appendChild(el('p', { class: 't-small' }, 'Passwords are SHA-256 hashed before storage; plaintext is never seen or stored.'));
    const pwBtn = el('button', { class: 'btn btn--outline btn--sm' }, el('i', { 'data-lucide': 'key-round' }), 'Change password');
    pwBtn.addEventListener('click', () => openRiderChangePassword(userId));
    sec.appendChild(pwBtn);
    const logoutBtn = el('button', { class: 'btn btn--ghost-danger btn--sm' }, el('i', { 'data-lucide': 'log-out' }), 'Log out');
    logoutBtn.addEventListener('click', async () => {
      const ok = await confirmDialog({ title: 'Log out?', message: 'You will return to the welcome screen.', confirmLabel: 'Log out', icon: 'log-out' });
      if (ok) window.location.href = 'index.html#goodbye';
    });
    sec.appendChild(logoutBtn);
    wrap.appendChild(sec);

    root.appendChild(wrap);
    Icons.refresh(root);

    if (query && query.tab) {
      const target = wrap.querySelector(`[data-tab="${query.tab}"]`);
      if (target) setTimeout(() => {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        target.classList.add('cl-tab-flash');
        setTimeout(() => target.classList.remove('cl-tab-flash'), 1700);
      }, 120);
    }
  },
};

/* ---------- change password (rider) ---------- */
function openRiderChangePassword(userId) {
  const body = el('div', { class: 'col', style: 'gap:12px' });
  const mk = (id, label) => {
    const input = el('input', { class: 'input', id, type: 'password', placeholder: '••••••••', autocomplete: 'new-password' });
    const t = el('button', { class: 'pw-toggle', type: 'button', 'aria-label': 'Show password' }, el('i', { 'data-lucide': 'eye' }));
    t.addEventListener('click', () => {
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      t.innerHTML = ''; t.appendChild(el('i', { 'data-lucide': show ? 'eye-off' : 'eye' }));
      Icons.refresh(t);
    });
    return el('div', { class: 'field' }, el('label', {}, label), el('div', { class: 'input-wrap' }, input, t));
  };
  const cur = mk('rp-cur', 'Current password');
  const nw = mk('rp-new', 'New password');
  const cf = mk('rp-cfm', 'Confirm new password');
  const meter = el('div', { class: 'cl-meter' }, el('div', { class: 'cl-meter-bar' }));
  nw.querySelector('input').addEventListener('input', (e) => {
    const s = passwordStrength(e.target.value);
    const bar = meter.querySelector('.cl-meter-bar');
    bar.style.width = `${(s.score / 5) * 100}%`; bar.style.background = s.color;
  });
  body.append(cur, nw, meter, cf);
  Modal.open({
    title: 'Change password',
    body,
    actions: [
      { label: 'Cancel', variant: 'outline', onClick: (api) => api.close(null) },
      {
        label: 'Update', variant: 'primary', icon: 'shield-check',
        onClick: async (api) => {
          const { hashPassword, Users: U } = await import('../storage.js');
          const me = U.byId(userId);
          const ok = await U.verify(me.email, cur.querySelector('input').value);
          if (!ok) { Toast.error('Wrong password', 'Current password did not match.'); return; }
          const nv = nw.querySelector('input').value;
          if (nv.length < 8 || !/[A-Z]/.test(nv) || !/[a-z]/.test(nv) || !/\d/.test(nv)) {
            Toast.error('Weak password', 'Use 8+ chars with upper, lower, and a number.'); return;
          }
          if (nv !== cf.querySelector('input').value) { Toast.error('Mismatch', 'Passwords do not match.'); return; }
          U.update(userId, { passwordHash: await hashPassword(nv) });
          Toast.success('Password updated', 'Use it on your next sign-in.');
          api.close(true);
        },
      },
    ],
  });
}

export { riderProfileView };
