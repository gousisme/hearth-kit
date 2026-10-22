#!/usr/bin/env node
/** Static server for local dev. `npm run serve` → http://localhost:5173/ (fixture) and /repo/… (whole repo). SPA fallback for the fixture. */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = +process.env.PORT || 5173;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const path = decodeURIComponent(url.pathname);
  const file = path.startsWith('/repo/') ? join(ROOT, path.slice(6)) : join(ROOT, 'fixtures/example-site', path === '/' ? 'index.html' : path);
  const safe = resolve(file).startsWith(ROOT);
  try {
    if (!safe) throw new Error('outside root');
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'access-control-allow-origin': '*', 'cache-control': 'no-store' }).end(body);
  } catch {
    if (!path.startsWith('/repo/')) return readFile(join(ROOT, 'fixtures/example-site/index.html')).then(b => res.writeHead(200, { 'content-type': 'text/html' }).end(b));
    res.writeHead(404).end('not found');
  }
}).listen(PORT, () => console.log(`fixture site: http://localhost:${PORT}/   repo files: http://localhost:${PORT}/repo/dist/hearth.css`));
