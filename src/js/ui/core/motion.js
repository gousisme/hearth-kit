import { delay } from '../../shared/util.js';

/**
 * MOTION SYSTEM (see docs/03-motion.md)
 * CSS owns the timing tokens (--tf / --tb / --ts, --ease / --ein). This file mirrors the durations
 * for the few places JS has to wait for a transition, and holds the helpers that make "everything
 * animates out as well as in" cheap: reveal-on-scroll, view swapping, element removal.
 */
export const T = { fast: 160, base: 320, slow: 700, swap: 200 };

export const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const ms = n => (reduced() ? 0 : n);

/**
 * Rise-and-fade `.rv` elements in as they scroll into view, as a cascade: everything that becomes visible in the same
 * frame is ordered top→bottom, left→right and started 40 ms apart (capped), so a full screen of cards ripples in
 * instead of popping. `lead` delays the first batch (used while the page itself is still fading in).
 * The motion is a CSS *animation* (`.rv.in`), so it never fights the cards' hover transitions. Returns a disconnect fn.
 */
export function reveal(root, { lead = 0 } = {}) {
  const els = [...root.querySelectorAll('.rv:not(.in)')];
  if (!('IntersectionObserver' in window)) { els.forEach(e => e.classList.add('in')); return () => {}; }
  let first = true;
  const io = new IntersectionObserver(es => {
    const hit = es.filter(e => e.isIntersecting).map(e => ({ el: e.target, r: e.boundingClientRect })).sort((a, b) => a.r.top - b.r.top || a.r.left - b.r.left);
    if (!hit.length) return;
    const base = first ? lead : 0; first = false;
    hit.forEach(({ el }, n) => { el.style.setProperty('--d', (base + Math.min(n, 12) * 40) + 'ms'); el.classList.add('in'); io.unobserve(el); });
  }, { threshold: .05 });
  els.forEach(e => io.observe(e));
  return () => io.disconnect();
}

/** Animated "out → replace → in" for a container. `render` swaps the content while it is invisible. */
export async function swap(el, render) {
  el.classList.add('is-out');
  await delay(ms(T.swap));
  render();
  void el.offsetWidth; // commit the "out" state so removing the class transitions
  el.classList.remove('is-out');
}

/** Animate an element out, then remove it. */
export async function leave(el) {
  el.classList.add('is-leaving');
  await delay(ms(T.base));
  el.remove();
}

