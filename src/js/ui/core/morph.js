import { T, reduced } from './motion.js';

/**
 * UPDATES WITHOUT RE-CREATING WHAT DID NOT CHANGE
 * detailHtml() / pageHtml() mark every region with data-k (and containers with data-morph). morphInto() renders new HTML next to the old one and,
 * region by region, keeps the DOM node when its source HTML is identical (so an image that is already on screen is never created and
 * loaded a second time, a scrolled media strip stays where it is, a playing thing keeps playing) and replaces only what changed.
 *
 * Region attributes:
 *   data-morph   look inside: the children are matched by data-k the same way
 *   data-live    patch the existing node IN PLACE (attributes, text, children) instead of replacing it, so CSS transitions run
 *                (a tab that becomes .on, a pager whose current page moves, a button that gets disabled). No fade.
 *   data-na      replace without the fade-in
 * Regions that are new or replaced fade in (`.rg-in`, cascaded 45 ms apart through --d); with { ghost: true } a replaced or removed region
 * also fades OUT: a clone is left in its place for a moment (`.rg-out`), so a skeleton turning into content cross-fades instead of blinking.
 */
export function morphInto(parent, html, { animate = true, ghost = false } = {}) {
  const t = document.createElement('template'); t.innerHTML = html;
  morphKids(parent, [...t.content.children], { animate, ghost: ghost && animate && !reduced(), fresh: 0 });
}

/** Out → change → in for a container (a tab body, a comment page): the old content fades out, `change()` swaps it, the new one fades in. */
export async function swapRegion(el, change) {
  if (!el) return change();
  el.classList.add('is-out');
  await new Promise(r => setTimeout(r, reduced() ? 0 : T.fast));
  change();
  void el.offsetWidth;
  el.classList.remove('is-out');
}

function ghostOut(c, parent) {
  if (c.__ghost) return;
  const g = c.cloneNode(true), s = g.style;
  s.position = 'absolute'; s.top = c.offsetTop + 'px'; s.left = c.offsetLeft + 'px'; s.width = c.offsetWidth + 'px'; s.height = c.offsetHeight + 'px'; s.margin = '0';
  g.__ghost = 1; g.removeAttribute('id'); g.classList.add('rg-out'); g.setAttribute('aria-hidden', 'true');
  parent.appendChild(g);
  c.remove();
  setTimeout(() => g.remove(), T.base);
}

/** Make `o` look like `n` without replacing it. Returns false when the tags differ (the caller then replaces). */
function patchNode(o, n) {
  if (o.nodeType !== 1 || n.nodeType !== 1 || o.tagName !== n.tagName) return false;
  for (const a of [...o.attributes]) if (!n.hasAttribute(a.name)) o.removeAttribute(a.name);
  for (const a of n.attributes) if (o.getAttribute(a.name) !== a.value) o.setAttribute(a.name, a.value);
  const oc = [...o.childNodes], nc = [...n.childNodes];
  nc.forEach((b, i) => {
    const a = oc[i];
    if (!a) o.appendChild(b);
    else if (a.nodeType === 3 && b.nodeType === 3) { if (a.data !== b.data) a.data = b.data; }
    else if (!patchNode(a, b)) o.replaceChild(b, a);
  });
  while (o.childNodes.length > nc.length) o.lastChild.remove();
  return true;
}

function morphKids(parent, next, ctx) {
  const old = new Map();
  const want = new Set(next.map(n => n.dataset.k || ''));
  for (const c of [...parent.children]) {
    if (c.__ghost) continue;
    const k = c.dataset.k || '';
    if (want.has(k) && !old.has(k)) old.set(k, c); else ctx.ghost ? ghostOut(c, parent) : c.remove();   // gone regions go first, so a kept one is never moved (moving a node resets its scroll position)
  }
  let prev = null;
  const after = () => { let n = prev ? prev.nextSibling : parent.firstChild; return n; };
  for (const n of next) {
    const k = n.dataset.k || '', o = old.get(k), src = n.outerHTML;
    old.delete(k);
    if (o && o.__src === src) {                                     // identical: keep the node (move it only if the order changed)
      if (o.previousElementSibling !== prev) parent.insertBefore(o, after());
      prev = o; continue;
    }
    if (o && n.hasAttribute('data-live') && patchNode(o, n)) { o.__src = src; prev = o; continue; }   // same node, new state: transitions run
    if (o && n.hasAttribute('data-morph')) {                        // a container: look inside it
      o.__src = src; o.className = n.className;
      if (o.previousElementSibling !== prev) parent.insertBefore(o, after());
      morphKids(o, [...n.children], ctx); prev = o; continue;
    }
    n.__src = src; n.querySelectorAll('[data-k]').forEach(c => { c.__src = c.outerHTML; });
    const fade = ctx.animate && !n.hasAttribute('data-na');
    if (fade) { n.classList.add('rg-in'); n.style.setProperty('--d', Math.min(ctx.fresh++, 8) * 45 + 'ms'); }
    if (o) { if (ctx.ghost && fade) { const at = o.nextSibling; ghostOut(o, parent); parent.insertBefore(n, at); } else parent.replaceChild(n, o); }
    else parent.insertBefore(n, after());
    if (fade) n.addEventListener('animationend', () => { n.classList.remove('rg-in'); n.style.removeProperty('--d'); }, { once: true });
    prev = n;
  }
}
