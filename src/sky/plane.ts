import { STORAGE_KEYS, store } from '../lib/storage';
import type { Who } from '../types';

const PLANE_TEXTS: Record<Who, string[]> = {
  beto: [
    'Seni seviyorum Betooo',
    'Sana aşığım galiba güzelim',
    'Aşığım sana prenses',
    'Seni çok seviyorum bebiş',
    'Özledim seni bebeğim',
    'Dünyanın en güzel kızı sensin',
    'Hep seninleyim güzelim',
    'Sensiz olmuyor Beto',
    'Gözlerin yıldızlardan güzel',
    'Seni seviyorum bebeğim',
    'Aklımdasın hep güzellik',
  ],
  hamham: [
    'Seni seviyorum Ham hammm',
    'Sana aşığım galiba aşkım',
    'Aşığım sana Ham ham',
    'Seni çok seviyorum aşkım',
    'Özledim seni Ham ham',
    'Hep yanındayım aşkım',
    'Sensiz olmuyor Ham ham',
    'Seni seviyorum yakışıklım',
    'Aklımdasın hep aşkım',
  ],
};

function pickPlaneText(who: Who): string {
  const last = store.get<string>(STORAGE_KEYS.plane, '');
  const pool = PLANE_TEXTS[who].filter((t) => t !== last);
  const picked = pool[Math.floor(Math.random() * pool.length)] ?? PLANE_TEXTS[who][0];
  store.set(STORAGE_KEYS.plane, picked);
  return picked;
}

export class PlaneController {
  private readonly planeSprite = document.createElement('canvas');
  private readonly bannerCanvas = document.createElement('canvas');
  private readonly planeTexScale = 4;
  private readonly bannerTexScale = 4;

  private active = false;
  private rev = false;
  private startT = 0;
  private dur = 28_000;
  private baseY = 140;
  private lift = 18;
  private period = 1.15;
  private bannerW = 240;
  private readonly bannerH = 34;
  private readonly ropeW = 34;
  private readonly planeW = 66;
  private readonly planeH = 30;

  constructor() {
    this.bakePlaneSprite();
  }

  public isActive(): boolean {
    return this.active;
  }

  private bakePlaneSprite(): void {
    const s = this.planeTexScale;
    this.planeSprite.width = this.planeW * s;
    this.planeSprite.height = this.planeH * s;
    const g = this.planeSprite.getContext('2d');
    if (!g) return;
    g.scale(s, s);
    g.clearRect(0, 0, this.planeW, this.planeH);

    // Tail fin (pink)
    g.fillStyle = '#ec7a98';
    g.beginPath();
    g.moveTo(9, 14);
    g.lineTo(2, 3);
    g.lineTo(10, 3);
    g.lineTo(18, 12);
    g.closePath();
    g.fill();

    // Rear horizontal stabilizer
    g.fillStyle = '#e7dff0';
    g.beginPath();
    g.moveTo(10, 19);
    g.lineTo(2, 22);
    g.lineTo(11, 22);
    g.closePath();
    g.fill();

    // Fuselage
    g.fillStyle = '#fdf6ef';
    g.beginPath();
    g.moveTo(6, 17);
    g.bezierCurveTo(6, 12, 13, 10, 23, 10);
    g.lineTo(46, 10);
    g.bezierCurveTo(54, 10, 59, 13, 59, 17);
    g.bezierCurveTo(59, 21, 54, 23, 46, 23);
    g.lineTo(18, 23);
    g.bezierCurveTo(10, 23, 6, 21, 6, 17);
    g.closePath();
    g.fill();

    // Pink fuselage stripe
    g.strokeStyle = 'rgba(236, 122, 152, 0.85)';
    g.lineWidth = 1.6;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(10, 18.5);
    g.lineTo(55, 18.5);
    g.stroke();

    // Canopy
    g.fillStyle = '#9db8da';
    g.beginPath();
    g.moveTo(29, 10);
    g.quadraticCurveTo(35, 5, 41, 10);
    g.closePath();
    g.fill();

    g.fillStyle = 'rgba(214, 230, 247, 0.7)';
    g.beginPath();
    g.moveTo(31, 10);
    g.quadraticCurveTo(35, 7, 39, 10);
    g.closePath();
    g.fill();

    // Swept wing
    g.fillStyle = '#e7dff0';
    g.beginPath();
    g.moveTo(25, 17);
    g.lineTo(17, 28);
    g.lineTo(30, 28);
    g.lineTo(39, 17);
    g.closePath();
    g.fill();

    g.fillStyle = '#d6cde6';
    g.beginPath();
    g.moveTo(25, 17);
    g.lineTo(17, 28);
    g.lineTo(21, 28);
    g.lineTo(29, 17);
    g.closePath();
    g.fill();

    // Spinner nose
    g.fillStyle = '#c9cfe6';
    g.beginPath();
    g.arc(59.5, 17, 2.2, 0, Math.PI * 2);
    g.fill();
  }

