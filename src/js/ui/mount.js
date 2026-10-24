import { esc, safeUrl, debounce, delay } from '../shared/util.js';
import { normalize, addGames } from './core/data.js';
import { createArt } from './core/art.js';
import { createEnrich } from './core/enrich.js';
import { reveal, swap, T, reduced } from './core/motion.js';
import { heroHtml, initHero } from './components/hero.js';
import { chipsHtml } from './components/chips.js';
import { featuredHtml } from './components/featured.js';
import { shelfHtml, initShelves } from './components/shelf.js';
import { barHtml, cornerHtml, searchHtml, navActive } from './components/nav.js';
import { detailHtml } from './components/detail.js';
import { lightboxInner } from './components/media.js';
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
    return heroHtml(D.hero) + chipsHtml(D.categories, '') + featuredHtml(D.featured) + D.shelves.map(shelfHtml).join('');
  }

  function paint() {
    heroCtl && heroCtl.destroy(); stopReveal && stopReveal(); stopShelves && stopShelves(); stopGrid && stopGrid();
    $page.classList.toggle('has-bar', route.view !== 'home');
    $page.innerHTML = route.view === 'home' ? homeHtml() : browseHtml(D, route, saved);
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
    $search = $bar.querySelector('.searchbox'); $input = $search.querySelector('input');
    $input.addEventListener('input', debounce(onSearch, 180));
  }
  let $search, $input;
  function syncNav() {
    D.nav.forEach(n => {
      const b = $bar.querySelector(`[data-nav-id="${CSS.escape(n.id)}"]`); if (!b) return;
      const on = navActive(n, route); b.classList.toggle('on', on); on ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current');
    });
  }

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
    const fill = () => {
      const old = $sheet.querySelector('.mstrip'), sl = old ? old.scrollLeft : 0;
      $sheet.classList.remove('is-profile'); $sheet.innerHTML = detailHtml(D, g, { saved: saved.has(g.id), placeholders: opt.placeholders, pending: !enrich.done(g.id), dlOpen }); art.hydrate($sheet); $sheet.scrollTop = 0;
      const ns = sl && $sheet.querySelector('.mstrip'); if (ns) ns.scrollLeft = sl;       // a re-render (details arriving) keeps the strip where the person scrolled it
    };
    const sig = () => [g.description, g.developer, g.publisher, g.releaseYear, g.rating].join('|'), s0 = sig();
    if (!$modal.classList.contains('open')) {
      lastFocus = active(); fill();
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
    const fill = () => { $sheet.classList.add('is-profile'); $sheet.innerHTML = profileHtml(D.site.user || u, prof.data, { pending: !prof.done }); $sheet.scrollTop = 0; };
    if (!$modal.classList.contains('open')) {
      lastFocus = active(); fill();
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
    openId = null; profileOpen = false;
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
  /* ── media viewer ── */
  let lbI = -1, dragMoved = false;
  function lbShow(i) {
    const g = D.byId.get(openId), items = (g && g.media) || []; if (!items[i]) return;
    lbI = i; $lb.innerHTML = lightboxInner(items, i); $lb.classList.add('open'); $lb.setAttribute('aria-hidden', 'false');
    const v = $lb.querySelector('video');
    if (v) { const s = v.querySelectorAll('source'); s[s.length - 1].addEventListener('error', () => { v.hidden = true; $lb.querySelector('.lb-err').hidden = false; }); }   // every source failed (e.g. blocked by the page's CSP)
    const x = $lb.querySelector('.lb-x'); x && x.focus({ preventScroll: true });
  }
  function lbHide() {
    if (lbI < 0) return; lbI = -1;
    $lb.classList.remove('open'); $lb.setAttribute('aria-hidden', 'true'); $lb.innerHTML = '';       // also stops a playing video / embed
    $sheet.focus({ preventScroll: true });
  }
  function lbStep(d) { const g = D.byId.get(openId), n = (g && g.media && g.media.length) || 0; if (n > 1 && lbI >= 0) lbShow((lbI + d + n) % n); }
  let drag = null;                                     // mouse drag-to-scroll on the media strip
  $sheet.addEventListener('pointerdown', e => { const s = e.pointerType === 'mouse' && !e.button && e.target.closest && e.target.closest('.mstrip'); if (s) { drag = { s, x: e.clientX, l: s.scrollLeft }; dragMoved = false; } });
  root.addEventListener('pointermove', e => { if (!drag) return; const dx = e.clientX - drag.x; if (Math.abs(dx) > 5) { dragMoved = true; drag.s.scrollLeft = drag.l - dx; } });
  root.addEventListener('pointerup', () => { drag = null; setTimeout(() => { dragMoved = false; }, 0); });

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
    if (t === $lb) return lbHide();                                  // the dark area around the media
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
    destroy() { destroyed = true; art.destroy(); heroCtl && heroCtl.destroy(); stopReveal && stopReveal(); stopShelves && stopShelves(); stopGrid && stopGrid(); document.removeEventListener('keydown', onKey); host.remove(); },
  };
}

function adopt(scope, css) {
  try { const sh = new CSSStyleSheet(); sh.replaceSync(css); scope.adoptedStyleSheets = [...scope.adoptedStyleSheets, sh]; }
  catch (e) { const s = document.createElement('style'); s.textContent = css; scope.appendChild(s); }
}
