import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const ICON_DIR = path.resolve('public/icons');
const SPLASH_DIR = path.resolve('public/splash');
fs.mkdirSync(ICON_DIR, { recursive: true });
fs.mkdirSync(SPLASH_DIR, { recursive: true });

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
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0;
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

function paintNightSky(buf, width, height, bottomColor = [20, 36, 74], dustCount = Math.round(Math.min(width, height) * 0.14)) {
  const cTop = [3, 5, 14];    // #03050e
  const cMid = [8, 18, 43];   // #08122b

  // Satır bazlı gradient hesapla, ardından ilk satırı doldurup Buffer.copy ile satırlara yay
  const row = Buffer.alloc(width * 4);
  for (let y = 0; y < height; y++) {
    const ny = height > 1 ? y / (height - 1) : 0;
    const col = ny < 0.56 ? mixRGB(cTop, cMid, ny / 0.56) : mixRGB(cMid, bottomColor, (ny - 0.56) / 0.44);
    const r = Math.round(col[0]);
    const g = Math.round(col[1]);
    const b = Math.round(col[2]);
    for (let x = 0; x < width; x++) {
      const idx = x * 4;
      row[idx] = r;
      row[idx + 1] = g;
      row[idx + 2] = b;
      row[idx + 3] = 255;
    }
    row.copy(buf, y * width * 4);
  }

  const rnd = mulberry32(2027);
  for (let i = 0; i < dustCount; i++) {
    const dx = rnd() * width;
    const dy = rnd() * height;
    const dr = Math.max(0.6, Math.min(width, height) * (0.0018 + rnd() * 0.0018));
    const alpha = 0.08 + rnd() * 0.16;
    const minX = Math.max(0, Math.floor(dx - dr - 1));
    const maxX = Math.min(width - 1, Math.ceil(dx + dr + 1));
    const minY = Math.max(0, Math.floor(dy - dr - 1));
    const maxY = Math.min(height - 1, Math.ceil(dy + dr + 1));
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const d = Math.hypot(x - dx, y - dy);
        if (d < dr + 0.8) {
          const w = Math.max(0, 1 - d / (dr + 0.8));
          blendPixel(buf, (y * width + x) * 4, 226, 236, 255, alpha * w * w);
        }
      }
    }
  }
}

