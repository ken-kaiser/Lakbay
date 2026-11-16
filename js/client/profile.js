/* ==========================================================================
   Lakbay — Passenger profile & settings
   Personal info, password, saved places, notification preferences, support
   FAQ, and app data controls. Everything persists to localStorage.
   ========================================================================== */
import { App } from '../app.js';
import { Users, Prefs, SavedPlacesRepo, Store, Notifs } from '../storage.js';
import { searchPlaces, DEFAULT_SAVED_PLACES, FAQS, getPlace } from '../data.js';
import { el, clear, qs } from '../shared/dom.js';
import { Icons } from '../shared/icons.js';
import { Toast } from '../shared/toast.js';
import { Modal, confirmDialog } from '../shared/modal.js';
import { avatarURI, initials, dateShort, firstNameOf } from '../shared/format.js';
import { validate, attachLiveValidation, formatPhoneInput, phoneDisplay, isValidPhone, passwordStrength } from '../shared/validation.js';

function ensureSavedPlaces(userId) {
  let list = SavedPlacesRepo.list(userId);
  if (!list) { list = DEFAULT_SAVED_PLACES(userId); SavedPlacesRepo.save(userId, list); }
  return list;
}

/* ---------- edit profile modal ---------- */
function openEditProfile() {
  const u = App.user;
  const body = el('div', { class: 'col', style: 'gap:12px' });
  const fFirst = el('div', { class: 'field' },
    el('label', { for: 'pf-first' }, 'First name'),
    el('input', { class: 'input', id: 'pf-first', name: 'firstName', type: 'text', value: u.firstName, placeholder: 'Enter your first name', maxlength: '40' }));
  const fLast = el('div', { class: 'field' },
    el('label', { for: 'pf-last' }, 'Last name'),
    el('input', { class: 'input', id: 'pf-last', name: 'lastName', type: 'text', value: u.lastName, placeholder: 'Enter your last name', maxlength: '40' }));
  const fEmail = el('div', { class: 'field' },
    el('label', { for: 'pf-email' }, 'Email address'),
    el('input', { class: 'input', id: 'pf-email', name: 'email', type: 'email', value: u.email, disabled: true }),
    el('small', { class: 'input-hint' }, 'Email is your login ID and cannot be changed here.'));
  const fPhone = el('div', { class: 'field' },
    el('label', { for: 'pf-phone' }, 'Mobile number'),
    el('input', { class: 'input', id: 'pf-phone', name: 'phone', type: 'tel', value: u.phone || '', placeholder: '0917 123 4567', maxlength: '14' }),
    el('small', { class: 'input-hint' }, 'Format: 0917 123 4567'));
  fPhone.querySelector('input').addEventListener('input', (e) => { e.target.value = formatPhoneInput(e.target.value); });
  const row2 = el('div', { class: 'cl-form-2col' }, fFirst, fLast);
  body.append(row2, fEmail, fPhone);

  Modal.open({
    title: 'Edit personal information',
    body,
    actions: [
      { label: 'Cancel', variant: 'outline', onClick: (api) => api.close(null) },
      {
        label: 'Save changes', variant: 'primary', icon: 'check',
        onClick: (api) => {
          const res = validate(body, {
            firstName: [['required'], ['minlen', 2]],
            lastName: [['required'], ['minlen', 2]],
            phone: [['required'], ['phone']],
          });
          if (!res.ok) return;
          const next = Users.update(u.id, {
            firstName: res.values.firstName.trim(),
            lastName: res.values.lastName.trim(),
            phone: phoneDisplay(res.values.phone),
          });
          Toast.success('Profile updated', 'Your details were saved on this device.');
          Notifs.push({ userId: u.id, role: u.role, title: 'Profile updated', body: 'Your personal information was changed.', icon: 'user-round', tone: 'primary' });
          api.close(true);
          App.refreshHeader();
          App.navigate('profile', {}, { replace: true });
        },
      },
    ],
  });
}

