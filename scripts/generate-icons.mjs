import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const OUT_DIR = path.resolve('public/icons');
fs.mkdirSync(OUT_DIR, { recursive: true });

// Precompute CRC32 table for valid PNG encoding
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[n] = c >>> 0;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  const combined = Buffer.concat([typeBuf, data]);
  crcBuf.writeUInt32BE(crc32(combined), 0);
  return Buffer.concat([len, combined, crcBuf]);
}

function encodePNG(width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0; // filter: None
    rgba.copy(raw, y * stride + 1, y * width * 4, (y + 1) * width * 4);
  }
  const compressed = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function mixRGB(c1, c2, t) {
  return [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
}

function blendPixel(buf, idx, r, g, b, alpha) {
  const a = Math.max(0, Math.min(1, alpha));
  buf[idx] = Math.min(255, Math.round(buf[idx] * (1 - a) + r * a));
  buf[idx + 1] = Math.min(255, Math.round(buf[idx + 1] * (1 - a) + g * a));
  buf[idx + 2] = Math.min(255, Math.round(buf[idx + 2] * (1 - a) + b * a));
}

function addGlow(buf, idx, r, g, b, alpha) {
  const a = Math.max(0, Math.min(1, alpha));
  buf[idx] = Math.min(255, Math.round(buf[idx] + r * a));
  buf[idx + 1] = Math.min(255, Math.round(buf[idx + 1] + g * a));
  buf[idx + 2] = Math.min(255, Math.round(buf[idx + 2] + b * a));
}

function mulberry32(seed) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function renderIcon(size, maskable) {
  const buf = Buffer.alloc(size * size * 4);
  const cTop = [3, 5, 14];      // #03050e
  const cMid = [8, 18, 43];     // #08122b
  const cBot = [20, 36, 74];    // subtle deep horizon #14244a

  // 1. Deep night sky gradient background
  for (let y = 0; y < size; y++) {
    const ny = y / (size - 1);
    const col = ny < 0.56 ? mixRGB(cTop, cMid, ny / 0.56) : mixRGB(cMid, cBot, (ny - 0.56) / 0.44);
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      buf[idx] = Math.round(col[0]);
      buf[idx + 1] = Math.round(col[1]);
      buf[idx + 2] = Math.round(col[2]);
      buf[idx + 3] = 255;
    }
  }

  // 2. Very faint quiet background dust specks (so it feels like a real night sky, never noisy)
  const rnd = mulberry32(2027);
  const dustCount = Math.round(size * 0.14);
  for (let i = 0; i < dustCount; i++) {
    const dx = rnd() * size;
    const dy = rnd() * size;
    const dr = Math.max(0.6, size * (0.0018 + rnd() * 0.0018));
    const alpha = 0.08 + rnd() * 0.16;
    const minX = Math.max(0, Math.floor(dx - dr - 1));
    const maxX = Math.min(size - 1, Math.ceil(dx + dr + 1));
    const minY = Math.max(0, Math.floor(dy - dr - 1));
    const maxY = Math.min(size - 1, Math.ceil(dy + dr + 1));
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const d = Math.hypot(x - dx, y - dy);
        if (d < dr + 0.8) {
          const w = Math.max(0, 1 - d / (dr + 0.8));
          blendPixel(buf, (y * size + x) * 4, 226, 236, 255, alpha * w * w);
        }
      }
    }
  }

  // 3. Two small, understated stars side by side: blue (Ham ham) & pink (Beto)
  // Maskable icons need extra inner padding for safe zone; standard icons match cleanly too.
  const spread = maskable ? 0.085 : 0.095;
  const starScale = maskable ? 0.88 : 1.0;
  const stars = [
    {
      cx: size * (0.5 - spread),
      cy: size * 0.515,
      coreR: size * 0.015 * starScale,
      haloR: size * 0.13 * starScale,
      spikeL: size * 0.056 * starScale,
      tint: [168, 212, 255],   // #a8d4ff
      glow: [84, 150, 255],    // #5496ff
    },
    {
      cx: size * (0.5 + spread),
      cy: size * 0.485,
      coreR: size * 0.0145 * starScale,
      haloR: size * 0.125 * starScale,
      spikeL: size * 0.054 * starScale,
      tint: [255, 179, 218],   // #ffb3da
      glow: [255, 92, 172],    // #ff5cac
    },
  ];

  for (const s of stars) {
    const rad = Math.ceil(s.haloR);
    const minX = Math.max(0, Math.floor(s.cx - rad));
    const maxX = Math.min(size - 1, Math.ceil(s.cx + rad));
    const minY = Math.max(0, Math.floor(s.cy - rad));
    const maxY = Math.min(size - 1, Math.ceil(s.cy + rad));

    for (let y = minY; y <= maxY; y++) {
      const dy = y - s.cy;
      const ady = Math.abs(dy);
      for (let x = minX; x <= maxX; x++) {
        const dx = x - s.cx;
        const adx = Math.abs(dx);
        const dist = Math.hypot(dx, dy);
        if (dist > s.haloR) continue;

        const idx = (y * size + x) * 4;

        // Soft outer halo
        const hNorm = dist / s.haloR;
        const haloAlpha = Math.pow(1 - hNorm, 3.1) * 0.34;
        addGlow(buf, idx, s.glow[0], s.glow[1], s.glow[2], haloAlpha);

        // Subtle 4-pointed star flare spikes (thin & delicate)
        const spikeThickness = Math.max(0.9, size * 0.0042);
        if (adx < s.spikeL && ady < spikeThickness * 2.4) {
          const sx = 1 - adx / s.spikeL;
          const sy = Math.exp(-Math.pow(ady / spikeThickness, 2));
          const sa = Math.pow(sx, 1.8) * sy * 0.55;
          addGlow(buf, idx, s.tint[0], s.tint[1], s.tint[2], sa);
        }
        if (ady < s.spikeL * 0.88 && adx < spikeThickness * 2.4) {
          const sy = 1 - ady / (s.spikeL * 0.88);
          const sx = Math.exp(-Math.pow(adx / spikeThickness, 2));
          const sa = Math.pow(sy, 1.8) * sx * 0.52;
          addGlow(buf, idx, s.tint[0], s.tint[1], s.tint[2], sa);
        }

        // Bright white-tinted star core
        if (dist < s.coreR * 2.4) {
          const cNorm = dist / (s.coreR * 2.4);
          const coreA = Math.exp(-cNorm * cNorm * 3.6);
          const mixToWhite = Math.exp(-cNorm * cNorm * 7.5);
          const cr = lerp(s.tint[0], 255, mixToWhite);
          const cg = lerp(s.tint[1], 255, mixToWhite);
          const cb = lerp(s.tint[2], 255, mixToWhite);
          blendPixel(buf, idx, cr, cg, cb, coreA);
        }
      }
    }
  }

  return encodePNG(size, size, buf);
}

const targets = [
  { name: 'icon-180.png', size: 180, maskable: false },
  { name: 'icon-192.png', size: 192, maskable: false },
  { name: 'icon-512.png', size: 512, maskable: false },
  { name: 'icon-192-maskable.png', size: 192, maskable: true },
  { name: 'icon-512-maskable.png', size: 512, maskable: true },
  { name: 'favicon-64.png', size: 64, maskable: false },
];

for (const t of targets) {
  const png = renderIcon(t.size, t.maskable);
  fs.writeFileSync(path.join(OUT_DIR, t.name), png);
  console.log(`Generated ${t.name} (${png.length} bytes)`);
}

