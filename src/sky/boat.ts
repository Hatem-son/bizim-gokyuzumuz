import { PINK_BOW_COLORS, PINK_BOW_PATHS } from '../lib/illustrations';
import { PEOPLE } from '../lib/people';
import { STORAGE_KEYS, store } from '../lib/storage';
import type { Who } from '../types';

const BOAT_TEXTS: Record<Who, string[]> = {
  // Ham ham'ın uygulamasında (Ham ham'dan Beto'ya)
  hamham: [
    'Rüzgar seni bana getirsin',
    `Pusulam sensin ${PEOPLE.beto.name}`,
    'Yıldızlar yolumu gösteriyor, sana geliyorum',
    'Okyanus aramızda ama gökyüzü ortak',
    'Her dalga seni biraz yaklaştırıyor',
    `Limanım sensin ${PEOPLE.beto.name}`,
    'Seni seviyorum Betoooo',
    'Yolum hep sana çıkıyor',
  ],
  // Beto'nun uygulamasında (Beto'dan Ham ham'a)
  beto: [
    'Rüzgar seni bana getirsin',
    `Pusulam sensin ${PEOPLE.hamham.name}`,
    'Aynı yıldızlara bakıyoruz',
    'Okyanus ne kadar büyük olsa da gönlüm sende',
    `Limanım sensin ${PEOPLE.hamham.name}`,
    'Her gece yıldızlardan yolunu soruyorum',
    'Seni seviyorum Ham hamııı',
    'Yolum hep sana çıkıyor',
  ],
};

function pickBoatText(who: Who): string {
  const last = store.get<string>(STORAGE_KEYS.boat, '');
  const pool = BOAT_TEXTS[who].filter((t) => t !== last);
  const picked = pool[Math.floor(Math.random() * pool.length)] ?? BOAT_TEXTS[who][0];
  store.set(STORAGE_KEYS.boat, picked);
  return picked;
}

export class BoatController {
  private readonly boatSprite = document.createElement('canvas');
  private readonly bowSprite = document.createElement('canvas');
  private readonly bannerCanvas = document.createElement('canvas');
  private readonly texScale = 4;

  private active = false;
  private rev = false;
  private reducedFade = false;
  private fadingOut = false;
  private fadeStartT = 0;
  private startT = 0;
  private dur = 30_000;
  private baseY = 260;
  private withBanner = true;

  private readonly boatW = 72;
  private readonly boatH = 58;
  private readonly hullLen = 60;
  private readonly bowW = 10; // ≈ %16.6 gövde uzunluğu (~%15)
  private readonly bowH = 7;
  private bannerW = 200;
  private readonly bannerH = 34;
  private readonly notchW = 12;
  private readonly ropeW = 24;
  private fontsReady = false;
  private lastScreenBox: { x: number; y: number; w: number; h: number } | null = null;
  private lastBannerBox: { x: number; y: number; w: number; h: number } | null = null;

  constructor() {
    this.bakeBoatSprite();
    this.bakeBowSprite();
    void this.ensureFontsLoaded();
  }

  private async ensureFontsLoaded(): Promise<void> {
    if (this.fontsReady) return;
    if (typeof document !== 'undefined' && 'fonts' in document) {
      try {
        await document.fonts.load('400 20px "Great Vibes"', 'Okyanus rüzgar pusulam limanım ŞĞÜÖÇİı Beto Ham');
        await document.fonts.ready;
      } catch {
        // Sistem fontuna temiz düşüş
      }
    }
    this.fontsReady = true;
  }

  public isActive(): boolean {
    return this.active;
  }

  public hitTest(clientX: number, clientY: number): boolean {
    if (!this.active || this.fadingOut) return false;
    const inBox = (b: { x: number; y: number; w: number; h: number } | null) =>
      !!b && clientX >= b.x - 10 && clientX <= b.x + b.w + 10 && clientY >= b.y - 10 && clientY <= b.y + b.h + 10;
    return inBox(this.lastScreenBox) || inBox(this.lastBannerBox);
  }

  public dismissWithFade(now = performance.now()): boolean {
    if (!this.active || this.fadingOut) return false;
    this.fadingOut = true;
    this.fadeStartT = now;
    return true;
  }

