import { run } from './run.js';
import { hideOriginal, showOriginal } from './hide.js';
import { watchNavigation } from './navwatch.js';
import { loadFonts, gmImageLoader, FONT_HREF } from './assets.js';

/** HearthGlue: the Tampermonkey side. Normally you only call `run()`. */
export { run, hideOriginal, showOriginal, watchNavigation, loadFonts, gmImageLoader, FONT_HREF };
