/**
 * SHEET UPDATES WITHOUT RE-CREATING WHAT DID NOT CHANGE
 * detailHtml() marks every region with data-k (and containers with data-morph). morphInto() renders new HTML next to the old one and,
 * region by region, keeps the DOM node when its source HTML is identical (so an image that is already on screen is never created and
 * loaded a second time, a scrolled media strip stays where it is, a playing thing keeps playing) and replaces only what changed.
 * Regions that are new or replaced fade in (`.rg-in`, unless `animate` is false); regions that are gone are removed.
 */
export function morphInto(parent, html, { animate = true } = {}) {
  const t = document.createElement('template'); t.innerHTML = html;
  morphKids(parent, [...t.content.children], animate);
}

function morphKids(parent, next, animate) {
  const old = new Map();
  const want = new Set(next.map(n => n.dataset.k || ''));
  for (const c of [...parent.children]) { const k = c.dataset.k || ''; if (want.has(k) && !old.has(k)) old.set(k, c); else c.remove(); }   // gone regions go first, so a kept one is never moved (moving a node resets its scroll position)
  let prev = null;
  const after = () => (prev ? prev.nextSibling : parent.firstChild);
  for (const n of next) {
    const k = n.dataset.k || '', o = old.get(k), src = n.outerHTML;
    old.delete(k);
    if (o && o.__src === src) {                                     // identical: keep the node (move it only if the order changed)
      if (o.previousElementSibling !== prev) parent.insertBefore(o, after());
      prev = o; continue;
    }
    if (o && n.hasAttribute('data-morph')) {                        // a container: look inside it
      o.__src = src; o.className = n.className;
      if (o.previousElementSibling !== prev) parent.insertBefore(o, after());
      morphKids(o, [...n.children], animate); prev = o; continue;
    }
    n.__src = src;
    if (animate) n.classList.add('rg-in');
    if (o) parent.replaceChild(n, o); else parent.insertBefore(n, after());
    if (n.classList.contains('rg-in')) n.addEventListener('animationend', () => n.classList.remove('rg-in'), { once: true });
    prev = n;
  }
}
