// Çizim tahtası (vektör çizgiler, 1000×1333 mantıksal tuval) + şifreli canlı izleme + yeniden oynatma.
import { h, $, $$, confirmSheet, reduced, toast } from './ui';
import { I } from './icons';
import { state, PEOPLE } from './state';
import { core } from './core';
import { MAX_STROKES, MAX_POINTS } from '../lib/drawCodec';

export type Stroke = { k: 'pen' | 'glow' | 'erase'; c: string; s: number; p: [number, number, number][] };

export type DrawLivePacket =
  | { t: 'hello'; seq: number }
  | { t: 'snap'; seq: number; strokes: Stroke[] }
  | { t: 'pts'; seq: number; si: number; k: Stroke['k']; c: string; s: number; pts: [number, number, number][] }
  | { t: 'end'; seq: number; si: number }
  | { t: 'undo'; seq: number }
  | { t: 'redo'; seq: number }
  | { t: 'clear'; seq: number }
  | { t: 'done'; seq: number; strokes: Stroke[] }
  | { t: 'bye'; seq: number }
  | { t: 'react'; seq: number };

const LW = 1000, LH = 1333;
const COLORS = ['#ffffff', '#9db6ff', '#ffadcc', '#e3b866', '#9bb06a', '#b9a2ff', '#ff8a7a', '#ffe08a'];
const SIZES = [4, 9, 18];

/** Çizgileri tuvale çiz. upTo: ms (yeniden oynatma için), yoksa tümü. */
export function renderDrawing(cv: HTMLCanvasElement, strokes: Stroke[], _scale = 1, upTo = Infinity) {
  const r = cv.getBoundingClientRect();
  const d = Math.min(devicePixelRatio || 1, 2);
  const w = (r.width || cv.width) * d, hh = (r.height || cv.height) * d;
  if (w > 0 && hh > 0 && (cv.width !== Math.round(w) || cv.height !== Math.round(hh))) {
    cv.width = Math.round(w);
    cv.height = Math.round(hh);
  }
  const c = cv.getContext('2d');
  if (!c) return;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, cv.width, cv.height);
  const k = Math.min(cv.width / LW, cv.height / LH);
  c.setTransform(k, 0, 0, k, (cv.width - LW * k) / 2, (cv.height - LH * k) / 2);
  for (const s of strokes) drawStroke(c, s, upTo);
}

function drawStroke(c: CanvasRenderingContext2D, s: Stroke, upTo = Infinity) {
  const pts = upTo === Infinity ? s.p : s.p.filter((p) => p[2] <= upTo);
  if (!pts.length) return;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.globalCompositeOperation = s.k === 'erase' ? 'destination-out' : 'source-over';
  const path = () => {
    c.beginPath();
    c.moveTo(pts[0][0], pts[0][1]);
    if (pts.length === 1) c.lineTo(pts[0][0] + 0.1, pts[0][1]);
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
      c.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
    }
    if (pts.length > 1) c.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
  };
  if (s.k === 'glow') {
    c.strokeStyle = s.c; c.globalAlpha = 0.18; c.lineWidth = s.s * 2.8; path(); c.stroke();
    c.globalAlpha = 1; c.strokeStyle = '#ffffff'; c.lineWidth = s.s * 0.55; path(); c.stroke();
    c.globalAlpha = 0.85; c.strokeStyle = s.c; c.lineWidth = s.s; path(); c.stroke();
    c.globalAlpha = 1;
  } else {
    c.strokeStyle = s.c;
    c.lineWidth = s.s;
    path();
    c.stroke();
  }
  c.globalCompositeOperation = 'source-over';
}

function spawnReactionHeart(host: HTMLElement) {
  const drift = (Math.random() - 0.5) * 44;
  const f = h(`<div class="react-float" style="left:50%;bottom:120px;margin-left:-14px">${I.heartFill(28)}</div>`);
  host.appendChild(f);
  f.animate(
    [
      { transform: 'translate(0,0) scale(.5)', opacity: 0 },
      { transform: `translate(${drift * 0.4}px,-60px) scale(1)`, opacity: 1, offset: 0.3 },
      { transform: `translate(${drift}px,-220px) scale(.8)`, opacity: 0 },
    ],
    { duration: 1600, easing: 'ease-out' }
  ).finished.then(() => f.remove());
}

