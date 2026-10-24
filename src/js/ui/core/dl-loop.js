import { reduced } from './motion.js';

/**
 * The Get button's arrow: ONE hand-style slide per hover (Web Animations API), modelled on the designer's "hover-slide":
 *   1. the arrow drops down into the line and out of sight (accelerating),
 *   2. a new arrow is drawn in from the top, head first — the head travels down, the shaft stretches behind it (decelerating).
 * It is ONE arrow (a shaft + a head), animated through both phases, and every animated value ends exactly on its resting value (shaft fully drawn, head and group at
 * offset 0, opacity 1). So when the animation ends nothing is swapped or re-placed: it cannot end "half-way" or jump, whatever the pointer does.
 * The curves are sampled into plain keyframes (no CSS easing at the end of the slide), so how soft the landing is can be tuned in one place (ENTER_POW).
 *   dlPlay(disc) — the pointer / keyboard focus reached the button: play once (ignored while playing; plays again on the next hover)
 */
const DIST = 17, SHAFT = 11, MS = 700, EXIT = 0.3, EPS = 0.002, N_EXIT = 8, N_ENTER = 24, EXIT_POW = 2.2, ENTER_POW = 2;
const px = v => `${Math.round(v * 100) / 100}px`;

/** keyframes for the three parts: g = the whole arrow, h = its head, s = its shaft (drawn with stroke-dasharray = "11 22", so dashoffset 11 = nothing, 0 = all) */
export function buildKeyframes() {
  const g = [], h = [], s = [];
  for (let i = 0; i <= N_EXIT; i++) {                          // 1 · drop out
    const u = i / N_EXIT, t = EXIT * u;
    g.push({ offset: t, transform: `translateY(${px(DIST * Math.pow(u, EXIT_POW))})` });
    h.push({ offset: t, transform: 'translateY(0px)' });
    s.push({ offset: t, strokeDashoffset: '0px', opacity: 1 });
  }
  for (let i = 0; i <= N_ENTER; i++) {                         // 2 · drawn in from the top (starts out of sight, while the old arrow is already gone)
    const u = i / N_ENTER, t = EXIT + EPS + (1 - EXIT - EPS) * u, e = 1 - Math.pow(1 - u, ENTER_POW);
    const off = -DIST * (1 - e), drawn = Math.min(1, Math.max(0, (SHAFT + off) / SHAFT));     // the shaft reaches from the top (y 4) to the head's tip (y 15 + off)
    g.push({ offset: t, transform: 'translateY(0px)' });
    h.push({ offset: t, transform: `translateY(${px(off)})` });
    s.push({ offset: t, strokeDashoffset: px(SHAFT * (1 - drawn)), opacity: drawn > 0 ? 1 : 0 });
  }
  return { g, h, s };
}

let KF = null;
const busy = new WeakSet();                                   // discs that are playing right now

export function dlPlay(d) {
  if (!d || reduced() || busy.has(d)) return;
  const g = d.querySelector('.ar-g'), h = d.querySelector('.ar-h'), s = d.querySelector('.ar-s');
  if (!g || !h || !s || !g.animate) return;
  KF = KF || buildKeyframes();
  busy.add(d);
  const o = { duration: MS, easing: 'linear' };                // fill: none → back to the resting values at the end, which are exactly the last keyframe
  const done = () => busy.delete(d);
  const a = g.animate(KF.g, o); h.animate(KF.h, o); s.animate(KF.s, o);
  a.onfinish = a.oncancel = done;
}
