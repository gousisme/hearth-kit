import { reduced } from './motion.js';

/**
 * One shared Lottie player for every primary "download" button (the Get buttons).
 *   options.lottie = the lottie-web player (lottie_light is enough; the userscript @requires it)
 *   options.icons  = { download: { data: <lottie JSON>, rest: 69, hover: [70, 140] } }
 * Without both, nothing changes: the buttons keep their CSS arrow swap.
 * The animation is created on the first hover and then MOVED into whichever button is hovered (one player, one SVG, however many cards there are).
 * Colours are replaced with the button's own icon colour, so the theme accent keeps working; expressions / effects of the export are not needed.
 */
export function createIconPlayer(options) {
  const lib = options && options.lottie, cfg = options && options.icons && options.icons.download;
  if (!lib || typeof lib.loadAnimation !== 'function' || !cfg || !cfg.data) return null;
  const rest = Number.isFinite(cfg.rest) ? cfg.rest : 0, seg = Array.isArray(cfg.hover) && cfg.hover.length === 2 ? cfg.hover : null;
  let anim = null, el = null, cur = null, failed = false;

  const rgb = css => { const m = String(css || '').match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i); return m ? [m[1] / 255, m[2] / 255, m[3] / 255, 1] : [1, 1, 1, 1]; };
  /** a private copy of the animation data with every fill / stroke in `color`, no expressions, no effects */
  function paint(data, color) {
    const copy = JSON.parse(JSON.stringify(data));
    (function walk(o) {
      if (Array.isArray(o)) return o.forEach(walk);
      if (!o || typeof o !== 'object') return;
      if ((o.ty === 'st' || o.ty === 'fl') && o.c) { o.c = { a: 0, k: color, ix: o.c.ix || 3 }; }
      delete o.ef; if (typeof o.x === 'string') delete o.x;
      Object.values(o).forEach(walk);
    })(copy);
    return copy;
  }
  function ensure(d) {
    if (anim || failed) return !failed;
    try {
      el = document.createElement('span'); el.className = 'lt'; d.appendChild(el);
      anim = lib.loadAnimation({ container: el, renderer: 'svg', loop: false, autoplay: false, animationData: paint(cfg.data, rgb(getComputedStyle(d).color)), rendererSettings: { preserveAspectRatio: 'xMidYMid meet' } });
      anim.goToAndStop(rest, true);
    } catch (e) { failed = true; anim = null; if (el && el.parentNode) el.parentNode.removeChild(el); return false; }
    return true;
  }
  return {
    /** the pointer entered (or keyboard focus reached) `btn` */
    hover(btn) {
      const d = btn && btn.querySelector && btn.querySelector('.d[data-dl]');
      if (!d || !ensure(d)) return;
      if (cur !== d) { if (cur) cur.classList.remove('lt-on'); cur = d; d.appendChild(el); d.classList.add('lt-on'); anim.goToAndStop(rest, true); }
      if (seg && !reduced()) anim.playSegments(seg, true);
    },
    destroy() { try { anim && anim.destroy(); } catch (e) { /* ignore */ } anim = null; },
  };
}
