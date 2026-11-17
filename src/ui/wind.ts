// Gerçekçi hafif rüzgâr: tek bir rüzgâr alanı (sürekli esinti + ara ara gelen esintiler) palmiye yapraklarını ve
// fenerleri birlikte etkiler. Yapraklar: yavaş eğilme + kendi ritminde salınım + uçta hızlı titreme.
// Fenerler: ip uzunluğuna göre doğal periyotlu, sönümlü sarkaç (rüzgâr kuvvetiyle sürülür).
// Her karede yalnızca transform yazılır.

type Frond = { el: SVGGElement; ph: number; f: number; amp: number; side: number };
type Lantern = { el: HTMLElement; th: number; om: number; w0: number; ph: number };

export class Wind {
  private fronds: Frond[] = [];
  private lanterns: Lantern[] = [];
  private t = 0;
  strength = 0.2; // 0..1, hava durumundan (engine.weather.wind)

  attach(root: HTMLElement) {
    this.fronds = [...root.querySelectorAll('.frond')].map((el, i) => {
      const g = el as SVGGElement;
      // yaprağın baktığı yön: sola bakanlar rüzgârla kapanır, sağa bakanlar açılır (aynı yöne eğilme)
      const d = g.querySelector('path:last-child')?.getAttribute('d') ?? '';
      const nums = d.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [0, 0, 1, 0];
      const side = Math.sign(nums[nums.length - 2] - nums[0]) || 1;
      return { el: g, ph: (i * 2.399) % 6.283, f: 0.55 + ((i * 0.37) % 0.4), amp: 0.7 + ((i * 0.53) % 0.6), side };
    });
    this.attachPalms(root);
    this.lanterns = [...root.querySelectorAll('.lantern .swing')].map((el, i) => {
      const rope = parseFloat((el.querySelector('.rope') as SVGElement)?.getAttribute('height') ?? '70');
      // sarkaç: T = 2π√(L/g); ekran ölçeğinde L ≈ ip + fenerin yarısı
      const Lm = (rope + 30) / 260;
      return { el: el as HTMLElement, th: 0, om: 0, w0: Math.sqrt(9.8 / Lm) * 0.6, ph: i * 1.7 };
    });
  }

  /** Rüzgâr alanı: 0..1 esinti zarfı (yavaş dalgalanan birkaç sinüs, keskin olmayan). */
  private gust(t: number) {
    const g = 0.5 + 0.28 * Math.sin(t * 0.17) + 0.16 * Math.sin(t * 0.41 + 1.3) + 0.08 * Math.sin(t * 1.1 + 0.4);
    return Math.max(0, Math.min(1, g));
  }

  /** Hava durumundan: rüzgâr şiddeti (0..1) ve yönü (+1 sağa, −1 sola). main.ts her karede yazar. */
  dir = 1;
  private sm = 0.15;
  private palms: { el: HTMLElement; base: string; ph: number }[] = [];
  attachPalms(root: HTMLElement) {
    this.palms = [...root.querySelectorAll('.fgi > div')].map((el, i) => ({ el: el as HTMLElement, base: (el as HTMLElement).style.transform || '', ph: i * 1.9 }));
  }

  frame(dt: number) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    this.t += dt;
    const t = this.t;
    this.sm += (this.strength - this.sm) * Math.min(1, dt * 0.6);        // rüzgâr yavaşça güçlenir / diner
    const wn = this.sm, dir = this.dir || 1;
    // güç eğrisi: sakin (0,1) çok hafif · esintili (0,35) belirgin · fırtına (0,7+) şiddetle savrulur
    const P = 0.35 + 4.2 * Math.pow(wn, 1.2);
    const g = this.gust(t * (1 + wn * 1.4));
    for (const f of this.fronds) {
      const lean = f.side * dir * g * P * 1.6;                                           // rüzgâr yönüne eğilme (derece)
      const sway = Math.sin(t * f.f * (1.4 + 1.6 * wn) + f.ph) * f.amp * (0.6 + g) * P * 0.8; // kendi salınımı (rüzgârla hızlanır)
      const flutter = Math.sin(t * (7.3 + 8 * wn) + f.ph * 3) * 0.2 * g * P * (0.4 + 1.5 * wn); // uç titremesi (fırtınada belirgin)
      f.el.style.transform = `rotate(${(lean + sway + flutter).toFixed(3)}deg)`;
    }
    // gövde: rüzgâr yönüne hafif eğilir, esintiyle salınır
    for (const p of this.palms) {
      const a = dir * (g - 0.35) * P * 0.7 + Math.sin(t * 0.45 + p.ph) * P * 0.14;
      p.el.style.transform = `${p.base} rotate(${a.toFixed(3)}deg)`;
    }
    const step = Math.min(dt, 1 / 30);
    const s = 0.35 + P * 0.45;
    for (const l of this.lanterns) {
      const force = ((g - 0.45) * dir * s * 1.8) + Math.sin(t * 2.3 + l.ph) * 0.06 * s;  // rüzgâr itişi (yönlü)
      const acc = -l.w0 * l.w0 * Math.sin(l.th) - 1.1 * l.om + force;
      l.om += acc * step;
      l.th += l.om * step;
      l.el.style.transform = `rotate(${((l.th * 180) / Math.PI).toFixed(3)}deg)`;
    }
  }
}
