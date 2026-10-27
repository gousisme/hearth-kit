import { esc, safeUrl } from '../../shared/util.js';
import { ic, ICON } from '../core/icons.js';
import { T, reduced } from '../core/motion.js';
import { streamHtml, attachStreams, stopStream } from '../core/stream.js';

/**
 * THE FULL GAME PAGE: every visual of it lives here (markup) and in styles/66-page.css (looks and motion). A userscript only supplies data and decides when to
 * paint what; it writes no CSS, no icons and no inline styles. Builders return HTML strings (everything escaped), meant for morphInto() regions (data-k).
 *   pageOpen(root, game) → element         pageClose(el, instant)
 *   pageArt(el, { hero, logo }, final, onMiss)   hero / logo URL lists, tried in order; the slots stop being skeletons when one loads; onMiss('logo') when every logo URL failed
 *   stageHtml / showSlide / mediaReady     gallery (stage + thumbnails) and its cross-fade
 *   ratingHtml, histHtml, reviewHtml, commentHtml, pagerHtml, tabsHtml, noteHtml, skelHtml, aboutHtml   content blocks
 *   expand(el)                             animated "Read more" for .dp-clampbox / .dp-rt
 */
const num = n => (n == null || isNaN(n) ? '' : Number(n).toLocaleString('en-US'));
const when = ts => new Date(ts * 1000).toLocaleDateString('en', { year: 'numeric', month: 'short', day: 'numeric' });
const tone = d => (/positive/i.test(d || '') ? 'pos' : /negative/i.test(d || '') ? 'neg' : 'mix');

export function pageHtml(g) {
  return `<div class="dp-scroll"><div class="dp-hero"><div class="layer is-skel is-busy"><img class="art-img" alt=""></div>
    <div class="dp-hin"><div class="dp-nav"><button class="dp-back" data-dp-act="close">${ic(ICON.prev, 18)}Back</button><small>Esc to close</small></div>
    <div class="lg"><div class="fbt">${esc(g.title)}</div><img class="art-img logo" alt="${esc(g.title)}"></div></div></div>
    <div class="dp-wrap"><div class="dp-grid"><div><div class="dp-sec" id="dp-media"></div><div class="dp-sec" id="dp-about"></div><div class="dp-sec u" id="dp-upd"></div><div class="dp-sec" id="dp-guide"></div><div class="dp-sec" id="dp-req"></div><div class="dp-sec" id="dp-comm"></div></div>
    <aside class="side dp-side" id="dp-side"></aside></div></div></div>`;
}
export function pageOpen(root, g) {
  const el = document.createElement('div');
  el.className = 'dp'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', g.title); el.tabIndex = -1; el.innerHTML = pageHtml(g);
  root.appendChild(el);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('in')));
  el.focus({ preventScroll: true });
  return el;
}
export function pageClose(el, instant) {
  if (instant) return el.remove();
  el.classList.remove('in'); el.classList.add('out');
  setTimeout(() => el.remove(), reduced() ? 0 : T.base + 40);
}

/** One art slot (the hero layer or the logo): try the URLs in turn; the first that loads is shown (fades in over the skeleton). `final` = no more URLs will come. */
function slotFill(box, urls, final, done, miss) {
  const img = box && box.querySelector('img'); if (!img || box.dataset.ok) return;
  const key = urls.join('|');
  if (!urls.length) { if (final && miss) miss(); return; }
  if (box.dataset.k === key) return; box.dataset.k = key;
  let i = 0;
  const next = () => {
    if (!box.isConnected || box.dataset.k !== key) return;
    if (i >= urls.length) return miss && miss();
    const im = new Image(), u = urls[i++];
    im.onload = () => { if (!box.isConnected || box.dataset.k !== key) return; img.src = u; box.dataset.ok = '1'; requestAnimationFrame(() => { img.classList.add('is-loaded'); done && done(); }); };
    im.onerror = next; im.src = u;
  };
  next();
}
export function pageArt(el, { hero = [], logo = [] }, final, onMiss) {
  const list = a => [...new Set(a.map(safeUrl).filter(Boolean))];
  const layer = el.querySelector('.dp-hero .layer'), lg = el.querySelector('.dp-hero .lg');
  slotFill(layer, list(hero), final, () => layer.classList.remove('is-skel', 'is-busy'), () => { layer.classList.remove('is-busy'); layer.classList.add('is-failed'); });
  slotFill(lg, list(logo), final, () => lg.classList.add('has-logo'), () => onMiss && onMiss('logo'));
}

