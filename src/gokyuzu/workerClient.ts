// Worker istemcisi: söz (promise) tabanlı iş gönderme, sonuç ImageBitmap olarak döner.
type Res = { id: number; w: number; h: number; data: Uint8ClampedArray };

export class SkyWorker {
  private w: Worker;
  private seq = 0;
  private wait = new Map<number, (r: Res) => void>();
  /** Son iş türlerine göre worker hesaplama süreleri (ms — Teşhis ekranı için). */
  timings: Record<string, number> = { atmo: 0, clouds: 0, milky: 0, moon: 0 };

  constructor(
    factory: () => Worker = () => new Worker(new URL('./skyWorker.ts', import.meta.url), { type: 'module' }),
  ) {
    this.w = factory();
    this.w.onmessage = (e: MessageEvent<Res>) => {
      const cb = this.wait.get(e.data.id);
      this.wait.delete(e.data.id);
      cb?.(e.data);
    };
  }

  /** İşi gönder, sonucu ImageBitmap (yoksa canvas) olarak al. */
  run(job: Record<string, unknown>): Promise<{ img: CanvasImageSource; w: number; h: number; data: Uint8ClampedArray }> {
    const id = ++this.seq;
    const t0 = performance.now();
    const kind = String(job.type ?? 'job');
    return new Promise((resolve) => {
      this.wait.set(id, async (r) => {
        this.timings[kind] = Math.round((performance.now() - t0) * 10) / 10;
        const copy = new Uint8ClampedArray(r.data); // ImageData orijinali tüketir; renk örneklemek için kopya
        const id2 = new ImageData(new Uint8ClampedArray(r.data), r.w, r.h);
        let img: CanvasImageSource;
        if (typeof createImageBitmap === 'function') img = await createImageBitmap(id2);
        else {
          const c = document.createElement('canvas');
          c.width = r.w;
          c.height = r.h;
          c.getContext('2d')!.putImageData(id2, 0, 0);
          img = c;
        }
        resolve({ img, w: r.w, h: r.h, data: copy });
      });
      this.w.postMessage({ ...job, id });
    });
  }
}
