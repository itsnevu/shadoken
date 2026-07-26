// ============================================================================
// Shadoken — brand asset generator.
//
// Single source of truth: ../../Assets/shadoken.png (square artwork). Every
// derived asset is rendered from it so the logo, PWA icons and favicon can
// never drift apart:
//
//   public/logo.png                      768x768  (landing hero)
//   public/favicon.png                    64x64   (browser tab)
//   public/icons/icon-192.png            192x192  (any)
//   public/icons/icon-512.png            512x512  (any)
//   public/icons/apple-touch-icon-180.png 180x180 (iOS home screen)
//   public/icons/icon-512-maskable.png   512x512  (maskable, artwork inside
//                                                   the ~72% safe zone)
//
// Run from web/:  node scripts/gen-icons.mjs
// ============================================================================

import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, '..', 'public');
const ICONS_DIR = join(PUBLIC_DIR, 'icons');
const SOURCE = join(__dirname, '..', '..', 'Assets', 'shadoken.png');

// Backdrop for padded/maskable icons — sampled from the artwork's own lime
// field so the maskable safe-zone padding is invisible.
const BG = { r: 211, g: 246, b: 12, alpha: 1 };

/**
 * Render the source artwork to `size`, optionally inset so it survives a
 * maskable crop. `inset` is the fraction of the canvas the artwork spans.
 */
async function render({ size, inset = 1, out }) {
  const art = Math.round(size * inset);
  let pipeline = sharp(SOURCE).resize(art, art, { fit: 'contain', background: BG });

  if (art !== size) {
    const pad = Math.round((size - art) / 2);
    pipeline = pipeline.extend({ top: pad, bottom: pad, left: pad, right: pad, background: BG });
  }

  await pipeline.png({ compressionLevel: 9 }).toFile(out);
  return out;
}

async function main() {
  await mkdir(ICONS_DIR, { recursive: true });

  const jobs = [
    { size: 768, out: join(PUBLIC_DIR, 'logo.png') },
    { size: 64, out: join(PUBLIC_DIR, 'favicon.png') },
    { size: 192, out: join(ICONS_DIR, 'icon-192.png') },
    { size: 512, out: join(ICONS_DIR, 'icon-512.png') },
    { size: 180, out: join(ICONS_DIR, 'apple-touch-icon-180.png') },
    // Maskable: artwork inside the ~72% safe zone on a full-bleed background.
    { size: 512, inset: 0.72, out: join(ICONS_DIR, 'icon-512-maskable.png') },
  ];

  for (const job of jobs) {
    await render(job);
    console.log(`  ✓ ${job.out.replace(PUBLIC_DIR, 'public')}  (${job.size}x${job.size})`);
  }
  console.log('Brand assets written from Assets/shadoken.png');
}

main().catch((err) => {
  console.error('gen-icons failed:', err);
  process.exit(1);
});
