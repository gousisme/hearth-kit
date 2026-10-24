import { reduced } from './motion.js';

/**
 * The Get button's looping arrow (Web Animations API). The glyph (see dlGlyph) has two arrow copies: A leaves downwards into the line, B enters from the top.
 *   dlStart(disc) — the pointer / keyboard focus is on the button: loop (a cycle = slide, then a short hold)
 *   dlStop(disc)  — it left: let the CURRENT cycle finish, then rest. A finished cycle looks exactly like the resting glyph, so nothing ever snaps or freezes half-way.
 * Starting again while a cycle is still finishing just keeps going (no restart); a disc that is removed from the page cancels its animations by itself.
 * State lives in a WeakMap, not in CSS classes, so a re-render, a hover that comes and goes, or an event arriving late cannot leave it in a wrong state.
 */
const DIST = 17, MS = 1000, EASE = 'cubic-bezier(.5, 0, .2, 1)', SLIDE = 0.78;
const KF_A = [{ transform: 'translateY(0px)', offset: 0, easing: EASE }, { transform: `translateY(${DIST}px)`, offset: SLIDE }, { transform: `translateY(${DIST}px)`, offset: 1 }];
const KF_B = [{ transform: `translateY(${-DIST}px)`, offset: 0, easing: EASE }, { transform: 'translateY(0px)', offset: SLIDE }, { transform: 'translateY(0px)', offset: 1 }];
const live = new WeakMap();                                   // .d → { a, b }

const iterate = (s, n) => { s.a.effect.updateTiming({ iterations: n }); s.b.effect.updateTiming({ iterations: n }); };

export function dlStart(d) {
  if (!d || !d.animate || reduced()) return;
  const cur = live.get(d);
  if (cur && cur.a.playState === 'running') { iterate(cur, Infinity); return; }       // still finishing its last cycle: just keep looping
  const A = d.querySelector('.ar.a'), B = d.querySelector('.ar.b'); if (!A || !B) return;
  const o = { duration: MS, iterations: Infinity }, s = { a: A.animate(KF_A, o), b: B.animate(KF_B, o) };
  live.set(d, s);
  const gone = () => { if (live.get(d) === s) live.delete(d); };
  s.a.onfinish = s.a.oncancel = gone;
}

export function dlStop(d) {
  const s = d && live.get(d); if (!s || s.a.playState !== 'running') return;
  const t = s.a.effect.getComputedTiming();
  iterate(s, (t.currentIteration || 0) + 1);                  // ends at the end of the cycle that is running now
}
