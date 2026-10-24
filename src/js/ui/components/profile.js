import { esc, safeUrl } from '../../shared/util.js';
import { ic, ICON } from '../core/icons.js';

const LINK_ICON = { profile: ICON.user, bookmarks: ICON.bookmark, logout: ICON.logout };
const rows = a => (Array.isArray(a) ? a : []).filter(x => x && x.label && x.value != null && String(x.value).trim() !== '');

/**
 * The account sheet that the avatar opens (rendered into the same modal as the game sheet).
 *   u = D.site.user  { name, avatarUrl, initials, href }          (always there: this is what is known at once)
 *   p = options.resolveProfile(u) result, or null while it is loading / when there is none:
 *       { name, avatarUrl, badge, stats:[{label,value}], facts:[{label,value}], links:[{label,href,hint,kind:'profile'|'bookmarks'|'logout'}] }
 */
export function profileHtml(u, p, { pending = false } = {}) {
  p = p || {};
  const name = p.name || u.name || 'Account', av = safeUrl(p.avatarUrl || u.avatarUrl);
  const stats = rows(p.stats), facts = rows(p.facts);
  const links = (Array.isArray(p.links) ? p.links : []).filter(l => l && l.label && safeUrl(l.href));
  if (!links.length && !pending && safeUrl(u.href)) links.push({ label: 'Open your profile on the site', href: u.href, kind: 'profile' });
  const sk = '<div class="facts psk"><div><i></i></div><div><i></i></div><div><i></i></div></div>';
  return `<button class="x" data-close aria-label="Close">${ic(ICON.close, 16)}</button>
  <div class="ph">${av ? `<img class="ph-bg" src="${esc(av)}" alt="" aria-hidden="true">` : ''}
    <div class="pav">${av ? `<img src="${esc(av)}" alt="">` : esc(u.initials || name.slice(0, 2).toUpperCase())}</div>
    <div class="pm"><h3>${esc(name)}</h3>${p.badge ? `<span class="pbadge">${esc(p.badge)}</span>` : ''}</div></div>
  <div class="pb">
    ${stats.length ? `<div class="pstats">${stats.map(s => `<div><b>${esc(s.value)}</b><span>${esc(s.label)}</span></div>`).join('')}</div>` : ''}
    ${facts.length ? `<div class="facts">${facts.map(f => `<div><span>${esc(f.label)}</span>${esc(f.value)}</div>`).join('')}</div>` : pending ? sk : ''}
    ${links.length ? `<div class="plinks">${links.map(l => `<a class="dl${l.kind === 'logout' ? ' out' : ''}" href="${esc(safeUrl(l.href))}" target="_blank" rel="noopener noreferrer"><span class="di">${ic(LINK_ICON[l.kind] || ICON.ext, 17)}</span><span class="dt"><b>${esc(l.label)}</b>${l.hint ? `<small>${esc(l.hint)}</small>` : ''}</span><span class="da">${ic(ICON.ext, 15)}</span></a>`).join('')}</div>` : ''}
  </div>`;
}
