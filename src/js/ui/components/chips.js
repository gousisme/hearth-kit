import { esc } from '../../shared/util.js';

/** Category pills. `active` is a category id, or '' for "All". */
export function chipsHtml(categories, active = '') {
  if (!categories.length) return '';
  const chip = (id, label) => `<button class="chip${id === active ? ' on' : ''}" data-cat="${esc(id)}" aria-pressed="${id === active}">${esc(label)}</button>`;
  return `<div class="chips" role="group" aria-label="Categories">${chip('', 'All')}${categories.map(c => chip(c.id, c.label)).join('')}</div>`;
}
