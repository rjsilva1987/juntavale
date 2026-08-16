// Generate a monochrome (white) notification icon from site/logo.png,
// preserving the original alpha channel. Android status-bar notification
// icons must be white-on-transparent; Android itself applies the tint.
// The source logo has asymmetric transparent padding, so the drawing is
// trimmed to its opaque bbox first, then scaled to 90% of the canvas and
// centered exactly, so the visible mark doesn't sit off-center.
// The output is stripped of auxiliary PNG chunks (e.g. pHYs) before this
// function returns, so running the script alone produces the final file.
// Usage: node scripts/make-notification-icon.js
'use strict';

const fs = require('fs');
const sharp = require('sharp');

const SRC = './site/logo.png';
const OUT = './assets/notification-icon.png';
const SIZE = 96;
const FRACTION = 0.90;

// strip-png-chunks.js exports nothing importable (it's a CLI script that
// runs main() unconditionally at load time), so the minimal chunk-boundary
// parsing + type filter is duplicated here. No CRC recompute is needed:
// kept chunks' bytes (and thus their existing CRCs) are left untouched.
const KEEP_CHUNK_TYPES = new Set(['IHDR', 'PLTE', 'tRNS', 'IDAT', 'IEND']);

function stripAuxiliaryChunks(filePath) {
  const buf = fs.readFileSync(filePath);
  const signature = buf.slice(0, 8);
  const kept = [signature];

  let offset = 8;
  while (offset < buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.slice(offset + 4, offset + 8).toString('ascii');
    const chunkEnd = offset + 12 + length;

    if (KEEP_CHUNK_TYPES.has(type)) {
      kept.push(buf.slice(offset, chunkEnd));
    }

    offset = chunkEnd;
    if (type === 'IEND') break;
  }

  fs.writeFileSync(filePath, Buffer.concat(kept));
}

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

  const maskedBuffer = await sharp(data, { raw: { width, height, channels } }).png().toBuffer();
  const trimmedBuffer = await sharp(maskedBuffer).trim({ threshold: 8 }).toBuffer();

  const inner = Math.round(SIZE * FRACTION);
  const resized = await sharp(trimmedBuffer)
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();

  await sharp({
    create: {
      width: SIZE,
      height: SIZE,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: resized, gravity: 'center' }])
    .png()
    .toFile(OUT);

  stripAuxiliaryChunks(OUT);

  console.log(`Gerado ${OUT} (${SIZE}x${SIZE}) a partir de ${SRC}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { main };
