// Balina: arada bir uzak denizde bir balina yüzeye çıkar, nefes verir (püskürtme), sırtını kavislendirir,
// kuyruğunu sudan kaldırıp damlalar süzülerek dalar; ardından suda pürüzsüz "ayak izi" ve halkalar kalır.
// Özgün çizim; tamamen tuval. Dünya x'ine bağlı (kaydırınca denizle birlikte döner). ~15 sn.

type RGB = [number, number, number];
const mix = (a: RGB, b: RGB, t: number): RGB => a.map((v, i) => v + (b[i] - v) * t) as RGB;
const css = (c: RGB, a = 1) => `rgba(${c.map((v) => Math.round(v)).join(',')},${a.toFixed(3)})`;
const sm = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const env = (t: number, a: number, b: number, c: number, d: number) => sm(a, b, t) * (1 - sm(c, d, t));

type P = { x: number; y: number; vx: number; vy: number; age: number; max: number; r0: number; r1: number; kind: 0 | 1 };
type Ring = { x: number; y: number; born: number; max: number; a: number };

export type WhaleCtx = {
  now: number; scrollX: number; W: number; P: number; horizonY: number; shoreY: number;
  hor: RGB; day: number; wind: number; windDir: number;
};

export class Whale {
  private t0 = -1;
  private wx = 0; private k = 0.3; private dir = 1;
  private parts: P[] = [];
  private rings: Ring[] = [];
  private blown = [false, false];
  private dove = false;
  private last = 0;
  private dripAcc = 0;
  /** sonraki kendiliğinden çıkış (ms, performance.now) */
  next = performance.now() + 90_000 + Math.random() * 120_000;
  get active() { return this.t0 >= 0; }

  start(now: number, scrollX: number, W: number) {
    this.t0 = now; this.last = now;
    this.k = 0.16 + Math.random() * 0.2;                         // uzaklık (0 ufuk … 1 kıyı)
    this.dir = Math.random() < 0.5 ? -1 : 1;
    const side = Math.random() < 0.5 ? 0.24 : 0.7;                // adanın tam önüne değil, yanlara
    this.wx = scrollX + W * (side + Math.random() * 0.08);
    this.parts = []; this.rings = []; this.blown = [false, false]; this.dove = false; this.dripAcc = 0;
  }

