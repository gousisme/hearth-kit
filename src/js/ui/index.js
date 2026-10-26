import { mount } from './mount.js';
import { validate } from '../shared/schema.js';
import { steam, logoSlot, layer } from './core/art.js';
import { normalize } from './core/data.js';
import { getBox, guideHtml, actsHtml, factsHtml } from './components/detail.js';
import { morphInto } from './core/morph.js';
import { ic, icf, ICON, LOGO } from './core/icons.js';

export const version = '__HEARTH_VERSION__';
/** Capability flags, so userscripts can adapt to the kit they were loaded with. */
export const features = { downloadLoop: true, lazyGrid: true, skeletons: true, loadMore: true, lazyArt: true, addGames: true, noGeneratedArt: true, richDetail: true, profile: true, logoText: true, media: true, steamLink: true, detailPush: true, artDeadline: true, smoothMedia: true, siteLogo: true, sheetMorph: true, parts: true };
export { mount, validate, steam, normalize };
/** The sheet's own building blocks, for pages a userscript draws next to the sheet (so they look exactly like it and never re-implement it). */
export const parts = { getBox, guideHtml, actsHtml, factsHtml, logoSlot, layer, morphInto, ic, icf, ICON, LOGO };