/* ── gallery ─────────────────────────────────────────────────────────────────────────────── */
const slideHtml = m => {
  const src = safeUrl(m.src || (m.sources && m.sources[0] && m.sources[0].src) || m.thumb);
  return m.stream ? streamHtml(m)
    : m.type === 'video' && m.sources ? `<video controls autoplay muted playsinline poster="${esc(safeUrl(m.thumb))}">${m.sources.map(s => `<source src="${esc(safeUrl(s.src))}" type="${esc(s.type)}">`).join('')}</video>`
    : m.type === 'embed' ? `<iframe src="${esc(safeUrl(m.src))}" allow="autoplay; encrypted-media; fullscreen" allowfullscreen></iframe>` : `<img src="${esc(src)}" alt="">`;
};
export const stageHtml = (items, i) => `<div class="dp-stage"><div class="dp-sl in">${slideHtml(items[i])}</div></div><div class="dp-strip"><div class="dp-thumbs">${items.map((x, k) => `<button class="dp-th${k === i ? ' on' : ''}${x.type !== 'image' ? ' v' : ''}" data-dp-m="${k}" aria-label="Media ${k + 1}"><img src="${esc(safeUrl(x.thumb || x.src))}" alt="" decoding="async"></button>`).join('')}</div></div>`;
const thumbFade = s => { const m = s.parentNode, max = s.scrollWidth - s.clientWidth; m.style.setProperty('--fl', Math.max(0, Math.min(1, s.scrollLeft / 64)).toFixed(3)); m.style.setProperty('--fr', Math.max(0, Math.min(1, (max - s.scrollLeft) / 64)).toFixed(3)); };
/** After the gallery is painted: the strip fades at its ends while there is more to scroll, thumbnails fade in as they load. */
export function mediaReady(el) {
  const s = el.querySelector('.dp-thumbs'); if (!s) return;
  if (!s.__fade) { s.__fade = 1; s.addEventListener('scroll', () => thumbFade(s), { passive: true }); if (window.ResizeObserver) new ResizeObserver(() => thumbFade(s)).observe(s); }
  thumbFade(s); attachStreams(el);
  s.querySelectorAll('img:not([data-f])').forEach(im => { im.dataset.f = '1'; const ok = () => im.classList.add('ld'); im.complete && im.naturalWidth ? ok() : (im.addEventListener('load', ok, { once: true }), im.addEventListener('error', ok, { once: true })); });
}
/** Switch the stage: the new slide fades in over the old one, which fades out and is removed (that also stops a playing video). */
export function showSlide(el, items, i) {
  const st = el.querySelector('.dp-stage'); if (!st || !items[i]) return;
  const old = [...st.querySelectorAll('.dp-sl')], d = document.createElement('div'); d.className = 'dp-sl'; d.innerHTML = slideHtml(items[i]); st.appendChild(d); attachStreams(d);
  requestAnimationFrame(() => requestAnimationFrame(() => d.classList.add('in')));
  old.forEach(o => { stopStream(o); o.classList.remove('in'); setTimeout(() => o.remove(), T.slow); });
  const th = el.querySelectorAll('.dp-th'); th.forEach((b, k) => b.classList.toggle('on', k === i));
  const s = th[i] && th[i].parentNode; if (s) s.scrollTo({ left: th[i].offsetLeft - (s.clientWidth - th[i].offsetWidth) / 2, behavior: 'smooth' });
}