  private bakeBowSprite(): void {
    const s = this.texScale;
    this.bowSprite.width = 40 * s;
    this.bowSprite.height = 28 * s;
    const g = this.bowSprite.getContext('2d');
    if (!g) return;
    g.scale(s, s);
    g.clearRect(0, 0, 40, 28);

    const drawPath = (d: string, fill: string) => {
      g.fillStyle = fill;
      g.fill(new Path2D(d));
    };
    drawPath(PINK_BOW_PATHS.tails, PINK_BOW_COLORS.tail);
    drawPath(PINK_BOW_PATHS.leftWing, PINK_BOW_COLORS.wing);
    drawPath(PINK_BOW_PATHS.rightWing, PINK_BOW_COLORS.wing);
    drawPath(PINK_BOW_PATHS.innerShade, PINK_BOW_COLORS.wingShade);

    g.save();
    g.strokeStyle = PINK_BOW_COLORS.highlight;
    g.globalAlpha = 0.7;
    g.lineWidth = 1.15;
    g.lineCap = 'round';
    g.stroke(new Path2D(PINK_BOW_PATHS.highlight));
    g.restore();

    drawPath(PINK_BOW_PATHS.knot, PINK_BOW_COLORS.knot);
  }

  /** Özgün, sade yelkenli tekne (@4x): hilal gövde, tek direk, #f4efe6 üçgen yelken, küçük flama (≤ 6 path) */
  private bakeBoatSprite(): void {
    const s = this.texScale;
    this.boatSprite.width = this.boatW * s;
    this.boatSprite.height = this.boatH * s;
    const g = this.boatSprite.getContext('2d');
    if (!g) return;
    g.scale(s, s);
    g.clearRect(0, 0, this.boatW, this.boatH);

    // 1. Tek dikey direk
    g.strokeStyle = '#d4b499';
    g.lineWidth = 1.9;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(36, 10);
    g.lineTo(36, 44);
    g.stroke();

    // 2. Üçgen yelken (#f4efe6)
    g.fillStyle = '#f4efe6';
    g.beginPath();
    g.moveTo(37.2, 13.5);
    g.quadraticCurveTo(55, 25, 61, 38.5);
    g.quadraticCurveTo(48, 40.5, 37.2, 39.2);
    g.closePath();
    g.fill();

    // Yelken üzerinde yumuşak kıvrım gölgesi
    g.fillStyle = 'rgba(182, 165, 146, 0.22)';
    g.beginPath();
    g.moveTo(37.2, 13.5);
    g.quadraticCurveTo(43.5, 27, 45.5, 39.6);
    g.lineTo(37.2, 39.2);
    g.closePath();
    g.fill();

    // 3. Direğin ucunda rüzgar yönü flaması
    g.fillStyle = '#ec7a98';
    g.beginPath();
    g.moveTo(35.4, 10.2);
    g.lineTo(25.5, 12.6);
    g.lineTo(35.4, 14.8);
    g.closePath();
    g.fill();

    // 4. Yarım ay (hilal) formunda gövde
    const hullGrad = g.createLinearGradient(8, 42, 64, 53);
    hullGrad.addColorStop(0, '#7c5368');
    hullGrad.addColorStop(0.55, '#996a80');
    hullGrad.addColorStop(1, '#684457');
    g.fillStyle = hullGrad;
    g.beginPath();
    g.moveTo(6, 41.5);
    g.quadraticCurveTo(36, 47.5, 66, 41.5);
    g.quadraticCurveTo(60, 52.5, 36, 53.2);
    g.quadraticCurveTo(12, 52.5, 6, 41.5);
    g.closePath();
    g.fill();

    // 5. İnce küpeşte şeridi
    g.strokeStyle = 'rgba(244, 239, 230, 0.72)';
    g.lineWidth = 1.25;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(9, 43.2);
    g.quadraticCurveTo(36, 48.2, 63, 43.2);
    g.stroke();
  }

