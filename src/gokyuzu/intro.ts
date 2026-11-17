// Sinematik açılış: kamera pozlamayı yavaşça açar ve ufuktan göğe doğru hafifçe kalkar.
// Gece ise önce en parlak yıldızlar, sonra sönükler belirir (gözün karanlığa alışması gibi).
// Kıvılcım, kalem ucu, zıplayan öğe YOK. Her şey transform/opacity; hazırlık bitmeden başlamaz.

export type IntroRefs = {
  overlay: HTMLElement;   // splash ile AYNI renkte (koyu) en üst katman
  sky: HTMLElement;       // gök katmanları kapsayıcısı (kamera hareketi)
  ground: HTMLElement;    // çimen/mum/çiçek kapsayıcısı (paralaks: gökten fazla hareket eder)
  title?: HTMLElement;
  greeting?: HTMLElement;
  counter?: HTMLElement;
  buttons?: HTMLElement[];
  candleFlame?: HTMLElement;
  /** yıldız grupları: (parlak, orta, sönük) görünürlük çarpanı 0..1 */
  setStars?: (bright: number, mid: number, faint: number) => void;
  /** gönderilen yıldızları sırayla yak (başlangıç ms, aralık ms) */
  lightUserStars?: (startAt: number, gap: number) => void;
  countUp?: (ms: number) => void;
};

export async function prepare(tasks: Promise<unknown>[], fonts: string[]) {
  const all = Promise.all([...fonts.map((f) => document.fonts.load(f)), document.fonts.ready, ...tasks]);
  await Promise.race([all, new Promise((r) => setTimeout(r, 1800))]);
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
}

export function introMode(): 'full' | 'short' {
  const today = new Date().toDateString();
  let last: string | null = null;
  try { last = localStorage.getItem('gk.introDay'); localStorage.setItem('gk.introDay', today); } catch {}
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return 'short';
  return last === today ? 'short' : 'full';
}

// Sinema eğrileri: yavaş başlayıp yumuşakça oturan hareketler
const CAMERA = 'cubic-bezier(.25,.1,.12,1)';
const EXPO = 'cubic-bezier(.45,0,.2,1)';
const SOFT = 'cubic-bezier(.2,.65,.25,1)';

export function playIntro(r: IntroRefs, mode: 'full' | 'short' = 'full'): Promise<void> {
  const k = mode === 'short' ? 0.45 : 1;
  const anims: Animation[] = [];
  const A = (el: Element | undefined | null, kf: Keyframe[], delay: number, dur: number, easing = SOFT) => {
    if (!el) return;
    anims.push(el.animate(kf, { delay: delay * k, duration: dur * k, easing, fill: 'both' }));
  };

  // Pozlama: karanlıktan açılış (lineer değil: göz uyumu gibi)
  A(r.overlay, [{ opacity: 1 }, { opacity: 0 }], 0, 1900, EXPO);
  r.overlay.style.pointerEvents = 'none'; // pozlama sırasında bile dokunuşları engellemesin
  // Kamera: ufka bakarken yavaşça göğe kalkar ve oturur. Zemin daha çok hareket eder (derinlik).
  A(r.sky, [{ transform: 'translate3d(0,34px,0) scale(1.05)' }, { transform: 'none' }], 0, 2800, CAMERA);
  A(r.ground, [{ transform: 'translate3d(0,70px,0)' }, { transform: 'none' }], 0, 2800, CAMERA);

  // Yıldızlar parlaklık sırasıyla (gece)
  if (r.setStars) {
    const t0 = performance.now();
    const seg = (t: number, a: number, b: number) => Math.min(1, Math.max(0, (t - a * k) / ((b - a) * k)));
    const step = () => {
      const t = performance.now() - t0;
      const e = (x: number) => x * x * (3 - 2 * x);
      r.setStars!(e(seg(t, 500, 1500)), e(seg(t, 900, 2200)), e(seg(t, 1400, 2900)));
      if (t < 2900 * k) requestAnimationFrame(step); else r.setStars!(1, 1, 1);
    };
    requestAnimationFrame(step);
  }

  // Başlık: belirir ve 8 px süzülür; harf aralığı değişmez (yerleşim kayması yok)
  A(r.title, [{ opacity: 0, transform: 'translate3d(0,10px,0)' }, { opacity: 1, transform: 'none' }], 900, 1400);
  A(r.candleFlame, [{ opacity: 0, transform: 'scale(.6)' }, { opacity: 1, transform: 'none' }], 1500, 900);
  r.lightUserStars?.(1700 * k, 35 * k);

  A(r.counter, [{ opacity: 0, transform: 'translate3d(0,-6px,0)' }, { opacity: 1, transform: 'none' }], 2100, 800);
  window.setTimeout(() => r.countUp?.(900 * k), 2100 * k);
  (r.buttons ?? []).forEach((b, i) =>
    A(b, [{ opacity: 0, transform: 'translate3d(0,10px,0)' }, { opacity: 1, transform: 'none' }], 2300 + i * 90, 700),
  );
  A(r.greeting, [
    { opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 1, offset: 0.75 }, { opacity: 0 },
  ], 2200, 2600, 'ease-in-out');

  // dokununca 300 ms'de son duruma
  const skip = () => {
    for (const a of anims) {
      const t = a.effect?.getComputedTiming();
      const left = t ? (t.endTime as number) - ((a.currentTime as number) || 0) : 0;
      if (left > 0) a.playbackRate = Math.max(1, left / 300);
    }
  };
  document.addEventListener('pointerdown', skip, { once: true });

  return Promise.all(anims.map((a) => a.finished.catch(() => {}))).then(() => {
    r.overlay.style.display = 'none';
    for (const a of anims) { try { a.commitStyles(); } catch {} a.cancel(); }
    for (const el of [r.sky, r.ground]) el.style.transform = '';
    document.removeEventListener('pointerdown', skip);
  });
}
