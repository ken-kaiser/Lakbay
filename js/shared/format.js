/* ==========================================================================
   Lakbay — Formatting helpers (currency, dates, distance, avatars, refs)
   ========================================================================== */

const pesoFmt = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pesoFmtWhole = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 });

export function peso(n, { whole = false } = {}) {
  const num = Number(n) || 0;
  return whole ? pesoFmtWhole.format(num) : pesoFmt.format(num);
}

export function dateShort(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function dateTime(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) + ' · ' +
    new Date(ts).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', hour12: true });
}

export function timeOnly(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', hour12: true });
}

export function timeAgo(ts) {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return dateShort(ts);
}

export function km(n) { return `${(Number(n) || 0).toFixed(1)} km`; }
export function mins(n) {
  const m = Math.round(Number(n) || 0);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}
export function secs(n) {
  const s = Math.round(Number(n) || 0);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

export function initials(name = '') {
  return String(name).trim().split(/\s+/).slice(0, 2).map((w) => w[0] || '').join('').toUpperCase() || '?';
}

const AVATAR_HUES = [152, 40, 8, 210, 300, 96, 264, 20, 330, 60];
export function hueFor(name = '') {
  let hsh = 0;
  for (let i = 0; i < name.length; i++) hsh = (hsh * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_HUES[hsh % AVATAR_HUES.length];
}

/* Inline SVG avatar (initials) — never breaks, consistent with brand */
export function avatarURI(name, hue = null, size = 96) {
  const hh = hue == null ? hueFor(name) : hue;
  const letters = initials(name);
  const bg = `hsl(${hh}, 42%, 38%)`;
  const bg2 = `hsl(${hh}, 48%, 28%)`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${bg}"/><stop offset="1" stop-color="${bg2}"/></linearGradient></defs><rect width="96" height="96" fill="url(#g)"/><text x="48" y="59" font-family="Segoe UI,system-ui,sans-serif" font-size="34" font-weight="700" fill="#ffffff" text-anchor="middle">${letters}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/* Style object for an avatar div: prefers a photo, falls back to initials */
export function avatarStyle(person, sizeClass = '') {
  if (person && person.avatar) {
    return { backgroundImage: `url('${person.avatar}')` };
  }
  const name = (person && person.name) || '?';
  return { backgroundImage: `url("${avatarURI(name)}")` };
}

export function refCode(prefix = 'LB') {
  const d = new Date();
  const ymd = d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${ymd}-${rand}`;
}

export function statusLabel(status) {
  const map = {
    scheduled: 'Scheduled', searching: 'Finding a rider', accepted: 'Rider accepted',
    arriving: 'Rider on the way', arrived: 'Rider arrived', in_progress: 'Trip in progress',
    completed: 'Completed', cancelled: 'Cancelled', expired: 'No rider found',
  };
  return map[status] || status;
}

export function statusIcon(status) {
  const map = {
    scheduled: 'calendar-clock', searching: 'radar', accepted: 'check-circle-2',
    arriving: 'navigation', arrived: 'map-pin-check', in_progress: 'route',
    completed: 'circle-check', cancelled: 'circle-x', expired: 'clock-alert',
  };
  return map[status] || 'circle';
}

/* Status presented as quiet typography — a small colored dot + label.
   No pill backgrounds; color carries meaning, text carries detail. */
export function statusEl(status) {
  const span = document.createElement('span');
  span.className = `status-pill st-${status}`;
  span.innerHTML = `<span class="status-dot" aria-hidden="true"></span><span class="status-text"></span>`;
  span.querySelector('.status-text').textContent = statusLabel(status);
  return span;
}

/* Update an existing status element in place (keeps layout stable) */
export function refreshStatusEl(container, status) {
  if (!container) return;
  const prev = container.dataset.status;
  if (prev === status) return;
  container.dataset.status = status;
  container.className = `status-pill st-${status}`;
  const label = container.querySelector('.status-text');
  if (label) label.textContent = statusLabel(status);
  else container.textContent = statusLabel(status);
}

export function firstNameOf(user) {
  return (user && (user.firstName || (user.name || '').split(' ')[0])) || 'there';
}
