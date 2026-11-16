import { MONTHS_TR, monthIdx, starMonthIdx } from '../lib/links';
import { PEOPLE } from '../lib/people';
import type { StarRecord } from '../types';
import { START_DATE, TARGET_DATE } from '../ui/countdown';

export interface TravelMonthItem {
  k: number;
  title: string;
  n: number;
  locked: boolean;
  gold: boolean;
  stars: StarRecord[];
}

export function buildTravelMonths(allStars: StarRecord[]): TravelMonthItem[] {
  const cur = monthIdx(new Date());
  const tgt = monthIdx(TARGET_DATE);
  const startK = monthIdx(START_DATE);
  const starMonths = allStars.map(starMonthIdx);
  const first = Math.min(startK, cur, ...starMonths);
  const last = Math.max(cur, tgt);

  const out: TravelMonthItem[] = [];
  for (let k = first; k <= last; k++) {
    const mine = allStars.filter((st) => starMonthIdx(st) === k);
    const m = k % 12;
    const y = Math.floor(k / 12);
    out.push({
      k,
      title: `${MONTHS_TR[m]} ${y}`,
      n: mine.length,
      locked: k > cur,
      gold: k === tgt,
      stars: mine,
    });
  }
  return out;
}

export function drawMonthCardOnCanvas(params: {
  ctx: CanvasRenderingContext2D;
  item: TravelMonthItem;
  cx: number;
  cy: number;
  cardW: number;
  cardH: number;
  tiltAngleDeg: number;
  opacity: number;
  skyCols: [string, string, string, string];
  nowMs?: number;
}): void {
  const { ctx, item, cx, cy, cardW, cardH, tiltAngleDeg, opacity, skyCols, nowMs = Date.now() } = params;
  if (opacity <= 0.01) return;

  const rad = (tiltAngleDeg * Math.PI) / 180;
  const horizScale = Math.max(0.38, Math.cos(rad));
  const w = cardW * horizScale;
  const h = cardH;
  const x = cx - w / 2;
  const y = cy - h / 2;
  const r = 24;

  ctx.save();
  ctx.globalAlpha = opacity * (item.locked ? 0.78 : 1);

  // Rounded card path
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.save();
  ctx.clip();

  // Mini sky backdrop
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, skyCols[0]);
  g.addColorStop(0.55, skyCols[1]);
  g.addColorStop(1, skyCols[2]);
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);

  // Subtle ambient pinpoints
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  const specks: [number, number, number][] = [
    [0.14, 0.22, 1],
    [0.71, 0.14, 1],
    [0.38, 0.61, 1.2],
    [0.88, 0.52, 1],
    [0.55, 0.83, 1],
    [0.22, 0.78, 1],
  ];
  for (const [sx, sy, sr] of specks) {
    ctx.beginPath();
    ctx.arc(x + sx * w, y + sy * h, sr, 0, Math.PI * 2);
    ctx.fill();
  }

  // Stars belonging to that month
  for (const st of item.stars) {
    const px = x + (st.x / 100) * w;
    const py = y + (st.y / 100) * h;
    const radius = Math.max(2, (st.size / 9) * 3.2);
    const locked = Boolean(st.unlockAt && Date.parse(st.unlockAt) > nowMs);
    const col = PEOPLE[st.from].color === 'blue' ? '#cfe3ff' : '#ffe0ee';
    const glow = PEOPLE[st.from].color === 'blue' ? 'rgba(110,170,255,0.45)' : 'rgba(255,120,176,0.45)';
    ctx.save();
    if (locked) ctx.globalAlpha = opacity * 0.55;
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(px, py, radius * 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(px, py, radius, 0, Math.PI * 2);
    ctx.fill();
    if (locked) {
      ctx.strokeStyle = 'rgba(255, 220, 147, 0.72)';
      ctx.lineWidth = 0.8;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.arc(px, py, radius * 2.2, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Lock badge for future months
  if (item.locked) {
    ctx.fillStyle = item.gold ? 'rgba(255, 224, 170, 0.92)' : 'rgba(255, 236, 247, 0.78)';
    ctx.font = '26px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('✦', cx, cy);
  }

  ctx.restore();

  // Border (golden for January 2027!)
  ctx.lineWidth = item.gold ? 1.8 : 1;
  ctx.strokeStyle = item.gold ? 'rgba(255, 214, 140, 0.82)' : 'rgba(255, 255, 255, 0.16)';
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.stroke();

  ctx.restore();
}

