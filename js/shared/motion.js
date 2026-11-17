/* ==========================================================================
   Lakbay — Motion helpers
   Small, centralized utilities for the motion system:
   - initReveals(scope): IntersectionObserver-driven scroll reveals
   - prefersReducedMotion(): live user preference check
   - tickValue(el): brief emphasis animation for changing numbers
   All helpers degrade gracefully (no motion for reduced-motion users).
   ========================================================================== */

let io = null;

export function prefersReducedMotion() {
  return typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/* Scroll reveals: mark [data-reveal] elements inside `scope`.
   Elements become visible immediately when IO is unavailable or motion is reduced. */
export function initReveals(scope = document) {
  const nodes = scope.querySelectorAll('[data-reveal]');
  if (!nodes.length) return;
  if (prefersReducedMotion() || typeof IntersectionObserver === 'undefined') {
    document.documentElement.classList.add('no-io');
    nodes.forEach((n) => n.classList.add('revealed'));
    return;
  }
  if (!io) {
    io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('revealed');
        io.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
  }
  nodes.forEach((n) => {
    if (n.classList.contains('revealed')) return;
    io.observe(n);
  });
}

/* Number/value change emphasis — add once, remove on animationend */
export function tickValue(node) {
  if (!node || prefersReducedMotion()) return;
  node.classList.remove('tick');
  // force reflow so re-adding restarts the animation
  void node.offsetWidth;
  node.classList.add('tick');
  node.addEventListener('animationend', () => node.classList.remove('tick'), { once: true });
}

/* View-transition wrapper: subtle cross-fade when supported, direct call otherwise.
   The routed container (.app-view) carries `view-transition-name: view-root` in CSS,
   so only the content area animates — shared chrome (sidebar, header) stays put.
   Overlapping transitions (rapid navigation) skip the older one and reject with a
   benign AbortError — swallowed here so it never surfaces as a page error. */
export function withViewTransition(updateFn) {
  if (prefersReducedMotion() || typeof document.startViewTransition !== 'function') {
    updateFn();
    return;
  }
  try {
    const vt = document.startViewTransition(updateFn);
    if (vt) {
      // A newer transition skips the older one; the skipped transition's
      // `ready` promise rejects with a benign AbortError. Swallow both.
      if (vt.ready && typeof vt.ready.catch === 'function') vt.ready.catch(() => {});
      if (vt.finished && typeof vt.finished.catch === 'function') vt.finished.catch(() => {});
    }
  } catch (e) {
    updateFn();
  }
}

/* Rolling digits — each digit of a value spins to its new number like an
   odometer (₱1,260 → ₱1,345 turns only the digits that change). The first
   call rolls up from 0. Screen readers get the plain value; the reel is
   aria-hidden. Reduced motion: the text just updates. */
function digitReel() {
  const col = document.createElement('span');
  col.className = 'roll-col';
  for (let d = 0; d < 10; d++) { const s = document.createElement('span'); s.textContent = String(d); col.appendChild(s); }
  const cell = document.createElement('span');
  cell.className = 'roll-digit';
  cell.appendChild(col);
  return cell;
}
export function rollText(node, value) {
  const text = String(value);
  if (!node || node.dataset.roll === text) return;
  const prev = node.dataset.roll;
  node.dataset.roll = text;
  if (prefersReducedMotion()) { node.textContent = text; return; }
  const chars = [...text];
  const shape = (t) => [...t].map((c) => (/\d/.test(c) ? '0' : c)).join('');
  let reel = node.querySelector(':scope > .roll');
  if (!reel || prev == null || shape(prev) !== shape(text)) {
    // new layout (first paint, or the value gained/lost a digit): rebuild at 0
    node.textContent = '';
    const sr = document.createElement('span');
    sr.className = 'sr-only';
    reel = document.createElement('span');
    reel.className = 'roll';
    reel.setAttribute('aria-hidden', 'true');
    chars.forEach((c) => {
      if (/\d/.test(c)) reel.appendChild(digitReel());
      else { const s = document.createElement('span'); s.className = 'roll-ch'; s.textContent = c; reel.appendChild(s); }
    });
    node.append(sr, reel);
    void reel.offsetWidth; // commit the 0 position so the spin below animates
  }
  node.querySelector(':scope > .sr-only').textContent = text;
  const digits = [...reel.children].filter((c) => c.classList.contains('roll-digit'));
  let k = 0;
  chars.forEach((c, i) => {
    if (!/\d/.test(c)) return;
    const col = reel.children[i].firstChild;
    col.style.transitionDelay = `${(digits.length - 1 - k) * 45}ms`; // ones spin first, then tens…
    col.style.transform = `translateY(-${Number(c) * 10}%)`;
    k += 1;
  });
}