  private bakeBannerTexture(rawText: string, maxBannerW: number): void {
    const s = this.texScale;
    const probe = this.bannerCanvas.getContext('2d');
    if (!probe) return;

    let text = rawText;
    let fontSize = 19;
    const maxTextW = Math.max(96, maxBannerW - 58);

    probe.font = `400 ${fontSize}px "Great Vibes", "Snell Roundhand", cursive`;
    let metrics = probe.measureText(text);
    while (metrics.width > maxTextW && fontSize > 14.5) {
      fontSize -= 0.75;
      probe.font = `400 ${fontSize}px "Great Vibes", "Snell Roundhand", cursive`;
      metrics = probe.measureText(text);
    }
    if (metrics.width > maxTextW) {
      while (text.length > 8 && probe.measureText(`${text}…`).width > maxTextW) {
        text = text.slice(0, -1).trimEnd();
      }
      text = `${text}…`;
      metrics = probe.measureText(text);
    }

    const leftOver = Math.ceil(Math.max(0, metrics.actualBoundingBoxLeft ?? 0));
    const inkW = Math.ceil(Math.max(metrics.width, metrics.actualBoundingBoxRight ?? metrics.width)) + leftOver;
    const padLeft = this.rev ? 18 : 24 + this.notchW;
    const padRight = this.rev ? 24 + this.notchW : 20;
    this.bannerW = Math.min(maxBannerW, Math.max(168, inkW + padLeft + padRight));

    this.bannerCanvas.width = this.bannerW * s;
    this.bannerCanvas.height = this.bannerH * s;
    const g = this.bannerCanvas.getContext('2d');
    if (!g) return;

    g.scale(s, s);
    g.clearRect(0, 0, this.bannerW, this.bannerH);

    const heartX = this.rev ? 14 : this.notchW + 16;
    const heartY = this.bannerH / 2 - 4.2;
    const hs = 10;
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(heartX, heartY + hs * 0.3);
    g.bezierCurveTo(heartX, heartY, heartX - hs * 0.5, heartY - hs * 0.05, heartX - hs * 0.5, heartY + hs * 0.3);
    g.bezierCurveTo(heartX - hs * 0.5, heartY + hs * 0.6, heartX, heartY + hs * 0.8, heartX, heartY + hs);
    g.bezierCurveTo(heartX, heartY + hs * 0.8, heartX + hs * 0.5, heartY + hs * 0.6, heartX + hs * 0.5, heartY + hs * 0.3);
    g.bezierCurveTo(heartX + hs * 0.5, heartY - hs * 0.05, heartX, heartY, heartX, heartY + hs * 0.3);
    g.fill();

    const asc = metrics.actualBoundingBoxAscent ?? fontSize * 0.72;
    const desc = metrics.actualBoundingBoxDescent ?? fontSize * 0.28;
    const baselineY = this.bannerH / 2 + (asc - desc) * 0.5;
    g.fillStyle = '#531b48';
    g.textBaseline = 'alphabetic';
    g.font = `400 ${fontSize}px "Great Vibes", "Snell Roundhand", cursive`;
    g.fillText(text, heartX + 12 + leftOver, baselineY);
  }

  public launch(who: Who, skyTop: number, skyHeight: number, skyW: number, reducedMotion = false): boolean {
    if (this.active) return false;
    if (!this.fontsReady) {
      void this.ensureFontsLoaded();
      return false;
    }

    this.reducedFade = reducedMotion;
    this.fadingOut = false;
    this.fadeStartT = 0;
    // Tekne her zaman soldan sağa ileri yönde süzülür; pankart arkasından gelir
    this.rev = false;
    this.startT = performance.now();
    this.dur = reducedMotion ? 3200 : 28_000 + Math.random() * 6000;
    // Gökyüzünün orta kuşağı (sayaç ve ayın altı, ufuğun üstü)
    this.baseY = skyTop + skyHeight * (0.42 + Math.random() * 0.16);
    this.withBanner = true;

    const maxBannerW = Math.max(170, Math.min(248, skyW - this.boatW - this.ropeW - 36));
    this.bakeBannerTexture(pickBoatText(who), maxBannerW);
    this.active = true;
    this.lastScreenBox = null;
    this.lastBannerBox = null;
    return true;
  }

