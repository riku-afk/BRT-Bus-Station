// Regenerates the PWA icons in public/icons from one SVG. Run: node scripts/make-icons.mjs
import sharp from 'sharp';

const svg = (inset) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#0f3d3e"/>
  <g transform="translate(256 256) scale(${inset}) translate(-256 -256)" fill="none" stroke="#ffffff" stroke-width="28" stroke-linecap="round" stroke-linejoin="round">
    <rect x="96" y="120" width="320" height="236" rx="38"/>
    <path d="M96 252h320"/>
    <path d="M148 356v40M364 356v40"/>
    <circle cx="164" cy="304" r="4" fill="#ffffff"/>
    <circle cx="348" cy="304" r="4" fill="#ffffff"/>
  </g>
</svg>`;

for (const [name, size, inset] of [['icon-192.png', 192, 1], ['icon-512.png', 512, 1], ['icon-maskable-512.png', 512, 0.72], ['apple-touch-icon.png', 180, 0.86]]) {
  await sharp(Buffer.from(svg(inset))).resize(size, size).png().toFile(`public/icons/${name}`);
}
console.log('icons written');
