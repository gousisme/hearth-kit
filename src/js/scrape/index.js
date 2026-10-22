import { q, qa, text, attr, abs, num, imgUrl, bgUrl, first } from './dom.js';
import { fetchText, fetchJson, fetchDoc, mapLimit, loadAll } from './net.js';
import { steamAppId } from './steam.js';
import { game, uniqueBy, mergeGames, check } from './data.js';
import { waitFor } from '../shared/wait.js';
import { slug, delay } from '../shared/util.js';
import { validate } from '../shared/schema.js';

/** HearthScrape: helpers for the site-specific `scrape()` function. See docs/06-adaptation-playbook.md. */
export { q, qa, text, attr, abs, num, imgUrl, bgUrl, first, fetchText, fetchJson, fetchDoc, mapLimit, loadAll, steamAppId, game, uniqueBy, mergeGames, check, validate, waitFor, slug, delay };
