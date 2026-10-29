import { esc, safeUrl } from '../../shared/util.js';
import { ic, ICON } from '../core/icons.js';

/** Is nav item `n` the current one? Home matches the home view; browse items match on saved/category. */
export function navActive(n, route) {
  if (n.view === 'home') return route.view === 'home';
  if (n.view !== 'browse' || route.view !== 'browse') return false;
  const a = n.filter || {}, b = route.filter || {};
  if (!a.saved && !a.category) return !b.saved;                       // "Games": every grid that is not the library (all games, a category, a search, any sort)
  return !!a.saved === !!b.saved && (a.category || '') === (b.category || '');   // the sort is a setting of the page, not a section: "Games" stays on whichever way it is sorted
}

/** The site mark (left) and the account button (right), as buttons; `extra` adds classes (the docked copies get "dock"). No user (not signed in) → no account button, never the text "undefined". */
function markHtml(D, extra = '') {
  const logo = safeUrl(D.site.logo);                                   // site.logo: the site's own logo image; the letter (site.mark) shows until it has loaded, and stays if it never does
  return `<button class="mark${logo ? ' has-img' : ''}${extra}" data-nav="home" aria-label="${esc(D.site.name)} — home"><span>${esc(D.site.mark)}</span>${logo ? `<img src="${esc(logo)}" alt="" decoding="async" draggable="false">` : ''}</button>`;
}
function avatarHtml(D, extra = '') {
  const u = D.site.user, label = esc((u && u.name) || 'Account');
  return !u ? ''
    : u.avatarUrl && safeUrl(u.avatarUrl) ? `<button class="av${extra}" data-user aria-label="${label}"><img src="${esc(safeUrl(u.avatarUrl))}" alt=""></button>`
    : u.initials ? `<button class="av${extra}" data-user aria-label="${label}">${esc(u.initials)}</button>` : '';
}

/** Floating glass pill: sections + search, flanked by two "dock" slots. At the top of the page the slots are empty (the mark and the avatar sit in the page's corners, see cornerHtml); once the page
    is scrolled, copies of them slide in from those corners and stay beside the pill (mount.js sets .docked on the root; styles/30-nav.css animates it). */
export function barHtml(D, route) {
  return `<header class="bar"><span class="dk dk-l" inert>${markHtml(D, ' dock')}</span><nav class="gl pill" aria-label="Sections"><i class="ind" aria-hidden="true"></i>
      ${D.nav.map(n => `<button data-nav-id="${esc(n.id)}"${navActive(n, route) ? ' class="on" aria-current="page"' : ''}>${esc(n.label)}</button>`).join('')}
      <button class="sb" data-search-toggle aria-label="Search" aria-expanded="false">${ic(ICON.search)}</button>
    </nav><span class="dk dk-r" inert>${avatarHtml(D, ' dock')}</span></header>`;
}

/** The corners at the top of the scrolling page: the mark (left) and the account button (right). They scroll away with the page; the docked copies (barHtml) take over. */
export function cornerHtml(D) { return markHtml(D) + `<div class="bar-r">${avatarHtml(D)}</div>`; }

/** Drop-down search field that lives under the pill. */
export function searchHtml() {
  return `<div class="searchbox gl" role="search"><span class="si">${ic(ICON.search, 18)}</span><input type="search" placeholder="Search games, genres, studios…" aria-label="Search games" autocomplete="off" spellcheck="false"><button class="sx" data-search-clear aria-label="Clear search">${ic(ICON.close, 14)}</button></div>`;
}
