// Kumsal: ufukta gökyüzünü yansıtan deniz + ay/güneş ışık yolu + kıyıya gelip giden dalga köpüğü +
// ıslak kum parıltısı + kuru kum (gren, rüzgâr çizgileri, ikimizin ayak izleri) + mumların kuma düşen ışığı.
// Kum önbelleğe bir kez çizilir (ışık değişince yeniden); deniz ve köpük her kare (ucuz şeritlerle).
import { rng } from '../gokyuzu/util';

const SAND_BLEED_B = 96;

type RGB = [number, number, number];
const parse = (c: string): RGB => (c.match(/\d+/g) ?? ['0', '0', '0']).slice(0, 3).map(Number) as RGB;
const mix = (a: RGB, b: RGB, t: number): RGB => a.map((v, i) => v + (b[i] - v) * t) as RGB;
const css = (c: RGB, a = 1) => `rgba(${c.map((v) => Math.round(v)).join(',')},${a})`;

/** x yakınında kenara düşen öğeyi karşı kenara da kopyala (kesintisiz döşeme). */
function wrapCopies(x: number, P: number, m: number) { const a = [x]; if (x < m) a.push(x + P); if (x > P - m) a.push(x - P); return a; }

export class Beach {
  private sand: HTMLCanvasElement;
  private sandKey = '';
  private grain: CanvasPattern | null = null;
  private r = rng(77);
  wind = 0.15; windDir = 1;                     // hava durumundan (main.ts)
  private ridges: Float32Array[] = [];            // ufuktaki dağ sıraları (dünya x'inde periyodik, 2 px çözünürlük)
  private isl: number[] = [];                    // adanın siluet yükseklikleri (0..1)
  private prints: { x: number; y: number; a: number; s: number; who: 0 | 1 }[] = [];
  private readonly x0: number;
  readonly shoreY: number;

