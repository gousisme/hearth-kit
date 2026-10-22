import { esc, safeUrl, debounce, delay } from '../shared/util.js';
import { normalize } from './core/data.js';
import { hydrate } from './core/art.js';
import { reveal, swap, T, reduced } from './core/motion.js';
import { heroHtml, initHero } from './components/hero.js';
import { chipsHtml } from './components/chips.js';
import { featuredHtml } from './components/featured.js';
import { shelfHtml, initShelves } from './components/shelf.js';
import { barHtml, searchHtml, navActive } from './components/nav.js';
import { detailHtml } from './components/detail.js';
import { browseHtml } from './components/browse.js';

/**
 * mount({ target, data, css, shadow, options })  →  app
 *
 *  target   element the host <div> is appended to (default document.body)
 *  data     object following docs/04-data-contract.md
 *  css      CSS text. If given, the UI renders inside a Shadow DOM and adopts this stylesheet
 *           (this is the Tampermonkey path: the original site's CSS can't touch us, and vice versa).
 *           If omitted, the UI renders in the light DOM and expects dist/hearth.css to be linked (mockup/dev path).
 *  options  { autoplay, autoplayMs, placeholders, theme, saved, route, imageLoader,
 *             onGet(game, {button}) → false to cancel the default, onOpen(game), onClose(game), onRoute(route), onSave(game, on), onUser() }
 *
 * app: { el, root, update(data), navigate(view, filter), open(id), close(), getRoute(), destroy() }
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
    <div class="scroll"><main class="page is-out"></main><footer class="foot"></footer></div>
    <div class="modal" aria-hidden="true"><div class="scrim" data-close></div><div class="sheet" role="dialog" aria-modal="true" tabindex="-1"></div></div>`;
  scope.appendChild(root);
  target.appendChild(host);

  const $bar = root.querySelector('.bar-slot'), $scroll = root.querySelector('.scroll'), $page = root.querySelector('.page'),
    $foot = root.querySelector('.foot'), $modal = root.querySelector('.modal'), $sheet = root.querySelector('.sheet');
  const active = () => scope.activeElement || document.activeElement;

  let D = normalize(data);
  const saved = new Set((opt.saved || []).map(String));
  let route = { view: 'home', filter: {}, ...(opt.route || {}) };
  let heroCtl, stopReveal, stopShelves, openId = null, lastFocus = null, swapping = false, searchFrom = null, destroyed = false;

  /* ── render ─────────────────────────────────────────────────────────────────────────────── */
  function homeHtml() {
    if (!D.games.length) return `<div class="empty has-bar"><h3>No games to show</h3><p>The page was read, but no games were found. Check the scraper selectors.</p></div>`;
    return heroHtml(D.hero) + chipsHtml(D.categories, '') + featuredHtml(D.featured) + D.shelves.map(shelfHtml).join('');
  }

  function paint() {
    heroCtl && heroCtl.destroy(); stopReveal && stopReveal(); stopShelves && stopShelves();
    $page.classList.toggle('has-bar', route.view !== 'home');
    $page.innerHTML = route.view === 'home' ? homeHtml() : browseHtml(D, route, saved);
    $scroll.scrollTop = 0;
    hydrate($page, opt.imageLoader);
    stopReveal = reveal($page);
    stopShelves = initShelves($page);
    heroCtl = initHero($page.querySelector('#hero'), { autoplay: opt.autoplay, ms: opt.autoplayMs });
    $foot.textContent = D.site.footer || '';
    syncNav();
  }

  async function refresh() {
    if (swapping || destroyed) return;
    swapping = true;
    await swap($page, paint);
    swapping = false;
  }

  function renderBar() {
    $bar.innerHTML = barHtml(D, route) + searchHtml();
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
    const fill = () => { $sheet.innerHTML = detailHtml(D, g, { saved: saved.has(g.id), placeholders: opt.placeholders }); hydrate($sheet, opt.imageLoader); $sheet.scrollTop = 0; };
    if (!$modal.classList.contains('open')) {
      lastFocus = active(); fill();
      $modal.classList.add('open'); $modal.setAttribute('aria-hidden', 'false'); $scroll.classList.add('is-locked');
      $sheet.focus({ preventScroll: true });
    } else { $sheet.classList.add('is-swap'); await delay(reduced() ? 0 : T.fast); fill(); $sheet.classList.remove('is-swap'); }
    openId = g.id;
    opt.onOpen && opt.onOpen(g);
  }
  function closeGame() {
    if (!$modal.classList.contains('open')) return;
    $modal.classList.remove('open'); $modal.setAttribute('aria-hidden', 'true'); $scroll.classList.remove('is-locked');
    const was = D.byId.get(openId);
    openId = null;
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
    let r; try { r = opt.onGet && opt.onGet(g, { button: btn }); } catch (e) { console.error('[hearth] onGet failed', e); }
    if (r !== false && g.downloadUrl && safeUrl(g.downloadUrl)) window.open(safeUrl(g.downloadUrl), '_blank', 'noopener');
    const bl = btn && btn.querySelector('.bl');
    if (bl && !btn.dataset.busy) { btn.dataset.busy = '1'; const t = bl.textContent; bl.textContent = 'Starting…'; setTimeout(() => { bl.textContent = t; delete btn.dataset.busy; }, 1600); }
  }
  function toggleSaved(id, btn) {
    const g = D.byId.get(String(id)); if (!g) return;
    const on = !saved.has(g.id); on ? saved.add(g.id) : saved.delete(g.id);
    btn.classList.toggle('on', on); btn.querySelector('span').textContent = on ? 'Saved' : 'Save for later';
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
    if ((el = q('[data-get]'))) { e.stopPropagation(); return doGet(el.dataset.get, el); }
    if ((el = q('[data-wish]'))) return toggleSaved(el.dataset.wish, el);
    if (q('[data-close]')) return closeGame();
    if ((el = q('[data-nav-id]'))) { const n = D.nav.find(x => x.id === el.dataset.navId); return n && navTo(n); }
    if (q('[data-nav]')) { closeGame(); closeSearchSilently(); return go('home'); }
    if (q('[data-search-toggle]')) return searchOpen() ? closeSearch() : openSearch();
    if (q('[data-search-clear]')) { $input.value = ''; $input.focus(); return onSearch(); }
    if (q('[data-user]')) return opt.onUser && opt.onUser();
    if ((el = q('[data-cat]'))) { const id = el.dataset.cat; if (!id && route.view === 'home') return; return go('browse', id ? { category: id } : {}); }
    if ((el = q('[data-more]'))) { const s = D.shelves.find(x => x.id === el.dataset.more); return s && go('browse', s.filter || {}); }
    if ((el = q('[data-open]'))) return openGame(el.dataset.open);
  };
  const onKey = e => {
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
    navigate(view, filter) { return go(view, filter); },
    open: openGame, close: closeGame,
    getRoute: () => ({ view: route.view, filter: { ...route.filter } }),
    destroy() { destroyed = true; heroCtl && heroCtl.destroy(); stopReveal && stopReveal(); stopShelves && stopShelves(); document.removeEventListener('keydown', onKey); host.remove(); },
  };
}

function adopt(scope, css) {
  try { const sh = new CSSStyleSheet(); sh.replaceSync(css); scope.adoptedStyleSheets = [...scope.adoptedStyleSheets, sh]; }
  catch (e) { const s = document.createElement('style'); s.textContent = css; scope.appendChild(s); }
}
