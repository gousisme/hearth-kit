import { esc, safeUrl } from '../../shared/util.js';
import { ic, ICON } from '../core/icons.js';

/** Is nav item `n` the current one? Home matches the home view; browse items match on saved/sort/category. */
export function navActive(n, route) {
  if (n.view === 'home') return route.view === 'home';
  if (n.view !== 'browse' || route.view !== 'browse') return false;
  const a = n.filter || {}, b = route.filter || {};
  return !!a.saved === !!b.saved && (a.sort || '') === (b.sort || '') && (a.category || '') === (b.category || '');
}

/** Floating glass pill: sections + search. It is the only part of the top bar that stays on screen while scrolling. */
export function barHtml(D, route) {
  return `<header class="bar"><nav class="gl pill" aria-label="Sections">
      ${D.nav.map(n => `<button data-nav-id="${esc(n.id)}"${navActive(n, route) ? ' class="on" aria-current="page"' : ''}>${esc(n.label)}</button>`).join('')}
      <button class="sb" data-search-toggle aria-label="Search" aria-expanded="false">${ic(ICON.search)}</button>
    </nav></header>`;
}

/**
 * The site mark (left) and the account button (right). They sit at the top of the scrolling page, so they scroll away
 * with it instead of floating over the content. No user (not signed in) → no account button, never the text "undefined".
 */
export function cornerHtml(D) {
  const u = D.site.user, label = esc((u && u.name) || 'Account');
  const avatar = !u ? ''
    : u.avatarUrl && safeUrl(u.avatarUrl) ? `<button class="av" data-user aria-label="${label}"><img src="${esc(safeUrl(u.avatarUrl))}" alt=""></button>`
    : u.initials ? `<button class="av" data-user aria-label="${label}">${esc(u.initials)}</button>` : '';
  return `<button class="mark" data-nav="home" aria-label="${esc(D.site.name)} — home">${esc(D.site.mark)}</button><div class="bar-r">${avatar}</div>`;
}

/** Drop-down search field that lives under the pill. */
export function searchHtml() {
  return `<div class="searchbox gl" role="search"><span class="si">${ic(ICON.search, 18)}</span><input type="search" placeholder="Search games, genres, studios…" aria-label="Search games" autocomplete="off" spellcheck="false"><button class="sx" data-search-clear aria-label="Clear search">${ic(ICON.close, 14)}</button></div>`;
}
