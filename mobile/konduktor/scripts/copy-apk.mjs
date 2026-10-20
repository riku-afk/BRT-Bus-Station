// Copies the built APK to dist/BRT-Konduktor-<version>[-debug].apk, so the file to hand out has a clear name.
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const out = join(root, 'android', 'app', 'build', 'outputs', 'apk');
const candidates = [
  [join(out, 'release', 'app-release.apk'), `BRT-Konduktor-${version}.apk`],
  [join(out, 'debug', 'app-debug.apk'), `BRT-Konduktor-${version}-debug.apk`],
];
mkdirSync(join(root, 'dist'), { recursive: true });
let copied = 0;
for (const [from, name] of candidates) {
  if (!existsSync(from)) continue;
  copyFileSync(from, join(root, 'dist', name));
  console.log(`dist/${name}`);
  copied++;
}
if (copied === 0) {
  console.error('No APK found: run npm run build:debug or npm run build:release first.');
  process.exit(1);
}
