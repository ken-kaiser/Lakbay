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
