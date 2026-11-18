// HOTFIX 20 & 23 — Gerçek mikrofon ses kaydı (iPhone Safari AAC / audio/mp4 öncelikli, WebM/Opus yedekli).
// KURAL:
// 1) start() yalnızca kullanıcı dokunuşunun (click) içinden çağrılmalı; kutu kapanınca cleanup() mikrofonu hemen bırakır.
// 2) iPhone/iOS'ta kayıt sürerken AudioContext AÇILMAZ (iOS AVAudioSession'ı bozup kaydı sessiz/kısa bırakmaması için);
//    dalga göstergesi simüle edilir ama MediaRecorder kaydı tamamen gerçektir.

export interface RecordedVoice {
  bytes: Uint8Array<ArrayBuffer>;
  blob: Blob;
  previewUrl: string;
  mime: string;
  dur: number;
  peaks: number[];
}

function isIOSDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

export function detectAudioMime(bytes: Uint8Array, fallback = 'audio/mp4'): string {
  if (bytes.byteLength >= 12) {
    // MP4 / M4A: [4..7] == 'ftyp'
    if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
      return 'audio/mp4';
    }
    // WebM / Matroska: 1A 45 DF A3
    if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
      return 'audio/webm';
    }
    // Ogg: 'OggS'
    if (bytes[0] === 0x4f && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53) {
      return 'audio/ogg';
    }
  }
  if (fallback.startsWith('audio/mp4') || fallback.startsWith('audio/aac') || fallback.startsWith('audio/x-m4a')) {
    return 'audio/mp4';
  }
  if (fallback.startsWith('audio/webm')) return 'audio/webm';
  if (fallback.startsWith('audio/ogg')) return 'audio/ogg';
  return 'audio/mp4';
}

export function friendlyMicError(err: unknown): string {
  const name = (err as { name?: string })?.name || '';
  const msg = (err as { message?: string })?.message || '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || /permission|denied|notallowed/i.test(msg)) {
    return "Mikrofon izni kapalı. Ayarlar › Safari / Uygulama › Mikrofon'dan aç.";
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || /notfound|device/i.test(msg)) {
    return 'Mikrofon bulunamadı.';
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return 'Mikrofon şu an başka bir uygulama tarafından kullanılıyor.';
  }
  if (name === 'NotSupportedError') {
    return 'Bu tarayıcıda ses kaydı biçimi desteklenmiyor.';
  }
  if (msg && /[çğıöşüÇĞİÖŞÜ]/.test(msg)) return msg;
  return 'Mikrofon açılamadı, izinleri kontrol edip tekrar dene.';
}

export class VoiceRecorder {
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private timeBuf: Uint8Array<ArrayBuffer> | null = null;
  private chunks: Blob[] = [];
  private peakHistory: number[] = [];
  private startedAt = 0;
  private chosenMime = 'audio/mp4';
  private recordError: Error | null = null;

  async start(): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      throw new Error('Bu tarayıcıda ses kaydı desteklenmiyor.');
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch (err) {
      throw new Error(friendlyMicError(err));
    }