function paintTwinStars(buf, width, height, centerYFrac, spreadFrac, starScale, withOrb = false) {
  const ref = Math.min(width, height);
  const cxMid = width * 0.5;
  const cyMid = height * centerYFrac;

  if (withOrb) {
    const orbR = ref * 0.11;
    const minX = Math.max(0, Math.floor(cxMid - orbR));
    const maxX = Math.min(width - 1, Math.ceil(cxMid + orbR));
    const minY = Math.max(0, Math.floor(cyMid - orbR));
    const maxY = Math.min(height - 1, Math.ceil(cyMid + orbR));
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const dist = Math.hypot(x - cxMid, y - cyMid);
        if (dist > orbR) continue;
        const n = dist / orbR;
        const idx = (y * width + x) * 4;
        const soft = Math.pow(1 - n, 2.2) * 0.14;
        addGlow(buf, idx, 168, 212, 255, soft);
        const rimDist = Math.abs(dist - orbR * 0.82);
        if (rimDist < 1.6) {
          addGlow(buf, idx, 214, 232, 255, (1 - rimDist / 1.6) * 0.12);
        }
      }
    }
  }

  const stars = [
    {
      cx: cxMid - ref * spreadFrac,
      cy: cyMid + ref * 0.015,
      coreR: ref * 0.015 * starScale,
      haloR: ref * 0.13 * starScale,
      spikeL: ref * 0.056 * starScale,
      tint: [168, 212, 255],
      glow: [84, 150, 255],
    },
    {
      cx: cxMid + ref * spreadFrac,
      cy: cyMid - ref * 0.015,
      coreR: ref * 0.0145 * starScale,
      haloR: ref * 0.125 * starScale,
      spikeL: ref * 0.054 * starScale,
      tint: [255, 179, 218],
      glow: [255, 92, 172],
    },
  ];

  for (const s of stars) {
    const rad = Math.ceil(s.haloR);
    const minX = Math.max(0, Math.floor(s.cx - rad));
    const maxX = Math.min(width - 1, Math.ceil(s.cx + rad));
    const minY = Math.max(0, Math.floor(s.cy - rad));
    const maxY = Math.min(height - 1, Math.ceil(s.cy + rad));

    for (let y = minY; y <= maxY; y++) {
      const dy = y - s.cy;
      const ady = Math.abs(dy);
      for (let x = minX; x <= maxX; x++) {
        const dx = x - s.cx;
        const adx = Math.abs(dx);
        const dist = Math.hypot(dx, dy);
        if (dist > s.haloR) continue;

        const idx = (y * width + x) * 4;
        const hNorm = dist / s.haloR;
        addGlow(buf, idx, s.glow[0], s.glow[1], s.glow[2], Math.pow(1 - hNorm, 3.1) * 0.34);

        const spikeThickness = Math.max(0.9, ref * 0.0042);
        if (adx < s.spikeL && ady < spikeThickness * 2.4) {
          const sx = 1 - adx / s.spikeL;
          const sy = Math.exp(-Math.pow(ady / spikeThickness, 2));
          addGlow(buf, idx, s.tint[0], s.tint[1], s.tint[2], Math.pow(sx, 1.8) * sy * 0.55);
        }
        if (ady < s.spikeL * 0.88 && adx < spikeThickness * 2.4) {
          const sy = 1 - ady / (s.spikeL * 0.88);
          const sx = Math.exp(-Math.pow(adx / spikeThickness, 2));
          addGlow(buf, idx, s.tint[0], s.tint[1], s.tint[2], Math.pow(sy, 1.8) * sx * 0.52);
        }

        if (dist < s.coreR * 2.4) {
          const cNorm = dist / (s.coreR * 2.4);
          const coreA = Math.exp(-cNorm * cNorm * 3.6);
          const mixToWhite = Math.exp(-cNorm * cNorm * 7.5);
          blendPixel(
            buf,
            idx,
            lerp(s.tint[0], 255, mixToWhite),
            lerp(s.tint[1], 255, mixToWhite),
            lerp(s.tint[2], 255, mixToWhite),
            coreA
          );
        }
      }
    }
  }
}

function renderIcon(size, maskable) {
  const buf = Buffer.alloc(size * size * 4);
  paintNightSky(buf, size, size, [20, 36, 74], Math.round(size * 0.14));
  paintTwinStars(buf, size, size, 0.5, maskable ? 0.085 : 0.095, maskable ? 0.88 : 1.0, false);
  return encodePNG(size, size, buf);
}

function renderSplash(width, height) {
  const buf = Buffer.alloc(width * height * 4);
  paintNightSky(buf, width, height, [8, 23, 28], Math.round(Math.min(width, height) * 0.18));
  paintTwinStars(buf, width, height, 0.45, 0.055, 0.65, true);
  return encodePNG(width, height, buf);
}

const iconTargets = [
  { name: 'icon-180.png', size: 180, maskable: false },
  { name: 'icon-192.png', size: 192, maskable: false },
  { name: 'icon-512.png', size: 512, maskable: false },
  { name: 'icon-192-maskable.png', size: 192, maskable: true },
  { name: 'icon-512-maskable.png', size: 512, maskable: true },
  { name: 'favicon-64.png', size: 64, maskable: false },
];

for (const t of iconTargets) {
  const png = renderIcon(t.size, t.maskable);
  fs.writeFileSync(path.join(ICON_DIR, t.name), png);
  console.log(`Generated icon ${t.name} (${png.length} bytes)`);
}

const splashTargets = [
  [750, 1334],
  [1125, 2436],
  [828, 1792],
  [1242, 2688],
  [1170, 2532],
  [1284, 2778],
  [1179, 2556],
  [1290, 2796],
  [1206, 2622],
  [1320, 2868],
];

for (const [w, h] of splashTargets) {
  const name = `splash-${w}x${h}.png`;
  const png = renderSplash(w, h);
  fs.writeFileSync(path.join(SPLASH_DIR, name), png);
  console.log(`Generated splash ${name} (${png.length} bytes)`);
}
