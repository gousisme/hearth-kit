#!/usr/bin/env node
/** Validate a data-contract JSON file:  npm run validate -- path/to/data.json   (default: data/sample.json) */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validate } from '../src/js/shared/schema.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const file = process.argv[2] ? resolve(process.argv[2]) : resolve(root, 'data/sample.json');
const rep = validate(JSON.parse(readFileSync(file, 'utf8')));
console.log(`${file}\n${JSON.stringify(rep.stats)}`);
rep.errors.forEach(e => console.log('  ERROR  ', e));
rep.warnings.forEach(w => console.log('  warning', w));
console.log(rep.errors.length ? `\n✖ ${rep.errors.length} error(s)` : '\n✔ valid');
process.exit(rep.errors.length ? 1 : 0);