/* ── content blocks ──────────────────────────────────────────────────────────────────────── */
/** About: a string (lines starting with "##" are sub-headings) or Steam-style blocks [{ h } | { t } | { img, alt } | { vid, poster }] (a vid is a muted looping clip, Steam's "gif"). Long content starts clamped (expand() opens it). */
export function aboutHtml(src) {
  const blocks = typeof src === 'string' ? src.split('\n').filter(Boolean).map(l => (l.startsWith('##') ? { h: l.slice(2) } : { t: l })) : src;
  const weight = blocks.reduce((n, b) => n + (b.img || b.vid ? 220 : (b.t || b.h || '').length), 0), long = weight >= 700 || blocks.filter(b => b.img || b.vid).length > 1;
  const one = b => (b.vid ? `<figure class="dp-fig is-skel is-busy"><video src="${esc(safeUrl(b.vid))}" ${b.poster ? `poster="${esc(safeUrl(b.poster))}" ` : ''}muted loop autoplay playsinline preload="metadata"></video></figure>` : b.img ? `<figure class="dp-fig is-skel is-busy"><img src="${esc(safeUrl(b.img))}" alt="${esc(b.alt || '')}" loading="lazy" decoding="async" referrerpolicy="no-referrer"></figure>` : b.h ? `<h5>${esc(b.h)}</h5>` : `<p>${esc(b.t)}</p>`);
  return `<h4>About this game</h4><div class="dp-clampbox${long ? ' cl' : ''}"><div class="dp-text">${blocks.map(one).join('')}</div></div>${long ? '<button class="dp-more" data-dp-act="about">Read more</button>' : ''}`;
}
/** Section images fade in as they load (the figure shows the kit's skeleton until then; a failed one disappears). */
export function imgReady(el) {
  el.querySelectorAll('.dp-fig img:not([data-f]), .dp-fig video:not([data-f])').forEach(m => {
    m.dataset.f = '1'; const fig = m.parentNode, ok = () => fig.classList.remove('is-skel', 'is-busy'), bad = () => fig.remove(), vid = m.tagName === 'VIDEO';
    if (vid) { m.muted = true; if (m.readyState >= 2) ok(); else { m.addEventListener('loadeddata', ok, { once: true }); m.addEventListener('error', bad, { once: true }); } return; }
    m.complete ? (m.naturalWidth ? ok() : bad()) : (m.addEventListener('load', ok, { once: true }), m.addEventListener('error', bad, { once: true }));
  });
}
/** Open a clamped box (.cl) with a height transition. */
export function expand(box, animate = true) {
  if (!box || !box.classList.contains('cl')) return;
  const more = box.parentNode && box.parentNode.querySelector(':scope > .dp-more'); if (more) more.remove();
  if (!animate || reduced()) { box.classList.remove('cl'); return; }
  box.style.maxHeight = box.offsetHeight + 'px'; void box.offsetWidth;
  box.classList.remove('cl'); box.style.maxHeight = box.scrollHeight + 'px';
  setTimeout(() => { box.style.maxHeight = ''; }, T.slow + 60);
}
/** How a Steam verdict looks: op overwhelmingly positive (sparkles + shine), vp very positive (glow), po positive, mx mixed, ng negative, vn very negative (glow), on overwhelmingly negative (embers). */
const tier = d => { d = String(d || '').toLowerCase(); return /overwhelmingly positive/.test(d) ? 'op' : /very positive/.test(d) ? 'vp' : /positive/.test(d) ? 'po' : /overwhelmingly negative/.test(d) ? 'on' : /very negative/.test(d) ? 'vn' : /negative/.test(d) ? 'ng' : 'mx'; };
/** Steam's review summary ({ total_reviews, total_positive, total_negative, review_score_desc }) as the side card. '' when there is none. */
export function ratingHtml(R) {
  if (!R || !R.total_reviews) return '';
  const pos = R.total_positive || 0, pct = Math.round(100 * pos / Math.max(pos + (R.total_negative || 0), 1)), t = tone(R.review_score_desc), k = tier(R.review_score_desc);
  const fx = k === 'op' || k === 'on' ? `<span class="dp-fx" aria-hidden="true">${'<i></i>'.repeat(k === 'op' ? 7 : 9)}</span>` : '';
  return `<div class="dp-card" data-tier="${k}">${fx}<h4>Steam reviews</h4><div class="dp-rate"><div class="dp-pct ${t}">${pct}%</div><div class="dp-lab ${t}">${esc(R.review_score_desc || '')}</div><div class="dp-sub">${num(R.total_reviews)} reviews · ${num(pos)} positive</div><div class="dp-bar"><i style="--p:${pct}%"></i></div></div></div>`;
}
/** Reviews per month, as bars. h = [{ d (unix seconds), up, down }]. */
export function histHtml(h) {
  if (!h || h.length < 3) return '';
  const mx = Math.max(...h.map(x => x.up + x.down), 1), w = 600 / h.length;
  const bars = h.map((x, i) => { const hu = 66 * x.up / mx, hd = 66 * x.down / mx, X = (i * w + 1).toFixed(1), W = Math.max(w - 2, 1).toFixed(1); return `<rect x="${X}" y="${(70 - hu).toFixed(1)}" width="${W}" height="${hu.toFixed(1)}" rx="1.5" fill="var(--ac)"/><rect x="${X}" y="${(70 - hu - hd).toFixed(1)}" width="${W}" height="${hd.toFixed(1)}" rx="1.5" fill="var(--bad)"/>`; }).join('');
  const lab = x => new Date(x.d * 1000).toLocaleDateString('en', { month: 'short', year: 'numeric' });
  return `<div data-k="hist"><svg class="dp-hist" viewBox="0 0 600 70" preserveAspectRatio="none" role="img" aria-label="Reviews per month, positive and negative">${bars}</svg><div class="dp-histlab"><span>${esc(lab(h[0]))}</span><span>Reviews per month</span><span>${esc(lab(h[h.length - 1]))}</span></div></div>`;
}
/** r = { id, up, text, t (unix seconds) or when (text), hrs, votes, funny }. */
export function reviewHtml(r) {
  const long = r.text.length > 420, c = r.up ? 'pos' : 'neg';
  return `<div class="dp-rev" data-k="r${esc(r.id)}" data-id="${esc(r.id)}"><div class="dp-th2 ${c}" aria-hidden="true">${r.up ? '✓' : '✕'}</div><div class="dp-rh"><b class="${c}">${r.up ? 'Recommended' : 'Not recommended'}</b>${r.hrs ? `<span>${r.hrs.toFixed(r.hrs < 10 ? 1 : 0)} hrs on record</span>` : ''}${r.t || r.when ? `<span>${esc(r.t ? when(r.t) : r.when)}</span>` : ''}</div><div class="dp-rt${long ? ' cl' : ''}">${esc(r.text)}</div><div class="dp-ra">${long ? `<button data-dp-act="rmore" data-v="${esc(r.id)}">Read more</button>` : ''}${r.votes ? `<span>${num(r.votes)} found this helpful</span>` : ''}${r.funny ? `<span>${num(r.funny)} funny</span>` : ''}</div></div>`;
}
/** c = { id, name, href, av, text, when }; `shown` = the text to display (a translation, say); `offer` = '' | 'Translate' | 'Show original'. */
export function commentHtml(c, shown, offer) {
  const name = c.href && /^https:\/\/online-fix\.me\//.test(c.href) ? `<a class="dp-un" href="${esc(c.href)}" target="_blank" rel="noopener noreferrer">${esc(c.name)}</a>` : esc(c.name);
  return `<div class="dp-rev" data-k="c${esc(c.id)}"><div class="dp-th2">${esc(c.name.slice(0, 1).toUpperCase())}${c.av ? `<img src="${esc(safeUrl(c.av))}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}</div><div class="dp-rh"><b>${name}</b>${c.when ? `<span>${esc(c.when)}</span>` : ''}</div><div class="dp-rt">${esc(shown)}</div>${offer ? `<div class="dp-ra"><button data-dp-act="tr" data-v="${esc(c.id)}">${offer}</button></div>` : ''}</div>`;
}
/** 1 … 4 5 [6] 7 8 … 20, with previous / next. Patched in place, so the current page glides instead of blinking. */
export function pagerHtml(cur, total, key = 'pg') {
  if (total < 2) return '';
  const arr = [...new Set([1, total, cur - 2, cur - 1, cur, cur + 1, cur + 2].filter(n => n >= 1 && n <= total))].sort((a, b) => a - b); let out = '', prev = 0;
  for (const n of arr) { if (n - prev > 1) out += '<span class="dp-pgd">…</span>'; out += `<button class="dp-pgb${n === cur ? ' on' : ''}" data-dp-cp="${n}" aria-label="Page ${n}"${n === cur ? ' aria-current="page"' : ''}>${n}</button>`; prev = n; }
  return `<nav class="dp-pg" data-k="${key}" data-live aria-label="Pages"><button class="dp-pgb" data-dp-cp="${cur - 1}" aria-label="Previous page"${cur < 2 ? ' disabled' : ''}>${ic(ICON.prev, 16)}</button>${out}<button class="dp-pgb" data-dp-cp="${cur + 1}" aria-label="Next page"${cur >= total ? ' disabled' : ''}>${ic(ICON.next, 16)}</button></nav>`;
}
/** Tab row. tabs = [{ id, label }], sels = [{ attr, cur, items: [[value, label]] }] (filter pills on the right), btn = { act, label } (one more pill). */
export function tabsHtml({ tabs, tab, sels = [], btn = null }) {
  const pills = sels.map(s => s.items.map(([k, l]) => `<button class="dp-sel${s.cur === k ? ' on' : ''}" ${s.attr}="${k}">${l}</button>`).join('')).join('');
  return `<div class="dp-tabs" data-k="tabs" data-live>${tabs.map(t => `<button class="dp-tab${tab === t.id ? ' on' : ''}" data-dp-tab="${t.id}">${esc(t.label)}</button>`).join('')}<span class="sp"></span>${pills}${btn ? `<button class="dp-sel" data-dp-act="${btn.act}">${esc(btn.label)}</button>` : ''}</div>`;
}
/** A quiet message block; with `act` it gets a button, with `link` ({ href, label }) a link out. `hint` is the small print under the message. */
export function noteHtml(text, { act = '', label = '', link = null, hint = '' } = {}) {
  return `<div class="dp-empty" data-k="empty"><span>${esc(text)}</span>${hint ? `<small>${esc(hint)}</small>` : ''}${act ? `<button class="dp-ghost" data-dp-act="${act}">${esc(label)}</button>` : ''}${link ? `<a class="dp-ghost ac" href="${esc(safeUrl(link.href))}" target="_blank" rel="noopener noreferrer">${esc(link.label)}</a>` : ''}</div>`;
}
/** n skeleton blocks of a kind ('about' | 'rev' | 'com' | 'card'). */
export const skelHtml = (kind, n = 1, key = 'sk') => Array.from({ length: n }, (_, i) => `<div class="is-skel is-busy sk-${kind}" data-k="${key}${i}"></div>`).join('');
/** A wide "ghost" link-button (e.g. "Write a comment"). */
export const linkHtml = (href, label, key) => `<a class="dp-ghost ac" data-k="${key}" data-na href="${esc(safeUrl(href))}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>`;
/** A "Load more" pill. */
export const moreHtml = (label, busy) => `<button class="dp-ghost" data-k="more" data-live data-dp-act="rmoreList"${busy ? ' disabled' : ''}>${esc(label)}</button>`;