  /** @returns çizim yaptıysa true */
  draw(c: CanvasRenderingContext2D, o: WhaleCtx): boolean {
    if (this.t0 < 0) return false;
    const t = (o.now - this.t0) / 1000, dt = Math.min(0.05, (o.now - this.last) / 1000); this.last = o.now;
    if (t > 16.5 && !this.parts.length && !this.rings.length) { this.t0 = -1; this.next = o.now + 150_000 + Math.random() * 210_000; return false; }
    const s = 0.42 + 0.95 * this.k, L = 130 * s;                  // perspektif ölçeği, gövde boyu
    const wy = o.horizonY + 3 + this.k * (o.shoreY - o.horizonY - 6);
    let bx = this.wx - o.scrollX; bx -= o.P * Math.round((bx - o.W / 2) / o.P);
    const swim = t * 5.5 * s * this.dir;                         // yavaşça ilerler
    const cx = bx + swim, d = this.dir;
    const night = 1 - o.day;
    const body: RGB = mix(mix([34, 46, 58], [8, 11, 20], night), o.hor, 0.12);
    const belly: RGB = mix(body, [255, 255, 255], 0.12 + 0.18 * o.day);
    const rim: RGB = mix(o.hor, [255, 255, 255], 0.55 + 0.2 * o.day);
    const spray: RGB = mix([255, 255, 255], [205, 220, 255], night * 0.6);
    const ringC = mix(o.hor, [255, 255, 255], 0.5);
    if (cx < -L * 2 || cx > o.W + L * 2) { this.step(dt, wy, s); return true; }

    // ---- 0) su altından yaklaşan gölge (koyu, yumuşak)
    const shadow = env(t, 0, 1.0, 1.4, 1.9) * 0.5 + env(t, 4.2, 4.9, 5.3, 5.8) * 0.35;
    if (shadow > 0.01) {
      c.save(); c.translate(cx, wy + 3 * s); c.scale(1, 0.16);
      const g = c.createRadialGradient(0, 0, 0, 0, 0, L * 0.6);
      g.addColorStop(0, css(mix(body, [0, 0, 0], 0.4), 0.45 * shadow)); g.addColorStop(1, css(body, 0));
      c.fillStyle = g; c.fillRect(-L * 0.6, -L * 0.6, L * 1.2, L * 1.2); c.restore();
    }

    // ---- 1) sırt: iki yüzeye çıkış (ilki baş + püskürtme, ikincisi sırt yüzgeci + kuyruk öncesi yüksek kavis)
    const e1 = env(t, 1.0, 1.7, 3.3, 4.2);
    const e2 = env(t, 5.0, 5.7, 7.2, 8.0);
    const arch = sm(6.4, 7.6, t) * (1 - sm(7.6, 8.4, t));         // dalış öncesi gövde kamburlaşır
    for (const [e, phase] of [[e1, 0], [e2, 1]] as const) {
      if (e < 0.01) continue;
      const roll = phase === 0 ? sm(1.0, 4.2, t) : sm(5.0, 8.0, t);         // görünen kısım baştan kuyruğa kayar
      const a = L * (0.32 + 0.12 * phase + 0.08 * arch);
      const hb = (7 + 4 * phase + 10 * arch * phase) * s * e;
      const off = (0.28 - 0.56 * roll) * L * d;                              // gövdenin hangi kısmı suyun üstünde
      const x0 = cx + off;
      this.back(c, x0, wy, a, hb, d, body, belly, rim, e, o.day);
      if (phase === 1 && roll > 0.25 && roll < 0.85) this.fin(c, x0 - d * a * 0.15, wy - hb * 0.95, 5.5 * s * e, d, body, rim);
      // suyun gövdeyi sarıp akması: iki uçta köpük ve sırttan süzülen ince su tabakası
      this.foamEdges(c, x0, wy, a * 0.98, s, e, spray);
      if (Math.random() < 0.08 * e) this.rings.push({ x: x0 + (Math.random() - 0.5) * a * 1.6, y: wy, born: o.now, max: 1.2, a: 0.22 });
      // püskürtme: yüzeye çıkışın başında (ikincisi daha küçük)
      if (!this.blown[phase] && e > 0.55) { this.blown[phase] = true; this.blow(x0 + d * a * 0.55, wy - hb * 0.9, s, phase ? 0.65 : 1, o); }
    }

    // ---- 2) kuyruk: sudan yükselir, tepede durur, damlalar süzülür, dikey kayarak dalar
    const up = sm(7.6, 8.9, t), down = sm(9.6, 11.0, t), f = up * (1 - down);
    if (f > 0.005) {
      const fx = cx - d * L * 0.08, hF = L * 0.46 * (0.25 + 0.75 * up), lift = -hF * up + hF * 1.15 * down;
      const tilt = (0.06 * Math.sin(t * 1.3) + 0.05 * d) * (1 - down);
      c.save();
      c.beginPath(); c.rect(fx - L, wy - L * 1.2, L * 2, L * 1.2 + 0.5); c.clip();          // yalnızca su üstü
      c.translate(fx, wy + lift + hF); c.rotate(tilt);
      this.fluke(c, L * 0.29, hF, body, belly, rim, o.day);
      c.restore();
      // kuyruk dibinde köpük halkası
      this.foamEdges(c, fx, wy, L * 0.07 + 4 * s, s, Math.min(1, f * 1.5), spray);
      // damlalar: arka kenardan ince ipler gibi süzülür
      if (up > 0.6 && down < 0.7) {
        this.dripAcc += dt * 38;
        while (this.dripAcc > 1) {
          this.dripAcc--;
          const u = Math.random() * 2 - 1, w = L * 0.29;
          const ex = fx + u * w * 0.95, ey = wy + lift + hF - hF * (0.8 + 0.18 * (1 - Math.abs(u)) - (Math.abs(u) < 0.1 ? 0.08 : 0));
          this.parts.push({ x: ex, y: ey, vx: (Math.random() - 0.5) * 4 * s, vy: Math.random() * 10 * s, age: 0, max: 1.6, r0: 0.7 * s + 0.4, r1: 0.7 * s + 0.4, kind: 1 });
        }
      }
    }
    if (t > 10.7 && !this.dove) {
      this.dove = true;
      for (let i = 0; i < 3; i++) this.rings.push({ x: cx - d * L * 0.08, y: wy, born: o.now + i * 450, max: 5 + i, a: 0.55 });
    }

    // ---- 3) dalıştan sonra suda pürüzsüz, parlak "ayak izi" (balina izi)
    const slick = env(t, 10.4, 11.2, 13.5, 16.3);
    if (slick > 0.01) {
      c.save(); c.translate(cx - d * L * 0.1, wy + 1.5 * s); c.scale(1, 0.13);
      const g = c.createRadialGradient(0, 0, 0, 0, 0, L * 0.55);
      g.addColorStop(0, css(mix(o.hor, [255, 255, 255], 0.25), 0.28 * slick)); g.addColorStop(0.7, css(o.hor, 0.12 * slick)); g.addColorStop(1, css(o.hor, 0));
      c.fillStyle = g; c.fillRect(-L * 0.6, -L * 0.6, L * 1.2, L * 1.2); c.restore();
    }

    this.step(dt, wy, s);
    this.drawRings(c, o.now, s, ringC);
    this.drawParts(c, spray, wy, night);
    return true;
  }

