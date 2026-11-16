/* ==========================================================================
   Lakbay — Carousel (shared, dependency-free)
   A buttery translate3d carousel:
     - eased slide transitions (exp ease-out, ~600ms)
     - pointer drag / touch swipe with flick detection
     - prev/next buttons, position dots, keyboard arrows
     - optional autoplay that pauses on hover, focus, and hidden tabs
     - responsive slides-per-view via data-attr or option
   Usage:
     const car = createCarousel(rootEl, { slidesPerView: 3, autoplayMs: 5200 });
     rootEl contains: .car-viewport > .car-track > slides,
     plus .car-prev / .car-next / .car-dots anywhere inside rootEl.
   ========================================================================== */
import { el, qs } from './dom.js';

const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function createCarousel(root, { slidesPerView = 1, autoplayMs = 0, label = 'Carousel' } = {}) {
  const viewport = qs('.car-viewport', root);
  const track = qs('.car-track', root);
  const prevBtn = qs('.car-prev', root);
  const nextBtn = qs('.car-next', root);
  const dotsWrap = qs('.car-dots', root);
  if (!viewport || !track) return { destroy() {} };

  const slides = [...track.children];
  const state = {
    index: 0, spv: slidesPerView, max: 0,
    drag: null, timer: 0, resumeTimer: 0,
  };

  const live = el('span', { class: 'sr-only', 'aria-live': 'polite' });
  root.appendChild(live);

  function measure() {
    const attr = parseInt(root.getAttribute('data-spv') || '', 10);
    if (!Number.isNaN(attr) && attr > 0) {
      if (window.innerWidth >= 1020) state.spv = attr;
      else if (window.innerWidth >= 680) state.spv = Math.min(2, attr);
      else state.spv = 1;
    }
    state.spv = Math.max(1, Math.min(state.spv, slides.length));
    state.max = Math.max(0, slides.length - state.spv);
    state.index = Math.min(state.index, state.max);
    paintDots();
    go(state.index, true);
  }

  function offsetFor(i) {
    const s = slides[i];
    return s ? -s.offsetLeft : 0;
  }

  function apply(x, withTransition = true) {
    track.style.transition = withTransition && !reduced()
      ? `transform 640ms ${EASE}`
      : 'none';
    track.style.transform = `translate3d(${x}px, 0, 0)`;
  }

  function go(i, instant = false) {
    state.index = Math.max(0, Math.min(i, state.max));
    apply(offsetFor(state.index), !instant);
    const pages = state.max + 1;
    if (prevBtn) prevBtn.disabled = state.index <= 0;
    if (nextBtn) nextBtn.disabled = state.index >= state.max;
    if (dotsWrap) {
      [...dotsWrap.children].forEach((d, j) => {
        d.classList.toggle('active', j === state.index);
        d.setAttribute('aria-current', j === state.index ? 'true' : 'false');
      });
    }
    live.textContent = `Slide ${state.index + 1} of ${pages}`;
  }

  function paintDots() {
    if (!dotsWrap) return;
    const pages = state.max + 1;
    dotsWrap.innerHTML = '';
    for (let j = 0; j < pages; j++) {
      const d = el('button', {
        class: 'car-dot', type: 'button',
        'aria-label': `Go to slide ${j + 1} of ${pages}`,
      });
      d.addEventListener('click', () => { go(j); pauseAutoplay(); });
      dotsWrap.appendChild(d);
    }
  }

  /* ---------- drag / swipe ---------- */
  function onPointerDown(e) {
    if (e.button !== undefined && e.button !== 0) return;
    state.drag = { startX: e.clientX, base: offsetFor(state.index), dx: 0, id: e.pointerId, moved: false, t: performance.now() };
    track.classList.add('dragging');
    try { viewport.setPointerCapture(e.pointerId); } catch (err) { /* pointer already inactive */ }
    stopAutoplay();
  }
  function onPointerMove(e) {
    if (!state.drag) return;
    state.drag.dx = e.clientX - state.drag.startX;
    if (Math.abs(state.drag.dx) > 6) state.drag.moved = true;
    // rubber-band at the edges
    let x = state.drag.base + state.drag.dx;
    if ((state.index === 0 && state.drag.dx > 0) || (state.index === state.max && state.drag.dx < 0)) {
      x = state.drag.base + state.drag.dx * 0.35;
    }
    apply(x, false);
  }
  function onPointerUp() {
    if (!state.drag) return;
    const { dx, moved } = state.drag;
    const w = viewport.offsetWidth / state.spv;
    track.classList.remove('dragging');
    state.drag = null;
    if (moved && (Math.abs(dx) > w * 0.16 || Math.abs(dx) > 90)) {
      go(state.index + (dx < 0 ? 1 : -1));
    } else {
      go(state.index);
    }
    pauseAutoplay();
  }
  viewport.addEventListener('pointerdown', onPointerDown);
  viewport.addEventListener('pointermove', onPointerMove);
  viewport.addEventListener('pointerup', onPointerUp);
  viewport.addEventListener('pointercancel', onPointerUp);
  // suppress accidental card clicks after a drag
  viewport.addEventListener('click', (e) => {
    if (viewport._hadDrag) { e.stopPropagation(); e.preventDefault(); viewport._hadDrag = false; }
  }, true);
  viewport.addEventListener('pointerup', () => {
    if (viewport._hadDragTimer) clearTimeout(viewport._hadDragTimer);
    viewport._hadDragTimer = setTimeout(() => { viewport._hadDrag = false; }, 60);
  });
  // mark drags
  viewport.addEventListener('pointerdown', () => { viewport._hadDrag = false; });
  viewport.addEventListener('pointermove', (e) => {
    if (state.drag && Math.abs(e.clientX - state.drag.startX) > 8) viewport._hadDrag = true;
  });

  /* ---------- controls ---------- */
  if (prevBtn) prevBtn.addEventListener('click', () => { go(state.index - 1); pauseAutoplay(); });
  if (nextBtn) nextBtn.addEventListener('click', () => { go(state.index + 1); pauseAutoplay(); });
  viewport.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); go(state.index + 1); pauseAutoplay(); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(state.index - 1); pauseAutoplay(); }
  });

  /* ---------- autoplay ----------
     Auto-swipes right and loops back to the first slide. Manual
     interaction (drag, buttons, dots, keys) pauses it briefly, then it
     resumes on its own — so the rail always keeps moving. */
  function startAutoplay() {
    if (!autoplayMs || reduced() || state.max === 0) return;
    stopAutoplay();
    state.timer = setInterval(() => {
      if (document.hidden) return;
      go(state.index >= state.max ? 0 : state.index + 1);
    }, autoplayMs);
  }
  function stopAutoplay() {
    if (state.timer) { clearInterval(state.timer); state.timer = 0; }
    if (state.resumeTimer) { clearTimeout(state.resumeTimer); state.resumeTimer = 0; }
  }
  function pauseAutoplay() {
    stopAutoplay();
    if (!autoplayMs || reduced() || state.max === 0) return;
    state.resumeTimer = setTimeout(() => startAutoplay(), 6400);
  }
  root.addEventListener('pointerenter', stopAutoplay);
  root.addEventListener('pointerleave', () => startAutoplay());
  root.addEventListener('focusin', stopAutoplay);
  root.addEventListener('focusout', () => startAutoplay());

  /* ---------- resize ---------- */
  const ro = new ResizeObserver(() => measure());
  ro.observe(viewport);

  viewport.setAttribute('role', 'group');
  viewport.setAttribute('aria-roledescription', 'carousel');
  viewport.setAttribute('aria-label', label);
  viewport.tabIndex = 0;
  measure();
  startAutoplay();

  return {
    next: () => go(state.index + 1),
    prev: () => go(state.index - 1),
    go,
    destroy() { stopAutoplay(); ro.disconnect(); },
  };
}
