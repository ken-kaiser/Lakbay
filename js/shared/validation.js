/* ==========================================================================
   Lakbay — Form validation
   Rules-driven validation with live feedback.
   validate(formEl, rules) -> { ok, errors, values }
   ========================================================================== */

const RULES = {
  required: (v) => (String(v ?? '').trim() !== '' ? null : 'This field is required.'),
  email: (v) => (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v).trim()) ? null : 'Enter a valid email address.'),
  minlen: (v, arg) => (String(v ?? '').length >= Number(arg) ? null : `Must be at least ${arg} characters.`),
  password: (v) => {
    const s = String(v ?? '');
    if (s.length < 8) return 'Password must be at least 8 characters.';
    if (!/[A-Z]/.test(s)) return 'Include at least one uppercase letter.';
    if (!/[a-z]/.test(s)) return 'Include at least one lowercase letter.';
    if (!/\d/.test(s)) return 'Include at least one number.';
    return null;
  },
  match: (v, arg, values) => (v === values[arg] ? null : 'Passwords do not match.'),
  phone: (v) => (isValidPhone(v) ? null : 'Enter a valid PH mobile number (09XX XXX XXXX).'),
  checked: (v) => (v === true || v === 'on' || v === 'true' ? null : 'This checkbox must be checked.'),
};

export function isValidPhone(v) {
  const digits = String(v ?? '').replace(/\D/g, '');
  return /^(639\d{9}|09\d{9})$/.test(digits);
}

export function formatPhoneInput(value) {
  let d = String(value ?? '').replace(/\D/g, '');
  if (d.startsWith('639')) d = '0' + d.slice(3);
  if (!d.startsWith('0') && d.length === 10) d = '0' + d;
  const m = d.slice(0, 11).match(/^(\d{0,4})(\d{0,3})(\d{0,4})$/);
  if (!m) return d;
  let out = '';
  if (m[1]) out += m[1];
  if (m[2]) out += (out ? ' ' : '') + m[2];
  if (m[3]) out += ' ' + m[3];
  return out;
}

export function phoneDisplay(digits) {
  let d = String(digits ?? '').replace(/\D/g, '');
  if (d.startsWith('639')) d = '0' + d.slice(3);
  const m = d.match(/^(09\d{2})(\d{3})(\d{4})$/);
  return m ? `+63 ${m[1].slice(1)} ${m[2]} ${m[3]}` : String(digits);
}

export function passwordStrength(v) {
  const s = String(v ?? '');
  let score = 0;
  if (s.length >= 8) score++;
  if (s.length >= 12) score++;
  if (/[A-Z]/.test(s) && /[a-z]/.test(s)) score++;
  if (/\d/.test(s)) score++;
  if (/[^A-Za-z0-9]/.test(s)) score++;
  const labels = ['Very weak', 'Weak', 'Fair', 'Good', 'Strong', 'Excellent'];
  const colors = ['var(--c-danger)', 'var(--c-danger)', 'var(--c-warn)', 'var(--c-warn)', 'var(--c-success)', 'var(--c-success)'];
  return { score, label: labels[score], color: colors[score] };
}

/* rules: { fieldName: [['required'], ['email']], ... }
   Supports nested arg syntax ['minlen', 8], ['match', 'password'] */
export function validate(rootEl, rules) {
  const values = {};
  const errors = {};
  for (const [name, fieldRules] of Object.entries(rules)) {
    const input = rootEl.querySelector(`[name="${name}"]`);
    if (!input) continue;
    let v = input.type === 'checkbox' ? input.checked : input.value;
    values[name] = v;
    for (const rule of fieldRules) {
      const [ruleName, arg] = Array.isArray(rule) ? rule : [rule];
      const fn = RULES[ruleName];
      if (!fn) continue;
      const err = fn(v, arg, values);
      if (err) { errors[name] = err; break; }
    }
  }
  // paint errors
  for (const [name, err] of Object.entries(errors)) paintError(rootEl, name, err);
  for (const name of Object.keys(rules)) if (!errors[name]) clearError(rootEl, name);
  return { ok: Object.keys(errors).length === 0, errors, values };
}

export function paintError(rootEl, name, message) {
  const input = rootEl.querySelector(`[name="${name}"]`);
  const field = input ? input.closest('.field') : null;
  if (!field) return;
  input.classList.add('input--error');
  const existing = field.querySelector('.input-error-text');
  if (existing) existing.textContent = message;
  else {
    const err = document.createElement('div');
    err.className = 'input-error-text';
    err.textContent = message;
    field.appendChild(err);
  }
}

export function clearError(rootEl, name) {
  const input = rootEl.querySelector(`[name="${name}"]`);
  if (!input) return;
  input.classList.remove('input--error');
  const field = input.closest('.field');
  const existing = field && field.querySelector('.input-error-text');
  if (existing) existing.remove();
}

/* Attaches blur validation for immediate feedback */
export function attachLiveValidation(rootEl, rules) {
  for (const [name, fieldRules] of Object.entries(rules)) {
    const input = rootEl.querySelector(`[name="${name}"]`);
    if (!input) continue;
    input.addEventListener('blur', () => {
      if (!input.value) return;
      let err = null;
      for (const rule of fieldRules) {
        const [ruleName, arg] = Array.isArray(rule) ? rule : [rule];
        const fn = RULES[ruleName];
        if (!fn) continue;
        err = fn(input.type === 'checkbox' ? input.checked : input.value, arg, {});
        if (err) break;
      }
      if (err) paintError(rootEl, name, err); else clearError(rootEl, name);
    });
  }
}
