import { mount } from './mount.js';
import { validate } from '../shared/schema.js';
import { steam } from './core/art.js';
import { normalize } from './core/data.js';

export const version = '__HEARTH_VERSION__';
/** Capability flags, so userscripts can adapt to the kit they were loaded with. */
export const features = { downloadLoop: true, lazyGrid: true, skeletons: true, loadMore: true, lazyArt: true, addGames: true, noGeneratedArt: true, richDetail: true, profile: true, logoText: true, media: true, steamLink: true, detailPush: true, artDeadline: true, smoothMedia: true, siteLogo: true, sheetMorph: true };
export { mount, validate, steam, normalize };
