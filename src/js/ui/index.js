import { mount } from './mount.js';
import { validate } from '../shared/schema.js';
import { steam } from './core/art.js';
import { normalize } from './core/data.js';

export const version = '__HEARTH_VERSION__';
/** Capability flags, so userscripts can adapt to the kit they were loaded with. */
export const features = { lazyGrid: true };
export { mount, validate, steam, normalize };
