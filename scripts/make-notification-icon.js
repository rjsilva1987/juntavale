// Generate a monochrome (white) notification icon from adaptive-icon.png,
// preserving the original alpha channel. Android status-bar notification
// icons must be white-on-transparent; Android itself applies the tint.
// Usage: node scripts/make-notification-icon.js
'use strict';

const sharp = require('sharp');

const SRC = './assets/adaptive-icon.png';
const OUT = './assets/notification-icon.png';
const SIZE = 96;

async function main() {
  const image = sharp(SRC).ensureAlpha();
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  if (channels !== 4) {
    throw new Error(`esperado 4 canais (RGBA), obtido ${channels}`);
  }

  for (let i = 0; i < data.length; i += channels) {
    const alpha = data[i + 3];
    if (alpha > 0) {
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      // alpha (data[i + 3]) preserved unchanged
    }
  }

  await sharp(data, { raw: { width, height, channels } })
    .resize(SIZE, SIZE)
    .png()
    .toFile(OUT);

  console.log(`Gerado ${OUT} (${SIZE}x${SIZE}) a partir de ${SRC}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