/* ---------- change password modal ---------- */
function openChangePassword() {
  const u = App.user;
  const body = el('div', { class: 'col', style: 'gap:12px' });

  function pwField(id, label, placeholder) {
    const input = el('input', { class: 'input', id, name: id, type: 'password', placeholder, autocomplete: 'new-password' });
    const toggle = el('button', { class: 'pw-toggle', type: 'button', 'aria-label': 'Show password', tabindex: '-1' }, el('i', { 'data-lucide': 'eye' }));
    toggle.addEventListener('click', () => {
      const showing = input.type === 'text';
      input.type = showing ? 'password' : 'text';
      toggle.innerHTML = ''; toggle.appendChild(el('i', { 'data-lucide': showing ? 'eye' : 'eye-off' }));
      toggle.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
      Icons.refresh(toggle);
    });
    return el('div', { class: 'field' }, el('label', { for: id }, label), el('div', { class: 'input-wrap' }, input, toggle));
  }

  const cur = pwField('pw-cur', 'Current password', 'Enter your current password');
  const nw = pwField('pw-new', 'New password', 'At least 8 characters');
  const cf = pwField('pw-cfm', 'Confirm new password', 'Repeat the new password');

  const meter = el('div', { class: 'cl-meter' }, el('div', { class: 'cl-meter-bar' }));
  const meterRow = el('div', { class: 'cl-meter-row' }, el('span', {}, 'Password strength'), el('span', { class: 'strength-label' }, '—'));
  nw.querySelector('input').addEventListener('input', (e) => {
    const s = passwordStrength(e.target.value);
    const bar = meter.querySelector('.cl-meter-bar');
    bar.style.width = `${(s.score / 5) * 100}%`;
    bar.style.background = s.color;
    meterRow.querySelector('.strength-label').textContent = e.target.value ? s.label : '—';
  });

  body.append(cur, nw, meter, meterRow, cf);
  attachLiveValidation(body, { pwNew: [['password']] });

  Modal.open({
    title: 'Change password',
    body,
    actions: [
      { label: 'Cancel', variant: 'outline', onClick: (api) => api.close(null) },
      {
        label: 'Update password', variant: 'primary', icon: 'shield-check',
        onClick: async (api) => {
          const { hashPassword } = await import('../storage.js');
          const curVal = body.querySelector('#pw-cur').value;
          const newVal = body.querySelector('#pw-new').value;
          const cfVal = body.querySelector('#pw-cfm').value;
          if (!curVal || !newVal) { Toast.error('Missing fields', 'Fill in all three password fields.'); return; }
          if (newVal.length < 8 || !/[A-Z]/.test(newVal) || !/[a-z]/.test(newVal) || !/\d/.test(newVal)) {
            Toast.error('Weak password', 'Use 8+ characters with upper, lower, and a number.'); return;
          }
          if (newVal !== cfVal) { Toast.error('Mismatch', 'New password and confirmation do not match.'); return; }
          const { verify } = await import('../storage.js').then((m) => ({ verify: m.Users.verify }));
          const ok = await Users.verify(u.email, curVal);
          if (!ok) { Toast.error('Wrong password', 'Your current password did not match.'); return; }
          const hash = await hashPassword(newVal);
          Users.update(u.id, { passwordHash: hash });
          Notifs.push({ userId: u.id, role: u.role, title: 'Password changed', body: 'Your password was updated.', icon: 'shield-check', tone: 'success' });
          Toast.success('Password updated', 'Use your new password next time you sign in.');
          api.close(true);
        },
      },
    ],
  });
}

