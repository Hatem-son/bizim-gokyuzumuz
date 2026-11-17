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

export function peaksOfChannel(channel: Float32Array, n = 34): number[] {
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

export interface RecordedVoice {
  bytes: Uint8Array<ArrayBuffer>;
  mime: string;
  dur: number;
  peaks: number[];
}

export class VoiceRecorder {
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private freqBuf: Uint8Array<ArrayBuffer> | null = null;
  private chunks: Blob[] = [];
  private peakHistory: number[] = [];
  private startedAt = 0;

  async start(): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      throw new Error('Bu tarayıcıda ses kaydı desteklenmiyor.');
    }
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const candidates = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg'];
    const mime = candidates.find((m) => MediaRecorder.isTypeSupported?.(m)) || '';
    this.recorder = mime ? new MediaRecorder(this.stream, { mimeType: mime }) : new MediaRecorder(this.stream);
    this.chunks = [];
    this.peakHistory = [];
    this.recorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) this.chunks.push(ev.data);
    };

    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AC) {
        this.audioCtx = new AC();
        const src = this.audioCtx.createMediaStreamSource(this.stream);
        this.analyser = this.audioCtx.createAnalyser();
        this.analyser.fftSize = 128;
        src.connect(this.analyser);
        this.freqBuf = new Uint8Array(new ArrayBuffer(this.analyser.frequencyBinCount));
      }
    } catch {
      // Ses seviyesi ölçülemezse kayıt yine de devam eder
    }

    this.startedAt = performance.now();
    this.recorder.start(200);
  }

  /** Canlı mikrofon dalga çubuğu seviyeleri (0..1 arası 34 değer). */
  readBars(count = 34): number[] {
    if (!this.analyser || !this.freqBuf) {
      return Array.from({ length: count }, (_, i) => 0.15 + 0.15 * Math.abs(Math.sin(performance.now() / 180 + i)));
    }
    this.analyser.getByteTimeDomainData(this.freqBuf);
    let sum = 0;
    for (let i = 0; i < this.freqBuf.length; i++) {
      const v = (this.freqBuf[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.min(1, Math.sqrt(sum / this.freqBuf.length) * 3.6);
    this.peakHistory.push(rms);

    const out: number[] = [];
    const step = Math.max(1, Math.floor(this.freqBuf.length / count));
    for (let i = 0; i < count; i++) {
      let peak = 0;
      for (let j = 0; j < step; j++) {
        const idx = Math.min(this.freqBuf.length - 1, i * step + j);
        const amp = Math.abs(this.freqBuf[idx] - 128) / 128;
        if (amp > peak) peak = amp;
      }
      out.push(Math.min(1, 0.12 + peak * 2.8));
    }
    return out;
  }

  elapsedSec(): number {
    return this.startedAt ? (performance.now() - this.startedAt) / 1000 : 0;
  }

  async stop(): Promise<RecordedVoice> {
    const rec = this.recorder;
    if (!rec) throw new Error('Kayıt aktif değil.');
    const dur = Math.max(1, Math.round(this.elapsedSec()));
    const mime = rec.mimeType || 'audio/mp4';

    const blob = await new Promise<Blob>((resolve) => {
      rec.onstop = () => resolve(new Blob(this.chunks, { type: mime }));
      if (rec.state !== 'inactive') rec.stop();
      else resolve(new Blob(this.chunks, { type: mime }));
    });

    this.cleanup();
    const ab = await blob.arrayBuffer();
    const bytes = new Uint8Array(new ArrayBuffer(ab.byteLength));
    bytes.set(new Uint8Array(ab));

    const peaks = summarizePeaks(this.peakHistory, 30);
    return { bytes, mime, dur, peaks };
  }

  cleanup(): void {
    try {
      this.stream?.getTracks().forEach((t) => t.stop());
    } catch {
      // Ignore
    }
    try {
      void this.audioCtx?.close();
    } catch {
      // Ignore
    }
    this.stream = null;
    this.recorder = null;
    this.audioCtx = null;
    this.analyser = null;
    this.freqBuf = null;
  }
}

function summarizePeaks(raw: number[], n = 30): number[] {
  if (!raw.length) return Array.from({ length: n }, (_, i) => +(0.25 + 0.55 * Math.abs(Math.sin(i * 1.3))).toFixed(2));
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = Math.floor((i * raw.length) / n);
    const b = Math.max(a + 1, Math.floor(((i + 1) * raw.length) / n));
    let mx = 0;
    for (let j = a; j < b && j < raw.length; j++) if (raw[j] > mx) mx = raw[j];
    out.push(mx);
  }
  const top = Math.max(...out, 0.15);
  return out.map((v) => +Math.max(0.14, Math.min(1, v / top)).toFixed(2));
}
