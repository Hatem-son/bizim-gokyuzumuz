export {
  VoiceRecorder,
  detectAudioMime,
  friendlyMicError,
  type RecordedVoice,
} from '../ui/voice';

export interface CompressedPhoto {
  bytes: Uint8Array<ArrayBuffer>;
  mime: string;
  preview: string;
}

/** Fotoğrafı cihazda küçült (en uzun kenar 1600 px, JPEG %82) — şifrelemeden önce. */
export async function compressImage(file: File): Promise<CompressedPhoto> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
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
      preview: canvas.toDataURL('image/jpeg', 0.82),
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}