  private bakeBannerTexture(text: string): void {
    const s = this.bannerTexScale;
    const probe = this.bannerCanvas.getContext('2d');
    if (!probe) return;

    probe.font = '400 22px "Great Vibes", "Snell Roundhand", cursive';
    const textW = Math.ceil(probe.measureText(text).width);
    const notchW = 14;
    const padLeft = this.rev ? 22 : 28 + notchW;
    const padRight = this.rev ? 28 + notchW : 22;
    this.bannerW = Math.max(180, textW + padLeft + padRight);

    this.bannerCanvas.width = this.bannerW * s;
    this.bannerCanvas.height = this.bannerH * s;
    const g = this.bannerCanvas.getContext('2d');
    if (!g) return;

    g.scale(s, s);
    g.clearRect(0, 0, this.bannerW, this.bannerH);

    // Swallowtail clip shape
    g.save();
    g.beginPath();
    if (this.rev) {
      // Plane flies right-to-left: banner trails to the right, swallowtail at right edge
      g.moveTo(0, 0);
      g.lineTo(this.bannerW, 0);
      g.lineTo(this.bannerW - notchW, this.bannerH / 2);
      g.lineTo(this.bannerW, this.bannerH);
      g.lineTo(0, this.bannerH);
    } else {
      // Plane flies left-to-right: banner trails to the left, swallowtail at left edge
      g.moveTo(0, 0);
      g.lineTo(this.bannerW, 0);
      g.lineTo(this.bannerW, this.bannerH);
      g.lineTo(0, this.bannerH);
      g.lineTo(notchW, this.bannerH / 2);
    }
    g.closePath();
    g.clip();

    // Cloth background gradient (yeterli kontrast ile saf beyaz kalp net görünür)
    const bg = g.createLinearGradient(0, 0, 0, this.bannerH);
    bg.addColorStop(0, '#f7d2e2');
    bg.addColorStop(0.55, '#efbad0');
    bg.addColorStop(1, '#e49fbe');
    g.fillStyle = bg;
    g.fillRect(0, 0, this.bannerW, this.bannerH);

    // Top & bottom pink cloth trim
    g.fillStyle = '#cf7ba0';
    g.fillRect(0, 0, this.bannerW, 2);
    g.fillRect(0, this.bannerH - 2, this.bannerW, 2);

    // Crisp vector white heart + Great Vibes message (asla sistem emojisine düşmez)
    const heartX = this.rev ? 14 : notchW + 16;
    const heartY = this.bannerH / 2 - 4.5;
    const hs = 11;
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(heartX, heartY + hs * 0.3);
    g.bezierCurveTo(heartX, heartY, heartX - hs * 0.5, heartY - hs * 0.05, heartX - hs * 0.5, heartY + hs * 0.3);
    g.bezierCurveTo(heartX - hs * 0.5, heartY + hs * 0.6, heartX, heartY + hs * 0.8, heartX, heartY + hs);
    g.bezierCurveTo(heartX, heartY + hs * 0.8, heartX + hs * 0.5, heartY + hs * 0.6, heartX + hs * 0.5, heartY + hs * 0.3);
    g.bezierCurveTo(heartX + hs * 0.5, heartY - hs * 0.05, heartX, heartY, heartX, heartY + hs * 0.3);
    g.fill();

    g.fillStyle = '#5a214f';
    g.textBaseline = 'middle';
    g.font = '400 22px "Great Vibes", "Snell Roundhand", cursive';
    g.fillText(text, heartX + 14, this.bannerH / 2 + 1);

    g.restore();
  }

  public launch(who: Who, skyTop: number, skyHeight: number): boolean {
    if (this.active) return false;
    this.rev = Math.random() < 0.5;
    this.startT = performance.now();
    this.dur = 27_000 + Math.random() * 5000;
    this.baseY = skyTop + skyHeight * (0.14 + Math.random() * 0.18);
    this.lift = 14 + Math.random() * 12;
    this.period = 1.05 + Math.random() * 0.25;

    const text = pickPlaneText(who);
    this.bakeBannerTexture(text);
    this.active = true;
    return true;
  }

  public stop(): void {
    this.active = false;
  }