export function openBoard(existing?: Stroke[] | null): Promise<Stroke[] | null> {
  return new Promise((resolve) => {
    const p = PEOPLE[state.partner];
    let color = COLORS[2], tool: Stroke['k'] = 'pen', size = 1, live = false;
    const strokes: Stroke[] = existing ? existing.map((s) => ({ ...s, p: s.p.map((q) => [...q] as [number, number, number]) })) : [];
    const redo: Stroke[] = [];
    let totalPts = strokes.reduce((acc, s) => acc + s.p.length, 0);
    let seq = 0;

    const partnerHere = () => Boolean(document.querySelector('.lantern.partner.on'));
    const el = h(`<div class="board" role="dialog" aria-label="Çizim tahtası">
      <div class="board-top">
        <button type="button" class="btn btn-ghost" data-cancel style="height:44px;padding:0 10px">Vazgeç</button>
        <div class="mid"><div class="h2">${p.to} çizim</div>
          <button type="button" class="livebtn" data-live><span class="d"></span><span>Canlı izlet</span></button>
          <div class="small" style="margin-top:4px" data-pres>${partnerHere() ? `${p.name} burada` : ''}</div></div>
        <button type="button" class="btn btn-primary" data-done style="height:44px;padding:0 16px" disabled>Bitti</button>
      </div>
      <div class="canvas-wrap"><div class="canvas-box"><canvas></canvas><div class="ph">Parmağınla bir şey çiz</div></div></div>
      <div class="tools glass-strong" style="border-radius:26px 26px 0 0;border-bottom:0">
        <div class="swatches">${COLORS.map((c, i) => `<button type="button" class="sw ${i === 2 ? 'on' : ''}" aria-label="Renk ${i + 1}"><i style="background:${c}"></i></button>`).join('')}</div>
        <div class="toolrow">
          <button type="button" class="icon-btn on" data-tool="pen" aria-label="Kalem">${I.pen()}</button>
          <button type="button" class="icon-btn" data-tool="glow" aria-label="Işıklı kalem">${I.glow()}</button>
          <button type="button" class="icon-btn" data-tool="erase" aria-label="Silgi">${I.eraser()}</button>
          <button type="button" class="size-dot" data-size aria-label="Kalınlık"><i></i></button>
          <button type="button" class="icon-btn" data-undo aria-label="Geri al">${I.undo()}</button>
          <button type="button" class="icon-btn" data-redo aria-label="İleri al">${I.redo()}</button>
          <button type="button" class="icon-btn" data-clear aria-label="Temizle">${I.trash()}</button>
        </div>
      </div></div>`);

    const app = core.homeEl.parentElement!;
    app.appendChild(el);
    el.animate([{ transform: 'translateY(100%)' }, { transform: 'none' }], { duration: reduced() ? 150 : 460, easing: 'cubic-bezier(.2,.9,.25,1)' });
    const cv = $<HTMLCanvasElement>('canvas', el);
    const box = $('.canvas-box', el);
    const sizeDot = $('[data-size] i', el);
    const setSize = () => {
      const s = [5, 9, 15][size];
      sizeDot.style.width = sizeDot.style.height = `${s}px`;
    };
    setSize();
    const redraw = () => renderDrawing(cv, strokes);
    const update = () => {
      ($('[data-done]', el) as HTMLButtonElement).disabled = !strokes.length;
      $('.ph', el).style.opacity = strokes.length ? '0' : '1';
    };
    requestAnimationFrame(() => {
      redraw();
      update();
    });

    // ~70 ms toplu nokta gönderimi (pair:draw şifreli kanal)
    let pendingPts: [number, number, number][] = [];
    let pendingStrokeIdx = -1;
    let pendingMeta: { k: Stroke['k']; c: string; s: number } | null = null;
    let batchTimer = 0;

    const sendPkt = (pkt: DrawLivePacket) => {
      if (!live) return;
      core.sendDrawPacket(pkt);
    };

    const flushBatch = () => {
      batchTimer = 0;
      if (!live || !pendingPts.length || !pendingMeta) {
        pendingPts = [];
        return;
      }
      const batch = pendingPts;
      pendingPts = [];
      sendPkt({
        t: 'pts',
        seq: ++seq,
        si: pendingStrokeIdx,
        k: pendingMeta.k,
        c: pendingMeta.c,
        s: pendingMeta.s,
        pts: batch,
      });
    };

    const unsubDraw = core.onDrawPacket((pkt) => {
      if (!live || !el.isConnected) return;
      if (pkt.t === 'hello') {
        sendPkt({ t: 'snap', seq: ++seq, strokes });
      } else if (pkt.t === 'react') {
        spawnReactionHeart(el);
      }
    });

    const presTimer = window.setInterval(() => {
      if (!el.isConnected || document.hidden) return;
      $('[data-pres]', el).textContent = partnerHere() ? `${p.name} burada` : '';
    }, 2000);

    let cur: Stroke | null = null, t0 = 0, penActive = false;
    const toL = (e: PointerEvent): [number, number] => {
      const r = box.getBoundingClientRect();
      const k = Math.min(r.width / LW, r.height / LH);
      const x = Math.max(0, Math.min(LW, (e.clientX - r.left - (r.width - LW * k) / 2) / k));
      const y = Math.max(0, Math.min(LH, (e.clientY - r.top - (r.height - LH * k) / 2) / k));
      return [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
    };

    cv.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'pen') penActive = true;
      else if (penActive) return;
      if (strokes.length >= MAX_STROKES || totalPts >= MAX_POINTS) {
        toast('Çizim sınırına ulaşıldı', I.info(14));
        return;
      }
      cv.setPointerCapture(e.pointerId);
      if (!t0) t0 = performance.now();
      const [x, y] = toL(e);
      const pr = e.pointerType === 'pen' ? 0.6 + e.pressure * 0.8 : 1;
      const pt: [number, number, number] = [x, y, Math.round(performance.now() - t0)];
      cur = { k: tool, c: color, s: SIZES[size] * (tool === 'erase' ? 2.2 : 1) * pr, p: [pt] };
      strokes.push(cur);
      totalPts++;
      redo.length = 0;
      pendingStrokeIdx = strokes.length - 1;
      pendingMeta = { k: cur.k, c: cur.c, s: cur.s };
      pendingPts.push(pt);
      if (live && !batchTimer) batchTimer = window.setTimeout(flushBatch, 70);
      redraw();
      update();
    });

    cv.addEventListener('pointermove', (e) => {
      if (!cur || totalPts >= MAX_POINTS) return;
      const evs: PointerEvent[] = (e as unknown as { getCoalescedEvents?: () => PointerEvent[] }).getCoalescedEvents?.() ?? [e];
      for (const ev of evs) {
        if (totalPts >= MAX_POINTS) break;
        const [x, y] = toL(ev);
        const last = cur.p[cur.p.length - 1];
        if (Math.hypot(x - last[0], y - last[1]) < 1.5) continue;
        const pt: [number, number, number] = [x, y, Math.round(performance.now() - t0)];
        cur.p.push(pt);
        totalPts++;
        if (live) pendingPts.push(pt);
      }
      if (live && pendingPts.length && !batchTimer) {
        batchTimer = window.setTimeout(flushBatch, 70);
      }
      redraw();
    });

    const up = () => {
      if (!cur) return;
      cur = null;
      if (batchTimer) {
        clearTimeout(batchTimer);
        flushBatch();
      }
      if (live && pendingStrokeIdx >= 0) {
        sendPkt({ t: 'end', seq: ++seq, si: pendingStrokeIdx });
      }
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);

    $$('.sw', el).forEach((b, i) =>
      b.addEventListener('click', () => {
        color = COLORS[i];
        $$('.sw', el).forEach((x) => x.classList.toggle('on', x === b));
        if (tool === 'erase') selectTool('pen');
      })
    );
    const selectTool = (t: Stroke['k']) => {
      tool = t;
      $$('[data-tool]', el).forEach((x) => x.classList.toggle('on', x.dataset.tool === t));
    };
    $$('[data-tool]', el).forEach((b) => b.addEventListener('click', () => selectTool(b.dataset.tool as Stroke['k'])));
    $('[data-size]', el).addEventListener('click', () => {
      size = (size + 1) % 3;
      setSize();
    });
    $('[data-undo]', el).addEventListener('click', () => {
      const s = strokes.pop();
      if (s) {
        totalPts -= s.p.length;
        redo.push(s);
        sendPkt({ t: 'undo', seq: ++seq });
      }
      redraw();
      update();
    });
    $('[data-redo]', el).addEventListener('click', () => {
      const s = redo.pop();
      if (s) {
        totalPts += s.p.length;
        strokes.push(s);
        sendPkt({ t: 'redo', seq: ++seq });
      }
      redraw();
      update();
    });
    $('[data-clear]', el).addEventListener('click', async () => {
      if (!strokes.length) return;
      if (await confirmSheet('Tuval temizlensin mi?', 'Çizdiklerin silinecek.', 'Temizle', true)) {
        strokes.length = 0;
        redo.length = 0;
        totalPts = 0;
        sendPkt({ t: 'clear', seq: ++seq });
        redraw();
        update();
      }
    });
    $('[data-live]', el).addEventListener('click', (e) => {
      live = !live;
      (e.currentTarget as HTMLElement).classList.toggle('on', live);
      $('[data-live] span:last-child', el).textContent = live ? `${p.name} izleyebilir` : 'Canlı izlet';
      if (live) {
        core.setMyLiveActivity('drawing');
        sendPkt({ t: 'snap', seq: ++seq, strokes });
      } else {
        core.sendDrawPacket({ t: 'bye', seq: ++seq });
        core.setMyLiveActivity('idle');
      }
    });

    const close = async (res: Stroke[] | null) => {
      clearInterval(presTimer);
      clearTimeout(batchTimer);
      unsubDraw();
      if (live) {
        if (res) sendPkt({ t: 'done', seq: ++seq, strokes: res });
        else core.sendDrawPacket({ t: 'bye', seq: ++seq });
        core.setMyLiveActivity('idle');
      }
      await el.animate([{ transform: 'none' }, { transform: 'translateY(100%)' }], { duration: 340, easing: 'cubic-bezier(.4,0,.8,.4)', fill: 'forwards' }).finished;
      el.remove();
      resolve(res);
    };
    $('[data-cancel]', el).addEventListener('click', async () => {
      if (!strokes.length || (await confirmSheet('Çizimden çıkılsın mı?', 'Çizdiklerin kaydedilmeyecek.', 'Çık', true))) {
        await close(null);
      }
    });
    $('[data-done]', el).addEventListener('click', () => void close(strokes.slice()));
  });
}

