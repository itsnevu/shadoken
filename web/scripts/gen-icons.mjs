// ============================================================================
// Shadoken — PWA icon generator.
//
// Renders a bold shuriken / ninja emblem (molten-red on dark charcoal) to the
// PNG icons referenced by public/manifest.webmanifest:
//
//   public/icons/icon-192.png            192x192  (any)
//   public/icons/icon-512.png            512x512  (any)
//   public/icons/apple-touch-icon-180.png 180x180 (iOS home screen)
//   public/icons/icon-512-maskable.png   512x512  (maskable, emblem in the
//                                                   center ~72% safe zone)
//
// Run from web/:  node scripts/gen-icons.mjs
// ============================================================================

import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ICONS_DIR = join(__dirname, '..', 'public', 'icons');

const BG = '#16191d';
const RED = '#e23b2e';
const RED_BRIGHT = '#ff5a3c';

/**
 * Build the emblem SVG for a square canvas of `size` px.
 * `scale` (0..1) is the fraction of the canvas the emblem spans — smaller for
 * maskable icons so the star sits fully inside the safe zone.
 * `rounded` draws a rounded-rect plate; maskable uses a full-bleed background.
 */
function emblemSvg({ size, scale, rounded }) {
  const c = size / 2;
  // Outer radius of the blades, in px from center.
  const r = (size * scale) / 2;
  const inner = r * 0.27; // waist of each blade
  const hub = r * 0.25; // dark central hub
  const hubDot = r * 0.1;

  // Four-point star polygon (points up), centered at origin.
  const star = [
    [0, -r],
    [inner, -inner],
    [r, 0],
    [inner, inner],
    [0, r],
    [-inner, inner],
    [-r, 0],
    [-inner, -inner],
  ]
    .map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`)
    .join(' L ');
  const starPath = `M ${star} Z`;

  const plate = rounded
    ? `<rect width="${size}" height="${size}" rx="${size * 0.22}" fill="${BG}"/>`
    : `<rect width="${size}" height="${size}" fill="${BG}"/>`;

  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <defs>
        <radialGradient id="glow" cx="50%" cy="42%" r="65%">
          <stop offset="0%" stop-color="${RED_BRIGHT}"/>
          <stop offset="100%" stop-color="${RED}"/>
        </radialGradient>
      </defs>
      ${plate}
      <g transform="translate(${c} ${c})">
        <g fill="url(#glow)">
          <path d="${starPath}"/>
          <path d="${starPath}" transform="rotate(45)" opacity="0.9"/>
        </g>
        <circle r="${hub.toFixed(2)}" fill="${BG}"/>
        <circle r="${hubDot.toFixed(2)}" fill="${RED}"/>
      </g>
    </svg>`,
    'utf8',
  );
}

async function render({ size, scale, rounded, file }) {
  const svg = emblemSvg({ size, scale, rounded });
  const out = join(ICONS_DIR, file);
  // Render the SVG at high density for crisp edges, then downscale to the
  // exact target dimensions.
  await sharp(svg, { density: 384 })
    .resize(size, size, { fit: 'cover' })
    .png({ compressionLevel: 9 })
    .toFile(out);
  return file;
}

async function main() {
  await mkdir(ICONS_DIR, { recursive: true });

  const jobs = [
    { size: 192, scale: 0.78, rounded: true, file: 'icon-192.png' },
    { size: 512, scale: 0.78, rounded: true, file: 'icon-512.png' },
    { size: 180, scale: 0.78, rounded: true, file: 'apple-touch-icon-180.png' },
    // Maskable: emblem inside the ~72% safe zone, full-bleed dark background.
    { size: 512, scale: 0.56, rounded: false, file: 'icon-512-maskable.png' },
  ];

  for (const job of jobs) {
    const name = await render(job);
    console.log(`  ✓ ${name}  (${job.size}x${job.size})`);
  }
  console.log('Icons written to public/icons/');
}

main().catch((err) => {
  console.error('gen-icons failed:', err);
  process.exit(1);
});
