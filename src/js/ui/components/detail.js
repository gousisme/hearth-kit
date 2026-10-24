import { esc, safeUrl } from '../../shared/util.js';
import { layer, artImg, logoSlot } from '../core/art.js';
import { ic, icf, ICON, LOGO } from '../core/icons.js';
import { similar } from '../core/data.js';
import { button } from './button.js';
import { mediaHtml } from './media.js';

const DEMO_REQ = { minimum: { OS: 'Windows 10', CPU: 'Core i5-8400', RAM: '8 GB' }, recommended: { OS: 'Windows 11', CPU: 'Core i7-8700K', RAM: '16 GB' } };
const KIND_ICON = { hosters: ICON.cloud, drive: ICON.drive, fix: ICON.fix, torrent: ICON.torrent };
/** "1.5.1.2608" → "v1.5.1.2608", but "Build 16102" stays as it is (never "vBuild 16102"). */
const verLabel = v => (/^v?\d/i.test(v) ? 'v' + v.replace(/^v/i, '') : v);

/** The download list that opens directly under the Get button (one card, not a floating menu). */
function getBox(g, { pending, dlOpen }) {
  const dl = g.downloads, expandable = dl.length > 1 || pending;
  const label = 'Get game' + (g.size ? ' · ' + g.size : '');
  if (!expandable) return button(label, { attrs: `data-get="${esc(g.id)}"`, cls: 'w' });
  const rows = pending && !dl.length
    ? [1, 2, 3].map(() => '<div class="dl sk"><span class="di"></span><span class="dt"><i></i><i></i></span></div>').join('')
    : dl.map(d => `<a class="dl" href="${esc(safeUrl(d.href))}" target="_blank" rel="noopener noreferrer"><span class="di">${ic(KIND_ICON[d.kind] || ICON.download, 17)}</span><span class="dt"><b>${esc(d.label)}</b>${d.hint ? `<small>${esc(d.hint)}</small>` : ''}</span><span class="da">${ic(ICON.ext, 15)}</span></a>`).join('');
  const pw = g.password ? `<div class="pw"><span>Archive password</span><code>${esc(g.password)}</code><button type="button" data-copy="${esc(g.password)}" aria-label="Copy password">${ic(ICON.copy, 14)}<em>Copy</em></button></div>` : '';
  return `<div class="getbox${dlOpen ? ' open' : ''}">${button(label, { icon: ICON.chev, attrs: `data-get="${esc(g.id)}" aria-expanded="${dlOpen ? 'true' : 'false'}"`, cls: 'w' })}<div class="dlp"><div class="dli"><div class="dlin">${rows}${pw}</div></div></div></div>`;
}

/** "How to connect": install / launch / join / host, as numbered cards. Skeleton lines while it is being fetched. */
function guideHtml(g, pending) {
  if (!g.guide.length) return pending ? '<h4>How to connect</h4><div class="guide"><section class="gsec sk"><i></i><i></i><i></i></section><section class="gsec sk"><i></i><i></i></section></div>' : '';
  return `<h4>How to connect</h4><div class="guide">${g.guide.map(s => `<section class="gsec">${s.title ? `<h5>${esc(s.title)}</h5>` : ''}<ol>${s.steps.map(t => `<li><span>${esc(t)}</span></li>`).join('')}</ol></section>`).join('')}</div>`;
}

/** Save-for-later, plus an "Open Steam" button when the game has a Steam page (Save then shrinks to a round heart button).
 *  With a known app id the button uses steam://store/<id>, which asks the browser to open the Steam client itself; otherwise it falls back to the page link. */
function actsHtml(g, saved) {
  const web = safeUrl(g.steamUrl), app = /^\d+$/.test(String(g.steamAppId || '')) ? String(g.steamAppId) : '';
  const href = app ? `steam://store/${app}` : web;
  const off = href ? 'Save' : 'Save for later';
  const wish = `<button class="btn glass alt wish${saved ? ' on' : ''}" data-wish="${esc(g.id)}" data-off="${off}" aria-label="${saved ? 'Saved' : 'Save for later'}" title="${saved ? 'Saved' : 'Save for later'}">${ic(ICON.heart, 20)}${href ? '' : `<span>${saved ? 'Saved' : off}</span>`}</button>`;
  if (!href) return wish;
  const ext = app ? '' : ' target="_blank" rel="noopener noreferrer"';
  return `<div class="acts">${wish}<a class="btn glass alt steam" href="${esc(href)}"${ext}>${icf(LOGO.steam, 20)}<span>Open in Steam</span></a></div>`;
}

/** Game detail sheet (rendered into the modal). Sections with no data are omitted. */
export function detailHtml(D, g, { saved = false, placeholders = false, pending = false, dlOpen = false } = {}) {
  const req = (g.requirements.minimum && Object.keys(g.requirements.minimum).length) || Object.keys(g.requirements.recommended).length ? g.requirements : placeholders ? DEMO_REQ : null;
  const reqBox = (title, o) => (o && Object.keys(o).length ? `<div><b>${title}</b>${Object.entries(o).map(([k, v]) => `${esc(k)}: ${esc(v)}`).join('<br>')}</div>` : '');
  const shots = g.screenshots.map(safeUrl).filter(Boolean);
  const shotsHtml = shots.length
    ? shots.slice(0, 6).map(u => `<div><img src="${esc(u)}" alt="" loading="lazy" decoding="async"></div>`).join('')
    : '';
  // base facts, in a fixed order; an entry in g.facts with the same label replaces the base value, the rest are appended
  const base = [['Developer', g.developer], ['Publisher', g.publisher], ['Released', g.releaseYear], ['Reception', g.rating], ['Genre', g.genres[0]], ['Size', g.size]];
  const extra = g.facts || [];
  const facts = [...base.map(([k, v]) => [k, (extra.find(f => f.label === k) || {}).value || v]), ...extra.filter(f => !base.some(([k]) => k === f.label)).map(f => [f.label, f.value])].filter(([, v]) => v);
  const upd = g.update ? `<div class="upd">${g.update.version ? `<span class="v">${esc(verLabel(g.update.version))}</span>` : ''}<div><b>${g.update.date ? 'Updated ' + esc(g.update.date) : 'Latest update'}</b>${g.update.text ? `<span>${esc(g.update.text)}</span>` : ''}</div></div>` : '';
  const sim = similar(D, g);
  return `<button class="x" data-close aria-label="Close">${ic(ICON.close, 16)}</button>
  <div class="dh">${layer(g, 'hero')}${logoSlot(g)}</div>
  <div class="db"><div>
    ${mediaHtml(g, { pending })}
    ${g.description ? `<h4>About</h4><p>${esc(g.description)}</p>` : ''}
    ${upd}
    ${guideHtml(g, pending)}
    ${shotsHtml ? `<h4>Screenshots</h4><div class="shots">${shotsHtml}</div>` : ''}
    ${req ? `<h4>System requirements</h4><div class="req">${reqBox('Minimum', req.minimum)}${reqBox('Recommended', req.recommended)}</div>` : ''}
  </div>
  <aside class="side">${getBox(g, { pending, dlOpen })}
    ${actsHtml(g, saved)}
    ${facts.length ? `<div class="facts">${facts.map(([k, v]) => `<div><span>${esc(k)}</span>${esc(v)}</div>`).join('')}</div>` : ''}
    ${sim.length ? `<h4 class="sh4">Similar</h4>${sim.map(x => `<div class="sim" tabindex="0" role="button" data-open="${esc(x.id)}"><div class="sa is-skel">${artImg(x, 'header')}</div>${esc(x.title)}</div>`).join('')}` : ''}
  </aside></div>`;
}