  public draw(ctx: CanvasRenderingContext2D, now: number, skyW: number): void {
    if (!this.active) return;

    const elapsed = now - this.startT;
    if (elapsed >= this.dur) {
      this.active = false;
      return;
    }

    const p = elapsed / this.dur;
    const totalW = this.bannerW + this.ropeW + this.planeW + 30;
    const fromX = this.rev ? skyW + 30 : -totalW;
    const toX = this.rev ? -totalW : skyW + 30;
    const x = fromX + (toX - fromX) * p;

    // Gentle rising & dipping flight path + bobbing
    const ts = now / 1000;
    const pathOffset = -Math.sin(p * Math.PI * 1.65) * this.lift;
    const bobY = Math.sin((ts * Math.PI) / 1.8) * 2.5;
    const y = this.baseY + pathOffset + bobY;

    // Fade in / out at screen edges
    const alpha = p < 0.04 ? p / 0.04 : p > 0.96 ? (1 - p) / 0.04 : 1;
    const dir = this.rev ? 1 : -1;
    const pitch = Math.sin((ts * Math.PI) / 1.8 + 0.4) * 0.022 * dir;

    ctx.save();
    ctx.globalAlpha = alpha;

    const flagX = this.rev ? x + this.planeW + this.ropeW : x;
    const planeX = this.rev ? x : x + this.bannerW + this.ropeW;
    const planeCy = y + this.bannerH / 2;

    // 1. Tow ropes from plane tail to banner leading edge
    const tailX = this.rev ? planeX + this.planeW - 4 : planeX + 4;
    const ropeEndX = this.rev ? flagX : flagX + this.bannerW;
    const flagSwing = Math.sin((ts * Math.PI) / 1.8 - 0.9) * 1.2;

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.72)';
    ctx.lineWidth = 0.95;
    ctx.beginPath();
    ctx.moveTo(tailX, planeCy);
    ctx.quadraticCurveTo((tailX + ropeEndX) / 2, planeCy - 6, ropeEndX, y + 3 + flagSwing);
    ctx.moveTo(tailX, planeCy);
    ctx.lineTo(ropeEndX, y + this.bannerH / 2 + flagSwing);
    ctx.moveTo(tailX, planeCy);
    ctx.quadraticCurveTo((tailX + ropeEndX) / 2, planeCy + 6, ropeEndX, y + this.bannerH - 2 + flagSwing);
    ctx.stroke();

    // 2. Single-canvas cloth banner bent by traveling sine wave (3px GPU-friendly strips)
    const sliceW = 3;
    const s = this.bannerTexScale;
    const numSlices = Math.ceil(this.bannerW / sliceW);

    for (let i = 0; i < numSlices; i++) {
      const sx = i * sliceW;
      const w = Math.min(sliceW, this.bannerW - sx);
      const u = sx / Math.max(1, this.bannerW - sliceW);
      // 0 near rope, 1 at loose swallowtail end
      const far = this.rev ? u : 1 - u;

      const amp = 0.6 + far * far * 4.4;
      const phase = (ts * Math.PI * 2) / this.period - (1 - far) * 4.2;
      const wave = Math.sin(phase);
      const dy = wave * amp + flagSwing * (1 - far * 0.4);
      const scaleY = 1 + far * 0.045 * wave;
      const dh = this.bannerH * scaleY;
      const drawY = y + (this.bannerH - dh) / 2 + dy;

      ctx.drawImage(
        this.bannerCanvas,
        sx * s,
        0,
        w * s,
        this.bannerH * s,
        flagX + sx,
        drawY,
        w + 0.4,
        dh
      );

      // Cloth fold shadow on receding curve slopes
      const slope = Math.cos(phase);
      if (slope > 0.12) {
        const foldAlpha = slope * (0.04 + far * 0.11);
        if (foldAlpha > 0.025) {
          ctx.fillStyle = `rgba(110, 30, 80, ${foldAlpha.toFixed(2)})`;
          ctx.fillRect(flagX + sx, drawY, w + 0.4, dh);
        }
      }
    }

    // 3. Airplane + spinning propeller
    ctx.save();
    ctx.translate(planeX + this.planeW / 2, planeCy);
    ctx.rotate(pitch);
    if (this.rev) ctx.scale(-1, 1);

    ctx.drawImage(
      this.planeSprite,
      -this.planeW / 2,
      -this.planeH / 2,
      this.planeW,
      this.planeH
    );

    // Spinning propeller blur
    const propScale = 0.35 + 0.65 * Math.abs(Math.sin(ts * 42));
    ctx.fillStyle = `rgba(170, 178, 208, ${(0.3 + 0.28 * propScale).toFixed(2)})`;
    const propH = 22 * propScale;
    ctx.fillRect(this.planeW / 2 - 5.4, 2 - propH / 2, 2.4, propH);

    ctx.restore();
    ctx.restore();
  }
}

