// Kumsal: ufukta gökyüzünü yansıtan deniz + ay/güneş ışık yolu + kıyıya gelip giden dalga köpüğü +
// ıslak kum parıltısı + kuru kum (gren, rüzgâr çizgileri, ikimizin ayak izleri) + mumların kuma düşen ışığı.
// Kum önbelleğe bir kez çizilir (ışık değişince yeniden); deniz ve köpük her kare (ucuz şeritlerle).
import { rng } from '../gokyuzu/util';
import { Whale } from './whale';
import { paintDecor, BeachLife } from './decor';
import { mtPalette, paintMountain, peakCloud, MtPal } from './mountain';

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
  /** açık denizdeki dalgacıklar: dünya konumu (u), derinlik (k: 0 ufuk … 1 kıyı), yaşam fazı/hızı, boy */
  private wl: { u: number; k: number; ph: number; sp: number; len: number; hi: number }[] = [];
  readonly shoreY: number;
  /** arada bir yüzeye çıkan balina (main.ts tetikler) */
  readonly whale = new Whale();
  /** yengeçler ve ateş böcekleri */
  readonly life = new BeachLife();
  private lady: number[] = [];
  // dağ önbellekleri (ışık/renk değişince yeniden boyanır, en sık 2.5 sn'de bir)
  private mt: { ridge: HTMLCanvasElement[]; lady: HTMLCanvasElement; isl: HTMLCanvasElement; pal: MtPal[] } | null = null;
  private mtKey = ''; private mtAt = 0; private mtDay = -1;
  private static readonly RH = 100;                   // "Uyuyan Kadın" dağı siluet yükseklikleri (0..1)

  constructor(private c: CanvasRenderingContext2D, private o: { W: number; H: number; horizonY: number; skyW: number; x0: number }) {
    this.shoreY = o.horizonY + 92;
    // ufuktaki dağlar: iki sıra (uzak ve puslu / daha yakın), tamamı panoramada döngüsel; adanın çevresinde yüksek, aralarda alçak
    const P = o.skyW, step = 2, nn = Math.ceil(P / step);
    const mk = (seed: number, count: number, hMin: number, hMax: number) => {
      const r = rng(seed), arr = new Float32Array(nn);
      const peaks: { x: number; w: number; h: number; s: number }[] = [];
      // düzensiz yerleşim: gruplar (kümeler) + boşluklar; boyutlar çok değişken, ara sıra yüksek bir zirve
      let cx = o.x0 + 260;
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
    { const r = rng(909);
      for (let i = 0; i < 620; i++) {
        const k = Math.pow(r(), 1.35);                                   // uzakta daha çok (perspektif sıkışması)
        this.wl.push({ u: r(), k, ph: r(), sp: 0.18 + r() * 0.32, len: (2 + 22 * Math.pow(k, 1.25)) * (0.55 + r() * 0.9), hi: r() });
      }
      this.wl.sort((a, b) => a.k - b.k);
    }
    // Dağ silueti: kullanıcının gönderdiği GERÇEK fotoğraftaki dağ sırasından (Pasifik'te tropik bir koy) piksel piksel çıkarıldı.
    // Dağ silueti (beğenilen gerçek-fotoğraf sürümü): sol uçta küçük yuvarlak tepecik, ardından uzun ve bombeli, yumuşak yamaç. (u: 0..1, h: 0..1)
    { const K: [number, number][] = [[0.0000, 0.0], [0.0120, 0.09], [0.0300, 0.15], [0.0500, 0.15], [0.0750, 0.13], [0.1100, 0.19], [0.1600, 0.29], [0.2100, 0.4], [0.2600, 0.52], [0.3100, 0.62], [0.3500, 0.69], [0.3616, 0.693], [0.3732, 0.67], [0.3848, 0.682], [0.3965, 0.682], [0.4080, 0.704], [0.4197, 0.739], [0.4312, 0.773], [0.4429, 0.773], [0.4545, 0.773], [0.4660, 0.807], [0.4777, 0.875], [0.4893, 0.931], [0.5009, 0.966], [0.5125, 1], [0.5242, 1], [0.5357, 0.989], [0.5474, 0.978], [0.5590, 0.943], [0.5706, 0.909], [0.5822, 0.853], [0.5938, 0.773], [0.6054, 0.739], [0.6170, 0.704], [0.6286, 0.682], [0.6401, 0.682], [0.6518, 0.693], [0.6633, 0.715], [0.6749, 0.715], [0.6866, 0.693], [0.6981, 0.715], [0.7098, 0.727], [0.7214, 0.818], [0.7330, 0.875], [0.7446, 0.864], [0.7562, 0.829], [0.7678, 0.84], [0.7794, 0.807], [0.7910, 0.762], [0.8026, 0.715], [0.8143, 0.682], [0.8258, 0.682], [0.8375, 0.693], [0.8491, 0.704], [0.8607, 0.715], [0.8723, 0.715], [0.8840, 0.715], [0.8955, 0.682], [0.9071, 0.625], [0.9187, 0.557], [0.9303, 0.454], [0.9420, 0.352], [0.9535, 0.261], [0.9652, 0.182], [0.9768, 0.147], [0.9884, 0.114], [1.0000, 0.0]];
      const N = 240;
      for (let i = 0; i <= N; i++) {
        const u = i / N; let j = 0; while (j < K.length - 2 && K[j + 1][0] < u) j++;
        const [u0, h0] = K[j], [u1, h1] = K[j + 1], hp = K[Math.max(0, j - 1)][1], hn = K[Math.min(K.length - 1, j + 2)][1];
        const tt = (u - u0) / (u1 - u0 || 1), t2 = tt * tt, t3 = t2 * tt;                       // Catmull-Rom: yumuşak, doğal sırt
        const v = 0.5 * (2 * h0 + (-hp + h1) * tt + (2 * hp - 5 * h0 + 4 * h1 - hn) * t2 + (-hp + 3 * h0 - 3 * h1 + hn) * t3);
        const rough = (Math.sin(u * 173) * 0.006 + Math.sin(u * 61 + 2) * 0.008) * Math.sin(Math.PI * u);  // kaya ve ağaç pürüzü
        this.lady.push(Math.max(0, v + rough));
      }
    }
    const d = Math.min(devicePixelRatio || 1, 2);
    this.sand = document.createElement('canvas');
    this.sand.width = Math.ceil(o.skyW * d);
    this.sand.height = Math.ceil((o.H - this.shoreY + 116) * d);
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
    const startX = o.x0 - 40;
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
    const h = this.o.H - this.shoreY + 116;
    // kum rengi: gündüz sıcak bej (güneş ışığı rengine göre), gece gökyüzü renginde soğuk ve koyu
    const dayS: RGB = [222 * (0.75 + 0.25 * sun[0]), 202 * (0.75 + 0.25 * sun[1]), 168 * (0.7 + 0.3 * sun[2])];
    const nightS: RGB = mix([28, 30, 40], top, 0.25);
    const base = mix(nightS, dayS, Math.pow(day, 0.8));
    const near = mix(base, [0, 0, 0], 0.22 + 0.2 * (1 - day));
    const groundBot = css(mix(near, [4, 6, 14], 0.55));
    document.documentElement.style.setProperty('--ground-bot', groundBot);
    document.documentElement.style.backgroundColor = groundBot;
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
    // süsler: kayalar, gelgit havuzu, kütük, kano, sarmaşık, otlar, deniz yıldızı, hindistan cevizi, çiçekler, kumda kalp
    paintDecor(c, { P: skyW, h, x0: this.o.x0, sand: base, day, hor, sun });
    // gren
    if (this.grain) { c.fillStyle = this.grain; c.globalAlpha = 0.5 + 0.5 * day; c.fillRect(0, 0, skyW, h); c.globalAlpha = 1; }
  }

  /** Ufuktaki dağlar: iki sıra, havayla puslu; gündüz yeşilimsi-mavi, gece lacivert. */
  private buildMountains(hor: RGB, day: number, sun: RGB) {
    const { skyW: P } = this.o, d = Math.min(devicePixelRatio || 1, 1.5);
    const mk = (w: number, hgt: number) => { const cv = document.createElement('canvas'); cv.width = Math.ceil(w * d); cv.height = Math.ceil(hgt * d); const x = cv.getContext('2d')!; x.scale(d, d); return cv; };
    const reuse = (cv: HTMLCanvasElement | undefined, w: number, hgt: number) => { if (!cv) return mk(w, hgt); const x = cv.getContext('2d')!; x.setTransform(d, 0, 0, d, 0, 0); x.clearRect(0, 0, w, hgt); return cv; };
    const pal = [mtPalette(hor, day, sun, 0.85), mtPalette(hor, day, sun, 0.6), mtPalette(hor, day, sun, 0.4), mtPalette(hor, day, sun, 0.25)];
    const RH = Beach.RH;
    const ridge = [0, 1].map((L) => {
      const cv = reuse(this.mt?.ridge[L], P, RH);
      paintMountain(cv.getContext('2d')!, this.ridges[L], 2, RH, pal[L], 31 + L * 7, L ? 0.8 : 0.5, true);
      return cv;
    });
    const LW = 380, LH = 72, ln = this.lady.length - 1;
    const lh = new Float32Array(LW + 1); for (let x = 0; x <= LW; x++) lh[x] = this.lady[Math.round((x / LW) * ln)] * LH;
    const lady = reuse(this.mt?.lady, LW, LH + 4); paintMountain(lady.getContext('2d')!, lh, 1, LH + 4, pal[2], 404, 1);
    const IW = 168, IH = 70, inn = this.isl.length - 1;
    const ih = new Float32Array(IW + 1); for (let x = 0; x <= IW; x++) { const u = (x / IW) * inn, i0 = Math.floor(u), f = u - i0; ih[x] = (this.isl[i0] * (1 - f) + this.isl[Math.min(inn, i0 + 1)] * f) * IH; }
    const isl = reuse(this.mt?.isl, IW, IH + 4); paintMountain(isl.getContext('2d')!, ih, 1, IH + 4, pal[3], 77, 1.1);
    this.mt = { ridge, lady, isl, pal };
  }

  private drawRidges(c: CanvasRenderingContext2D, scrollX: number, hor: RGB, day: number) {
    const { W, horizonY, skyW: P } = this.o, base = horizonY + 1;
    void day;
    const RH = Beach.RH, off = -(((scrollX % P) + P) % P);
    for (let L = 0; L < 2; L++) {
      c.globalAlpha = L ? 1 : 0.92;
      for (let sx = off; sx < W; sx += P) c.drawImage(this.mt!.ridge[L], Math.round(sx), base - RH, P, RH);
    }
    c.globalAlpha = 1;
    // dağ eteğinde pus (denizle birleşir)
    const hz = c.createLinearGradient(0, base - 30, 0, base + 1);
    hz.addColorStop(0, css(hor, 0)); hz.addColorStop(1, css(mix(hor, [255, 255, 255], 0.14), 0.55));
    c.fillStyle = hz; c.fillRect(0, base - 30, W, 31);
  }

  /** "Uyuyan Kadın" dağı: ana sahnenin hemen sağında, ufukta uzanan uzun, puslu bir dağ. Gece ay ışığı sırt çizgisini yalar. */
  private drawLady(c: CanvasRenderingContext2D, scrollX: number, hor: RGB, top: RGB, day: number, now: number) {
    const { W, horizonY, skyW: P, x0 } = this.o;
    const LW = 380, LH = 72;
    let cx = x0 + 400 - scrollX; cx -= P * Math.round((cx - W / 2) / P);
    if (cx < -LW || cx > W + LW) return;
    const left = cx - LW / 2, base = horizonY + 1, n = this.lady.length - 1;
    const body = this.mt!.pal[2].base;
    const path = (k: number, yoff = 0) => {
      c.beginPath(); c.moveTo(left, base);
      for (let i = 0; i <= n; i++) c.lineTo(left + (i / n) * LW, base - this.lady[i] * LH * k + yoff);
      c.lineTo(left + LW, base); c.closePath();
    };
    // yansıma: ters, soluk, dalgayla kırık şeritler
    const t = now / 1000;
    for (let b = 0; b < 7; b++) {
      c.save(); c.beginPath(); c.rect(left - 20, base + b * 3, LW + 40, 3); c.clip();
      c.save(); c.translate(Math.sin(t * 1.1 + b * 1.9) * (1 + b * 0.5), base * 2); c.scale(1, -1);
      c.fillStyle = css(body, 0.17 * (1 - b / 8)); path(0.85); c.fill(); c.restore(); c.restore();
    }
    // lagün: gündüz dağın önünde turkuaz sığ su
    this.lagoon(c, cx, base, LW, day);
    // gövde: önbellekten (orman, yamaç ışığı, oyuklar, pus, sırt ışığı)
    c.drawImage(this.mt!.lady, left, base - (LH + 4) + 1, LW, LH + 4);
    void top;
    // dizlerin üstünde ara sıra bulut toplanır
    peakCloud(c, left + LW * 0.38, base - LH * 0.9, 80, t, 1.7, day, hor);
    // saçlar denize dökülür: sol uçta ince köpük ve pus
    c.save(); c.translate(cx, base); c.scale(1, 0.12);                 // etek pusu: kenarları yumuşak (dikey kesik yok)
    const hz = c.createRadialGradient(0, 0, 0, 0, 0, LW * 0.62);
    hz.addColorStop(0, css(mix(hor, [255, 255, 255], 0.12), 0.5)); hz.addColorStop(1, css(hor, 0));
    c.fillStyle = hz; c.fillRect(-LW * 0.62, -LW * 0.62, LW * 1.24, LW * 1.24); c.restore();
    c.fillStyle = css(mix(hor, [255, 255, 255], 0.5), 0.25 + 0.15 * Math.sin(t * 0.9));
    c.fillRect(left + 2, base - 0.5, LW * 0.12, 1);
  }

  /** Ufkun sonunda, denizin karşısında bir ada: uzaktan puslu, gece tepesinin dibinde küçük sıcak bir ışık. */
  private drawIsland(c: CanvasRenderingContext2D, scrollX: number, hor: RGB, day: number, now: number) {
    const { W, horizonY, skyW: P, x0 } = this.o;
    let cx = x0 + 20 - scrollX; cx -= P * Math.round((cx - W / 2) / P);
    const IW = 168, IH = 70;
    if (cx < -IW || cx > W + IW) return;
    const left = cx - IW / 2, base = horizonY + 1;
    const far = mix(this.mt!.pal[1].base, hor, 0.25);                             // arka sırt: puslu yeşil (gece koyu)
    const near = this.mt!.pal[3].shade;
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
    this.lagoon(c, cx, base, IW * 1.1, day);
    c.drawImage(this.mt!.isl, left, base - (IH + 4) + 1, IW, IH + 4);
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
    peakCloud(c, left + IW * 0.58, base - IH * 0.8, 52, t, 0.4, day, hor);
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

  /** gündüz dağın/adanın önünde turkuaz sığ su (lagün) */
  private lagoon(c: CanvasRenderingContext2D, cx: number, base: number, w: number, day: number) {
    if (day < 0.2) return;
    c.save(); c.translate(cx, base + 2); c.scale(1, 0.07);
    const g = c.createRadialGradient(0, 0, 0, 0, 0, w * 0.55);
    g.addColorStop(0, `rgba(110,220,210,${(0.42 * day).toFixed(3)})`); g.addColorStop(0.7, `rgba(80,200,200,${(0.18 * day).toFixed(3)})`); g.addColorStop(1, 'rgba(80,200,200,0)');
    c.fillStyle = g; c.fillRect(-w * 0.55, -w * 0.55, w * 1.1, w * 1.1); c.restore();
  }

  private swellColors(hor: RGB, top: RGB, deep: RGB, day: number) {
    return { trough: mix(deep, [0, 0, 0], 0.45), face: mix(mix(hor, top, 0.4), [255, 255, 255], 0.08 + 0.12 * day), crest: mix(hor, [255, 255, 255], 0.55 + 0.25 * day) };
  }

  frame(now: number, scrollX: number, skyRefl: HTMLCanvasElement, colors: { hor: string; top: string }, day: number, sun: RGB,
    glints: { x: number; k: number; warm: boolean }[], candles: { x: number; y: number; k: number }[]) {
    const c = this.c, { W, H, horizonY } = this.o;
    const hor = parse(colors.hor), top = parse(colors.top);
    const shore = this.shoreY;
    c.clearRect(0, horizonY - 140, W, H + 96 - horizonY + 140);
    { const key = `${Math.round(day * 16)}|${hor.map((v) => v >> 3).join()}|${Math.round(sun[0] * 8)}`;
      const bigJump = Math.abs(day - this.mtDay) > 0.35;
      if (!this.mt || (key !== this.mtKey && (bigJump || now - this.mtAt > 2500))) { this.mtKey = key; this.mtAt = now; this.mtDay = day; this.buildMountains(hor, day, sun); } }

    // ---- deniz. KURAL: her desen DÜNYAYA sabitlenir (wx = x + scrollX) → sağa/sola kaydırınca su "kaymaz", gök ve dağlarla birlikte döner.
    const P = this.o.skyW, TAU = Math.PI * 2;
    const fq = (f: number) => (Math.max(1, Math.round((f * P) / TAU)) * TAU) / P;     // 360°'de dikişsiz frekans
    const t = now / 1000, wk = this.wind;
    const deep: RGB = mix([5, 9, 22], [18, 62, 92], day);                              // derin su
    const shallow: RGB = mix([14, 22, 40], [52, 150, 160], day);                        // kıyıya yakın sığ su (gündüz turkuaz)
    const hl = mix(hor, [255, 255, 255], 0.18 + 0.2 * day);                             // ufukta Fresnel parlaklığı
    const g = c.createLinearGradient(0, horizonY, 0, shore);
    g.addColorStop(0, css(mix(hl, deep, 0.18)));
    g.addColorStop(0.18, css(mix(hor, deep, 0.45)));
    g.addColorStop(0.62, css(mix(top, deep, 0.7)));
    g.addColorStop(0.88, css(mix(deep, shallow, 0.55)));
    g.addColorStop(1, css(mix(shallow, hor, 0.15)));
    c.fillStyle = g;
    c.fillRect(0, horizonY, W, shore - horizonY + 2);
    // gökyüzü yansıması: ters çevrilmiş gök, ufukta güçlü (Fresnel) kıyıya doğru zayıf; satırlar dalgayla hafifçe kırılır
    const reflC = skyRefl, d = 0.5;
    for (let y = horizonY; y < shore; y += 2) {
      const k = (y - horizonY) / (shore - horizonY);
      const srcY = horizonY - 2 - (y - horizonY) * (2.2 + 6 * k);
      if (srcY < 0) break;
      const off = Math.sin(t * 0.9 + y * 0.37) * (0.5 + 4 * k) + Math.sin(t * 0.55 + y * 0.11) * 1.6 * k;
      c.globalAlpha = 0.55 * Math.pow(1 - k, 1.4);
      c.drawImage(reflC, 0, srcY * d, reflC.width, 2 * d, off, y, W, 2);
    }
    c.globalAlpha = 1;
    // kabarmalar (swell): ince çizgi DEĞİL, geniş yumuşak bantlar; sırt göğü yansıtır, arkası koyu çukur; boyunca yer yer kesilir
    const T = 6.5, ph = (t % T) / T, cyc = Math.floor(t / T);
    const sw = this.swellColors(hor, top, deep, day);
    for (let n = 0; n < 4; n++) {
      const p = (ph + n / 4) % 1, pe = Math.pow(p, 1.8);
      const y = horizonY + 2 + (shore - horizonY - 4) * pe, k = pe;
      if (k < 0.06) continue;
      const th = 1 + 9 * k * (1 + 0.6 * wk), amp = (0.5 + 3 * k) * (1 + wk);
      const fade = p > 0.93 ? (1 - p) / 0.07 : 1;
      // boyunca yer yer kesilen yumuşak bant: alfa yatay gradyanla verilir (blok/tuğla görüntüsü yok)
      const ag = (col: RGB, amax: number) => {
        const gr = c.createLinearGradient(0, 0, W, 0);
        for (let i = 0; i <= 16; i++) {
          const wx = (i / 16) * W + scrollX;
          const patch = 0.5 + 0.5 * Math.sin(fq(0.009) * wx + n * 2.1 + t * 0.15) * Math.sin(fq(0.023) * wx - n * 1.3);
          gr.addColorStop(i / 16, css(col, amax * fade * Math.min(1, k * 1.6) * (0.2 + 0.8 * patch)));
        }
        return gr;
      };
      const yAt = (x: number) => y + Math.sin(fq(0.012) * (x + scrollX) + n * 1.7 + t * 0.35) * amp;
      const band = (o0: number, o1: number) => { c.beginPath(); for (let x = 0; x <= W + 8; x += 8) { const yy = yAt(x) + o0; x ? c.lineTo(x, yy) : c.moveTo(x, yy); } for (let x = W + 8; x >= 0; x -= 8) c.lineTo(x, yAt(x) + o1); c.closePath(); };
      band(th * 0.3, th * 1.35); c.fillStyle = ag(sw.trough, 0.3); c.fill();
      band(-th * 0.3, th * 0.3); c.fillStyle = ag(sw.face, 0.32); c.fill();
      if (k > 0.25) { band(-th * 0.32, -th * 0.32 + Math.max(0.8, th * 0.12)); c.fillStyle = ag(sw.crest, 0.4 * k); c.fill(); }
    }
    // yüzey: binlerce küçük dalgacık; belirir-söner (pırıl pırıl), kaymaz. Uzakta ince ve sık, yakında iri.
    const Tw = W + 80;
    const hiC = css(mix(hl, mix(hor, top, 0.5), 0.3)), loC = css(mix(deep, [0, 0, 0], 0.35));
    for (const q of this.wl) {
      const life = (t * q.sp + q.ph) % 1, env = Math.sin(life * Math.PI);
      if (env < 0.08) continue;
      const k = q.k, y = horizonY + 2 + k * (shore - horizonY - 8);
      const drift = t * (1 + 5 * wk) * (0.3 + k) * this.windDir;
      const x = (((q.u * Tw + drift - scrollX) % Tw) + Tw) % Tw - 40;
      if (x > W) continue;
      const L = q.len * (0.6 + 0.4 * env), a = env * (0.08 + 0.22 * k + 0.12 * (1 - k));
      if (k < 0.45) {                                                       // uzak: ince parıltı çizgileri
        c.globalAlpha = a * (0.5 + 0.5 * q.hi); c.fillStyle = hiC; c.fillRect(x, y, L, 0.5 + 0.6 * k);
      } else {                                                              // yakın: hilal biçimli dalgacık (ışıklı sırt + gölge)
        const hh = 0.8 + 2.2 * k;
        c.globalAlpha = a * 0.6; c.fillStyle = loC;
        c.beginPath(); c.ellipse(x + L / 2, y + hh * 0.7, L / 2, hh * 0.55, 0, 0, Math.PI); c.fill();
        c.globalAlpha = a * (0.5 + 0.5 * q.hi); c.fillStyle = hiC;
        c.beginPath(); c.ellipse(x + L / 2, y + hh * 0.2, L / 2, hh * 0.4, 0, Math.PI, Math.PI * 2); c.fill();
      }
    }
    c.globalAlpha = 1;
    // ufukta ince pus (deniz ile göğü yumuşakça birleştirir)
    const haze = c.createLinearGradient(0, horizonY - 6, 0, horizonY + 14);
    haze.addColorStop(0, css(hor, 0)); haze.addColorStop(0.4, css(mix(hor, [255, 255, 255], 0.15), 0.35)); haze.addColorStop(1, css(hor, 0));
    c.fillStyle = haze; c.fillRect(0, horizonY - 6, W, 20);
    this.drawRidges(c, scrollX, hor, day);
    this.drawLady(c, scrollX, hor, top, day, now);
    this.drawIsland(c, scrollX, hor, day, now);
    // ışık yolu (ay/güneş): yumuşak ışık sütunu + yavaşça yanıp sönen parıltılar (titreşmez), kıyıya doğru genişler
    const hash = (v: number) => { const x = Math.sin(v * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
    for (const gl of glints) {
      if (gl.k < 0.02 || gl.x < -120 || gl.x > W + 120) continue;
      const col = gl.warm ? '255,214,160' : '235,240,255';
      const glow = c.createLinearGradient(0, horizonY, 0, shore);
      glow.addColorStop(0, `rgba(${col},${(0.22 * gl.k).toFixed(3)})`); glow.addColorStop(1, `rgba(${col},${(0.06 * gl.k).toFixed(3)})`);
      c.save(); c.translate(gl.x, 0); c.scale(1, 1);
      c.beginPath(); c.moveTo(-4, horizonY); c.lineTo(4, horizonY); c.lineTo(52, shore); c.lineTo(-52, shore); c.closePath();
      c.fillStyle = glow; c.globalAlpha = 0.6; c.fill(); c.restore(); c.globalAlpha = 1;
      for (let y = horizonY + 2, row = 0; y < shore; y += 2.5, row++) {
        const k = (y - horizonY) / (shore - horizonY), spread = 5 + 50 * k, n = 2 + Math.floor(4 * k);
        for (let i = 0; i < n; i++) {
          const sp = 0.9 + hash(row * 7 + i) * 1.1, lt = t * sp + hash(row * 13 + i * 5), gen = Math.floor(lt), life = lt - gen;
          const fr = hash(row * 31 + i * 17 + gen * 3.7);
          const x = gl.x + (fr - 0.5) * 2 * spread * (0.6 + 0.4 * Math.sin(t * 0.4 + row));
          const a = gl.k * Math.sin(life * Math.PI) * (0.35 + 0.65 * hash(row + i * 3 + gen)) * (1 - 0.35 * k);
          c.fillStyle = `rgba(${col},${a.toFixed(3)})`;
          c.fillRect(x, y, 1.5 + 7 * k * (0.4 + fr), 0.8 + 0.6 * k);
          if (!gl.warm && day > 0.5 && fr > 0.95 && life > 0.4 && life < 0.6) {
            c.fillStyle = `rgba(255,255,255,${(a * 1.3).toFixed(3)})`;
            c.fillRect(x - 3, y, 7, 0.7); c.fillRect(x + 0.2, y - 2.5, 0.7, 6);
          }
        }
      }
    }
    // balina (aktifse): adanın ve ışık yolunun önünde, kumun arkasında
    this.whale.draw(c, { now, scrollX, W, P, horizonY, shoreY: shore, hor, day, wind: wk, windDir: this.windDir });
    // ufuk çizgisi: çok ince parlak hat
    c.fillStyle = css(mix(hor, [255, 255, 255], 0.35), 0.5);
    c.fillRect(0, horizonY, W, 1);

    // ---- kum
    const key = colors.hor + colors.top + Math.round(day * 30) + sun.map((v) => v.toFixed(1)).join();
    if (key !== this.sandKey) { this.sandKey = key; this.drawSand(hor, top, day, sun); }
    { const P = this.o.skyW; for (let sx = -(((scrollX % P) + P) % P); sx < W; sx += P) c.drawImage(this.sand, Math.round(sx), shore - 6, P, H - shore + 116); }

    // ---- kıyı (6.5 sn döngü; yukarıdaki kabarmalarla aynı faz: sırt kıyıya varınca kırılır)
    const reachOf = (n: number) => 34 * (0.78 + 0.3 * hash(n)) * (1 + 0.7 * wk);   // her dalga farklı mesafeye çıkar; rüzgârda daha uzağa
    // kırılmadan hemen önce: kıyıya yakın sırt kabarır, tepesi beyazlaşır (köpük sırtı), düzensiz
    { const p = ph > 0.86 ? (ph - 0.86) / 0.14 : -1;
      if (p >= 0) {
        const y = shore - 9 + 6 * p;
        for (let x = -8; x < W + 8; x += 6) {
          const wx = x + scrollX, nz = 0.5 + 0.5 * Math.sin(fq(0.031) * wx + cyc) * Math.sin(fq(0.007) * wx - cyc * 0.7);
          const a = p * (0.25 + 0.75 * nz) * (0.45 + 0.4 * day);
          c.fillStyle = `rgba(255,255,255,${(0.55 * a).toFixed(3)})`;
          c.fillRect(x, y + Math.sin(fq(0.02) * wx) * 1.5 - 2 * nz * p, 6.5, 1.2 + 3 * p * nz);
        }
      } }
    // 2) kıyıda kırılan dalga: köpük patlaması + kuma tırmanan su (swash) + geri çekilme (backwash)
    //    ph 0.00–0.38 tırmanış (hızlı başlar, yavaşlar), 0.38–0.95 geri çekilme, sonra kısa bekleme
    const up = ph < 0.38 ? 1 - Math.pow(1 - ph / 0.38, 3) : ph < 0.95 ? 1 - Math.pow((ph - 0.38) / 0.57, 1.6) : 0;
    const maxReach = reachOf(cyc);
    const edge = (x: number) => shore + 2 + up * maxReach + Math.sin(fq(0.04) * x + t * 0.5) * (2 + 3 * up) + Math.sin(fq(0.013) * x - 1.3) * 5 * up;
    // ---- dalga izleri: her dalganın ulaştığı en uç çizgide köpük kalıntısı + koyu ıslak çizgi kalır, ~40 sn'de silinir
    for (let k = ph > 0.38 ? 0 : 1; k <= 2; k++) {
      const m = cyc - k, tM = (m + 0.38) * T, age = t - tM, rM = reachOf(m);
      if (age < 0 || age > 30) continue;
      const decay = Math.exp(-age / 10) * (1 - 0.5 * (1 - day)), line = (x: number) => shore + 2 + rM + Math.sin(fq(0.04) * x + 0.5 * (m % 3)) * 3.5 + Math.sin(fq(0.013) * x - 1.3) * 4;
      // kesik çizgi YOK: suyun ulaştığı yerde yumuşak, sürekli koyu ıslaklık sınırı (zamanla kurur)
      c.strokeStyle = css(mix(hor, [0, 0, 0], 0.55), 0.16 * decay);
      c.lineWidth = 3.5; c.lineJoin = 'round';
      c.beginPath();
      for (let x = 0; x <= W; x += 6) x ? c.lineTo(x, line(x + scrollX)) : c.moveTo(x, line(x + scrollX));
      c.stroke();
      // izde kalan baloncuklar
      for (let i = 0; i < 14; i++) {
        const fx = hash(m * 31 + i), x = (((fx * this.o.skyW - scrollX) % this.o.skyW) + this.o.skyW) % this.o.skyW; if (x > W) continue;
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
    sheet.addColorStop(0, css(mix(mix(shallow, hor, 0.3), [255, 255, 255], 0.06), 0.9));
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
      for (let x = W; x >= 0; x -= 5) c.lineTo(x, edge(x + scrollX) - (band * (k + 1)) / 4 - 1);
      c.closePath(); c.fill();
    }
    // köpük kenarı: tek kesintisiz çizgi; parlaklığı boyunca değişir (yatay gradyan, dünyaya sabit). Boncuk/kesik görüntü yok.
    { const gr = c.createLinearGradient(0, 0, W, 0);
      for (let i = 0; i <= 20; i++) {
        const wx = (i / 20) * W + scrollX, nz = 0.5 + 0.5 * Math.sin(fq(0.05) * wx + cyc * 1.3) * Math.sin(fq(0.017) * wx - cyc);
        gr.addColorStop(i / 20, `rgba(255,255,255,${(foamA * (0.4 + 0.6 * nz)).toFixed(3)})`);
      }
      c.lineCap = 'round'; c.lineJoin = 'round';
      const path = () => { c.beginPath(); for (let x = 0; x <= W; x += 4) x ? c.lineTo(x, edge(x + scrollX)) : c.moveTo(x, edge(x + scrollX)); };
      path(); c.strokeStyle = gr; c.lineWidth = 2.6 + 2.4 * up; c.globalAlpha = 0.45; c.stroke();
      path(); c.lineWidth = 1.1 + 0.8 * up; c.globalAlpha = 1; c.stroke(); }
    // dantel: kenarın arkasında rastgele küçük köpük kümeleri (deterministik, kayarak hareket eder)
    const lace = Math.round(40 + 50 * up);
    for (let i = 0; i < lace; i++) {
      const hx = Math.sin(i * 91.7 + 0.3) * 43758.5453, fx = hx - Math.floor(hx);
      const hy = Math.sin(i * 12.3 + 1.7) * 23421.631, fy = hy - Math.floor(hy);
      const Tl = W + 40, x = (((fx * Tl - scrollX) % Tl) + Tl) % Tl - 20;
      const ey = edge(x + scrollX);
      const y = ey - 2 - fy * (10 + 18 * (1 - up));
      if (y < shore - 8) continue;
      const rr = 0.5 + fy * 1.2;
      c.fillStyle = `rgba(255,255,255,${(foamA * (0.25 + 0.6 * (1 - fy))).toFixed(3)})`;
      c.beginPath(); c.ellipse(x + Math.sin(t * 1.5 + i) * 1.5, y, rr * 2.2, rr * 0.7, 0, 0, Math.PI * 2); c.fill();
    }
    // kırılma anı: kıyı çizgisinde kısa köpük parlaması (ph≈0)
    const burst = ph < 0.12 ? 1 - ph / 0.12 : 0;
    if (burst > 0) {
      for (let x = 0; x < W; x += 8) {
        const nz = 0.5 + 0.5 * Math.sin(fq(0.03) * (x + scrollX) + cyc);
        c.fillStyle = `rgba(255,255,255,${(0.4 * burst * nz * (0.5 + 0.5 * day)).toFixed(3)})`;
        c.fillRect(x, shore - 7 + 2 * (1 - nz), 8.5, 3 + 4 * nz);
      }
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

    // ---- canlı kumsal: yengeçler, gece ateş böcekleri
    this.life.draw(c, now, scrollX, W, this.o.skyW, shore - 6, H - shore + 20, day, hor);
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
