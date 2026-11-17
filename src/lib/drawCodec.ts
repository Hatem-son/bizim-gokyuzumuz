// Çizim vektör verisi sıkıştırma/açma: 1000×1333 mantıksal tuval, en çok 400 çizgi, 30 000 nokta, sıkıştırılmış ≤ 200 KB.
// Delta kodlama + gzip (CompressionStream), ardından crypto.ts ile AES-GCM şifrelenir.
import type { Stroke } from '../ui/draw';

export const MAX_STROKES = 400;
export const MAX_POINTS = 30_000;
export const MAX_COMPRESSED_BYTES = 200 * 1024;

type PackedStroke = {
  k: 'pen' | 'glow' | 'erase';
  c: string;
  s: number;
  d: number[]; // [x0, y0, t0, dx1, dy1, dt1, ...]
};

type PackedDoc = {
  v: 1;
  s: PackedStroke[];
};

const TE = new TextEncoder();
const TD = new TextDecoder();

export function clampStrokes(strokes: Stroke[]): Stroke[] {
  const out: Stroke[] = [];
  let totalPts = 0;
  for (const st of strokes.slice(0, MAX_STROKES)) {
    if (totalPts >= MAX_POINTS) break;
    const allow = Math.min(st.p.length, MAX_POINTS - totalPts);
    if (allow <= 0) break;
    out.push({
      k: st.k,
      c: st.c,
      s: Math.round(st.s * 10) / 10,
      p: st.p.slice(0, allow).map(([x, y, t]) => [Math.round(x), Math.round(y), Math.max(0, Math.round(t))]),
    });
    totalPts += allow;
  }
  return out;
}

function packDelta(strokes: Stroke[]): PackedDoc {
  const clamped = clampStrokes(strokes);
  return {
    v: 1,
    s: clamped.map((st) => {
      const d: number[] = [];
      let px = 0, py = 0, pt = 0;
      for (let i = 0; i < st.p.length; i++) {
        const [x, y, t] = st.p[i];
        if (i === 0) {
          d.push(x, y, t);
        } else {
          d.push(x - px, y - py, t - pt);
        }
        px = x; py = y; pt = t;
      }
      return { k: st.k, c: st.c, s: st.s, d };
    }),
  };
}

function unpackDelta(doc: PackedDoc): Stroke[] {
  if (!doc || !Array.isArray(doc.s)) return [];
  let totalPts = 0;
  const out: Stroke[] = [];
  for (const st of doc.s.slice(0, MAX_STROKES)) {
    if (!Array.isArray(st.d) || st.d.length < 3) continue;
    const pts: [number, number, number][] = [];
    let x = 0, y = 0, t = 0;
    for (let i = 0; i + 2 < st.d.length && totalPts < MAX_POINTS; i += 3) {
      if (i === 0) {
        x = st.d[0]; y = st.d[1]; t = st.d[2];
      } else {
        x += st.d[i]; y += st.d[i + 1]; t += st.d[i + 2];
      }
      pts.push([x, y, t]);
      totalPts++;
    }
    if (pts.length) {
      const k = st.k === 'glow' || st.k === 'erase' ? st.k : 'pen';
      out.push({ k, c: String(st.c || '#ffffff'), s: Number(st.s) || 8, p: pts });
    }
  }
  return out;
}

async function streamTransform(
  input: Uint8Array<ArrayBuffer>,
  transform: { readable: ReadableStream<Uint8Array>; writable: WritableStream<BufferSource> }
): Promise<Uint8Array<ArrayBuffer>> {
  const writer = transform.writable.getWriter();
  void writer.write(input).then(() => writer.close());
  const reader = transform.readable.getReader();
  const chunks: Uint8Array[] = [];
  let len = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      len += value.byteLength;
    }
  }
  const merged = new Uint8Array(new ArrayBuffer(len));
  let off = 0;
  for (const ch of chunks) {
    merged.set(ch, off);
    off += ch.byteLength;
  }
  return merged;
}

export async function encodeDrawingBytes(strokes: Stroke[]): Promise<Uint8Array<ArrayBuffer>> {
  const packed = packDelta(strokes);
  const jsonBytes = TE.encode(JSON.stringify(packed));
  const rawBuf = new Uint8Array(new ArrayBuffer(jsonBytes.byteLength));
  rawBuf.set(jsonBytes);

  let out: Uint8Array<ArrayBuffer>;
  if (typeof CompressionStream !== 'undefined') {
    const gz = await streamTransform(rawBuf, new CompressionStream('gzip'));
    out = new Uint8Array(new ArrayBuffer(gz.byteLength + 1));
    out[0] = 1; // gzip bayrağı
    out.set(gz, 1);
  } else {
    out = new Uint8Array(new ArrayBuffer(rawBuf.byteLength + 1));
    out[0] = 0; // sıkıştırılmamış UTF-8 yedek bayrağı
    out.set(rawBuf, 1);
  }

  if (out.byteLength > MAX_COMPRESSED_BYTES) {
    throw new Error('Çizim çok büyük (200 KB sınırını aştı). Birkaç çizgiyi geri alıp tekrar dene.');
  }
  return out;
}

export async function decodeDrawingBytes(bytes: Uint8Array<ArrayBuffer>): Promise<Stroke[]> {
  if (!bytes || bytes.byteLength < 2) return [];
  const mode = bytes[0];
  const body = new Uint8Array(new ArrayBuffer(bytes.byteLength - 1));
  body.set(bytes.subarray(1));

  let jsonBytes: Uint8Array<ArrayBuffer>;
  if (mode === 1 && typeof DecompressionStream !== 'undefined') {
    jsonBytes = await streamTransform(body, new DecompressionStream('gzip'));
  } else {
    jsonBytes = body;
  }
  const parsed = JSON.parse(TD.decode(jsonBytes)) as PackedDoc;
  return unpackDelta(parsed);
}
