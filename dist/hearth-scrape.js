/*! hearth-kit v0.6.0 · HearthScrape · built from src/js/scrape/index.js — DO NOT EDIT, edit src/ and run `npm run build` */
var HearthScrape=(function(){
'use strict';
/* ── src/js/scrape/dom.js ── */
/** Tiny DOM helpers. All tolerate null so scrapers can chain without try/catch. */
function q(sel, root = document) { return root ? root.querySelector(sel) : null; }
function qa(sel, root = document) { return root ? [...root.querySelectorAll(sel)] : []; }

/** Trimmed, whitespace-collapsed text of an element (or of the first match of a selector). */
function text(elOrSel, root = document) {
  const el = typeof elOrSel === 'string' ? q(elOrSel, root) : elOrSel;
  return el ? el.textContent.replace(/\s+/g, ' ').trim() : '';
}

function attr(elOrSel, name, root = document) {
  const el = typeof elOrSel === 'string' ? q(elOrSel, root) : elOrSel;
  return el ? (el.getAttribute(name) || '').trim() : '';
}

/** Absolute URL ('' if it can't be resolved). Always run scraped hrefs/srcs through this. */
function abs(href, base = location.href) {
  if (!href) return '';
  try { return new URL(href, base).href; } catch (e) { return ''; }
}

/** First number in a string: num('1,234.5 GB') → 1234.5 ; null if none. */
function num(s) {
  const m = String(s ?? '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

/** Best image URL from an <img> (handles lazy-loading attributes and srcset). */
function imgUrl(elOrSel, root = document) {
  const el = typeof elOrSel === 'string' ? q(elOrSel, root) : elOrSel;
  if (!el) return '';
  const lazy = ['data-src', 'data-lazy-src', 'data-original', 'data-lazy', 'src'].map(a => el.getAttribute(a)).find(v => v && !/^data:image\/(gif|svg)/.test(v));
  const set = el.getAttribute('srcset') || el.getAttribute('data-srcset');
  if (set) {
    const best = set.split(',').map(s => s.trim().split(/\s+/)).map(([u, d]) => [u, parseFloat(d) || 1]).sort((a, b) => b[1] - a[1])[0];
    if (best && best[0]) return abs(best[0], el.baseURI);
  }
  return abs(lazy, el.baseURI);
}

/** url(...) of an element's inline or computed background-image. */
function bgUrl(el) {
  if (!el) return '';
  const v = el.style.backgroundImage || getComputedStyle(el).backgroundImage || '';
  const m = v.match(/url\(["']?(.*?)["']?\)/);
  return m ? abs(m[1], el.baseURI) : '';
}

/** First non-empty value of: [selector|fn, ...]. Handy for sites with inconsistent markup. */
function first(root, ...picks) {
  for (const p of picks) { const v = typeof p === 'function' ? p(root) : text(p, root); if (v) return v; }
  return '';
}

/* ── src/js/scrape/net.js ── */
/**
 * Network helpers. Uses GM_xmlhttpRequest when the userscript granted it (cross-origin, ignores the
 * page's CSP `connect-src`), otherwise falls back to fetch (same-origin only).
 * Header needed for GM:  // @grant GM_xmlhttpRequest   (+ // @connect <host> for cross-origin hosts)
 */
function gmRequest(url, responseType) {
  return new Promise((resolve, reject) => {
    // eslint-disable-next-line no-undef
    GM_xmlhttpRequest({ method: 'GET', url, responseType, timeout: 20000, onload: r => (r.status >= 200 && r.status < 400 ? resolve(r.response) : reject(new Error(`HTTP ${r.status} for ${url}`))), onerror: () => reject(new Error('Network error for ' + url)), ontimeout: () => reject(new Error('Timeout for ' + url)) });
  });
}
const hasGM = () => typeof GM_xmlhttpRequest === 'function';

async function fetchText(url) {
  if (hasGM()) return gmRequest(url, 'text');
  const r = await fetch(url, { credentials: 'include' });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return r.text();
}

async function fetchJson(url) { return JSON.parse(await fetchText(url)); }

/** Fetch a page and parse it into a detached Document whose baseURI is `url` (so abs(href, doc.baseURI) works). */
async function fetchDoc(url) {
  const html = await fetchText(url);
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const base = doc.createElement('base'); base.href = url; doc.head.prepend(base);
  return doc;
}

/** Run `fn` over `items` with at most `limit` in flight. Failures become `null` results (and are logged), never a thrown batch. */
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length); let i = 0;
  const worker = async () => { while (i < items.length) { const k = i++; try { out[k] = await fn(items[k], k); } catch (e) { console.warn('[hearth] mapLimit item failed', items[k], e); out[k] = null; } } };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/**
 * Infinite-scroll / "load more" helper. Repeatedly scrolls the ORIGINAL page (or `container`) until
 * `count()` stops growing. Needs the original page to be rendered: set `hide: 'visibility'` in glue.run.
 */
async function loadAll(count, { container = document.scrollingElement, max = 40, idleMs = 700 } = {}) {
  let last = -1;
  for (let i = 0; i < max; i++) {
    const n = count();
    if (n === last) break;
    last = n;
    container.scrollTo({ top: container.scrollHeight });
    await new Promise(r => setTimeout(r, idleMs));
  }
  return count();
}

/* ── src/js/scrape/steam.js ── */
/** Steam helpers for scrapers. */

/** Extract an app id from a Steam store/CDN URL or a bare id: 'https://store.steampowered.com/app/1245620/Elden_Ring/' → 1245620 */
function steamAppId(input) {
  if (input == null) return null;
  const s = String(input);
  const m = s.match(/store\.steampowered\.com\/app\/(\d+)/) || s.match(/steam\/apps\/(\d+)/) || s.match(/steamcommunity\.com\/app\/(\d+)/) || s.match(/^\s*(\d{1,9})\s*$/);
  return m ? parseInt(m[1], 10) : null;
}

/* ── src/js/shared/util.js ── */
/** Small helpers shared by the UI, scrape and glue bundles. */

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** HTML-escape any value. EVERY scraped string that reaches innerHTML goes through this. */
function esc(v) { return String(v ?? '').replace(/[&<>"']/g, c => ESC[c]); }

/** Only allow http(s), protocol-relative, blob: and data:image URLs. Anything else (javascript:, file:, relative) becomes ''. */
function safeUrl(u) {
  if (!u) return '';
  u = String(u).trim();
  return /^(https?:)?\/\//i.test(u) || /^blob:/i.test(u) || /^data:image\//i.test(u) ? u : '';
}

function slug(s) {
  return String(s ?? '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

/* ── src/js/shared/schema.js ── */
/**
 * The data contract lives in docs/04-data-contract.md and data/hearth-data.schema.json.
 * This file is the executable version: `coerceGame` makes a scraped record safe to render,
 * `validate` produces a human-readable report for scraper authors.
 */

const str = v => (v == null ? '' : String(v).trim());
const strList = v => (Array.isArray(v) ? v : v == null || v === '' ? [] : [v]).map(str).filter(Boolean);
const kv = o => {
  const out = {};
  if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) if (str(v)) out[str(k)] = str(v);
  return out;
};

const list = v => (Array.isArray(v) ? v : []);
const http = u => /^https?:\/\//i.test(str(u));

/** Media strip items: { type:'image'|'video'|'embed', thumb, src, sources:[{src,type}], stream (a DASH .mpd URL, played with dash.js), page (where to watch it when it cannot play), title }. Items without a usable thumbnail or source are dropped. */
function coerceMedia(v) {
  return list(v).map(m => {
    if (!m || typeof m !== 'object') return null;
    const type = m.type === 'video' || m.type === 'embed' ? m.type : 'image';
    const thumb = http(m.thumb) ? str(m.thumb) : '', src = http(m.src) ? str(m.src) : '';
    const sources = list(m.sources).filter(s => s && http(s.src)).map(s => ({ src: str(s.src), type: str(s.type) }));
    const stream = type === 'video' && http(m.stream) ? str(m.stream) : '';
    if (!thumb || (type === 'image' ? !(src || thumb) : type === 'video' ? !(sources.length || stream) : !src)) return null;
    return { type, thumb, src: src || thumb, sources, ...(stream ? { stream, page: http(m.page) ? str(m.page) : '' } : {}), title: str(m.title) };
  }).filter(Boolean).slice(0, 16);
}

function coerceGame(g) {
  const art = g.art && typeof g.art === 'object' ? g.art : {};
  const appId = parseInt(g.steamAppId, 10);
  const genres = strList(g.genres);
  const year = parseInt(g.releaseYear ?? g.year, 10);
  const req = g.requirements && typeof g.requirements === 'object' ? g.requirements : {};
  return {
    id: str(g.id),
    title: str(g.title),
    steamAppId: Number.isFinite(appId) && appId > 0 ? appId : null,
    art: { poster: str(art.poster), hero: str(art.hero), logo: str(art.logo), header: str(art.header), fallback: str(art.fallback) },
    tagline: str(g.tagline),
    description: str(g.description),
    genres,
    categories: strList(g.categories).length ? strList(g.categories).map(slug) : genres.map(slug),
    developer: str(g.developer),
    publisher: str(g.publisher),
    releaseYear: Number.isFinite(year) ? year : null,
    size: str(g.size),
    rating: str(g.rating),
    requirements: { minimum: kv(req.minimum), recommended: kv(req.recommended) },
    screenshots: strList(g.screenshots),
    similarIds: strList(g.similarIds),
    downloadUrl: str(g.downloadUrl),
    sourceUrl: str(g.sourceUrl),
    steamUrl: http(g.steamUrl) ? str(g.steamUrl) : '',
    media: coerceMedia(g.media),
    // — rich detail (all optional; usually filled lazily through options.resolveDetail) —
    downloads: list(g.downloads).filter(d => d && str(d.label) && http(d.href)).map(d => ({ label: str(d.label), href: str(d.href), kind: str(d.kind), hint: str(d.hint) })),
    password: str(g.password),
    guide: list(g.guide).map(s => ({ title: str(s && s.title), steps: strList(s && s.steps) })).filter(s => s.steps.length),
    update: g.update && typeof g.update === 'object' && (str(g.update.date) || str(g.update.version) || str(g.update.text) || g.update.closed) ? { date: str(g.update.date), version: str(g.update.version), text: str(g.update.text), closed: !!g.update.closed } : null,
    facts: list(g.facts).filter(f => f && str(f.label) && str(f.value)).map(f => ({ label: str(f.label), value: str(f.value) })),
  };
}

/** @returns {{errors:string[], warnings:string[], stats:object}} */
function validate(data) {
  const errors = [], warnings = [];
  if (!data || typeof data !== 'object') return { errors: ['data must be an object'], warnings, stats: {} };
  const games = Array.isArray(data.games) ? data.games : null;
  if (!games) return { errors: ['`games` must be an array'], warnings, stats: {} };
  if (!games.length) warnings.push('`games` is empty — the UI will render an empty state.');

  const ids = new Set();
  games.forEach((g, i) => {
    const at = `games[${i}]${g && g.title ? ` (${g.title})` : ''}`;
    if (!g || typeof g !== 'object') return errors.push(`${at}: must be an object`);
    if (g.id == null || g.id === '') errors.push(`${at}: missing \`id\``);
    else if (ids.has(String(g.id))) errors.push(`${at}: duplicate id "${g.id}"`);
    else ids.add(String(g.id));
    if (!g.title) errors.push(`${at}: missing \`title\``);
    if (!g.steamAppId && !(g.art && (g.art.poster || g.art.hero))) warnings.push(`${at}: no steamAppId and no art overrides — the card will show an empty tile (no artwork)`);
    if (!g.downloadUrl) warnings.push(`${at}: no downloadUrl — "Get" buttons will do nothing unless you set options.onGet`);
    for (const k of ['downloadUrl', 'sourceUrl']) if (g[k] && !/^https?:\/\//i.test(g[k])) errors.push(`${at}: \`${k}\` must be an absolute http(s) URL (got "${g[k]}")`);
  });

  const refs = (list, key, where) => (list || []).forEach((x, i) => {
    const id = key ? x && x[key] : x;
    if (id != null && !ids.has(String(id))) errors.push(`${where}[${i}]: unknown game id "${id}"`);
  });
  refs(data.hero, 'gameId', 'hero');
  refs(data.featured, 'gameId', 'featured');
  (data.shelves || []).forEach((s, i) => {
    if (!s || !s.title) errors.push(`shelves[${i}]: missing \`title\``);
    refs(s && s.gameIds, null, `shelves[${i}].gameIds`);
  });
  if (data.hero && data.hero.length > 8) warnings.push('hero has more than 8 slides — consider fewer.');

  return { errors, warnings, stats: { games: games.length, hero: (data.hero || []).length, shelves: (data.shelves || []).length } };
}

/* ── src/js/scrape/data.js ── */
/** Fill in a scraped record: coerces types, trims, defaults. Use on every game you emit. */
function game(raw) { return coerceGame(raw); }

/** Dedupe by key (first wins). */
function uniqueBy(list, key = x => x.id) { const seen = new Set(); return list.filter(x => { const k = key(x); return seen.has(k) ? false : seen.add(k); }); }

/** Merge two game lists by id; non-empty fields from `b` (e.g. detail-page data) win over `a` (list-page data). */
function mergeGames(a, b) {
  const map = new Map(a.map(g => [String(g.id), g]));
  for (const g of b) {
    const id = String(g.id), old = map.get(id) || {};
    const merged = { ...old };
    for (const [k, v] of Object.entries(g)) {
      const empty = v == null || v === '' || (Array.isArray(v) && !v.length) || (typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length);
      if (!empty) merged[k] = v;
    }
    map.set(id, merged);
  }
  return [...map.values()];
}

/** Validate scraper output and print a readable report. Returns the report. Call it while developing. */
function check(data, label = 'scraped data') {
  const rep = validate(data);
  const head = `[hearth] ${label}: ${rep.stats.games ?? 0} games, ${rep.errors.length} errors, ${rep.warnings.length} warnings`;
  (console.groupCollapsed || console.log).call(console, head);
  rep.errors.forEach(e => console.error('  ✖', e));
  rep.warnings.slice(0, 20).forEach(w => console.warn('  !', w));
  if (rep.warnings.length > 20) console.warn(`  … and ${rep.warnings.length - 20} more warnings`);
  console.groupEnd && console.groupEnd();
  return rep;
}

/* ── src/js/shared/wait.js ── */
/**
 * Resolve when `target` is truthy.
 *   target: CSS selector string, or a function returning a truthy value (sync or async).
 * Rejects after `timeout` ms. Uses a MutationObserver plus a slow interval as a safety net,
 * so it also works for conditions that are not DOM-mutation driven.
 */
function waitFor(target, { timeout = 10000, root = document, interval = 250 } = {}) {
  const probe = typeof target === 'function' ? target : () => root.querySelector(target);
  return new Promise((resolve, reject) => {
    let done = false, mo, iv, to;
    const finish = (fn, v) => { if (done) return; done = true; mo && mo.disconnect(); clearInterval(iv); clearTimeout(to); fn(v); };
    const check = async () => { try { const v = await probe(); if (v) finish(resolve, v); } catch (e) { /* keep waiting */ } };
    check();
    if (done) return;
    mo = new MutationObserver(check);
    mo.observe(root.documentElement || root, { childList: true, subtree: true, attributes: true });
    iv = setInterval(check, interval);
    to = setTimeout(() => finish(reject, new Error('waitFor timed out: ' + (typeof target === 'string' ? target : 'custom condition'))), timeout);
  });
}

/* ── src/js/scrape/index.js ── */
/** HearthScrape: helpers for the site-specific `scrape()` function. See docs/06-adaptation-playbook.md. */

return {q, qa, text, attr, abs, num, imgUrl, bgUrl, first, fetchText, fetchJson, fetchDoc, mapLimit, loadAll, steamAppId, game, uniqueBy, mergeGames, check, validate, waitFor, slug, delay};
})();
if(typeof window!=='undefined')window.HearthScrape=HearthScrape;