  public stop(): void {
    this.active = false;
    this.fadingOut = false;
    this.lastScreenBox = null;
    this.lastBannerBox = null;
  }

  public draw(ctx: CanvasRenderingContext2D, now: number, skyW: number): void {
    if (!this.active) return;

    const elapsed = now - this.startT;
    if (elapsed >= this.dur) {
      this.stop();
      return;
    }

    let fadeAlpha = 1;
    if (this.fadingOut) {
      const fk = Math.min(1, (now - this.fadeStartT) / 420);
      fadeAlpha = 1 - fk;
      if (fk >= 1) {
        this.stop();
        return;
      }
    }

    const ts = now / 1000;
    let boatX: number;
    let y: number;
    let alpha: number;
    let pitch: number;

    if (this.reducedFade) {
      const p = Math.max(0, Math.min(1, elapsed / this.dur));
      alpha = (p < 0.2 ? p / 0.2 : p > 0.8 ? (1 - p) / 0.2 : 1) * fadeAlpha;
      boatX = skyW * 0.5 - this.boatW * 0.5;
      y = this.baseY;
      pitch = 0;
    } else {
      const p = Math.max(0, Math.min(1, elapsed / this.dur));
      const totalW = this.bannerW + this.ropeW + this.boatW + 32;
      const fromX = this.rev ? skyW + 24 : -totalW;
      const toX = this.rev ? -totalW : skyW + 24;
      const baseX = fromX + (toX - fromX) * p;
      boatX = this.rev ? baseX : baseX + this.bannerW + this.ropeW;
      // 4 sn periyotta ±4 px yumuşak dalga hareketi
      const bobY = Math.sin((ts * Math.PI * 2) / 4.0) * 4;
      y = this.baseY + bobY;
      alpha = (p < 0.05 ? p / 0.05 : p > 0.95 ? (1 - p) / 0.05 : 1) * fadeAlpha;
      pitch = Math.cos((ts * Math.PI * 2) / 4.0) * 0.032 * (this.rev ? -1 : 1);
    }

    const boatCy = y + this.boatH * 0.5;
    const flagX = this.rev ? boatX + this.boatW + this.ropeW : boatX - this.ropeW - this.bannerW;
    const flagY = y + 18;

    ctx.save();
    ctx.globalAlpha = alpha;

    // 1. Geçtiği yolda çok silik yıldız tozu izi (8–10 küçük nokta, opaklık ≤ .25, filtre yok)
    if (!this.reducedFade) {
      const dotCount = 9;
      const dirSign = this.rev ? 1 : -1;
      const wakeStartX = this.rev ? boatX + this.hullLen + 2 : boatX + 10;
      const wakeBaseY = y + 48;
      for (let i = 0; i < dotCount; i++) {
        const k = i / dotCount;
        const wx = wakeStartX + dirSign * (10 + i * 13);
        const wy = wakeBaseY + Math.sin(ts * 2.4 - i * 0.7) * 2.2;
        const da = 0.24 * (1 - k) * alpha;
        if (da <= 0.01) continue;
        ctx.globalAlpha = da;
        ctx.fillStyle = i % 2 === 0 ? '#f4efe6' : '#dbe6ff';
        ctx.beginPath();
        ctx.arc(wx, wy, 1.5 - k * 0.65, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = alpha;
    }

    // 2. Küçük arka bayrak + ince ip (hareket hâlinde)
    if (this.withBanner && !this.reducedFade) {
      const sternX = this.rev ? boatX + this.boatW - 6 : boatX + 6;
      const sternY = y + 42;
      const ropeEndX = this.rev ? flagX : flagX + this.bannerW;
      const flagSwing = Math.sin((ts * Math.PI * 2) / 4.0 - 0.6) * 1.4;

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.68)';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(sternX, sternY);
      ctx.quadraticCurveTo((sternX + ropeEndX) / 2, sternY - 4, ropeEndX, flagY + 4 + flagSwing);
      ctx.moveTo(sternX, sternY);
      ctx.quadraticCurveTo((sternX + ropeEndX) / 2, sternY + 4, ropeEndX, flagY + this.bannerH - 4 + flagSwing);
      ctx.stroke();

      const steps = 14;
      const pts: { x: number; topY: number; botY: number; slope: number; far: number }[] = [];
      for (let i = 0; i <= steps; i++) {
        const u = i / steps;
        const sx = u * this.bannerW;
        const far = this.rev ? u : 1 - u;
        const amp = 0.4 + far * far * 3.0;
        const phase = ts * 4.6 - (1 - far) * 3.6;
        const wave = Math.sin(phase);
        const dy = wave * amp + flagSwing * (1 - far * 0.4);
        const dh = this.bannerH * (1 + far * 0.03 * wave);
        const topY = flagY + (this.bannerH - dh) / 2 + dy;
        pts.push({ x: flagX + sx, topY, botY: topY + dh, slope: Math.cos(phase), far });
      }

      const leftMid = (pts[0].topY + pts[0].botY) * 0.5;
      const rightMid = (pts[steps].topY + pts[steps].botY) * 0.5;

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].topY);
      for (let i = 1; i <= steps; i++) ctx.lineTo(pts[i].x, pts[i].topY);
      if (this.rev) ctx.lineTo(flagX + this.bannerW - this.notchW, rightMid);
      for (let i = steps; i >= 0; i--) ctx.lineTo(pts[i].x, pts[i].botY);
      if (!this.rev) ctx.lineTo(flagX + this.notchW, leftMid);
      ctx.closePath();

      const bg = ctx.createLinearGradient(0, flagY - 3, 0, flagY + this.bannerH + 3);
      bg.addColorStop(0, '#fae0eb');
      bg.addColorStop(0.55, '#f2c3d7');
      bg.addColorStop(1, '#e6a5c2');
      ctx.fillStyle = bg;
      ctx.fill();

      ctx.save();
      ctx.clip();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      const s = this.texScale;
      for (let i = 0; i < steps; i++) {
        const p0 = pts[i];
        const p1 = pts[i + 1];
        const w = p1.x - p0.x;
        if (w <= 0) continue;
        const sx = (i / steps) * this.bannerW;
        const sw = this.bannerW / steps;
        const shear = (p1.topY - p0.topY) / w;
        const scaleY = (p0.botY - p0.topY + (p1.botY - p1.topY)) / (2 * this.bannerH);
        ctx.save();
        ctx.transform(1, shear, 0, scaleY, p0.x, p0.topY);
        ctx.drawImage(this.bannerCanvas, sx * s, 0, sw * s, this.bannerH * s, -0.3, 0, w + 0.6, this.bannerH);
        ctx.restore();
      }
      ctx.restore();

      ctx.strokeStyle = '#cf7ba0';
      ctx.lineWidth = 1.4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].topY + 0.7);
      for (let i = 1; i <= steps; i++) ctx.lineTo(pts[i].x, pts[i].topY + 0.7);
      ctx.moveTo(pts[0].x, pts[0].botY - 0.7);
      for (let i = 1; i <= steps; i++) ctx.lineTo(pts[i].x, pts[i].botY - 0.7);
      ctx.stroke();
      ctx.restore();
    }

    // 3. Yelkenli tekne + direğin tepesinde küçük pembe fiyonk (≈ gövde uzunluğunun %15'i)
    ctx.save();
    ctx.translate(boatX + this.boatW * 0.5, boatCy);
    ctx.rotate(pitch);
    if (this.rev) ctx.scale(-1, 1);

    ctx.drawImage(this.boatSprite, -this.boatW * 0.5, -this.boatH * 0.5, this.boatW, this.boatH);
    ctx.drawImage(
      this.bowSprite,
      36 - this.boatW * 0.5 - this.bowW * 0.5,
      10.5 - this.boatH * 0.5 - this.bowH * 0.5,
      this.bowW,
      this.bowH
    );
    ctx.restore();

    this.lastScreenBox = { x: boatX, y, w: this.boatW, h: this.boatH };
    this.lastBannerBox =
      this.withBanner && !this.reducedFade ? { x: flagX, y: flagY, w: this.bannerW, h: this.bannerH } : null;
    ctx.restore();
  }
}