/* ---------- saved place modal ---------- */
function openPlaceModal(userId, existing) {
  const body = el('div', { class: 'col', style: 'gap:12px' });
  const labelSel = el('select', { class: 'select', id: 'sp-label', 'aria-label': 'Place label' },
    ['Home', 'Work', 'Gym', 'School', 'Favorite'].map((l) => el('option', { value: l, selected: existing && existing.label === l }, l)));
  const q = el('input', { class: 'input', type: 'text', placeholder: 'Search a place…', 'aria-label': 'Search saved place', value: existing && existing.placeId ? existing.name : '' });
  const results = el('div', { class: 'cl-ac-search-results' });
  let chosen = existing && existing.placeId ? getPlace(existing.placeId) : null;

  function paintResults() {
    clear(results);
    const list = q.value.trim() ? searchPlaces(q.value, 6) : searchPlaces('mall', 6);
    list.forEach((p) => {
      const row = el('button', { class: 'cl-ac-item', type: 'button' },
        el('span', { class: 'li-icon' }, el('i', { 'data-lucide': 'map-pin' })),
        el('span', { class: 'li-body' },
          el('span', { class: 'li-title' }, p.name),
          el('span', { class: 'li-sub' }, p.address)));
      row.addEventListener('click', () => {
        chosen = p; q.value = p.name; clear(results);
        Toast.info('Place selected', p.name);
      });
      results.appendChild(row);
    });
    Icons.refresh(results);
  }
  q.addEventListener('input', paintResults);
  paintResults();

  body.append(
    el('div', { class: 'field' }, el('label', { for: 'sp-label' }, 'Label'), labelSel),
    el('div', { class: 'field' }, el('label', { for: 'sp-q' }, 'Place'), q,
      el('small', { class: 'input-hint' }, 'Search covers popular spots near your area.')),
    results,
  );

  Modal.open({
    title: existing ? 'Edit saved place' : 'Add saved place',
    body,
    actions: [
      { label: 'Cancel', variant: 'outline', onClick: (api) => api.close(null) },
      {
        label: 'Save place', variant: 'primary', icon: 'check',
        onClick: (api) => {
          if (!chosen) { Toast.error('No place chosen', 'Search and select a place from the list.'); return; }
          const list = ensureSavedPlaces(userId).slice();
          const entry = {
            id: existing ? existing.id : 'sp-' + Date.now().toString(36),
            label: labelSel.value,
            icon: labelSel.value === 'Home' ? 'house' : labelSel.value === 'Work' ? 'briefcase' : 'star',
            placeId: chosen.id, name: chosen.name, address: chosen.address, lat: chosen.lat, lng: chosen.lng,
          };
          const idx = list.findIndex((s) => s.id === entry.id);
          if (idx >= 0) list[idx] = entry; else list.push(entry);
          SavedPlacesRepo.save(userId, list);
          Toast.success('Saved place updated', `${entry.label} · ${entry.name}`);
          api.close(true);
          App.navigate('profile', { query: { tab: 'places' } }, { replace: true });
        },
      },
    ],
  });
}