  private back(c: CanvasRenderingContext2D, x0: number, wy: number, a: number, hb: number, d: number, body: RGB, belly: RGB, rim: RGB, e: number, day: number) {
    // önü (baş tarafı) küt, arkası uzun ve ince: asimetrik kavis
    const N = 28, pts: [number, number][] = [];
    for (let i = 0; i <= N; i++) {
      const u = (i / N) * 2 - 1;                                    // -1 arka … +1 ön
      const shape = u > 0 ? Math.pow(1 - u * u, 0.5) : Math.pow(1 - u * u, 0.95);
      pts.push([x0 + u * a * d, wy - hb * shape * (1 - 0.12 * Math.max(0, -u))]);
    }
    c.save();
    c.beginPath(); c.moveTo(pts[0][0], wy + 0.5);
    for (const [x, y] of pts) c.lineTo(x, y);
    c.lineTo(pts[N][0], wy + 0.5); c.closePath();
    const g = c.createLinearGradient(0, wy - hb, 0, wy);
    g.addColorStop(0, css(mix(body, rim, 0.18))); g.addColorStop(0.5, css(body)); g.addColorStop(1, css(belly, 0.95));
    c.fillStyle = g; c.fill();
    // ıslak parlaklık: sırtın tepesinde ince ışık (ay/güneş)
    c.beginPath();
    for (let i = 4; i <= N - 4; i++) { const [x, y] = pts[i]; i === 4 ? c.moveTo(x, y + 0.4) : c.lineTo(x, y + 0.4); }
    c.strokeStyle = css(rim, (0.35 + 0.25 * day) * e); c.lineWidth = 0.9; c.stroke();
    // sırttan süzülen su (ince açık çizgiler aşağı akar)
    c.strokeStyle = css(rim, 0.18 * e); c.lineWidth = 0.6;
    for (let i = 8; i < N - 6; i += 7) { const [x, y] = pts[i]; c.beginPath(); c.moveTo(x, y + 1); c.lineTo(x + 0.3, Math.min(wy, y + 1 + hb * 0.55)); c.stroke(); }
    c.restore();
    // suda yansıma (ters, soluk, dalgayla kırık)
    c.save(); c.globalAlpha = 0.18 * e; c.fillStyle = css(body);
    for (let b = 0; b < 3; b++) { c.fillRect(x0 - a * (0.8 - b * 0.15), wy + 1 + b * 1.6, a * 2 * (0.8 - b * 0.15), 1.1); }
    c.restore();
  }

