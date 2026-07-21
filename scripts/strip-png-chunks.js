// Strip auxiliary PNG chunks, keeping only IHDR, PLTE, tRNS, IDAT, IEND.
// Usage: node scripts/strip-png-chunks.js <file.png> [file2.png ...]
'use strict';

const fs = require('fs');

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const KEEP_TYPES = new Set(['IHDR', 'PLTE', 'tRNS', 'IDAT', 'IEND']);

// Standard CRC-32 (ISO-HDLC / zlib), as required by the PNG spec.
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function parseChunks(buf, filePath) {
  if (buf.length < 8 || !buf.slice(0, 8).equals(SIGNATURE)) {
    throw new Error(`${filePath}: assinatura PNG inválida`);
  }

  const chunks = [];
  let offset = 8;

  while (offset < buf.length) {
    if (offset + 8 > buf.length) {
      throw new Error(`${filePath}: chunk truncado (header incompleto) no offset ${offset}`);
    }

    const length = buf.readUInt32BE(offset);
    const type = buf.slice(offset + 4, offset + 8).toString('ascii');
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const crcEnd = dataEnd + 4;

    if (crcEnd > buf.length) {
      throw new Error(`${filePath}: chunk "${type}" declara tamanho ${length} mas ultrapassa o arquivo`);
    }

    const data = buf.slice(dataStart, dataEnd);
    const storedCrc = buf.readUInt32BE(dataEnd);
    const computedCrc = crc32(buf.slice(offset + 4, dataEnd));

    if (storedCrc !== computedCrc) {
      throw new Error(
        `${filePath}: CRC inválido no chunk "${type}" (offset ${offset}) — esperado ${computedCrc.toString(16)}, encontrado ${storedCrc.toString(16)}`
      );
    }

    chunks.push({ type, data, crc: storedCrc });
    offset = crcEnd;

    if (type === 'IEND') break;
  }

  const lastType = chunks.length ? chunks[chunks.length - 1].type : null;
  if (lastType !== 'IEND') {
    throw new Error(`${filePath}: arquivo não termina em IEND (último chunk: ${lastType})`);
  }
  if (!chunks.some((c) => c.type === 'IHDR')) {
    throw new Error(`${filePath}: chunk IHDR ausente`);
  }

  return chunks;
}

function encodeChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeData), 0);
  return Buffer.concat([length, typeData, crc]);
}

function stripFile(filePath) {
  const buf = fs.readFileSync(filePath);
  const chunks = parseChunks(buf, filePath);

  const kept = chunks.filter((c) => KEEP_TYPES.has(c.type));
  const dropped = chunks.filter((c) => !KEEP_TYPES.has(c.type)).map((c) => c.type);

  const parts = [SIGNATURE];
  for (const c of kept) {
    parts.push(encodeChunk(c.type, c.data));
  }
  const output = Buffer.concat(parts);

  fs.writeFileSync(filePath, output);

  return {
    filePath,
    before: chunks.map((c) => c.type),
    after: kept.map((c) => c.type),
    dropped,
  };
}

function main() {
  const files = process.argv.slice(2);
  if (files.length === 0) {
    console.error('Uso: node scripts/strip-png-chunks.js <file.png> [file2.png ...]');
    process.exit(1);
  }

  // Validate every file first; abort without writing anything if any file is invalid.
  const parsedByFile = new Map();
  for (const filePath of files) {
    try {
      const buf = fs.readFileSync(filePath);
      parsedByFile.set(filePath, parseChunks(buf, filePath));
    } catch (err) {
      console.error(`ERRO: ${err.message}`);
      console.error('Nenhum arquivo foi sobrescrito.');
      process.exit(1);
    }
  }

  const results = [];
  for (const filePath of files) {
    results.push(stripFile(filePath));
  }

  for (const r of results) {
    console.log(`${r.filePath}`);
    console.log(`  antes:  ${r.before.join(', ')}`);
    console.log(`  depois: ${r.after.join(', ')}`);
    console.log(`  removidos: ${r.dropped.length ? r.dropped.join(', ') : '(nenhum)'}`);
  }
}

main();
