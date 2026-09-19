// Generates the extension icons as PNGs with no image dependencies:
// a rounded teal square with a white ring and centre dot ("a steady target").
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const outDir = path.resolve(import.meta.dirname, '../src/icons');
mkdirSync(outDir, { recursive: true });

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

function coverage(size, x, y) {
  // Returns [r,g,b,a] for pixel centre (x,y) in a unit-square design space.
  const u = x / size, v = y / size;
  const r = 0.2; // corner radius
  const cx = Math.min(Math.max(u, r), 1 - r), cy = Math.min(Math.max(v, r), 1 - r);
  if (Math.hypot(u - cx, v - cy) > r) return [0, 0, 0, 0];
  const d = Math.hypot(u - 0.5, v - 0.5);
  if (d < 0.11) return [255, 255, 255, 255];
  if (d > 0.24 && d < 0.34) return [255, 255, 255, 255];
  return [11, 93, 99, 255];
}

function png(size) {
  const ss = 4;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      let acc = [0, 0, 0, 0];
      for (let sy = 0; sy < ss; sy++)
        for (let sx = 0; sx < ss; sx++) {
          const c = coverage(size, x + (sx + 0.5) / ss, y + (sy + 0.5) / ss);
          acc = [acc[0] + c[0] * c[3], acc[1] + c[1] * c[3], acc[2] + c[2] * c[3], acc[3] + c[3]];
        }
      const a = acc[3];
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = a ? Math.round(acc[0] / a) : 0;
      raw[o + 1] = a ? Math.round(acc[1] / a) : 0;
      raw[o + 2] = a ? Math.round(acc[2] / a) : 0;
      raw[o + 3] = Math.round(a / (ss * ss));
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const s of [16, 32, 48, 128]) writeFileSync(path.join(outDir, `icon-${s}.png`), png(s));
console.log('icons written to', outDir);
