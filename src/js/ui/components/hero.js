import { esc } from '../../shared/util.js';
import { artImg, keyArt } from '../core/art.js';
import { reduced } from '../core/motion.js';
import { button, glassButton } from './button.js';

/** Hero carousel markup. `slides` = [{ game, eyebrow }]. */
export function heroHtml(slides) {
  if (!slides.length) return '';
  const slide = ({ game: g, eyebrow }, i) => {
    const meta = [g.genres[0], g.releaseYear, g.size, g.rating].filter(Boolean).map(v => `<span>${esc(v)}</span>`).join('<i></i>');
    return `<article class="slide${i ? '' : ' on'}" aria-roledescription="slide" ${i ? 'aria-hidden="true"' : ''}>
      <div class="art"><div class="layer">${keyArt(g, 1600, 800, 'h')}${artImg(g, 'hero')}</div></div>
      <div class="info">
        <div class="chip-new"><i></i>${esc(eyebrow)}${g.tagline ? ' · ' + esc(g.tagline) : ''}</div>
        <div class="lg">${artImg(g, 'logo', 'logo') || `<div class="fbt">${esc(g.title)}</div>`}</div>
        <div class="tags">${meta}</div>
        <div class="acts">${button('Get game', { attrs: `data-get="${esc(g.id)}"` })}${glassButton('Details', `data-open="${esc(g.id)}"`)}</div>
      </div></article>`;
  };
  const segs = slides.length > 1 ? `<div class="segs" role="tablist" aria-label="Featured games">${slides.map(({ game: g }, i) => `<button class="sg${i ? '' : ' on'}" role="tab" aria-label="${esc(g.title)}" ${i ? '' : 'aria-current="true"'}><i></i></button>`).join('')}</div>` : '';
  return `<section class="hero" id="hero" aria-roledescription="carousel" aria-label="Featured games">${slides.map(slide).join('')}${segs}</section>`;
}

/**
 * Behaviour: crossfade slides, progress lines, autoplay that pauses on hover / focus / hidden tab /
 * scrolled-away, remaining-time-aware resume, swipe on touch. Autoplay is off under reduced motion.
 */
export function initHero(hero, { autoplay = true, ms = 7000 } = {}) {
  if (!hero) return { destroy() {}, go() {} };
  const slides = [...hero.querySelectorAll('.slide')], segs = [...hero.querySelectorAll('.sg')];
  const auto = autoplay && !reduced() && slides.length > 1;
  hero.style.setProperty('--dur', ms + 'ms');
  if (!auto) hero.classList.add('static');
  let i = 0, timer = 0, left = ms, t0 = 0;
  const holds = new Set();

  const run = () => { clearTimeout(timer); if (!auto || holds.size) return; t0 = performance.now(); timer = setTimeout(() => go(i + 1), left); };
  const halt = () => { clearTimeout(timer); if (t0) left = Math.max(400, left - (performance.now() - t0)); t0 = 0; };
  const hold = (k, on) => { const was = holds.size; on ? holds.add(k) : holds.delete(k); if (was === holds.size) return; hero.classList.toggle('paused', holds.size > 0); holds.size ? halt() : run(); };

  function go(n) {
    n = (n + slides.length) % slides.length;
    if (n === i) return;
    slides[i].classList.remove('on'); slides[i].setAttribute('aria-hidden', 'true'); segs[i] && (segs[i].classList.remove('on'), segs[i].removeAttribute('aria-current'));
    i = n;
    slides[i].classList.add('on'); slides[i].removeAttribute('aria-hidden');
    if (segs[i]) { void segs[i].offsetWidth; segs[i].classList.add('on'); segs[i].setAttribute('aria-current', 'true'); }
    left = ms; t0 = 0; run();
  }

  segs.forEach((b, k) => b.addEventListener('click', () => go(k)));
  const mouse = e => e.pointerType === 'mouse';
  hero.addEventListener('pointerenter', e => mouse(e) && hold('hover', true));
  hero.addEventListener('pointerleave', e => mouse(e) && hold('hover', false));
  hero.addEventListener('focusin', () => hold('focus', true));
  hero.addEventListener('focusout', () => hold('focus', false));
  let sx = null;
  hero.addEventListener('pointerdown', e => { sx = !mouse(e) && !e.target.closest('button') ? e.clientX : null; });
  hero.addEventListener('pointerup', e => { if (sx != null && Math.abs(e.clientX - sx) > 50) go(i + (e.clientX < sx ? 1 : -1)); sx = null; });
  const vis = () => hold('tab', document.hidden);
  document.addEventListener('visibilitychange', vis);
  let io;
  if ('IntersectionObserver' in window) { io = new IntersectionObserver(([e]) => hold('offscreen', !e.isIntersecting), { threshold: .25 }); io.observe(hero); }

  run();
  return { go, destroy() { clearTimeout(timer); document.removeEventListener('visibilitychange', vis); io && io.disconnect(); } };
}
