import { reduced } from './motion.js';

/**
 * The Get button's arrow: ONE slide per hover (Web Animations API), no loop.
 * The glyph (see dlGlyph) is one group holding two arrows 17 units apart; sliding the group down by 17 makes the arrow leave into the line while the next one arrives from
 * above, and at 17 the picture is identical to the resting one (offset 0) — so the animation always ends exactly where it began and cannot be left half-way, whatever the pointer does.
 *   dlPlay(disc) — the pointer / keyboard focus reached the button: play once (ignored while it is still playing; plays again on the next hover)
 */
const DIST = 17, MS = 560, EASE = 'cubic-bezier(.45, 0, .2, 1)';
const KF = [{ transform: 'translateY(0px)' }, { transform: `translateY(${DIST}px)` }];
const busy = new WeakSet();                                   // discs that are playing right now

export function dlPlay(d) {
  if (!d || reduced() || busy.has(d)) return;
  const g = d.querySelector('.ar-g'); if (!g || !g.animate) return;
  busy.add(d);
  const a = g.animate(KF, { duration: MS, easing: EASE });    // fill: none → back to the resting transform when it ends (which looks the same)
  a.onfinish = a.oncancel = () => busy.delete(d);
}
