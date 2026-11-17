/* ==========================================================================
   Lakbay — Confetti burst (for a good rating)
   One short burst of brand-coloured pieces from a point on screen, drawn on a
   temporary full-screen canvas that removes itself (~1.6s). It sits on
   <body>, so it survives the route change that follows a rating, never takes
   clicks, and is skipped entirely when the user prefers reduced motion.
   ========================================================================== */
import { prefersReducedMotion } from './motion.js';

const COLORS = ['#B6F500', '#B6F500', '#C6FA3C', '#F4F6EF', '#8FBF00', '#2C3A32'];
const LIFE_MS = 1600;

/** x, y: burst origin in viewport pixels (defaults to the screen centre) */
export function confetti({ x = window.innerWidth / 2, y = window.innerHeight * 0.45, count = 80 } = {}) {
  if (prefersReducedMotion()) return;
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:200;pointer-events:none';
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = window.innerWidth; const h = window.innerHeight;
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.scale(dpr, dpr);
  document.body.appendChild(canvas);

  // pieces fan upward from the origin, then gravity and air drag take over
  const pieces = Array.from({ length: count }, () => {
    const angle = (-90 + (Math.random() - 0.5) * 130) * (Math.PI / 180);
    const speed = 380 + Math.random() * 520; // px/s
    return {
      x, y,
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 14,
      w: 5 + Math.random() * 5, h: Math.random() < 0.3 ? 2.5 : 4 + Math.random() * 6,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      wobble: Math.random() * Math.PI * 2,
    };
  });

  const start = performance.now();
  let last = start;
  function frame(now) {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    const t = (now - start) / LIFE_MS;
    if (t >= 1 || !canvas.isConnected) { canvas.remove(); return; }
    ctx.clearRect(0, 0, w, h);
    ctx.globalAlpha = t < 0.65 ? 1 : 1 - (t - 0.65) / 0.35; // fade out over the last third
    for (const p of pieces) {
      p.vy += 1100 * dt;                 // gravity
      p.vx *= 1 - 1.6 * dt; p.vy *= 1 - 0.9 * dt; // air drag
      p.wobble += 9 * dt;
      p.x += (p.vx + Math.sin(p.wobble) * 30) * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.scale(1, Math.cos(p.wobble)); // flutter: the piece turns edge-on and back
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

/** Burst from the centre of an element (e.g. the star row just tapped) */
export function confettiFrom(node, opts = {}) {
  const r = node && node.getBoundingClientRect ? node.getBoundingClientRect() : null;
  if (!r || (!r.width && !r.height)) { confetti(opts); return; }
  confetti({ ...opts, x: r.left + r.width / 2, y: r.top + r.height / 2 });
}
