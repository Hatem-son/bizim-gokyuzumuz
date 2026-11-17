export interface CompressedPhoto {
  bytes: Uint8Array<ArrayBuffer>;
  mime: string;
  preview: string;
}

export async function compressImage(file: File): Promise<CompressedPhoto> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    const scale = Math.min(1, 1280 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas hazırlanamadı');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.82));
    if (!blob) throw new Error('Fotoğraf sıkıştırılamadı');

    const ab = await blob.arrayBuffer();
    const bytes = new Uint8Array(new ArrayBuffer(ab.byteLength));
    bytes.set(new Uint8Array(ab));

    return {
      bytes,
      mime: 'image/jpeg',
      preview: canvas.toDataURL('image/jpeg', 0.5),
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function peaksOfChannel(channel: Float32Array, n = 36): number[] {
  const step = Math.max(1, Math.floor(channel.length / n));
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    let max = 0;
    for (let j = i * step; j < (i + 1) * step && j < channel.length; j += 4) {
      const val = Math.abs(channel[j]);
      if (val > max) max = val;
    }
    out.push(max);
  }
  const mx = Math.max(...out) || 1;
  return out.map((x) => +(x / mx).toFixed(2));
}

export async function peaksFromBytes(bytes: Uint8Array<ArrayBuffer>): Promise<number[] | null> {
  try {
    const AudioCtx =
      window.OfflineAudioContext ||
      (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
    if (!AudioCtx) return null;
    const ctx = new AudioCtx(1, 1, 44100);
    const copy = bytes.slice().buffer;
    const audioBuf = await ctx.decodeAudioData(copy);
    return peaksOfChannel(audioBuf.getChannelData(0));
  } catch {
    return null;
  }
}

export { barsHtml, formatDuration } from './audioUi';