  constructor(private c: CanvasRenderingContext2D, private o: { W: number; H: number; horizonY: number; skyW: number; x0?: number }) {
    this.x0 = o.x0 ?? o.skyW / 2;
    this.shoreY = o.horizonY + 92;
    // ufuktaki dağlar: iki sıra (uzak ve puslu / daha yakın), tamamı panoramada döngüsel; adanın çevresinde yüksek, aralarda alçak
    const P = o.skyW, step = 2, nn = Math.ceil(P / step);
    const mk = (seed: number, count: number, hMin: number, hMax: number) => {
      const r = rng(seed), arr = new Float32Array(nn);
      const peaks: { x: number; w: number; h: number; s: number }[] = [];
      // düzensiz yerleşim: gruplar (kümeler) + boşluklar; boyutlar çok değişken, ara sıra yüksek bir zirve
      let cx = this.x0 + 260;
      for (let i = 0; i < count; i++) {
        cx += (i % 3 === 0 ? 150 + r() * 330 : 40 + r() * 140) * (P / 3505);
        const big = r() < 0.22;
        peaks.push({ x: ((cx % P) + P) % P, w: (big ? 120 : 55) + r() * (big ? 150 : 110), h: big ? hMax * (0.65 + r() * 0.3) : hMin + r() * (hMax - hMin) * 0.7, s: r() * 1.1 });
      }
      for (let i = 0; i < nn; i++) {
        const wx = i * step; let hh = 0;
        for (const p of peaks) {
          let d = Math.abs(wx - p.x); d = Math.min(d, P - d);   // x ve wx ∈ [0,P) → d ∈ [0,P/2]
          const v = Math.min(1, Math.max(0, 1 - d / p.w));
          hh = Math.max(hh, p.h * Math.pow(v, 1.5 + 0.4 * p.s));
        }
        const ang = (wx / P) * Math.PI * 2;                                   // döngüsel ince pürüz
        hh += (Math.sin(ang * 23 + seed) * 1.1 + Math.sin(ang * 61 + seed * 2) * 0.7 + Math.sin(ang * 149) * 0.35) * Math.min(1, hh / 6);
        arr[i] = Math.min(hMax * 1.3, Math.max(0, hh)); // güvenlik sınırı: hiçbir dağ taşmaz
      }
      return arr;
    };
    this.ridges = [mk(31, 18, 20, 66), mk(77, 22, 10, 40)];
    // karşı ada: kendi tasarımım. Ortada volkanik bir tepe, iki yanda alçak sırtlar; sabit, tekrarlanabilir siluet
    const N = 90, gs = (u: number, m: number, sg: number) => Math.exp(-((u - m) ** 2) / (2 * sg * sg));
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      const body = Math.pow(Math.sin(Math.PI * u), 1.35) * 0.2;
      let hh = body + gs(u, 0.58, 0.085) * 0.78 + gs(u, 0.34, 0.12) * 0.34 + gs(u, 0.82, 0.07) * 0.22;
      hh -= gs(u, 0.58, 0.018) * 0.06;                                    // tepede küçük çukur
      hh += (Math.sin(u * 61) * 0.012 + Math.sin(u * 23 + 1) * 0.02) * Math.sin(Math.PI * u);
      this.isl.push(Math.max(0, hh));
    }
    const d = Math.min(devicePixelRatio || 1, 2);
    this.sand = document.createElement('canvas');
    this.sand.width = Math.ceil(o.skyW * d);
    this.sand.height = Math.ceil((o.H - this.shoreY + SAND_BLEED_B) * d);
    this.sand.getContext('2d')!.scale(d, d);
    // gren dokusu
    const g = document.createElement('canvas');
    g.width = g.height = 96;
    const gx = g.getContext('2d')!;
    const im = gx.createImageData(96, 96);
    for (let i = 0; i < im.data.length; i += 4) {
      const v = this.r() * 255;
      im.data[i] = im.data[i + 1] = im.data[i + 2] = v;
      im.data[i + 3] = this.r() < 0.5 ? 26 : 0;
    }
    gx.putImageData(im, 0, 0);
    this.grain = this.sand.getContext('2d')!.createPattern(g, 'repeat');
    // ayak izleri: iki iz, kumun önünden denize doğru yan yana yürür (sol: daha büyük = Ham ham)
    const startX = this.x0 - 40;
    for (let k = 0; k < 18; k++) {
      const t = k / 17;
      const y = (o.H - this.shoreY) * (1 - t) + 6;           // önbellek koordinatı
      const persp = 0.45 + 0.55 * (1 - t);
      const sway = Math.sin(t * 5) * 10 * persp;
      for (const who of [0, 1] as const) {
        const side = k % 2 ? 1 : -1;
        this.prints.push({ x: startX + (who ? 34 : 0) * persp + sway + side * 4 * persp + t * 30, y: y - (who ? 4 : 0), a: -0.15 + t * 0.2, s: persp * (who ? 0.82 : 1), who });
      }
    }
  }

  private drawSand(hor: RGB, top: RGB, day: number, sun: RGB) {
    const c = this.sand.getContext('2d')!;
    const { skyW } = this.o;
    const h = this.o.H - this.shoreY + SAND_BLEED_B;
    // kum rengi: gündüz sıcak bej (güneş ışığı rengine göre), gece gökyüzü renginde soğuk ve koyu
    const dayS: RGB = [222 * (0.75 + 0.25 * sun[0]), 202 * (0.75 + 0.25 * sun[1]), 168 * (0.7 + 0.3 * sun[2])];
    const nightS: RGB = mix([28, 30, 40], top, 0.25);
    const base = mix(nightS, dayS, Math.pow(day, 0.8));
    const near = mix(base, [0, 0, 0], 0.22 + 0.2 * (1 - day));
    c.clearRect(0, 0, skyW, h);
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, css(mix(base, hor, 0.15)));
    g.addColorStop(1, css(near));
    c.fillStyle = g;
    c.fillRect(0, 0, skyW, h);
    // rüzgâr çizgileri (kum dalgacıkları)
    c.strokeStyle = css(mix(base, [255, 255, 255], 0.25), 0.18 + 0.1 * day);
    c.lineWidth = 0.7;
    const rr = rng(5);
    for (let i = 0; i < 70; i++) {
      const y = 10 + rr() * (h - 10), x0 = rr() * skyW, L = 30 + rr() * 80, pers = 0.4 + y / h;
      for (const x of wrapCopies(x0, skyW, 120)) {
        c.beginPath();
        c.moveTo(x, y);
        c.bezierCurveTo(x + L * 0.3, y - 2 * pers, x + L * 0.7, y + 2 * pers, x + L, y);
        c.stroke();
      }
    }
    // tonlu lekeler (kum hiçbir zaman tek renk değil)
    const rb = rng(17);
    for (let i = 0; i < 46; i++) {
      const x0 = rb() * skyW, y = rb() * h, r = 30 + rb() * 90;
      const tone = rb() < 0.5 ? [255, 250, 235] : [90, 70, 50];
      for (const x of wrapCopies(x0, skyW, 130)) {
        const g2 = c.createRadialGradient(x, y, 0, x, y, r);
        g2.addColorStop(0, css(tone as RGB, 0.05 + 0.05 * day));
        g2.addColorStop(1, css(tone as RGB, 0));
        c.fillStyle = g2; c.fillRect(x - r, y - r * 0.4, r * 2, r * 0.8);
      }
    }
    // perspektifli taneler: önde iri, ufka doğru ince
    for (let i = 0; i < 2600; i++) {
      const y = Math.pow(rb(), 0.8) * h, x = rb() * skyW;
      const sz = 0.35 + (y / h) * 1.1 * rb();
      c.fillStyle = rb() < 0.55 ? css(mix(base, [255, 255, 255], 0.35), 0.18 + 0.12 * day) : css(mix(base, [0, 0, 0], 0.4), 0.16);
      c.fillRect(x, y, sz, sz * 0.8);
    }
    // dalganın bıraktığı ince birikinti çizgisi (kabuk kırıntıları, yosun)
    for (let i = 0; i < 420; i++) {
      const x = rb() * skyW, y = 34 + Math.sin(x * 0.02) * 4 + (rb() - 0.5) * 6;
      c.fillStyle = css(mix(base, [0, 0, 0], 0.5), 0.35 * rb());
      c.fillRect(x, y, 0.8 + rb() * 1.5, 0.7);
    }
    // deniz kabukları ve çakıllar
    for (let i = 0; i < 26; i++) {
      const x = 12 + rb() * (skyW - 24), y = 40 + Math.pow(rb(), 0.7) * (h - 50), sc = 0.6 + (y / h) * 1.3;
      c.save(); c.translate(x, y); c.scale(sc, sc * 0.75);
      if (rb() < 0.55) { // çakıl
        const pc = mix(base, rb() < 0.5 ? [120, 110, 100] : [200, 190, 175], 0.5);
        c.fillStyle = css(mix(pc, [0, 0, 0], 0.35), 0.4); c.beginPath(); c.ellipse(0.6, 0.8, 3.2, 2, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = css(pc, 0.95); c.beginPath(); c.ellipse(0, 0, 3, 1.9, rb(), 0, Math.PI * 2); c.fill();
        c.fillStyle = css(mix(pc, [255, 255, 255], 0.5), 0.6 * (0.3 + day)); c.beginPath(); c.ellipse(-0.8, -0.6, 1.1, 0.6, 0, 0, Math.PI * 2); c.fill();
      } else { // tarak kabuğu: yelpaze + kaburgalar
        c.rotate((rb() - 0.5) * 1.2);
        const sc2 = mix(base, rb() < 0.5 ? [255, 214, 222] : [255, 240, 225], 0.65);
        c.fillStyle = css(mix(sc2, [0, 0, 0], 0.3), 0.35); c.beginPath(); c.ellipse(0.8, 1, 4.2, 2.4, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = css(sc2, 0.95); c.beginPath(); c.moveTo(0, 2.4); c.arc(0, 2.4, 4.2, Math.PI * 1.08, Math.PI * 1.92); c.closePath(); c.fill();
        c.strokeStyle = css(mix(sc2, [0, 0, 0], 0.25), 0.6); c.lineWidth = 0.35;
        for (let r2 = -3; r2 <= 3; r2++) { c.beginPath(); c.moveTo(0, 2.4); c.lineTo(r2 * 1.15, -1.4); c.stroke(); }
      }
      c.restore();
    }
    // ayak izleri (yumuşak çukur: koyu gölge + ışık alan kenar)
    for (const p of this.prints) {
      c.save();
      c.translate(p.x, p.y);
      c.rotate(p.a);
      c.scale(p.s, p.s * 0.55);
      c.fillStyle = css(mix(base, [0, 0, 0], 0.35), 0.45);
      c.beginPath(); c.ellipse(0, 0, 3.6, 8, 0, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.ellipse(0.4, -10.5, 2.6, 3.2, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = css(mix(base, [255, 255, 255], 0.3), 0.25);
      c.beginPath(); c.ellipse(-1.2, 1.5, 2.4, 6.4, 0, 0, Math.PI * 2); c.fill();
      c.restore();
    }
    // gren
    if (this.grain) { c.fillStyle = this.grain; c.globalAlpha = 0.5 + 0.5 * day; c.fillRect(0, 0, skyW, h); c.globalAlpha = 1; }
  }

  /**
   * @param skyCanvas gök katmanı (yansıma kaynağı)
   * @param glints ay/güneş: ekran x'i ve şiddeti (ışık yolu için)
   * @param candles mumların ekran konumları (kumda sıcak ışık)
   */
  /** Ufuktaki dağlar: iki sıra, havayla puslu; gündüz yeşilimsi-mavi, gece lacivert. */
  private drawRidges(c: CanvasRenderingContext2D, scrollX: number, hor: RGB, day: number) {
    const { W, horizonY, skyW: P } = this.o, base = horizonY + 1;
    const tint: RGB = day > 0.15 ? [78, 112, 118] : [16, 22, 40];
    const cols = [mix(hor, tint, 0.5), mix(hor, mix(tint, [0, 0, 0], 0.25), 0.7)];
    for (let L = 0; L < 2; L++) {
      const arr = this.ridges[L], n = arr.length;
      c.beginPath(); c.moveTo(-2, base);
      for (let x = -2; x <= W + 2; x += 2) {
        const wx = (((scrollX + x) % P) + P) % P, i = Math.floor(wx / 2) % n;
        c.lineTo(x, base - arr[i]);
      }
      c.lineTo(W + 2, base); c.closePath();
      c.fillStyle = css(cols[L], L ? 0.92 : 0.7); c.fill();
    }
    // dağ eteğinde pus (denizle birleşir)
    const hz = c.createLinearGradient(0, base - 30, 0, base + 1);
    hz.addColorStop(0, css(hor, 0)); hz.addColorStop(1, css(mix(hor, [255, 255, 255], 0.14), 0.55));
    c.fillStyle = hz; c.fillRect(0, base - 30, W, 31);
  }

  /** Ufkun sonunda, denizin karşısında bir ada: uzaktan puslu, gece tepesinin dibinde küçük sıcak bir ışık. */
  private drawIsland(c: CanvasRenderingContext2D, scrollX: number, hor: RGB, day: number, now: number) {
    const { W, horizonY, skyW: P } = this.o;
    const x0 = this.x0;
    let cx = x0 + 20 - scrollX; cx -= P * Math.round((cx - W / 2) / P);
    const IW = 168, IH = 70;
    if (cx < -IW || cx > W + IW) return;
    const left = cx - IW / 2, base = horizonY + 1;
    const far = mix(hor, day > 0.15 ? [64, 96, 90] : [12, 16, 30], 0.62);        // havadaki pustan geçen uzak yeşil/lacivert
    const near = mix(far, [0, 0, 0], 0.22 + 0.1 * (1 - day));
    const poly = (k: number, sx: number, off: number, flip: number) => {
      c.beginPath(); c.moveTo(left + off, base);
      for (let i = 0; i < this.isl.length; i++) c.lineTo(left + off + (i / (this.isl.length - 1)) * IW * sx, base - flip * this.isl[i] * IH * k);
      c.lineTo(left + off + IW * sx, base); c.closePath();
    };
    // yansıma: ters çevrilmiş siluet, dalgayla bölünmüş şeritler
    const t = now / 1000;
    for (let b = 0; b < 6; b++) {
      c.save();
      c.beginPath(); c.rect(left - 20, base + b * 3, IW + 40, 3); c.clip();
      c.fillStyle = css(near, 0.2 * (1 - b / 7));
      poly(0.9, 1, Math.sin(t * 1.2 + b * 1.7) * (1 + b * 0.5), -0.55);
      c.fill(); c.restore();
    }
    // arka sırt (daha puslu, biraz geniş) + ön gövde
    c.fillStyle = css(far, 0.85); poly(0.78, 1.08, -IW * 0.04, 1); c.fill();
    c.fillStyle = css(near, 0.95); poly(1, 1, 0, 1); c.fill();
    // sahil şeridi
    c.fillStyle = css(mix(hor, [255, 236, 205], 0.45), 0.5 * (0.35 + 0.65 * day));
    c.fillRect(left + IW * 0.1, base - 1.5, IW * 0.8, 1.5);
    // sırt üstünde minik palmiye tutamları
    c.strokeStyle = css(mix(near, [0, 0, 0], 0.35), 0.9); c.lineWidth = 0.8; c.lineCap = 'round';
    for (const u of [0.22, 0.3, 0.41, 0.49, 0.67, 0.74, 0.86]) {
      const i = Math.round(u * (this.isl.length - 1)), px = left + u * IW, py = base - this.isl[i] * IH;
      c.beginPath(); c.moveTo(px, py); c.lineTo(px + 0.5, py - 4); c.stroke();
      for (const a of [-2.6, -2.0, -1.1, -0.5]) { c.beginPath(); c.moveTo(px + 0.5, py - 4); c.quadraticCurveTo(px + 0.5 + Math.cos(a) * 3, py - 4 + Math.sin(a) * 3 - 1, px + 0.5 + Math.cos(a) * 5, py - 4 + Math.sin(a) * 4 + 1); c.stroke(); }
    }
    // alt pus: adanın dibi denizle birleşir
    c.save(); c.translate(cx, base); c.scale(1, 0.16);
    const hz = c.createRadialGradient(0, 0, 0, 0, 0, IW * 0.7);
    hz.addColorStop(0, css(mix(hor, [255, 255, 255], 0.12), 0.6)); hz.addColorStop(1, css(hor, 0));
    c.fillStyle = hz; c.fillRect(-IW * 0.7, -IW * 0.7, IW * 1.4, IW * 1.4); c.restore();
    // gece: kıyıda küçük bir ateş (titreşir) ve denizde sıcak çizgi
    const night = 1 - day;
    if (night > 0.2) {
      const fl = 0.8 + 0.2 * Math.sin(t * 7 + Math.sin(t * 2.3) * 2), fxp = left + IW * 0.46, fyp = base - 3;
      const gr = c.createRadialGradient(fxp, fyp, 0, fxp, fyp, 14);
      gr.addColorStop(0, `rgba(255,190,110,${(0.5 * night * fl).toFixed(3)})`); gr.addColorStop(1, 'rgba(255,170,90,0)');
      c.fillStyle = gr; c.fillRect(fxp - 14, fyp - 14, 28, 28);
      c.fillStyle = `rgba(255,226,170,${(0.9 * night * fl).toFixed(3)})`; c.fillRect(fxp - 0.8, fyp - 0.8, 1.6, 1.6);
      for (let j = 0; j < 7; j++) { c.fillStyle = `rgba(255,190,110,${(0.22 * night * fl * (1 - j / 7)).toFixed(3)})`; c.fillRect(fxp - 1.5 + Math.sin(t * 2 + j) * 1.2, base + 3 + j * 3, 3 - j * 0.2, 1.4); }
    }
  }

  frame(now: number, scrollX: number, skyCanvas: HTMLCanvasElement, colors: { hor: string; top: string }, day: number, sun: RGB,
    glints: { x: number; k: number; warm: boolean }[], candles: { x: number; y: number; k: number }[]) {
    const c = this.c, { W, H, horizonY } = this.o;
    const hor = parse(colors.hor), top = parse(colors.top);
    const shore = this.shoreY;
    c.clearRect(0, horizonY - 90, W, H - horizonY + 90 + SAND_BLEED_B); // ufuktaki ada için ufkun biraz üstü de temizlenir

    // ---- deniz: gökyüzü rengi + koyu derinlik
    const deep: RGB = mix([6, 10, 20], [28, 70, 96], day);
    const g = c.createLinearGradient(0, horizonY, 0, shore);
    g.addColorStop(0, css(mix(hor, deep, 0.25)));
    g.addColorStop(1, css(mix(top, deep, 0.55)));
    c.fillStyle = g;
    c.fillRect(0, horizonY, W, shore - horizonY + 2);
    // gökyüzü yansıması: ters çevrilmiş, dalgayla kırılan yatay şeritler
    const d = skyCanvas.width / W;
    const t = now / 1000;
    for (let y = horizonY; y < shore; y += 2) {
      const k = (y - horizonY) / (shore - horizonY);           // 0 ufuk … 1 kıyı
      const srcY = horizonY - 2 - (y - horizonY) * (2.2 + 6 * k); // perspektif: kıyıya yakın satır daha yüksek gökyüzünü yansıtır
      if (srcY < 0) break;
      const off = Math.sin(t * 1.1 + y * 0.42) * (0.6 + 6 * k) + Math.sin(t * 0.7 + y * 0.13) * 2 * k;
      c.globalAlpha = 0.5 * (1 - 0.6 * k);
      c.drawImage(skyCanvas, 0, srcY * d, skyCanvas.width, 2 * d, off, y, W, 2);
    }
    c.globalAlpha = 1;
    // yüzey dokusu: perspektifle yoğunlaşan küçük dalgacıklar (açık sırt + koyu çukur), yavaşça kayar
    const hi = css(mix(hor, [255, 255, 255], 0.35 + 0.25 * day), 1), lo = css(mix(deep, [0, 0, 0], 0.35), 1);
    for (let y = horizonY + 2; y < shore - 3; y += 2) {
      const k = (y - horizonY) / (shore - horizonY);
      const n = 4 + Math.floor(k * 12);
      for (let i = 0; i < n; i++) {
        const h1 = Math.sin(y * 7.13 + i * 31.7) * 43758.5453, f1 = h1 - Math.floor(h1);
        const h2 = Math.sin(y * 3.71 + i * 17.3) * 24634.6345, f2 = h2 - Math.floor(h2);
        const x = (((f1 * (W + 60) + t * (3 + 9 * k) * (i % 2 ? 1 : -0.6) - scrollX * 0.9) % (W + 60)) + W + 60) % (W + 60) - 30;
        const len = 2 + (4 + 16 * k) * f2;
        c.globalAlpha = (0.05 + 0.16 * k) * (0.5 + 0.5 * Math.sin(t * 1.7 + i + y));
        c.fillStyle = i % 3 === 0 ? lo : hi;
        c.fillRect(x, y, len, k > 0.5 ? 1.2 : 0.8);
      }
    }
    c.globalAlpha = 1;
    // ufukta ince pus (deniz ile göğü yumuşakça birleştirir)
    const haze = c.createLinearGradient(0, horizonY - 6, 0, horizonY + 14);
    haze.addColorStop(0, css(hor, 0)); haze.addColorStop(0.4, css(mix(hor, [255, 255, 255], 0.15), 0.35)); haze.addColorStop(1, css(hor, 0));
    c.fillStyle = haze; c.fillRect(0, horizonY - 6, W, 20);
    this.drawRidges(c, scrollX, hor, day);
    this.drawIsland(c, scrollX, hor, day, now);
    // ışık yolu (ay/güneş): titreşen kısa parıltılar, kıyıya doğru genişler
    for (const gl of glints) {
      if (gl.k < 0.02) continue;
      const col = gl.warm ? '255,214,160' : '235,240,255';
      for (let y = horizonY + 2; y < shore; y += 3) {
        const k = (y - horizonY) / (shore - horizonY);
        const spread = 6 + 46 * k;
        const n = 2 + Math.floor(3 * k);
        for (let i = 0; i < n; i++) {
          const h = Math.sin(y * 12.9898 + i * 78.233 + Math.floor(t * 6 + i) * 3.17) * 43758.5453;
          const fr = h - Math.floor(h);
          const x = gl.x + (fr - 0.5) * 2 * spread;
          const a = gl.k * (0.25 + 0.6 * fr) * (1 - 0.3 * k);
          c.fillStyle = `rgba(${col},${a.toFixed(3)})`;
          c.fillRect(x, y, 2 + 6 * k * fr, 1);
          // gündüz güneşinde pırıltı: kısa dört kollu ışık (rastgele, çok kısa ömürlü)
          if (gl.warm === false && day > 0.5 && fr > 0.93) {
            c.fillStyle = `rgba(255,255,255,${(a * 1.4).toFixed(3)})`;
            c.fillRect(x - 3, y, 7, 0.7); c.fillRect(x + 0.2, y - 2.5, 0.7, 6);
          }
        }
      }
    }
    // ufuk çizgisi: çok ince parlak hat
    c.fillStyle = css(mix(hor, [255, 255, 255], 0.35), 0.5);
    c.fillRect(0, horizonY, W, 1);

    // ---- kum
    const key = colors.hor + colors.top + Math.round(day * 30) + sun.map((v) => v.toFixed(1)).join();
    if (key !== this.sandKey) { this.sandKey = key; this.drawSand(hor, top, day, sun); }
    {
      const P = this.o.skyW, f = c.getTransform().a || 1;
      let sx = -Math.round((((scrollX % P) + P) % P) * f) / f;
      for (; sx < W; sx += P) c.drawImage(this.sand, sx, shore - 6, P, H - shore + SAND_BLEED_B);
    }

    // ---- dalgalar (6.5 sn döngü): ufuktan kıyıya yuvarlanan dalga sırtları → kıyıda kırılma → kuma tırmanma → geri çekilme
    const T = 6.5, ph = (t % T) / T, cyc = Math.floor(t / T);
    const hash = (v: number) => { const x = Math.sin(v * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
    const wk = this.wind;
    const reachOf = (n: number) => 34 * (0.78 + 0.3 * hash(n)) * (1 + 0.7 * wk);   // her dalga farklı mesafeye çıkar; rüzgârda daha uzağa
    // 1) dalga sırtları: 4 sırt, perspektifle yaklaştıkça hızlanır, kalınlaşır ve parlaklaşır; arkalarında gölge çukuru
    for (let k = 0; k < 4; k++) {
      const p = (ph + k / 4) % 1;
      const pe = Math.pow(p, 1.7);
      const y = horizonY + 3 + (shore - horizonY - 6) * pe;
      const amp = (0.4 + 2.6 * pe) * (1 + 1.4 * wk), lw = (0.6 + 2.2 * pe) * (1 + 0.5 * wk);
      const a = (0.1 + 0.55 * pe) * (p > 0.94 ? (1 - p) / 0.06 : 1);
      // çukur (sırtın hemen altı, koyu)
      c.strokeStyle = css(mix(deep, [0, 0, 0], 0.4), 0.22 * pe);
      c.lineWidth = lw * 2.2;
      c.beginPath();
      for (let x = -4; x <= W + 4; x += 5) { const yy = y + lw * 1.4 + Math.sin(x * 0.03 + k * 2 + t * 0.8 + scrollX * 0.02) * amp; x < 0 ? c.moveTo(x, yy) : c.lineTo(x, yy); }
      c.stroke();
      // sırt (aydınlık çizgi; gökyüzü ışığını yansıtır)
      c.strokeStyle = css(mix(hor, [255, 255, 255], 0.45 + 0.3 * day), a);
      c.lineWidth = lw;
      c.beginPath();
      for (let x = -4; x <= W + 4; x += 5) { const yy = y + Math.sin(x * 0.03 + k * 2 + t * 0.8 + scrollX * 0.02) * amp; x < 0 ? c.moveTo(x, yy) : c.lineTo(x, yy); }
      c.stroke();
    }
    // 2) kıyıda kırılan dalga: köpük patlaması + kuma tırmanan su (swash) + geri çekilme (backwash)
    //    ph 0.00–0.38 tırmanış (hızlı başlar, yavaşlar), 0.38–0.95 geri çekilme, sonra kısa bekleme
    const up = ph < 0.38 ? 1 - Math.pow(1 - ph / 0.38, 3) : ph < 0.95 ? 1 - Math.pow((ph - 0.38) / 0.57, 1.6) : 0;
    const maxReach = reachOf(cyc);
    const edge = (x: number) => shore + 2 + up * maxReach + Math.sin(x * 0.04 + t * 0.5) * (2 + 3 * up) + Math.sin(x * 0.013 - 1.3) * 5 * up;
    // ---- dalga izleri: her dalganın ulaştığı en uç çizgide köpük kalıntısı + koyu ıslak çizgi kalır, ~40 sn'de silinir
    for (let k = (ph > 0.38 ? 0 : 1); k <= 3; k++) {
      const m = cyc - k, tM = (m + 0.38) * T, age = t - tM, rM = reachOf(m);
      if (age < 0 || age > 48) continue;
      const decay = Math.exp(-age / 15), line = (x: number) => shore + 2 + rM + Math.sin(x * 0.04 + tM * 0.5) * 5 + Math.sin(x * 0.013 - 1.3) * 5 + Math.sin(x * 0.11 + m * 3) * 1.2;
      c.lineCap = 'round';
      c.strokeStyle = css(mix(hor, [0, 0, 0], 0.5), 0.24 * decay * (0.6 + 0.4 * (1 - day)));
      c.lineWidth = 3.2; c.beginPath();
      for (let x = 0; x <= W; x += 6) x ? c.lineTo(x, line(x + scrollX) + 2) : c.moveTo(x, line(x + scrollX) + 2);
      c.stroke();
      c.strokeStyle = `rgba(255,255,255,${(0.8 * decay * (0.55 + 0.35 * day)).toFixed(3)})`;
      c.lineWidth = 1.1; c.setLineDash([7 + 5 * hash(m), 2.5, 2, 4]); c.lineDashOffset = -scrollX + m * 9;
      c.beginPath();
      for (let x = 0; x <= W; x += 6) x ? c.lineTo(x, line(x + scrollX)) : c.moveTo(x, line(x + scrollX));
      c.stroke(); c.setLineDash([]);
      // izde kalan baloncuklar
      for (let i = 0; i < 26; i++) {
        const fx = hash(m * 31 + i), x = ((fx * this.o.skyW - scrollX) % this.o.skyW + this.o.skyW) % this.o.skyW; if (x > W) continue;
        c.fillStyle = `rgba(255,255,255,${(0.5 * decay * hash(m * 7 + i)).toFixed(3)})`;
        c.beginPath(); c.ellipse(x, line(x + scrollX) - 1 - hash(m + i * 3) * 3, 0.7 + hash(i + m) * 1.1, 0.5, 0, 0, 6.2832); c.fill();
      }
    }
    // ıslak kum: suyun ulaştığı en uç çizgiye kadar koyu ve parlak, zamanla kurur
    const dry = ph < 0.38 ? 0 : (ph - 0.38) / 0.62;
    const wetTo = shore + 2 + maxReach + 4;
    const wg = c.createLinearGradient(0, shore, 0, wetTo);
    wg.addColorStop(0, css(mix(hor, [0, 0, 0], 0.35), 0.5));
    wg.addColorStop(1, css(mix(hor, [0, 0, 0], 0.35), 0.16 * (1 - dry)));
    c.fillStyle = wg;
    c.fillRect(0, shore - 2, W, wetTo - shore + 4);
    // ıslak kumda gökyüzü yansıması (ince parlak şerit, geri çekilen suyun ardında)
    if (ph > 0.38) {
      c.fillStyle = css(mix(hor, [255, 255, 255], 0.2), 0.18 * (1 - dry));
      c.beginPath(); c.moveTo(0, shore);
      for (let x = 0; x <= W; x += 6) c.lineTo(x, edge(x + scrollX) + 3);
      for (let x = W; x >= 0; x -= 6) c.lineTo(x, shore + 2 + maxReach * (1 - dry * 0.6) + Math.sin(x * 0.04) * 3);
      c.closePath(); c.fill();
    }
    // su tabakası: yarı saydam, gökyüzünü yansıtır, kıyıdan kenara incelir
    const sheet = c.createLinearGradient(0, shore - 8, 0, shore + maxReach + 8);
    sheet.addColorStop(0, css(mix(mix(hor, deep, 0.45), [255, 255, 255], 0.08), 0.95));
    sheet.addColorStop(1, css(mix(hor, [255, 255, 255], 0.25), 0.55));
    c.fillStyle = sheet;
    c.beginPath(); c.moveTo(0, shore - 8);
    for (let x = 0; x <= W; x += 5) c.lineTo(x, edge(x + scrollX));
    c.lineTo(W, shore - 8); c.closePath(); c.fill();
    // köpük: kenarda kalın beyaz şerit + arkasında dantel gibi köpük benekleri (tırmanırken yoğun, geri çekilirken dağılır)
    const foamA = (0.55 + 0.4 * day) * (ph < 0.38 ? 1 : 0.35 + 0.65 * up);
    // köpük şeridi: kenarın arkasında yoğun beyazdan saydama (gerçek köpük gibi dolgun)
    const band = 6 + 10 * up;
    for (let k = 0; k < 4; k++) {
      c.fillStyle = `rgba(255,255,255,${(foamA * 0.22 * (1 - k / 4)).toFixed(3)})`;
      c.beginPath();
      for (let x = 0; x <= W; x += 5) { const y = edge(x + scrollX) - (band * k) / 4 + Math.sin(x * 0.11 + t * 2 + k) * 1.2; x ? c.lineTo(x, y) : c.moveTo(x, y); }
      for (let x = W; x >= 0; x -= 5) c.lineTo(x, edge(x + scrollX) - band * (k + 1) / 4 - 1);
      c.closePath(); c.fill();
    }
    c.strokeStyle = `rgba(255,255,255,${foamA.toFixed(3)})`;
    c.lineWidth = 2.2 + 2 * up;
    c.lineCap = 'round';
    c.beginPath();
    for (let x = 0; x <= W; x += 5) x ? c.lineTo(x, edge(x + scrollX)) : c.moveTo(x, edge(x + scrollX));
    c.stroke();
    // dantel: kenarın arkasında rastgele küçük köpük kümeleri (deterministik, kayarak hareket eder)
    const lace = Math.round(60 + 70 * up);
    for (let i = 0; i < lace; i++) {
      const hx = Math.sin(i * 91.7 + 0.3) * 43758.5453, fx = hx - Math.floor(hx);
      const hy = Math.sin(i * 12.3 + 1.7) * 23421.631, fy = hy - Math.floor(hy);
      const x = fx * W;
      const ey = edge(x + scrollX);
      const y = ey - 2 - fy * (10 + 18 * (1 - up)) ;
      if (y < shore - 8) continue;
      const rr = 0.5 + fy * 1.2;
      c.fillStyle = `rgba(255,255,255,${(foamA * (0.25 + 0.6 * (1 - fy))).toFixed(3)})`;
      c.beginPath(); c.ellipse(x + Math.sin(t * 1.5 + i) * 1.5, y, rr * 2.2, rr * 0.7, 0, 0, Math.PI * 2); c.fill();
    }
    // kırılma anı: kıyı çizgisinde kısa köpük parlaması (ph≈0)
    const burst = ph < 0.12 ? 1 - ph / 0.12 : 0;
    if (burst > 0) {
      c.fillStyle = `rgba(255,255,255,${(0.35 * burst * (0.5 + 0.5 * day)).toFixed(3)})`;
      c.fillRect(0, shore - 7, W, 6);
    }

    // ---- geri çekilen suyun bıraktığı baloncuklar: belirir ve patlar
    if (ph > 0.4) {
      const Pw = this.o.skyW;
      for (let i = 0; i < 50; i++) {
        const s0 = 0.42 + 0.45 * hash(cyc * 13 + i), u = (ph - s0) / 0.16; if (u < 0 || u > 1) continue;
        let x = hash(cyc * 5 + i + 0.5) * Pw - scrollX; x -= Pw * Math.round((x - W / 2) / Pw); if (x < 0 || x > W) continue;
        const y = shore + 5 + hash(cyc * 9 + i) * (maxReach - 4);
        if (y < edge(x + scrollX) + 2) continue;
        const a = Math.sin(u * Math.PI), r = 0.9 + 1.6 * hash(i + cyc) * (u < 0.85 ? 1 : 1 + (u - 0.85) * 6);
        c.strokeStyle = `rgba(255,255,255,${(0.55 * a).toFixed(3)})`; c.lineWidth = 0.6;
        c.beginPath(); c.ellipse(x, y, r * 1.6, r * 0.8, 0, 0, 6.2832); c.stroke();
        c.fillStyle = `rgba(255,255,255,${(0.18 * a).toFixed(3)})`; c.fill();
      }
    }
    // ---- rüzgârda beyaz köpüklü dalga başları (açık denizde belirir, söner; rüzgâr yönüne kayar)
    if (wk > 0.18) {
      const Pw = this.o.skyW, cnt = Math.round(10 + 46 * wk);
      for (let i = 0; i < cnt; i++) {
        const life = (t * (0.28 + 0.3 * wk) + hash(i * 3.3)) % 1, a = Math.sin(life * Math.PI);
        const fy = Math.pow(hash(i * 1.7 + 4), 1.5), y = horizonY + 6 + fy * (shore - horizonY - 16), k = (y - horizonY) / (shore - horizonY);
        let x = hash(i * 2.1) * Pw + t * (3 + 12 * wk) * k * this.windDir - scrollX; x = ((x % Pw) + Pw) % Pw;
        x -= Pw * Math.round((x - W / 2) / Pw); if (x < -30 || x > W + 30) continue;
        c.fillStyle = `rgba(255,255,255,${(a * (0.14 + 0.5 * wk) * (0.35 + 0.65 * k) * (0.5 + 0.5 * day)).toFixed(3)})`;
        c.fillRect(x, y, 3 + 18 * k * (0.6 + hash(i)), 0.8 + 1.4 * k);
      }
    }

    // ---- mumların kuma ve suya düşen sıcak ışığı (gece belirgin)
    const nightK = 1 - day;
    for (const m of candles) {
      if (m.k <= 0) continue;
      const rg = c.createRadialGradient(m.x, m.y, 2, m.x, m.y, 90);
      rg.addColorStop(0, `rgba(255,190,120,${(0.32 * nightK + 0.06) * m.k})`);
      rg.addColorStop(1, 'rgba(255,170,90,0)');
      c.fillStyle = rg;
      c.fillRect(m.x - 90, m.y - 60, 180, 140);
    }
  }
}
