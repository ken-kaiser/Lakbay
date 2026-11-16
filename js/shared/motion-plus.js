/* ==========================================================================
   Lakbay — Motion-plus (landing enhancements)
   - initSmoothScroll(): lerped wheel scrolling for a "buttery" feel
   - initParallax(scope): [data-parallax] elements drift as you scroll
   - initPointerTilt(scope): [data-tilt] elements lean toward the cursor
   Everything respects prefers-reduced-motion, stays native on touch,
   and returns a destroy() so SPA re-renders never leak listeners.
   ========================================================================== */

const reduced = () => typeof window.matchMedia === 'function'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const finePointer = () => typeof window.matchMedia === 'function'
  && window.matchMedia('(hover: hover) and (pointer: fine)').matches;

/* ---------- buttery wheel scroll ----------
   Wheel input feeds a target offset; a rAF loop eases the real scroll
   toward it, so every wheel tick glides instead of snapping. Touch,
   keyboard, and scrollbar drags remain fully native. */
export function initSmoothScroll({ lerp = 0.092 } = {}) {
  if (reduced()) {
    return { scrollTo(y) { window.scrollTo(0, y); }, destroy() {} };
  }

  let target = window.scrollY;
  let current = target;
  let raf = 0;
  let animating = false;

  const maxScroll = () => Math.max(0, document.documentElement.scrollHeight - window.innerHeight);

  function loop() {
    current += (target - current) * lerp;
    if (Math.abs(target - current) < 0.6) {
      current = target;
      window.scrollTo(0, current);
      animating = false;
      raf = 0;
      return;
    }
    window.scrollTo(0, current);
    raf = requestAnimationFrame(loop);
  }

  function kick() {
    if (!raf) raf = requestAnimationFrame(loop);
  }

  function onWheel(e) {
    if (e.ctrlKey || e.metaKey) return;           // pinch-zoom, not scrolling
    const d = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    if (!d) return;
    e.preventDefault();
    if (!animating) { current = window.scrollY; target = current; }
    target = Math.max(0, Math.min(maxScroll(), target + d));
    animating = true;
    kick();
  }

  /* Keep in sync when the user scrolls by other means (scrollbar, keys). */
  function onScroll() {
    if (!animating) target = current = window.scrollY;
  }

  window.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('scroll', onScroll, { passive: true });

  /* Duration-eased jump for anchor links (nav section buttons). */
  function scrollTo(y, { duration = 700 } = {}) {
    const from = window.scrollY;
    const to = Math.max(0, Math.min(maxScroll(), y));
    if (duration <= 0) { window.scrollTo(0, to); target = current = to; return; }
    const t0 = performance.now();
    const ease = (t) => 1 - Math.pow(1 - t, 3);
    animating = true;
    (function step(now) {
      const p = Math.min(1, (now - t0) / duration);
      const yNow = from + (to - from) * ease(p);
      window.scrollTo(0, yNow);
      target = current = yNow;
      if (p < 1) requestAnimationFrame(step);
      else animating = false;
    })(t0);
  }

  return {
    scrollTo,
    destroy() {
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
    },
  };
}

/* ---------- parallax ----------
   [data-parallax="0.14"] drifts as the page scrolls. Speed is a fraction:
   the element eases toward an offset proportional to its distance from the
   viewport centre (measured on the parent, so transforms never feed back).
   Values are lerped every frame for a fluid, weighted feel. */
export function initParallax(scope = document) {
  const nodes = [...scope.querySelectorAll('[data-parallax]')].map((n) => ({
    el: n,
    speed: parseFloat(n.getAttribute('data-parallax')) || 0,
    cur: 0,
  }));
  if (!nodes.length || reduced()) return { destroy() {} };

  let raf = requestAnimationFrame(frame);
  function frame() {
    const vh = window.innerHeight;
    for (const nd of nodes) {
      const host = nd.el.parentElement || nd.el;
      const r = host.getBoundingClientRect();
      const delta = (r.top + r.height / 2) - vh / 2;
      const want = -delta * nd.speed;
      nd.cur += (want - nd.cur) * 0.14;
      if (Math.abs(want - nd.cur) < 0.05) nd.cur = want;
      nd.el.style.transform = `translate3d(0, ${nd.cur.toFixed(2)}px, 0)`;
    }
    raf = requestAnimationFrame(frame);
  }

  return {
    destroy() {
      if (raf) cancelAnimationFrame(raf);
      nodes.forEach((nd) => { nd.el.style.transform = ''; });
    },
  };
}

/* ---------- pointer tilt ----------
   [data-tilt] elements lean subtly toward the cursor (fine pointers only).
   The element must not carry competing CSS transforms/animations — put the
   attribute on a dedicated layer (e.g. the inner card face). */
export function initPointerTilt(scope = document, { max = 3.2 } = {}) {
  if (reduced() || !finePointer()) return { destroy() {} };
  const nodes = [...scope.querySelectorAll('[data-tilt]')];
  if (!nodes.length) return { destroy() {} };

  const cur = nodes.map(() => ({ x: 0, y: 0 }));
  const tgt = nodes.map(() => ({ x: 0, y: 0 }));
  let raf = 0;

  function frame() {
    let alive = false;
    nodes.forEach((n, i) => {
      const c = cur[i], t = tgt[i];
      c.x += (t.x - c.x) * 0.09;
      c.y += (t.y - c.y) * 0.09;
      if (Math.abs(t.x - c.x) > 0.01 || Math.abs(t.y - c.y) > 0.01) alive = true;
      n.style.transform = `perspective(1100px) rotateX(${c.y.toFixed(2)}deg) rotateY(${c.x.toFixed(2)}deg)`;
    });
    raf = alive ? requestAnimationFrame(frame) : 0;
  }
  function kick() { if (!raf) raf = requestAnimationFrame(frame); }

  function onMove(e) {
    nodes.forEach((n, i) => {
      const r = n.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      tgt[i].x = px * max * 2;
      tgt[i].y = -py * max * 2;
    });
    kick();
  }
  function onLeave() {
    nodes.forEach((_, i) => { tgt[i].x = 0; tgt[i].y = 0; });
    kick();
  }

  const host = nodes[0].closest('.lb-hero') || document;
  host.addEventListener('pointermove', onMove, { passive: true });
  host.addEventListener('pointerleave', onLeave, { passive: true });
  return {
    destroy() {
      host.removeEventListener('pointermove', onMove);
      host.removeEventListener('pointerleave', onLeave);
      if (raf) cancelAnimationFrame(raf);
      nodes.forEach((n) => { n.style.transform = ''; });
    },
  };
}