/* ---------- view ---------- */
const profileView = {
  id: 'profile',
  render(root, { query }) {
    const u = Users.byId(App.user.id) || App.user;
    const userId = u.id;
    App.setHeader('Profile & settings', 'Your account, places, and preferences');

    const wrap = el('div', { class: 'cl-profile-grid' });

    /* ---- profile card ---- */
    const pc = el('div', { class: 'card cl-profile-card cl-tab-target', 'data-tab': 'account' });
    const avRow = el('div', { class: 'cl-profile-avatar-row' });
    const av = el('span', { class: 'avatar avatar--xl', style: `background-image:url("${u.avatar || avatarURI(u.firstName + ' ' + u.lastName)}")` });
    avRow.append(av,
      el('div', { class: 'grow' },
        el('h2', { class: 't-h2' }, `${u.firstName} ${u.lastName}`),
        el('p', { class: 't-small' }, `${u.email} · ${u.phone || 'No phone'}`),
        el('p', { class: 't-xs' }, `Passenger since ${dateShort(u.joinedAt)} · ${u.trips || 0} rides`)));
    const editBtn = el('button', { class: 'btn btn--soft btn--sm' }, el('i', { 'data-lucide': 'pencil' }), 'Edit');
    editBtn.addEventListener('click', openEditProfile);
    avRow.appendChild(editBtn);
    pc.appendChild(avRow);
    pc.appendChild(el('div', { class: 'cl-plain-list' },
      ['Member rating 4.9 (from riders)', 'Account in good standing'].map((t) =>
        el('div', { class: 'row', style: 'gap:8px' }, el('i', { 'data-lucide': 'check-circle-2', style: 'width:15px;height:15px;color:var(--c-success)' }), el('span', { class: 't-small' }, t)))));
    wrap.appendChild(pc);

    /* ---- security card ---- */
    const sec = el('div', { class: 'card cl-profile-card cl-tab-target', 'data-tab': 'security' });
    sec.appendChild(el('h3', { class: 'cl-section-title' }, 'Password & security'));
    sec.appendChild(el('p', { class: 't-small' },
      'Passwords are hashed with SHA-256 and never stored in plain text. Your data lives only on this device.'));
    const pwBtn = el('button', { class: 'btn btn--outline' }, el('i', { 'data-lucide': 'key-round' }), 'Change password');
    pwBtn.addEventListener('click', openChangePassword);
    sec.appendChild(pwBtn);
    wrap.appendChild(sec);

    /* ---- saved places ---- */
    const places = el('div', { class: 'card cl-profile-card cl-tab-target', 'data-tab': 'places' });
    places.appendChild(el('h3', { class: 'cl-section-title' }, 'Saved places'));
    const placeList = el('div', {});
    function paintPlaces() {
      clear(placeList);
      const list = ensureSavedPlaces(userId);
      if (!list.length) {
        placeList.appendChild(el('p', { class: 't-small' }, 'No saved places yet. Add Home or Work for one-tap booking.'));
      }
      list.forEach((sp) => {
        const row = el('div', { class: 'cl-place-row' },
          el('span', { class: 'li-icon' }, el('i', { 'data-lucide': sp.icon || 'star' })),
          el('span', { class: 'li-body' },
            el('span', { class: 'li-title' }, sp.label),
            el('span', { class: 'li-sub' }, `${sp.name} · ${sp.address}`)),
          el('span', { class: 'cl-place-tools' },
            el('button', { class: 'icon-btn', 'aria-label': `Edit ${sp.label}` }, el('i', { 'data-lucide': 'pencil' })),
            el('button', { class: 'icon-btn', 'aria-label': `Delete ${sp.label}` }, el('i', { 'data-lucide': 'trash-2' }))));
        const [editB, delB] = row.querySelectorAll('button');
        editB.addEventListener('click', () => openPlaceModal(userId, sp));
        delB.addEventListener('click', async () => {
          const ok = await confirmDialog({
            title: `Delete ${sp.label}?`,
            message: `${sp.name} will be removed from your saved places.`,
            confirmLabel: 'Delete', tone: 'danger', icon: 'trash-2',
          });
          if (!ok) return;
          SavedPlacesRepo.save(userId, ensureSavedPlaces(userId).filter((s) => s.id !== sp.id));
          Toast.success('Place deleted', `${sp.label} was removed.`);
          paintPlaces();
        });
        placeList.appendChild(row);
      });
      Icons.refresh(placeList);
    }
    paintPlaces();
    places.appendChild(placeList);
    const addPlace = el('button', { class: 'btn btn--outline btn--sm' }, el('i', { 'data-lucide': 'plus' }), 'Add place');
    addPlace.addEventListener('click', () => openPlaceModal(userId, null));
    places.appendChild(addPlace);
    wrap.appendChild(places);

    /* ---- notification prefs ---- */
    const nprefs = el('div', { class: 'card cl-profile-card cl-tab-target', 'data-tab': 'notifications' });
    nprefs.appendChild(el('h3', { class: 'cl-section-title' }, 'Notification preferences'));
    const savedN = Prefs.get(userId, 'notify', { booking: true, promos: true, sound: true });
    [
      ['booking', 'Ride updates', 'Matching, arrival, and trip status alerts'],
      ['promos', 'Promos & announcements', 'Occasional voucher offers'],
      ['sound', 'Alert sounds', 'Short chime on ride updates'],
    ].forEach(([key, label, sub]) => {
      const sw = el('button', {
        class: `switch${savedN[key] ? ' on' : ''}`, role: 'switch', type: 'button',
        'aria-checked': String(!!savedN[key]), 'aria-label': label,
      }, el('span', { class: 'knob' }));
      sw.addEventListener('click', () => {
        const next = { ...Prefs.get(userId, 'notify', { booking: true, promos: true, sound: true }), [key]: !savedN[key] };
        savedN[key] = !savedN[key];
        sw.classList.toggle('on', savedN[key]);
        sw.setAttribute('aria-checked', String(savedN[key]));
        Prefs.set(userId, 'notify', next);
        Toast.info(label, savedN[key] ? 'Enabled.' : 'Disabled.');
      });
      nprefs.appendChild(el('div', { class: 'row-between' },
        el('div', {},
          el('div', { class: 't-strong' }, label),
          el('div', { class: 't-xs' }, sub)), sw));
    });
    wrap.appendChild(nprefs);

    /* ---- support ---- */
    const sup = el('div', { class: 'card cl-profile-card cl-tab-target cl-profile-wide', 'data-tab': 'support' });
    sup.appendChild(el('h3', { class: 'cl-section-title' }, 'Help & support'));
    const faq = el('div', { class: 'cl-faq' });
    FAQS.forEach((item) => {
      const q = el('button', { class: 'cl-faq-q', type: 'button', 'aria-expanded': 'false' },
        el('span', {}, item.q), el('i', { 'data-lucide': 'chevron-down' }));
      const a = el('div', { class: 'cl-faq-a' }, el('div', {}, el('p', {}, item.a)));
      q.addEventListener('click', () => {
        const open = faq.querySelector('.cl-faq-item.open');
        const li = q.parentElement;
        if (open && open !== li) open.classList.remove('open');
        li.classList.toggle('open');
        q.setAttribute('aria-expanded', li.classList.contains('open'));
      });
      faq.appendChild(el('div', { class: 'cl-faq-item' }, q, a));
    });
    sup.appendChild(faq);
    const links = el('div', { class: 'cl-support-links', style: 'margin-top:10px' });
    [
      { icon: 'shield-check', t: 'Safety center', s: 'Trip sharing, emergency contacts, and driver screening', go: () => Toast.info('Safety center', 'Full safety tooling is coming soon.') },
      { icon: 'file-text', t: 'Terms & privacy', s: 'Plain-language summary of Lakbay\'s rules', go: () => Modal.open({
          title: 'Terms & privacy', wide: true,
          body: el('div', { class: 'col', style: 'gap:10px' },
            el('p', { class: 't-body t-muted' }, 'Lakbay is a personal project. All accounts, bookings, chats, payments, and earnings live only in your browser\'s localStorage and never leave this device.'),
            el('p', { class: 't-body t-muted' }, 'Choose a password you do not use anywhere else. Your data stays on this device, and Lakbay follows the privacy principles of the Philippine Data Privacy Act of 2012.')),
          actions: [{ label: 'Got it', variant: 'primary', onClick: (api) => api.close(true) }],
        }) },
      { icon: 'life-buoy', t: 'Contact support', s: 'support@lakbay.app', go: () => Toast.info('Support', 'Inbox is not connected yet — try again later.') },
    ].forEach((l) => {
      const li = el('button', { class: 'list-item', type: 'button' },
        el('span', { class: 'li-icon' }, el('i', { 'data-lucide': l.icon })),
        el('span', { class: 'li-body' },
          el('span', { class: 'li-title' }, l.t),
          el('span', { class: 'li-sub' }, l.s)),
        el('i', { 'data-lucide': 'chevron-right', style: 'width:16px;height:16px;color:var(--c-ink-4)' }));
      li.addEventListener('click', l.go);
      links.appendChild(li);
    });
    sup.appendChild(links);
    wrap.appendChild(sup);

    /* ---- danger zone ---- */
    const dz = el('div', { class: 'card cl-profile-card cl-danger-card cl-tab-target', 'data-tab': 'about' });
    dz.appendChild(el('h3', { class: 'cl-section-title' }, 'About Lakbay'));
    dz.appendChild(el('p', { class: 't-small' }, 'Lakbay v1.0 · vanilla HTML, CSS, and JavaScript · Leaflet & OpenStreetMap maps · Lucide icons. Reset removes every account, booking, and preference stored in this browser.'));
    const dzRow = el('div', { class: 'row', style: 'flex-wrap:wrap;gap:8px' });
    const resetBtn = el('button', { class: 'btn btn--outline' }, el('i', { 'data-lucide': 'trash-2' }), 'Reset app data');
    resetBtn.addEventListener('click', async () => {
      const ok = await confirmDialog({
        title: 'Reset all app data?',
        message: 'Every account, booking, and setting saved in this browser will be erased. You will be returned to the welcome screen.',
        confirmLabel: 'Erase everything', tone: 'danger', icon: 'trash-2',
      });
      if (!ok) return;
      try {
        Object.keys(localStorage).filter((k) => k.startsWith('lakbay:')).forEach((k) => localStorage.removeItem(k));
        Object.keys(sessionStorage).filter((k) => k.startsWith('lakbay:')).forEach((k) => sessionStorage.removeItem(k));
      } catch (e) { /* noop */ }
      window.location.href = 'index.html';
    });
    const logoutBtn = el('button', { class: 'btn btn--ghost-danger' }, el('i', { 'data-lucide': 'log-out' }), 'Log out');
    logoutBtn.addEventListener('click', async () => {
      const { confirmDialog: cd } = await import('../shared/modal.js');
      const ok = await cd({ title: 'Log out?', message: 'You can sign back in anytime — your data stays.', confirmLabel: 'Log out', icon: 'log-out' });
      if (ok) window.location.href = 'index.html#goodbye';
    });
    dzRow.append(resetBtn, logoutBtn);
    dz.appendChild(dzRow);
    wrap.appendChild(dz);

    root.appendChild(wrap);
    Icons.refresh(root);

    /* deep link ?tab=... */
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

export { profileView };
