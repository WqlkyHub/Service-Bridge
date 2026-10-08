// Dessine l'icône de l'application (build/icon.png, 512×512) sans aucune dépendance.
// Barres de forme d'onde violettes sur un carré sombre arrondi, aux couleurs de l'interface.
// Usage : node outils/generer-icone.cjs
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const SIZE = 512;
const SS = 4; // sur-échantillonnage pour lisser les bords

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const BG_TOP = hex('#1f2029');
const BG_BOTTOM = hex('#111217');
const BAR_TOP = hex('#c4b5fd');
const BAR_BOTTOM = hex('#8b5cf6');
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

// Rectangle arrondi : vrai si (x, y) est dedans.
function inRoundRect(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

const MARGIN = 24;
const RADIUS = 104;
const HEIGHTS = [0.22, 0.42, 0.68, 0.9, 0.56, 0.78, 0.4, 0.24];
const BAR_W = 34;
const GAP = 16;
const totalW = HEIGHTS.length * BAR_W + (HEIGHTS.length - 1) * GAP;
const startX = (SIZE - totalW) / 2;
const MAX_H = 300;
const bars = HEIGHTS.map((h, i) => {
  const x0 = startX + i * (BAR_W + GAP);
  const hh = h * MAX_H;
  return [x0, SIZE / 2 - hh / 2, x0 + BAR_W, SIZE / 2 + hh / 2];
});

function sample(x, y) {
  if (!inRoundRect(x, y, MARGIN, MARGIN, SIZE - MARGIN, SIZE - MARGIN, RADIUS)) return null;
  for (const [x0, y0, x1, y1] of bars) {
    if (inRoundRect(x, y, x0, y0, x1, y1, BAR_W / 2)) {
      return mix(BAR_TOP, BAR_BOTTOM, (y - (SIZE / 2 - MAX_H / 2)) / MAX_H);
    }
  }
  return mix(BG_TOP, BG_BOTTOM, y / SIZE);
}

const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
for (let y = 0; y < SIZE; y++) {
  raw[y * (SIZE * 4 + 1)] = 0; // filtre PNG « aucun »
  for (let x = 0; x < SIZE; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const c = sample(x + (sx + 0.5) / SS, y + (sy + 0.5) / SS);
        if (c) { r += c[0]; g += c[1]; b += c[2]; a++; }
      }
    }
    const o = y * (SIZE * 4 + 1) + 1 + x * 4;
    if (a) { raw[o] = r / a; raw[o + 1] = g / a; raw[o + 2] = b / a; }
    raw[o + 3] = Math.round((a / (SS * SS)) * 255);
  }
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // 8 bits par canal
ihdr[9] = 6; // RVBA
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

const out = path.join(__dirname, '..', 'build', 'icon.png');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, png);
console.log(`Icône écrite : ${out}`);
