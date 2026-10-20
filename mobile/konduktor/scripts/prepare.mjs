// Writes www/index.html (the page shown when BRT cannot be reached) with the real BRT address in its Try again button.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const url = (process.env.BRT_APP_URL ?? 'http://10.10.0.4:3000').replace(/\/+$/, '');
mkdirSync(join(root, 'www'), { recursive: true });
writeFileSync(join(root, 'www', 'index.html'), readFileSync(join(root, 'template', 'offline.html'), 'utf8').replaceAll('__BRT_URL__', url));
console.log(`BRT address: ${url}`);
