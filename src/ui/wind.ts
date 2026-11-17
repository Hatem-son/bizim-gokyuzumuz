// Gerçekçi hafif rüzgâr: tek bir rüzgâr alanı (sürekli esinti + ara ara gelen esintiler) palmiye yapraklarını ve
// fenerleri birlikte etkiler. Her karede yalnızca transform yazılır.

type Frond = { el: SVGGElement; ph: number; f: number; amp: number; side: number };
type Lantern = { el: HTMLElement; th: number; om: number; w0: number; ph: number };

export class Wind {
  private fronds: Frond[] = [];
  private lanterns: Lantern[] = [];
  private t = 0;
  strength = 0.2;

  attach(root: HTMLElement) {
    this.fronds = [...root.querySelectorAll('.frond')].map((el, i) => {
      const g = el as SVGGElement;
      const d = g.querySelector('path:last-child')?.getAttribute('d') ?? '';
      const nums = d.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [0, 0, 1, 0];
      const side = Math.sign(nums[nums.length - 2] - nums[0]) || 1;
      return { el: g, ph: (i * 2.399) % 6.283, f: 0.55 + ((i * 0.37) % 0.4), amp: 0.7 + ((i * 0.53) % 0.6), side };
    });
    this.lanterns = [...root.querySelectorAll('.lantern .swing')].map((el, i) => {
      const rope = parseFloat((el.querySelector('.rope') as SVGElement)?.getAttribute('height') ?? '70');
      const Lm = (rope + 30) / 260;
      return { el: el as HTMLElement, th: 0, om: 0, w0: Math.sqrt(9.8 / Lm) * 0.6, ph: i * 1.7 };
    });
  }

  private gust(t: number) {
    const g = 0.5 + 0.28 * Math.sin(t * 0.17) + 0.16 * Math.sin(t * 0.41 + 1.3) + 0.08 * Math.sin(t * 1.1 + 0.4);
    return Math.max(0, Math.min(1, g));
  }

  frame(dt: number) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    this.t += dt;
    const t = this.t;
    const s = 0.35 + this.strength * 1.3;
    const g = this.gust(t);
    for (const f of this.fronds) {
      const lean = f.side * s * g * 2.2;
      const sway = Math.sin(t * f.f * 1.4 + f.ph) * f.amp * (0.6 + g) * s;
      const flutter = Math.sin(t * 7.3 + f.ph * 3) * 0.25 * g * s;
      f.el.style.transform = `rotate(${(lean + sway + flutter).toFixed(3)}deg)`;
    }
    const step = Math.min(dt, 1 / 30);
    for (const l of this.lanterns) {
      const force = (g - 0.45) * s * 0.9 + Math.sin(t * 2.3 + l.ph) * 0.06 * s;
      const acc = -l.w0 * l.w0 * Math.sin(l.th) - 1.1 * l.om + force;
      l.om += acc * step;
      l.th += l.om * step;
      l.el.style.transform = `rotate(${((l.th * 180) / Math.PI).toFixed(3)}deg)`;
    }
  }
}