  private fin(c: CanvasRenderingContext2D, x: number, y: number, h: number, d: number, body: RGB, rim: RGB) {
    if (h < 0.6) return;
    c.beginPath();
    c.moveTo(x - d * h * 0.9, y + 1);
    c.quadraticCurveTo(x - d * h * 0.1, y - h * 0.4, x - d * h * 0.35, y - h);      // öne hafif kıvrık uç
    c.quadraticCurveTo(x + d * h * 0.4, y - h * 0.35, x + d * h * 0.9, y + 1);
    c.closePath(); c.fillStyle = css(body); c.fill();
    c.strokeStyle = css(rim, 0.3); c.lineWidth = 0.6; c.stroke();
  }

  private fluke(c: CanvasRenderingContext2D, w: number, h: number, body: RGB, belly: RGB, rim: RGB, day: number) {
    // yerel: taban (0,0), yukarı -y. Alttan görünen kuyruk: iki lop, ortada çentik, tırtıklı arka kenar
    const sw = w * 0.13;
    const pth = new Path2D();
    const cc = { moveTo: (x: number, y: number) => pth.moveTo(x, y), lineTo: (x: number, y: number) => pth.lineTo(x, y), bezierCurveTo: (a: number, b: number, d: number, e: number, f: number, g: number) => pth.bezierCurveTo(a, b, d, e, f, g) };
    cc.moveTo(-sw, 0);
    cc.bezierCurveTo(-sw * 0.8, -h * 0.35, -w * 0.35, -h * 0.55, -w, -h * 0.74);           // sol ön kenar → uç
    // arka kenar: uçtan çentiğe, hafif dalgalı
    const scal = (x0: number, y0: number, x1: number, y1: number, bulge: number) => {
      const n = 6;
      for (let i = 1; i <= n; i++) {
        const u = i / n, x = x0 + (x1 - x0) * u, yb = y0 + (y1 - y0) * u - Math.sin(u * Math.PI) * bulge;
        cc.lineTo(x, yb + Math.sin(u * Math.PI * 5) * h * 0.012);
      }
    };
    scal(-w, -h * 0.74, -w * 0.06, -h * 0.9, h * 0.16);
    cc.lineTo(0, -h * 0.84);                                                                 // çentik
    cc.lineTo(w * 0.06, -h * 0.9);
    scal(w * 0.06, -h * 0.9, w, -h * 0.74, h * 0.16);
    cc.bezierCurveTo(w * 0.35, -h * 0.55, sw * 0.8, -h * 0.35, sw, 0);
    pth.closePath();
    const g = c.createLinearGradient(0, -h, 0, 0);
    g.addColorStop(0, css(mix(body, rim, 0.12))); g.addColorStop(0.55, css(body)); g.addColorStop(1, css(mix(body, [0, 0, 0], 0.2)));
    c.fillStyle = g; c.fill(pth);
    // kuyruk altındaki açık lekeler (her balinanın kendine özgü deseni), gündüz belirgin
    c.save(); c.clip(pth);
    for (const [px, py, rx, ry, a] of [[-0.6, 0.76, 0.2, 0.04, 1], [-0.32, 0.7, 0.1, 0.03, 0.7], [0.45, 0.74, 0.18, 0.04, 0.9], [0.72, 0.77, 0.09, 0.03, 0.6]]) {
      const gg = c.createRadialGradient(px * w, -py * h, 0, px * w, -py * h, rx * w);
      gg.addColorStop(0, css(belly, (0.25 + 0.3 * day) * a)); gg.addColorStop(1, css(belly, 0));
      c.save(); c.translate(px * w, -py * h); c.scale(1, ((ry / rx) * h) / w); c.translate(-px * w, py * h);
      c.fillStyle = gg; c.fillRect(px * w - rx * w, -py * h - rx * w, rx * w * 2, rx * w * 2); c.restore();
    }
    c.restore();
    c.strokeStyle = css(rim, 0.45 + 0.2 * day); c.lineWidth = 0.8; c.stroke(pth);
  }

  private foamEdges(c: CanvasRenderingContext2D, x0: number, wy: number, a: number, s: number, e: number, spray: RGB) {
    for (const sgn of [-1, 1]) {
      const x = x0 + sgn * a;
      c.fillStyle = css(spray, 0.55 * e);
      c.beginPath(); c.ellipse(x, wy, 4 * s + 2, 1.1 * s + 0.4, 0, 0, Math.PI * 2); c.fill();
    }
    c.fillStyle = css(spray, 0.3 * e);
    c.fillRect(x0 - a, wy - 0.4, a * 2, 1);
  }

