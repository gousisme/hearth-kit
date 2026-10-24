import { reduced } from './motion.js';

/**
 * The Get button's looping arrow (Web Animations API). The glyph (see dlGlyph) is ONE group holding two arrows, 17 units apart; moving the group down by 17 makes the
 * arrow leave into the line while the next one arrives from above — and at 17 the picture is identical to the resting one (offset 0). One animation, so the two arrows
 * can never drift apart.
 *   dlStart(disc) — pointer / keyboard focus is on the button: loop (slide, short hold, repeat)
 *   dlStop(disc)  — it left: after a short grace (hover flicker under a moving card), the arrow is eased to the nearest resting position (finish the slide, or go
 *                   back if it only just started) and the loop ends there — it neither keeps running unseen nor jumps. Re-entering during that settle waits for it, then loops.
 * State lives in a WeakMap (no CSS classes), a disc that leaves the page cancels its animations by itself.
 */
const DIST = 17, MS = 900, SLIDE = 0.7, EASE = 'cubic-bezier(.5, 0, .2, 1)', GRACE = 90;
const KF = [{ transform: 'translateY(0px)', offset: 0, easing: EASE }, { transform: `translateY(${DIST}px)`, offset: SLIDE }, { transform: `translateY(${DIST}px)`, offset: 1 }];
const st = new WeakMap();                                     // .d → { g, loop, settle, timer, hovering }

const offsetOf = g => { try { const m = String(getComputedStyle(g).transform).match(/matrix\(([^)]+)\)/); return m ? Math.min(DIST, Math.max(0, +m[1].split(',')[5] || 0)) : 0; } catch (e) { return 0; } };

export function dlStart(d) {
  if (!d || reduced()) return;
  let s = st.get(d);
  if (!s) { const g = d.querySelector('.ar-g'); if (!g || !g.animate) return; st.set(d, s = { g, loop: null, settle: null, timer: 0, hovering: false }); }
  clearTimeout(s.timer); s.hovering = true;
  if (s.loop || s.settle) return;                             // already looping, or settling (it restarts the loop when it ends, see settle())
  s.loop = s.g.animate(KF, { duration: MS, iterations: Infinity });
}

export function dlStop(d) {
  const s = d && st.get(d); if (!s) return;
  s.hovering = false; clearTimeout(s.timer);
  s.timer = setTimeout(() => settle(d, s), GRACE);
}

function settle(d, s) {
  if (s.hovering || !s.loop) return;
  const from = offsetOf(s.g), to = from > DIST / 2 ? DIST : 0, dist = Math.abs(to - from);
  s.loop.cancel(); s.loop = null;                             // (the element is at rest for the instant before the settle below takes over: same task, no frame between)
  if (dist < 0.5) return;
  const a = s.settle = s.g.animate([{ transform: `translateY(${from}px)` }, { transform: `translateY(${to}px)` }], { duration: 70 + dist * 9, easing: 'cubic-bezier(.25, 0, .2, 1)' });
  const done = () => { if (s.settle !== a) return; s.settle = null; a.cancel(); if (s.hovering) dlStart(d); };
  a.onfinish = a.oncancel = done;
}
