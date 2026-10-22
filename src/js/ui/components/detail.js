import { esc, safeUrl } from '../../shared/util.js';
import { layer, artImg, keyArt, candidates } from '../core/art.js';
import { ic, ICON } from '../core/icons.js';
import { similar } from '../core/data.js';
import { button } from './button.js';

const DEMO_REQ = { minimum: { OS: 'Windows 10', CPU: 'Core i5-8400', RAM: '8 GB' }, recommended: { OS: 'Windows 11', CPU: 'Core i7-8700K', RAM: '16 GB' } };

/** Game detail sheet (rendered into the modal). Sections with no data are omitted. */
export function detailHtml(D, g, { saved = false, placeholders = false } = {}) {
  const req = (g.requirements.minimum && Object.keys(g.requirements.minimum).length) || Object.keys(g.requirements.recommended).length ? g.requirements : placeholders ? DEMO_REQ : null;
  const reqBox = (title, o) => (o && Object.keys(o).length ? `<div><b>${title}</b>${Object.entries(o).map(([k, v]) => `${esc(k)}: ${esc(v)}`).join('<br>')}</div>` : '');
  const shots = g.screenshots.map(safeUrl).filter(Boolean);
  const shotsHtml = shots.length
    ? shots.slice(0, 6).map(u => `<div><img src="${esc(u)}" alt="" loading="lazy"></div>`).join('')
    : placeholders ? [1, 2, 3].map(i => `<div>${keyArt({ ...g, hue: (g.hue ?? 0) + i * 9 }, 320, 180, 's' + i)}</div>`).join('') : '';
  const facts = [['Developer', g.developer], ['Publisher', g.publisher], ['Released', g.releaseYear], ['Reception', g.rating], ['Genre', g.genres[0]], ['Size', g.size]].filter(([, v]) => v);
  const sim = similar(D, g);
  return `<button class="x" data-close aria-label="Close">${ic(ICON.close, 16)}</button>
  <div class="dh">${layer(g, 'hero', 1600, 800, 'd')}${artImg(g, 'logo', 'logo') || `<div class="fbt">${esc(g.title)}</div>`}</div>
  <div class="db"><div>
    ${g.description ? `<h4>About</h4><p>${esc(g.description)}</p>` : ''}
    ${shotsHtml ? `<h4>Screenshots</h4><div class="shots">${shotsHtml}</div>` : ''}
    ${req ? `<h4>System requirements</h4><div class="req">${reqBox('Minimum', req.minimum)}${reqBox('Recommended', req.recommended)}</div>` : ''}
  </div>
  <aside class="side">${button('Get game' + (g.size ? ' · ' + g.size : ''), { attrs: `data-get="${esc(g.id)}"`, cls: 'w' })}
    <button class="btn glass alt${saved ? ' on' : ''}" data-wish="${esc(g.id)}">${ic(ICON.heart)}<span>${saved ? 'Saved' : 'Save for later'}</span></button>
    ${facts.length ? `<div class="facts">${facts.map(([k, v]) => `<div><span>${k}</span>${esc(v)}</div>`).join('')}</div>` : ''}
    ${sim.length ? `<h4 class="sh4">Similar</h4>${sim.map(x => `<div class="sim" tabindex="0" role="button" data-open="${esc(x.id)}"><div class="sa">${keyArt(x, 230, 108, 'm')}${artImg(x, 'header')}</div>${esc(x.title)}</div>`).join('')}` : ''}
  </aside></div>`;
}