/** Test paneli / önizleme için yerel örnek çizim (kalp + yıldız; sunucuya gönderilmez). */
export function demoDrawing(): Stroke[] {
  const heart: [number, number, number][] = [];
  for (let i = 0; i <= 72; i++) {
    const t = Math.PI - (i / 72) * Math.PI * 2;
    const x = 500 + 16 * Math.pow(Math.sin(t), 3) * 14;
    const y = 640 - (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) * 14;
    heart.push([Math.round(x), Math.round(y), i * 38]);
  }
  return [{ k: 'glow', c: PEOPLE[state.partner].color, s: 9, p: heart }];
}

/** Karşı tarafın canlı çizimini izle (pair:draw üzerinden şifreli canlı çizgi akışı; simStrokes verilirse yerel simülasyon). */
export function openWatch(onDone?: (strokes: Stroke[]) => void, simStrokes?: Stroke[]) {
  if (document.querySelector('.watch')) return;
  const p = PEOPLE[state.partner];
  const strokes: Stroke[] = [];
  const redo: Stroke[] = [];
  let lastSeq = -1;
  let lastCursor: { x: number; y: number; ts: number } | null = null;

  const el = h(`<div class="watch" role="dialog" aria-label="${p.name} çiziyor">
    <div class="board-top"><span style="width:60px"></span>
      <div class="mid"><div class="h2">${p.name} çiziyor</div><div class="livebtn on" style="pointer-events:none"><span class="d"></span><span>Canlı</span></div></div>
      <button type="button" class="btn btn-ghost" data-close style="height:44px;padding:0 10px">Kapat</button></div>
    <div class="canvas-wrap"><div class="canvas-box"><canvas></canvas><div class="cur" style="opacity:0"></div></div></div>
    <div class="center" style="padding:16px 0 calc(var(--safe-b) + 20px)">
      <button type="button" class="btn btn-soft" data-heart>${I.heart(18)}<span>Kalp gönder</span></button>
      <div class="small" style="margin-top:10px">${p.name} kalbini çizerken görecek</div></div></div>`);

  const app = core.homeEl.parentElement!;
  app.appendChild(el);
  el.animate([{ opacity: 0, transform: 'scale(.98)' }, { opacity: 1, transform: 'none' }], { duration: 380, easing: 'ease-out' });
  const cv = $<HTMLCanvasElement>('canvas', el);
  const box = $('.canvas-box', el);
  const curEl = $('.cur', el);
  let closed = false;
  let raf = 0;

  const placeCursor = () => {
    if (closed || !el.isConnected) return;
    if (lastCursor) {
      const r = box.getBoundingClientRect();
      const k = Math.min(r.width / LW, r.height / LH);
      curEl.style.transform = `translate3d(${(r.width - LW * k) / 2 + lastCursor.x * k}px, ${(r.height - LH * k) / 2 + lastCursor.y * k}px, 0)`;
      curEl.style.opacity = performance.now() - lastCursor.ts < 550 ? '1' : '0';
    }
    raf = requestAnimationFrame(placeCursor);
  };
  raf = requestAnimationFrame(placeCursor);

  const unsub = core.onDrawPacket((pkt) => {
    if (closed || !el.isConnected) return;
    if (pkt.t === 'hello' || pkt.t === 'react') return;
    if (pkt.seq <= lastSeq && pkt.t !== 'snap') return;
    lastSeq = pkt.seq;

    if (pkt.t === 'snap') {
      strokes.splice(0, strokes.length, ...pkt.strokes);
      redo.length = 0;
      renderDrawing(cv, strokes);
    } else if (pkt.t === 'pts') {
      while (strokes.length <= pkt.si) {
        strokes.push({ k: pkt.k, c: pkt.c, s: pkt.s, p: [] });
      }
      const target = strokes[pkt.si];
      target.k = pkt.k; target.c = pkt.c; target.s = pkt.s;
      target.p.push(...pkt.pts);
      const tail = pkt.pts[pkt.pts.length - 1];
      if (tail) lastCursor = { x: tail[0], y: tail[1], ts: performance.now() };
      renderDrawing(cv, strokes);
    } else if (pkt.t === 'undo') {
      const s = strokes.pop();
      if (s) redo.push(s);
      renderDrawing(cv, strokes);
    } else if (pkt.t === 'redo') {
      const s = redo.pop();
      if (s) strokes.push(s);
      renderDrawing(cv, strokes);
    } else if (pkt.t === 'clear') {
      strokes.length = 0;
      redo.length = 0;
      renderDrawing(cv, strokes);
    } else if (pkt.t === 'done') {
      strokes.splice(0, strokes.length, ...pkt.strokes);
      renderDrawing(cv, strokes);
      void finish();
    } else if (pkt.t === 'bye') {
      toast(`${p.name} canlı çizimi kapattı`, I.pen(14));
      void close();
    }
  });

  // Mevcut çizim anlık görüntüsünü iste (yalnızca gerçek modda; Test paneli simülasyonunda ağa hiçbir şey gitmez)
  let simRaf = 0;
  if (simStrokes) {
    strokes.splice(0, strokes.length, ...simStrokes);
    const total = Math.max(200, ...simStrokes.flatMap((s) => s.p.map((q) => q[2])));
    const t0 = performance.now();
    const stepSim = () => {
      if (closed || !el.isConnected) return;
      const elapsed = performance.now() - t0;
      renderDrawing(cv, strokes, 1, elapsed);
      let curPt: [number, number, number] | null = null;
      for (const s of strokes) {
        for (const q of s.p) {
          if (q[2] <= elapsed) curPt = q;
        }
      }
      if (curPt) lastCursor = { x: curPt[0], y: curPt[1], ts: performance.now() };
      if (elapsed < total + 250) simRaf = requestAnimationFrame(stepSim);
      else void finish();
    };
    simRaf = requestAnimationFrame(stepSim);
  } else {
    core.sendDrawPacket({ t: 'hello', seq: Date.now() });
  }

  const close = async () => {
    if (closed) return;
    closed = true;
    unsub();
    cancelAnimationFrame(raf);
    cancelAnimationFrame(simRaf);
    await el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, fill: 'forwards' }).finished;
    el.remove();
  };

  const finish = async () => {
    if (closed) return;
    closed = true;
    unsub();
    cancelAnimationFrame(raf);
    cancelAnimationFrame(simRaf);
    await box.animate(
      [{ transform: 'none', opacity: 1 }, { transform: 'scale(.06)', opacity: 0.35 }],
      { duration: 520, easing: 'cubic-bezier(.6,0,.3,1)', fill: 'forwards' }
    ).finished;
    el.remove();
    onDone?.(strokes);
  };

  $('[data-close]', el).addEventListener('click', () => void close());
  $('[data-heart]', el).addEventListener('click', () => {
    spawnReactionHeart(el);
    if (!simStrokes) core.sendDrawPacket({ t: 'react', seq: Date.now() });
  });
}
