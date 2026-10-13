// Generates the PWA icons as plain PNGs with no image dependencies.
// Run with: node client/scripts/make-icons.mjs
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const NAVY = [0x1f, 0x3a, 0x5f];
const WHITE = [0xff, 0xff, 0xff];
const GREY = [0x9a, 0xa7, 0xb8];

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const body = Buffer.concat([Buffer.from(type), data]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), body.length + 4);
  return out;
};

function icon(size) {
  const px = Buffer.alloc(size * size * 3);
  const rect = (x0, y0, x1, y1, color) => {
    for (let y = Math.round(y0 * size); y < Math.round(y1 * size); y++)
      for (let x = Math.round(x0 * size); x < Math.round(x1 * size); x++) px.set(color, (y * size + x) * 3);
  };
  rect(0, 0, 1, 1, NAVY); // full bleed, so the same file works as a maskable icon
  rect(0.32, 0.25, 0.68, 0.75, WHITE);
  rect(0.38, 0.33, 0.62, 0.37, NAVY);
  rect(0.38, 0.45, 0.62, 0.475, GREY);
  rect(0.38, 0.52, 0.62, 0.545, GREY);
  rect(0.38, 0.59, 0.54, 0.615, GREY);

  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) px.copy(raw, y * (size * 3 + 1) + 1, y * size * 3, (y + 1) * size * 3);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 2, 0, 0, 0], 8); // 8-bit RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const size of [192, 512]) {
  writeFileSync(new URL(`../public/icon-${size}.png`, import.meta.url), icon(size));
}
