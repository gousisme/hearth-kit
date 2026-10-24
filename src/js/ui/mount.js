import { esc, safeUrl, debounce, delay } from '../shared/util.js';
import { normalize, addGames } from './core/data.js';
import { createArt } from './core/art.js';
import { createEnrich } from './core/enrich.js';
import { reveal, swap, T, reduced } from './core/motion.js';
import { heroHtml, initHero } from './components/hero.js';
import { genresHtml } from './components/genres.js';
import { featuredHtml } from './components/featured.js';
import { shelfHtml, initShelves } from './components/shelf.js';
import { barHtml, cornerHtml, searchHtml, navActive } from './components/nav.js';
import { detailHtml } from './components/detail.js';
import { lightboxShell, lightboxSlide } from './components/media.js';
import { morphInto } from './core/morph.js';
import { dlPlay } from './core/dl-loop.js';
import { profileHtml } from './components/profile.js';
import { browseHtml, initGrid } from './components/browse.js';

/**
 * mount({ target, data, css, shadow, options })  →  app
 *
 *  target   element the host <div> is appended to (default document.body)
 *  data     object following docs/04-data-contract.md
 *  css      CSS text. If given, the UI renders inside a Shadow DOM and adopts this stylesheet
 *           (this is the Tampermonkey path: the original site's CSS can't touch us, and vice versa).
 *           If omitted, the UI renders in the light DOM and expects dist/hearth.css to be linked (mockup/dev path).
 *  options  { autoplay, autoplayMs, placeholders, theme, saved, route, imageLoader,
 *             resolveDetail(game, push) → Promise<patch|null> // called once, the first time a game's sheet opens: { description, downloads[{label,href,kind,hint}], password, guide[{title,steps[]}], update{date,version,text}, facts[{label,value}], steamUrl, media[{type,thumb,src,sources,title}], steamAppId, art{} }; call push(partial) to show data early
 *             resolveArt(game) → Promise<patch|null>   // called lazily, once per game, right before its first image loads; patch = { steamAppId, art:{poster,hero,logo,header,fallback}, description, developer, … }
 *             resolveProfile(user) → Promise<profile|null>  // called when the avatar is first clicked: { name, avatarUrl, badge, stats[{label,value}], facts[{label,value}], links[{label,href,hint,kind}] }
 *             onGet(game, {button}) → false to cancel the default, onOpen(game), onClose(game), onRoute(route), onSave(game, on),
 *             resolveLogo(game, triedUrls) → Promise<url|''>   // optional: last-chance logo source (asked only when every Steam URL failed)
 *             artDeadlineMs (default 4000): longest a card waits for resolveArt before it loads with what it already has; imageTimeoutMs (default 12000): longest one image URL may take
 *             onUser(user) → false to take over the avatar click (default: the kit's own account sheet opens), onArtMiss(game, kind, urls),
 *             loadMore({view, filter}) → Promise<game[] | false>   // called when the browse grid has shown every local game }
 *
 * app: { el, root, update(data), add(games), navigate(view, filter), open(id), close(), getRoute(), destroy() }
 */
