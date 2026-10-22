#!/usr/bin/env node
/**
 * Zero-dependency build. No npm install needed.
 *
 *  src/styles/*.css (sorted by filename)  ->  dist/hearth.css
 *  src/js/ui/index.js                     ->  dist/hearth-ui.js      (global HearthUI)
 *  src/js/scrape/index.js                 ->  dist/hearth-scrape.js  (global HearthScrape)
 *  src/js/glue/index.js                   ->  dist/hearth-glue.js    (global HearthGlue)
 *  data/sample.json                       ->  mockup/sample-data.js  (window.HEARTH_SAMPLE)
 *
 * The JS "bundler" is intentionally tiny. It understands a restricted ES-module subset so the
 * source stays plain, readable modules:
 *   - `import { a, b } from './x.js';`      (named imports only, no aliasing, no `* as`)
 *   - `export function|async function|const|let|class name ...`  and  `export { a, b };`
 *   - NO default exports, NO dynamic import()
 *   - Top-level declarations must start at column 0 and be unique across ALL modules in a bundle
 *     (everything ends up in one IIFE scope; the build fails loudly on a collision).
 * If you outgrow this, swap in esbuild: entry points and global names are listed in ENTRIES below.
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync, watch } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const p = (...a) => join(ROOT, ...a);
const pkg = JSON.parse(readFileSync(p('package.json'), 'utf8'));

const ENTRIES = [
  { entry: 'src/js/ui/index.js', out: 'dist/hearth-ui.js', global: 'HearthUI' },
  { entry: 'src/js/scrape/index.js', out: 'dist/hearth-scrape.js', global: 'HearthScrape' },
  { entry: 'src/js/glue/index.js', out: 'dist/hearth-glue.js', global: 'HearthGlue' },
];

const IMPORT_RE = /^import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"];?[ \t]*$/gm;
const EXPORT_LIST_RE = /^export\s*\{([^}]*)\};?[ \t]*$/gm;
const EXPORT_DECL_RE = /^export\s+((?:async\s+)?function\*?|const|let|class)\s+/gm;
const TOP_DECL_RE = /^(?:async\s+)?(?:function\*?|const|let|class)\s+([A-Za-z_$][\w$]*)/gm;

function collect(entryFile) {
  const order = [], seen = new Set();
  (function visit(file) {
    if (seen.has(file)) return;
    seen.add(file);
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(IMPORT_RE)) {
      if (/\bas\b/.test(m[1])) throw new Error(`${relative(ROOT, file)}: import aliasing (\`as\`) is not supported: ${m[0]}`);
      visit(resolve(dirname(file), m[2]));
    }
    order.push(file);
  })(entryFile);
  return order;
}

function bundle({ entry, out, global }) {
  const files = collect(p(entry));
  const declared = new Map();
  let body = '';
  let entryExports = [];
  for (const file of files) {
    let src = readFileSync(file, 'utf8');
    const rel = relative(ROOT, file);
    const exported = [];
    src = src.replace(IMPORT_RE, '');
    src = src.replace(EXPORT_LIST_RE, (_, list) => { exported.push(...list.split(',').map(s => s.trim()).filter(Boolean)); return ''; });
    src = src.replace(EXPORT_DECL_RE, (_, kw) => kw + ' ');
    for (const m of src.matchAll(TOP_DECL_RE)) {
      if (declared.has(m[1])) throw new Error(`Duplicate top-level name "${m[1]}" in ${rel} (already declared in ${declared.get(m[1])}). Rename one.`);
      declared.set(m[1], rel);
    }
    // names exported via `export const/function` were rewritten above; recover them from the original text
    const orig = readFileSync(file, 'utf8');
    for (const m of orig.matchAll(/^export\s+(?:async\s+)?(?:function\*?|const|let|class)\s+([A-Za-z_$][\w$]*)/gm)) exported.push(m[1]);
    if (file === p(entry)) entryExports = exported;
    body += `\n/* ── ${rel} ── */\n${src.trim()}\n`;
  }
  const banner = `/*! hearth-kit v${pkg.version} · ${global} · built from ${entry} — DO NOT EDIT, edit src/ and run \`npm run build\` */\n`;
  const code = `${banner}var ${global}=(function(){\n'use strict';${body}\nreturn {${[...new Set(entryExports)].join(', ')}};\n})();\n` +
    `if(typeof window!=='undefined')window.${global}=${global};\n`;
  mkdirSync(dirname(p(out)), { recursive: true });
  writeFileSync(p(out), code.replaceAll('__HEARTH_VERSION__', pkg.version));
  console.log(`✔ ${out}  (${files.length} modules, ${(code.length / 1024).toFixed(1)} KB)`);
}

function css() {
  const dir = p('src/styles');
  const files = readdirSync(dir).filter(f => f.endsWith('.css')).sort();
  const out = `/*! hearth-kit v${pkg.version} — DO NOT EDIT, edit src/styles/ and run \`npm run build\` */\n` +
    files.map(f => `\n/* ── src/styles/${f} ── */\n${readFileSync(join(dir, f), 'utf8').trim()}\n`).join('');
  writeFileSync(p('dist/hearth.css'), out);
  console.log(`✔ dist/hearth.css  (${files.length} files, ${(out.length / 1024).toFixed(1)} KB)`);
}

function sample() {
  try {
    const json = JSON.parse(readFileSync(p('data/sample.json'), 'utf8'));
    writeFileSync(p('mockup/sample-data.js'), `/* generated from data/sample.json by scripts/build.mjs */\nwindow.HEARTH_SAMPLE=${JSON.stringify(json)};\n`);
    console.log('✔ mockup/sample-data.js');
  } catch (e) { console.warn('! sample data skipped:', e.message); }
}

function all() { css(); ENTRIES.forEach(bundle); sample(); }

try { all(); } catch (e) { console.error('✖ build failed:', e.message); process.exit(1); }
if (process.argv.includes('--watch')) {
  let t;
  for (const d of ['src', 'data']) watch(p(d), { recursive: true }, () => { clearTimeout(t); t = setTimeout(() => { try { all(); } catch (e) { console.error('✖', e.message); } }, 80); });
  console.log('watching src/ and data/ …');
}