  private blow(x: number, y: number, s: number, power: number, o: WhaleCtx) {
    // V biçimli, gür bir sis bulutu: hızlı çekirdek + yavaşça genişleyen buhar; rüzgârla sürüklenir
    const n = Math.round(220 * power);
    for (let i = 0; i < n; i++) {
      const core = i < n * 0.35, side = 1;
      const g = (Math.random() + Math.random() + Math.random()) / 3 - 0.5;          // ~normal: sürekli bir bulut, ayrı ayrı sütun değil
      const spread = g * (core ? 0.35 : 1.2);
      const sp = (55 + Math.random() * 60) * s * power * (core ? 1.15 : 0.85);
      this.parts.push({
        x: x + (Math.random() - 0.5) * 2 * s, y,
        vx: side * spread * sp + o.wind * 10 * o.windDir * s, vy: -sp,
        age: -Math.random() * 0.25, max: 2.2 + Math.random() * 1.6,
        r0: 1.2 * s + 0.5, r1: (4 + Math.random() * 7) * s, kind: 0,
      });
    }
    this.rings.push({ x, y: y + 2, born: o.now, max: 2.5, a: 0.35 });
  }

  private step(dt: number, wy: number, s: number) {
    for (const p of this.parts) {
      p.age += dt; if (p.age < 0) continue;
      if (p.kind === 0) { p.vy += 22 * s * dt; p.vx *= 1 - 1.1 * dt; p.vy *= 1 - 1.5 * dt; }   // buhar: yavaşlar, havada asılı kalır
      else { p.vy += 120 * s * dt; }                                                         // damla: düşer
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.kind === 1 && p.y >= wy) { p.age = p.max; if (Math.random() < 0.25) this.rings.push({ x: p.x, y: wy, born: performance.now(), max: 1.2, a: 0.3 }); }
    }
    this.parts = this.parts.filter((p) => p.age < p.max);
  }

  private drawParts(c: CanvasRenderingContext2D, spray: RGB, wy: number, night: number) {
    c.save();
    if (night > 0.5) c.globalCompositeOperation = 'lighter';
    for (const p of this.parts) {
      if (p.age < 0) continue;
      const u = p.age / p.max;
      if (p.kind === 0) {
        const r = p.r0 + (p.r1 - p.r0) * Math.pow(u, 0.6);
        const a = (night > 0.5 ? 0.05 : 0.085) * Math.pow(1 - u, 1.3) * Math.min(1, p.age * 6);
        const y = Math.min(p.y, wy - 1);
        // yumuşak sis tanesi: kenarı silik (top top görünmez)
        c.fillStyle = css(spray, a * 0.5); c.beginPath(); c.arc(p.x, y, r, 0, Math.PI * 2); c.fill();
        c.fillStyle = css(spray, a); c.beginPath(); c.arc(p.x, y, r * 0.55, 0, Math.PI * 2); c.fill();
      } else {
        c.fillStyle = css(spray, 0.45 * (1 - u));
        c.fillRect(p.x - p.r0 * 0.3, p.y - p.r0 * 3, p.r0 * 0.6, p.r0 * 3.5);
      }
    }
    c.restore();
  }

  private drawRings(c: CanvasRenderingContext2D, now: number, s: number, col: RGB) {
    for (const r of this.rings) {
      const u = (now - r.born) / 1000 / r.max; if (u < 0) continue;
      const rr = (2 + 10 * r.max * Math.pow(u, 0.7)) * s;
      c.strokeStyle = css(col, r.a * Math.pow(1 - u, 1.5)); c.lineWidth = 0.8;
      c.beginPath(); c.ellipse(r.x, r.y + 1, rr, rr * 0.16, 0, 0, Math.PI * 2); c.stroke();
    }
    this.rings = this.rings.filter((r) => (now - r.born) / 1000 < r.max);
  }
}

