// Draws the BRT Konduktor launcher icons into the Android project: a yellow bus tile on navy.
// Run from the repository root:  node mobile/konduktor/scripts/make-icons.mjs
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const res = join(dirname(fileURLToPath(import.meta.url)), '..', 'android', 'app', 'src', 'main', 'res');

const NAVY = '#0f172a';
const YELLOW = '#facc15';
const BUS = `<g fill="none" stroke="${NAVY}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" transform="translate(-12 -12)">
  <path d="M8 6v6"/><path d="M15 6v6"/><path d="M2 12h19.6"/>
  <path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"/>
  <circle cx="7" cy="18" r="2"/><path d="M9 18h5"/><circle cx="16" cy="18" r="2"/></g>`;

/** A full icon: navy square, yellow tile, bus. `radius` rounds the outer shape (the round icon is a circle). */
const full = (radius) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192">
  <rect width="192" height="192" rx="${radius}" fill="${NAVY}"/>
  <rect x="36" y="36" width="120" height="120" rx="30" fill="${YELLOW}"/>
  <g transform="translate(96 96) scale(3.6)">${BUS}</g></svg>`;

/** The adaptive foreground: the tile and bus inside the 66% safe zone, on a transparent canvas (the background is navy). */
const foreground = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108">
  <rect x="27" y="27" width="54" height="54" rx="14" fill="${YELLOW}"/>
  <g transform="translate(54 54) scale(1.62)">${BUS}</g></svg>`;

const densities = { mdpi: [48, 108], hdpi: [72, 162], xhdpi: [96, 216], xxhdpi: [144, 324], xxxhdpi: [192, 432] };
for (const [name, [icon, fg]] of Object.entries(densities)) {
  const dir = join(res, `mipmap-${name}`);
  await sharp(Buffer.from(full(36))).resize(icon, icon).png().toFile(join(dir, 'ic_launcher.png'));
  await sharp(Buffer.from(full(96))).resize(icon, icon).png().toFile(join(dir, 'ic_launcher_round.png'));
  await sharp(Buffer.from(foreground)).resize(fg, fg).png().toFile(join(dir, 'ic_launcher_foreground.png'));
}
writeFileSync(
  join(res, 'values', 'ic_launcher_background.xml'),
  `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${NAVY}</color>\n</resources>\n`,
);
console.log('launcher icons written');
