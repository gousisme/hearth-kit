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

/** Fade/slide `.rv` elements in once they scroll into view. Returns a disconnect fn. */
export function reveal(root) {
  const els = [...root.querySelectorAll('.rv:not(.in)')];
  if (!('IntersectionObserver' in window)) { els.forEach(e => e.classList.add('in')); return () => {}; }
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: .08 });
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