export function mount({ target = document.body, data, css = null, shadow, options = {} } = {}) {
  const opt = { autoplay: true, autoplayMs: 7000, placeholders: false, theme: null, saved: [], route: null, imageLoader: null, ...options };
  const host = document.createElement('div');
  host.id = 'hearth-host';
  const scope = (shadow ?? !!css) ? host.attachShadow({ mode: 'open' }) : host;
  if (css) adopt(scope, css);

  const root = document.createElement('div');
  root.className = 'hearth';
  if (opt.theme) Object.entries(opt.theme).forEach(([k, v]) => root.style.setProperty('--' + k, v));
  root.innerHTML = `<div class="bar-slot"></div>
    <div class="scroll"><div class="top"></div><main class="page is-out"></main><footer class="foot"></footer></div>
    <div class="modal" aria-hidden="true"><div class="scrim" data-close></div><div class="sheet" role="dialog" aria-modal="true" tabindex="-1"></div><div class="lb" aria-hidden="true" role="dialog" aria-label="Media viewer"></div></div>`;
  scope.appendChild(root);
  target.appendChild(host);

  const $bar = root.querySelector('.bar-slot'), $top = root.querySelector('.top'), $scroll = root.querySelector('.scroll'), $page = root.querySelector('.page'),
    $foot = root.querySelector('.foot'), $modal = root.querySelector('.modal'), $sheet = root.querySelector('.sheet'), $lb = root.querySelector('.lb');
  const active = () => scope.activeElement || document.activeElement;
  /** What gets focus back when the sheet closes: only an element the KEYBOARD had focused. After a mouse click the card is focused too, and giving it focus back made its
   *  hover-only Get button stick on (and :focus-visible matches for programmatic focus after Esc). Mouse users simply have no focused element afterwards. */
  const focusToRestore = () => { const a = active(); try { return a && a.matches && a.matches(':focus-visible') ? a : null; } catch (e) { return null; } };

  let D = normalize(data);
  const enrich = createEnrich({ resolve: opt.resolveDetail });
  let dlOpen = false;                                // the download panel of the open sheet is unfolded
  let profileOpen = false;                           // the open sheet is the account sheet, not a game
  const prof = { data: null, done: !opt.resolveProfile, call: null };
  const art = createArt({ root, loader: opt.imageLoader, resolve: opt.resolveArt, onMiss: opt.onArtMiss, resolveLogo: opt.resolveLogo, resolveMs: opt.artDeadlineMs, loadMs: opt.imageTimeoutMs, game: id => D.byId.get(String(id)) });
  const saved = new Set((opt.saved || []).map(String));
  let route = { view: 'home', filter: {}, ...(opt.route || {}) };
  let heroCtl, stopReveal, stopShelves, stopGrid, openId = null, lastFocus = null, swapping = false, searchFrom = null, destroyed = false;

  /* ── render ─────────────────────────────────────────────────────────────────────────────── */
  function homeHtml() {
    if (!D.games.length) return `<div class="empty has-bar"><h3>No games to show</h3><p>The page was read, but no games were found. Check the scraper selectors.</p></div>`;
    return heroHtml(D.hero) + featuredHtml(D.featured) + genresHtml(D) + D.shelves.map(shelfHtml).join('');
  }

  function paint() {
    heroCtl && heroCtl.destroy(); stopReveal && stopReveal(); stopShelves && stopShelves(); stopGrid && stopGrid();
    $page.classList.toggle('has-bar', route.view !== 'home');
    $page.innerHTML = route.view === 'home' ? homeHtml() : browseHtml(D, route, saved, typeof opt.loadMore === 'function');
    $scroll.scrollTop = 0;
    art.hydrate($page);
    stopReveal = reveal($page, { lead: 140 });
    stopShelves = initShelves($page);
    stopGrid = route.view === 'home' ? null : initGrid($page, D, route, saved, art, opt.loadMore);
    heroCtl = initHero($page.querySelector('#hero'), { autoplay: opt.autoplay, ms: opt.autoplayMs, warm: el => art.warm(el) });
    $foot.textContent = D.site.footer || '';
    syncNav();
  }

  let again = false, waiters = [];
  async function refresh() {
    if (destroyed) return;
    if (swapping) { again = true; return new Promise(r => waiters.push(r)); }      // a swap is running: repaint once more when it ends (the latest data/route wins)
    swapping = true;
    do { again = false; await swap($page, paint); } while (again && !destroyed);
    swapping = false; waiters.splice(0).forEach(r => r());                         // every caller resolves after the FINAL repaint
  }

  function renderBar() {
    $bar.innerHTML = barHtml(D, route) + searchHtml();
    $top.innerHTML = cornerHtml(D);
    $top.querySelectorAll('.mark img').forEach(im => { const ok = () => im.parentNode && im.parentNode.classList.add('ok'); im.complete && im.naturalWidth ? ok() : im.addEventListener('load', ok, { once: true }); });   // the site's own logo fades in over the letter
    $search = $bar.querySelector('.searchbox'); $input = $search.querySelector('input'); watchInd(); moveInd(true);
    $input.addEventListener('input', debounce(onSearch, 180));
  }
  let $search, $input;
  function syncNav() {
    D.nav.forEach(n => {
      const b = $bar.querySelector(`[data-nav-id="${CSS.escape(n.id)}"]`); if (!b) return;
      const on = navActive(n, route); b.classList.toggle('on', on); on ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current');
    });
    moveInd(true);
  }
  /** The selection pill glides to the active item. Moving right the right edge leads and the left edge follows (and the other way round), so it stretches on the way. */
  let indPos = null;                                   // where the pill last was ({ l, r } in px), also across a re-render of the bar
  function moveInd(animate) {
    const pill = $bar.querySelector('.pill'), ind = pill && pill.querySelector('.ind'); if (!ind) return;
    const on = pill.querySelector('[data-nav-id].on');
    if (!on || !pill.clientWidth) { ind.style.opacity = '0'; return; }
    const l = on.offsetLeft, r = pill.clientWidth - l - on.offsetWidth;
    if (!ind.__init) {                                 // a new bar: start where the old pill was (so a re-render still animates), or right at the item
      ind.__init = 1; ind.classList.add('no-anim');
      const from = animate && indPos || { l, r }; ind.style.left = from.l + 'px'; ind.style.right = from.r + 'px'; ind.style.opacity = '1';
      void ind.offsetWidth; ind.classList.remove('no-anim');
    }
    if (!animate) ind.classList.add('no-anim');
    if (indPos && indPos.l === l && indPos.r === r && ind.__init && !ind.classList.contains('no-anim')) { ind.style.opacity = '1'; return; }   // already there (syncNav runs twice per navigation): leave the running glide alone
    const from = indPos || { l, r }, right = l > from.l || (l === from.l && r < from.r), dist = Math.abs(l - from.l) + Math.abs(r - from.r);
    const lead = Math.round(230 + Math.min(dist, 600) * .12), trail = Math.round(lead * 1.9);
    ind.style.transition = animate ? `left ${right ? trail : lead}ms var(--ease), right ${right ? lead : trail}ms var(--ease), opacity var(--tf)` : '';
    ind.style.left = l + 'px'; ind.style.right = r + 'px'; ind.style.opacity = '1';
    if (!animate) { void ind.offsetWidth; ind.classList.remove('no-anim'); }
    indPos = { l, r };
  }
  let indRO = null;                                    // keep the pill on its item when the bar's size changes (fonts arriving, window resize, the host being shown again)
  const watchInd = () => { indRO && indRO.disconnect(); const pill = $bar.querySelector('.pill'); if (pill && typeof ResizeObserver === 'function') { indRO = new ResizeObserver(() => moveInd(false)); indRO.observe(pill); } };

  function go(view, filter = {}) {
    route = { view, filter: { ...filter } };
    opt.onRoute && opt.onRoute({ ...route });
    syncNav();
    return refresh();
  }

  /* ── search ─────────────────────────────────────────────────────────────────────────────── */
  const searchOpen = () => $search.classList.contains('open');
  function openSearch() {
    searchFrom = route.view === 'home' ? 'home' : 'browse';
    $search.classList.add('open'); $bar.querySelector('[data-search-toggle]').setAttribute('aria-expanded', 'true');
    $input.focus();
  }
  function closeSearch() {
    if (!searchOpen()) return;
    const had = $input.value.trim();
    $search.classList.remove('open'); $input.value = ''; $input.blur();
    $bar.querySelector('[data-search-toggle]').setAttribute('aria-expanded', 'false');
    if (had) go(searchFrom === 'home' ? 'home' : 'browse', searchFrom === 'home' ? {} : { ...route.filter, query: '' });
  }
  function onSearch() {
    const q = $input.value.trim();
    if (!q) return go(searchFrom === 'home' ? 'home' : 'browse', searchFrom === 'home' ? {} : { ...route.filter, query: '' });
    go('browse', { query: q });
  }

  /* ── detail modal ───────────────────────────────────────────────────────────────────────── */
  async function openGame(id) {
    const g = D.byId.get(String(id)); if (!g) return;
    if (openId === g.id && $modal.classList.contains('open')) return;
    if (openId !== g.id) dlOpen = false;
    profileOpen = false;
    enrich.applyCached(g);
    // One paint for the sheet: regions whose HTML did not change keep their DOM (no image is created or loaded twice, the media strip keeps its scroll).
    // `again` = the same game is already showing (details arriving): new regions fade in. A different game / the account sheet is painted from scratch.
    const fill = () => {
      const again = $sheet.dataset.gid === g.id && !$sheet.classList.contains('is-profile');
      if (!again) $sheet.textContent = '';
      $sheet.classList.remove('is-profile'); $sheet.dataset.gid = g.id;
      const sl = ($sheet.querySelector('.mstrip') || {}).scrollLeft || 0, strip0 = $sheet.querySelector('.mstrip');
      morphInto($sheet, detailHtml(D, g, { saved: saved.has(g.id), placeholders: opt.placeholders, pending: !enrich.done(g.id), dlOpen }), { animate: again });
      art.hydrate($sheet); if (!again) $sheet.scrollTop = 0;
      const ns = $sheet.querySelector('.mstrip'); if (ns && ns !== strip0 && sl) ns.scrollLeft = sl;   // the strip was replaced (not kept): put it back where the person had scrolled it
      stripReady();
    };
    const sig = () => [g.description, g.developer, g.publisher, g.releaseYear, g.rating].join('|'), s0 = sig();
    if (!$modal.classList.contains('open')) {
      lastFocus = focusToRestore(); fill();
      $modal.classList.add('open'); $modal.setAttribute('aria-hidden', 'false'); $scroll.classList.add('is-locked');
      $sheet.focus({ preventScroll: true });
    } else { $sheet.classList.add('is-swap'); await delay(reduced() ? 0 : T.fast); fill(); $sheet.classList.remove('is-swap'); }
    openId = g.id;
    // art/details that were still being resolved when the sheet opened: show them as soon as they arrive (the sheet never waits)
    if (opt.resolveArt) art.settle(g).then(() => { if (openId === g.id && sig() !== s0) { const st = $sheet.scrollTop; fill(); $sheet.scrollTop = st; } });
    // downloads / how-to-connect / update info are fetched on demand: the sheet opens at once with skeletons and fills in when they arrive
    // (a resolver may also push partial patches: the sheet shows each one as it arrives)
    const refill = () => { if (openId === g.id) { const st = $sheet.scrollTop; fill(); $sheet.scrollTop = st; } };
    if (!enrich.done(g.id)) enrich.get(g, () => { enrich.applyCached(g); refill(); }).then(refill);
    opt.onOpen && opt.onOpen(g);
  }
  /** The avatar: the kit's own account sheet (opens at once with what is known, fills in from options.resolveProfile). */
  async function openProfile() {
    const u = D.site.user; if (!u) return;
    if (opt.onUser) { let r; try { r = opt.onUser(u); } catch (e) { console.error('[hearth] onUser failed', e); } if (r === false) return; }
    if (profileOpen && $modal.classList.contains('open')) return closeGame();       // the avatar toggles the sheet
    if (prof.done && !prof.data && opt.resolveProfile) { prof.done = false; prof.call = null; }   // the last attempt failed: try again
    profileOpen = true; openId = null;
    const fill = () => { delete $sheet.dataset.gid; $sheet.classList.add('is-profile'); $sheet.innerHTML = profileHtml(D.site.user || u, prof.data, { pending: !prof.done }); $sheet.scrollTop = 0; };
    if (!$modal.classList.contains('open')) {
      lastFocus = focusToRestore(); fill();
      $modal.classList.add('open'); $modal.setAttribute('aria-hidden', 'false'); $scroll.classList.add('is-locked');
      $sheet.focus({ preventScroll: true });
    } else { $sheet.classList.add('is-swap'); await delay(reduced() ? 0 : T.fast); fill(); $sheet.classList.remove('is-swap'); }
    if (!prof.done) {
      if (!prof.call) prof.call = Promise.resolve().then(() => opt.resolveProfile(u)).catch(e => { console.warn('[hearth] resolveProfile failed', e); return null; }).then(p => { prof.data = p; prof.done = true; return p; });
      prof.call.then(() => { if (profileOpen && $modal.classList.contains('open')) { const st = $sheet.scrollTop; fill(); $sheet.scrollTop = st; } });
    }
  }
  function closeGame() {
    if (!$modal.classList.contains('open')) return;
    lbHide();
    $modal.classList.remove('open'); $modal.setAttribute('aria-hidden', 'true'); $scroll.classList.remove('is-locked');
    const was = D.byId.get(openId);
    openId = null; profileOpen = false; delete $sheet.dataset.gid;       // the next opening paints from scratch (and from the top)
    opt.onClose && was && opt.onClose(was);
    lastFocus && lastFocus.focus && lastFocus.focus({ preventScroll: true });
    if (route.filter && route.filter.saved) refresh();
  }
  function trapTab(e) {
    const f = [...$sheet.querySelectorAll('button,[href],input,[tabindex]:not([tabindex="-1"])')].filter(x => !x.disabled && x.offsetParent !== null);
    if (!f.length) return;
    const a = active();
    if (e.shiftKey && (a === f[0] || a === $sheet)) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && a === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
  }

  /* ── actions ────────────────────────────────────────────────────────────────────────────── */
  function doGet(id, btn) {
    const g = D.byId.get(String(id)); if (!g) return;
    if (btn && btn.closest('.sheet')) {              // inside the sheet the options unfold under the button instead of a floating menu
      const box = btn.closest('.getbox');
      if (box) { dlOpen = !dlOpen; box.classList.toggle('open', dlOpen); btn.setAttribute('aria-expanded', String(dlOpen)); return; }
      if (g.downloads.length === 1) { window.open(safeUrl(g.downloads[0].href), '_blank', 'noopener'); return; }
    }
    let r; try { r = opt.onGet && opt.onGet(g, { button: btn }); } catch (e) { console.error('[hearth] onGet failed', e); }
    if (r === false) return;                       // onGet took over (e.g. opened its own menu): no default action and no "Starting…" flash
    if (g.downloadUrl && safeUrl(g.downloadUrl)) window.open(safeUrl(g.downloadUrl), '_blank', 'noopener');
    const bl = btn && btn.querySelector('.bl');
    if (bl && !btn.dataset.busy) { btn.dataset.busy = '1'; const t = bl.textContent; bl.textContent = 'Starting…'; setTimeout(() => { bl.textContent = t; delete btn.dataset.busy; }, 1600); }
  }
  /* ── media viewer: opens / closes with a fade, and every change of item cross-fades (the new slide waits for its image, so there is never a blank flash) ── */
  let lbI = -1, lbT = 0;
  const LB_MS = () => (reduced() ? 0 : T.base + 60);
  function lbRetire(old, dir) {
    old.classList.remove('in'); old.classList.add('out'); old.style.setProperty('--dx', (-dir * 28) + 'px');
    old.querySelectorAll('video').forEach(v => v.pause());
    setTimeout(() => old.remove(), LB_MS());
  }
  function lbShow(i, dir = 0) {
    const g = D.byId.get(openId), items = (g && g.media) || []; if (!items[i]) return;
    const first = lbI < 0; lbI = i; clearTimeout(lbT);
    if (first || !$lb.querySelector('.lb-m')) $lb.innerHTML = lightboxShell(items.length > 1);
    const stage = $lb.querySelector('.lb-m');
    $lb.querySelector('.lb-c').textContent = items.length > 1 ? `${i + 1} / ${items.length}` : '';
    stage.querySelectorAll('.lb-s:not(.out)').forEach(o => lbRetire(o, dir));
    const sl = document.createElement('div'); sl.className = 'lb-s'; sl.style.setProperty('--dx', (dir * 28) + 'px'); sl.innerHTML = lightboxSlide(items[i]); stage.appendChild(sl);
    const v = sl.querySelector('video');
    if (v) { const s = v.querySelectorAll('source'); s[s.length - 1].addEventListener('error', () => { v.hidden = true; sl.querySelector('.lb-err').hidden = false; }); }   // every source failed (e.g. blocked by the page's CSP)
    const on = () => { if (sl.isConnected && !sl.classList.contains('out')) sl.classList.add('in'); }, img = sl.querySelector('img');
    if (img && !(img.complete && img.naturalWidth)) { img.addEventListener('load', on, { once: true }); img.addEventListener('error', on, { once: true }); setTimeout(on, 4000); }   // a picture fades in when it has arrived
    else requestAnimationFrame(() => requestAnimationFrame(on));
    $lb.classList.add('open'); $lb.setAttribute('aria-hidden', 'false');
    if (first) { const x = $lb.querySelector('.lb-x'); x && x.focus({ preventScroll: true }); }
  }
  function lbHide() {
    if (lbI < 0) return; lbI = -1;
    $lb.classList.remove('open'); $lb.setAttribute('aria-hidden', 'true');
    $lb.querySelectorAll('video').forEach(v => v.pause());
    $lb.querySelectorAll('iframe').forEach(f => { f.src = 'about:blank'; });                         // stops a playing embed at once; the frame then fades out with the rest
    clearTimeout(lbT); lbT = setTimeout(() => { if (lbI < 0) $lb.innerHTML = ''; }, LB_MS());           // content stays until the fade is over
    $sheet.focus({ preventScroll: true });
  }
  function lbStep(d) { const g = D.byId.get(openId), n = (g && g.media && g.media.length) || 0; if (n > 1 && lbI >= 0) lbShow((lbI + d + n) % n, d); }

  /* ── media strip: edge fades, a smooth glide for Shift+wheel, drag with momentum ── */
  let dragMoved = false, drag = null, glide = null, coast = 0;
  const FADE = 64;
  const stripFade = s => { const m = s.parentNode, max = s.scrollWidth - s.clientWidth; if (!m) return; m.style.setProperty('--fl', Math.max(0, Math.min(1, s.scrollLeft / FADE)).toFixed(3)); m.style.setProperty('--fr', Math.max(0, Math.min(1, (max - s.scrollLeft) / FADE)).toFixed(3)); };
  function stripReady() {                                                                              // after every paint: fade state, and thumbnails fade in as they load
    const s = $sheet.querySelector('.mstrip'); if (s && !s.__fade) { s.__fade = 1; s.addEventListener('scroll', () => stripFade(s), { passive: true }); }
    if (s) stripFade(s);
    $sheet.querySelectorAll('.mt img:not([data-f])').forEach(im => { im.dataset.f = '1'; const ok = () => im.classList.add('ld'); im.complete && im.naturalWidth ? ok() : (im.addEventListener('load', ok, { once: true }), im.addEventListener('error', ok, { once: true })); });
  }
  const stopMotion = () => { if (glide) { cancelAnimationFrame(glide.raf); glide = null; } cancelAnimationFrame(coast); coast = 0; };
  /** Shift+wheel: one continuous glide towards a moving target (no per-notch animation that stops and restarts, no snapping). */
  function glideBy(s, dx) {
    const max = s.scrollWidth - s.clientWidth; cancelAnimationFrame(coast);
    const from = glide && glide.s === s ? glide.to : s.scrollLeft, to = Math.max(0, Math.min(max, from + dx));
    if (glide && glide.s === s) { glide.to = to; return; }
    glide = { s, to, t: performance.now(), raf: 0 };
    const tick = now => {
      if (!glide) return; const dt = Math.min(48, now - glide.t); glide.t = now;
      const diff = glide.to - s.scrollLeft;
      if (Math.abs(diff) < .5) { s.scrollLeft = glide.to; glide = null; return; }
      s.scrollLeft += diff * (1 - Math.exp(-dt / (reduced() ? 1 : 85)));
      glide.raf = requestAnimationFrame(tick);
    };
    glide.raf = requestAnimationFrame(tick);
  }
  $sheet.addEventListener('wheel', e => {
    const s = e.target.closest && e.target.closest('.mstrip'); if (!s || s.scrollWidth <= s.clientWidth + 1) return;
    if (!e.shiftKey || e.ctrlKey) return;                                                              // only Shift+wheel is taken over; plain wheel keeps scrolling the sheet, trackpads keep their own physics
    const d = (e.deltaY || e.deltaX) * (e.deltaMode === 1 ? 34 : e.deltaMode === 2 ? s.clientWidth : 1);
    if (!d) return; e.preventDefault(); glideBy(s, d);
  }, { passive: false });
  $sheet.addEventListener('pointerdown', e => {
    const s = e.pointerType === 'mouse' && !e.button && e.target.closest && e.target.closest('.mstrip');
    if (!s) return; stopMotion();
    drag = { s, id: e.pointerId, x: e.clientX, l: s.scrollLeft, last: e.clientX, t: performance.now(), v: 0 }; dragMoved = false;
  });
  root.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x;
    if (!dragMoved) { if (Math.abs(dx) < 5) return; dragMoved = true; drag.s.classList.add('is-drag'); try { drag.s.setPointerCapture(drag.id); } catch (err) { /* ignore */ } }
    const now = performance.now(), dt = now - drag.t;
    if (dt > 0) drag.v = .8 * drag.v + .2 * ((drag.last - e.clientX) / dt);                                // px per ms, smoothed
    drag.last = e.clientX; drag.t = now;
    drag.s.scrollLeft = drag.l - dx;
  });
  const endDrag = e => {
    if (!drag || (e && e.pointerId !== drag.id)) return;
    const { s, v } = drag, moved = dragMoved; drag = null;
    s.classList.remove('is-drag'); try { s.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    if (moved && Math.abs(v) > .15 && !reduced()) {                                                    // let go while moving: keep gliding, slowing down
      let vel = v, last = performance.now();
      const tick = now => { const dt = Math.min(48, now - last); last = now; s.scrollLeft += vel * dt; vel *= Math.exp(-dt / 320); if (Math.abs(vel) > .02 && s.scrollLeft > 0 && s.scrollLeft < s.scrollWidth - s.clientWidth - 1) coast = requestAnimationFrame(tick); };
      coast = requestAnimationFrame(tick);
    }
    setTimeout(() => { dragMoved = false; }, 0);                                                       // (the click that ends a drag must not open the viewer)
  };
  root.addEventListener('pointerup', endDrag); root.addEventListener('pointercancel', endDrag);
  $sheet.addEventListener('dragstart', e => { if (e.target.closest && e.target.closest('.mstrip')) e.preventDefault(); });

  function toggleSaved(id, btn) {
    const g = D.byId.get(String(id)); if (!g) return;
    const on = !saved.has(g.id); on ? saved.add(g.id) : saved.delete(g.id);
    btn.classList.toggle('on', on); const sp = btn.querySelector('span'); if (sp) sp.textContent = on ? 'Saved' : (btn.dataset.off || 'Save for later'); btn.title = on ? 'Saved' : 'Save for later'; btn.setAttribute('aria-label', on ? 'Saved' : 'Save for later');
    opt.onSave && opt.onSave(g, on);
  }
  function navTo(item) {
    if (item.view === 'external' && item.href && safeUrl(item.href)) return window.open(safeUrl(item.href), '_blank', 'noopener');
    closeSearchSilently();
    go(item.view === 'home' ? 'home' : 'browse', item.view === 'home' ? {} : item.filter || {});
  }
  function closeSearchSilently() { if ($search && searchOpen()) { $search.classList.remove('open'); $input.value = ''; $bar.querySelector('[data-search-toggle]').setAttribute('aria-expanded', 'false'); } }

  const onClick = e => {
    const t = e.target, q = s => t.closest(s);
    let el;
    if ((el = q('[data-copy]'))) {
      e.stopPropagation(); const v = el.dataset.copy, em = el.querySelector('em'), done = () => { el.classList.add('ok'); if (em) em.textContent = 'Copied'; setTimeout(() => { el.classList.remove('ok'); if (em) em.textContent = 'Copy'; }, 1400); };
      try { navigator.clipboard.writeText(v).then(done, () => {}); } catch (err) { /* clipboard blocked: the code is selectable */ } return;
    }
    if (q('[data-lb-close]')) return lbHide();
    if ((el = q('[data-lb-step]'))) return lbStep(+el.dataset.lbStep);
    if (t === $lb || t.classList.contains('lb-m')) return lbHide();   // the dark area around the media
    if ((el = q('[data-media]'))) return dragMoved ? undefined : lbShow(+el.dataset.media);
    if ((el = q('[data-get]'))) { e.stopPropagation(); return doGet(el.dataset.get, el); }
    if ((el = q('[data-wish]'))) return toggleSaved(el.dataset.wish, el);
    if (q('[data-close]')) return closeGame();
    if ((el = q('[data-nav-id]'))) { const n = D.nav.find(x => x.id === el.dataset.navId); return n && navTo(n); }
    if (q('[data-nav]')) { closeGame(); closeSearchSilently(); return go('home'); }
    if (q('[data-search-toggle]')) return searchOpen() ? closeSearch() : openSearch();
    if (q('[data-search-clear]')) { $input.value = ''; $input.focus(); return onSearch(); }
    if (q('[data-user]')) return openProfile();
    if ((el = q('[data-cat]'))) { const id = el.dataset.cat; if (!id && route.view === 'home') return; return go('browse', id ? { category: id } : {}); }
    if ((el = q('[data-more]'))) { const s = D.shelves.find(x => x.id === el.dataset.more); return s && go('browse', s.filter || {}); }
    if ((el = q('[data-open]'))) return openGame(el.dataset.open);
  };
  const onKey = e => {
    if (lbI >= 0) {                                                  // the media viewer is on top of everything
      if (e.key === 'Escape') { e.preventDefault(); return lbHide(); }
      if (e.key === 'ArrowRight') { e.preventDefault(); return lbStep(1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); return lbStep(-1); }
      if (e.key === 'Tab') { e.preventDefault(); const x = $lb.querySelector('.lb-x'); return x && x.focus(); }
    }
    if (e.key === 'Escape') { if ($modal.classList.contains('open')) return closeGame(); if ($search && searchOpen()) return closeSearch(); }
    if (e.key === 'Tab' && $modal.classList.contains('open')) return trapTab(e);
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('[data-open][role="button"]')) { e.preventDefault(); openGame(e.target.dataset.open); }
  };
  /* Get button icon: one slide of the arrow each time the pointer (or keyboard focus) reaches a button (core/dl-loop.js). */
  const discOf = e => { const b = e.target.closest && e.target.closest('.btn'); return b ? [b, b.querySelector('.d[data-dl]')] : [null, null]; };
  root.addEventListener('pointerover', e => { const [b, d] = discOf(e); if (d && !(e.relatedTarget && b.contains(e.relatedTarget))) dlPlay(d); });
  root.addEventListener('focusin', e => { const [, d] = discOf(e); if (d && e.target.matches && e.target.matches(':focus-visible')) dlPlay(d); });
  root.addEventListener('click', onClick);
  document.addEventListener('keydown', onKey);

  /* ── boot ───────────────────────────────────────────────────────────────────────────────── */
  renderBar();
  paint();
  requestAnimationFrame(() => requestAnimationFrame(() => { root.classList.add('ready'); $page.classList.remove('is-out'); }));

  return {
    el: host, root,
    /** Replace the data. `to` ({view, filter}) sets the route in the same transition (one swap, not two). */
    update(next, to) {
      D = normalize(next);
      if (to && to.view) { route = { view: to.view, filter: { ...(to.filter || {}) } }; opt.onRoute && opt.onRoute({ ...route }); }
      if (openId && !D.byId.get(openId)) closeGame();
      renderBar();
      return refresh();
    },
    /** Add games to the running app without a full re-render (e.g. search results). Existing games only gain new search tags. */
    add(list) { const { added, merged } = addGames(D, list); return (added.length || merged) && route.view === 'browse' ? refresh() : Promise.resolve(); },
    navigate(view, filter) { return go(view, filter); },
    open: openGame, close: closeGame,
    getRoute: () => ({ view: route.view, filter: { ...route.filter } }),
    destroy() { destroyed = true; indRO && indRO.disconnect(); art.destroy(); heroCtl && heroCtl.destroy(); stopReveal && stopReveal(); stopShelves && stopShelves(); stopGrid && stopGrid(); document.removeEventListener('keydown', onKey); host.remove(); },
  };
}

function adopt(scope, css) {
  try { const sh = new CSSStyleSheet(); sh.replaceSync(css); scope.adoptedStyleSheets = [...scope.adoptedStyleSheets, sh]; }
  catch (e) { const s = document.createElement('style'); s.textContent = css; scope.appendChild(s); }
}