    const candidates = ['audio/mp4', 'audio/mp4;codecs=mp4a.40.2', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg'];
    const supported =
      candidates.find((m) => {
        try {
          return typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported(m);
        } catch {
          return false;
        }
      }) || '';

    try {
      const opts: MediaRecorderOptions = { audioBitsPerSecond: 48_000 };
      if (supported) opts.mimeType = supported;
      this.recorder = new MediaRecorder(this.stream, opts);
    } catch {
      try {
        this.recorder = new MediaRecorder(this.stream);
      } catch (err) {
        this.cleanup();
        throw new Error(friendlyMicError(err));
      }
    }

    const rawMime = this.recorder.mimeType || supported || 'audio/mp4';
    this.chosenMime = rawMime.startsWith('audio/mp4') ? 'audio/mp4' : rawMime;
    this.chunks = [];
    this.peakHistory = [];
    this.recordError = null;

    this.recorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) this.chunks.push(ev.data);
    };
    this.recorder.onerror = (ev) => {
      const errObj = (ev as unknown as { error?: Error })?.error;
      this.recordError = errObj ? new Error(friendlyMicError(errObj)) : new Error('Ses kaydı sırasında hata oluştu.');
    };

    // HOTFIX 23: iPhone'da kayıt sürerken AudioContext açılmaz (iOS ses oturumunu bozup kaydı sessiz/çok kısa bırakabiliyor)
    if (!isIOSDevice()) {
      try {
        const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (AC) {
          this.audioCtx = new AC();
          if (this.audioCtx.state === 'suspended') {
            void this.audioCtx.resume().catch(() => undefined);
          }
          const src = this.audioCtx.createMediaStreamSource(this.stream);
          this.analyser = this.audioCtx.createAnalyser();
          this.analyser.fftSize = 128;
          src.connect(this.analyser);
          this.timeBuf = new Uint8Array(new ArrayBuffer(this.analyser.fftSize));
        }
      } catch {
        // Ses seviyesi ölçülemezse dalga simüle edilir, kayıt devam eder
      }
    }

    this.startedAt = performance.now();
    try {
      this.recorder.start(400);
    } catch {
      this.recorder.start();
    }
  }

  /** Canlı mikrofon dalga çubuğu seviyeleri (0..1 arası 30 değer). iOS'ta AudioContext açılmadığı için doğal dalga simüle edilir. */
  readBars(count = 30): number[] {
    if (!this.analyser || !this.timeBuf) {
      const t = performance.now() / 150;
      const simPeak = 0.28 + 0.52 * Math.abs(Math.sin(t * 0.7) * Math.cos(t * 0.43));
      this.peakHistory.push(simPeak);
      return Array.from({ length: count }, (_, i) => {
        const w1 = Math.sin(t + i * 0.45);
        const w2 = Math.cos(t * 1.3 - i * 0.28);
        return Math.min(1, Math.max(0.16, 0.22 + 0.58 * Math.abs(w1 * 0.65 + w2 * 0.35)));
      });
    }
    this.analyser.getByteTimeDomainData(this.timeBuf);
    let sum = 0;
    for (let i = 0; i < this.timeBuf.length; i++) {
      const v = (this.timeBuf[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.min(1, Math.sqrt(sum / this.timeBuf.length) * 3.8);
    this.peakHistory.push(rms);

    const out: number[] = [];
    const step = Math.max(1, Math.floor(this.timeBuf.length / count));
    for (let i = 0; i < count; i++) {
      let peak = 0;
      for (let j = 0; j < step; j++) {
        const idx = Math.min(this.timeBuf.length - 1, i * step + j);
        const amp = Math.abs(this.timeBuf[idx] - 128) / 128;
        if (amp > peak) peak = amp;
      }
      out.push(Math.min(1, 0.14 + peak * 3.0));
    }
    return out;
  }

  elapsedSec(): number {
    return this.startedAt ? (performance.now() - this.startedAt) / 1000 : 0;
  }

  async stop(): Promise<RecordedVoice> {
    const rec = this.recorder;
    if (!rec) throw new Error('Kayıt aktif değil.');
    if (this.recordError) {
      const err = this.recordError;
      this.cleanup();
      throw err;
    }
    const elapsed = this.elapsedSec();
    const dur = Math.max(1, Math.round(elapsed));

    const rawBlob = await new Promise<Blob>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        resolve(new Blob(this.chunks, { type: this.chosenMime }));
      }, 2500);
      rec.onerror = (ev) => {
        clearTimeout(timer);
        const errObj = (ev as unknown as { error?: Error })?.error;
        reject(errObj ? new Error(friendlyMicError(errObj)) : new Error('Ses kaydı sırasında hata oluştu.'));
      };
      rec.onstop = () => {
        clearTimeout(timer);
        resolve(new Blob(this.chunks, { type: this.chosenMime }));
      };
      try {
        if (rec.state === 'recording' || rec.state === 'paused') {
          try {
            // Safari son parçayı kaybetmesin diye durdurmadan önce requestData()
            rec.requestData();
          } catch {
            // Ignore
          }
          rec.stop();
        } else {
          clearTimeout(timer);
          resolve(new Blob(this.chunks, { type: this.chosenMime }));
        }
      } catch (err) {
        clearTimeout(timer);
        reject(err);
      }
    });

    // Mikrofonu HEMEN bırak (iOS turuncu nokta kalmasın)
    this.cleanup();

    const ab = await rawBlob.arrayBuffer();
    if (ab.byteLength < 800 || elapsed < 0.45) {
      throw new Error('Ses alınamadı (kayıt çok kısa veya mikrofon sesi gelmedi), tekrar dene.');
    }

    const bytes = new Uint8Array(new ArrayBuffer(ab.byteLength));
    bytes.set(new Uint8Array(ab));
    const mime = detectAudioMime(bytes, this.chosenMime);
    const blob = new Blob([bytes], { type: mime });
    const previewUrl = URL.createObjectURL(blob);
    const peaks = summarizePeaks(this.peakHistory, 30);

    return { bytes, blob, previewUrl, mime, dur, peaks };
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
    this.timeBuf = null;
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
