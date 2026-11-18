// Çizim tahtası (vektör çizgiler, 1000×1333 mantıksal tuval) + şifreli canlı izleme + beraber çizme (HOTFIX 22) + yeniden oynatma.
import { h, $, $$, confirmSheet, reduced, toast, closeIsland } from './ui';
import { I } from './icons';
import { state, PEOPLE, Who } from './state';
import { core } from './core';
import { MAX_STROKES, MAX_POINTS } from '../lib/drawCodec';

export type Stroke = {
  k: 'pen' | 'glow' | 'erase';
  c: string;
  s: number;
  p: [number, number, number][];
  by?: Who;
};

export type BoardResult = {
  strokes: Stroke[];
  sid: string;
  collab: boolean;
  remoteFin?: boolean;
};

export type DrawLivePacket =
  | { t: 'dreq' | 'hello'; seq: number; sid?: string }
  | { t: 'djoin'; seq: number; sid?: string }
  | { t: 'dsnap' | 'snap'; seq: number; strokes: Stroke[]; sid?: string; collab?: boolean }
  | { t: 'dstart'; seq: number; k: Stroke['k']; c: string; s: number; pt: [number, number, number]; sid?: string }
  | { t: 'dpts' | 'pts'; seq: number; si?: number; k?: Stroke['k']; c?: string; s?: number; pts: [number, number, number][]; sid?: string }
  | { t: 'end'; seq: number; si: number }
  | { t: 'dundo' | 'undo'; seq: number; sid?: string }
  | { t: 'dredo' | 'redo'; seq: number; stroke?: Stroke; sid?: string }
  | { t: 'dclear' | 'clear'; seq: number; sid?: string }
  | { t: 'dleave' | 'bye'; seq: number; sid?: string }
  | { t: 'dfin' | 'done'; seq: number; strokes: Stroke[]; sid?: string; collab?: boolean }
  | { t: 'react'; seq: number };

const LW = 1000, LH = 1333;
const COLORS = ['#ffffff', '#9db6ff', '#ffadcc', '#e3b866', '#9bb06a', '#b9a2ff', '#ff8a7a', '#ffe08a'];
const SIZES = [4, 9, 18];
export const DRAW_DRAFT_KEY = 'gokyuzu.drawDraft.v1';

function makeSessionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `draw-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function loadSavedDrawingDraft(): Stroke[] | null {
  try {
    const raw = localStorage.getItem(DRAW_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? (parsed as Stroke[]) : null;
  } catch {
    return null;
  }
}

export function saveDrawingDraft(strokes: Stroke[] | null): void {
  try {
    if (!strokes || !strokes.length) localStorage.removeItem(DRAW_DRAFT_KEY);
    else localStorage.setItem(DRAW_DRAFT_KEY, JSON.stringify(strokes));
  } catch {
    // Ignore quota errors
  }
}

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

export function openBoard(
  existing?: Stroke[] | null,
  opts?: { collab?: boolean; sid?: string }
): Promise<BoardResult | null> {
  return new Promise((resolve) => {
    core.setInDrawView(true);
    void closeIsland();

    const p = PEOPLE[state.partner];
    // Herkesin varsayılan rengi kendi rengi (Ham ham mavi #9db6ff = COLORS[1], Beto pembe #ffadcc = COLORS[2])
    const initColorIdx = state.me === 'ham' ? 1 : 2;
    let color = COLORS[initColorIdx];
    let tool: Stroke['k'] = 'pen';
    let size = 1;
    let collab = Boolean(opts?.collab);
    let everCollab = collab;
    let live = collab;
    const isInitiator = !opts?.collab;
    let sid = opts?.sid || makeSessionId();

    const rawInitial =
      opts?.collab
        ? existing ?? []
        : existing && existing.length
          ? existing
          : loadSavedDrawingDraft();
    const strokes: Stroke[] = rawInitial
      ? rawInitial.map((s) => ({
          ...s,
          by: s.by ?? (opts?.collab ? state.partner : state.me),
          p: s.p.map((q) => [...q] as [number, number, number]),
        }))
      : [];
    const redo: Stroke[] = [];
    const partnerRedo: Stroke[] = [];
    let partnerCur: Stroke | null = null;
    let totalPts = strokes.reduce((acc, s) => acc + s.p.length, 0);
    let seq = 0;
    let lastPartnerSeq = 0;
    let lastReqAt = 0;
    let submitting = false;
    let closed = false;

    const partnerHere = () => Boolean(document.querySelector('.lantern.partner.on'));
    const el = h(`<div class="board" role="dialog" aria-label="Çizim tahtası">
      <div class="board-top">
        <button type="button" class="btn btn-ghost" data-cancel style="height:44px;padding:0 10px">Vazgeç</button>
        <div class="mid"><div class="h2" data-title>${collab ? 'Beraber çiziyorsunuz' : `${p.to} çizim`}</div>
          <button type="button" class="livebtn ${live ? 'on' : ''}" data-live><span class="d"></span><span>${collab ? 'Canlı · birlikte' : live ? `${p.name} izleyebilir` : 'Canlı izlet'}</span></button>
          <div class="small" style="margin-top:4px" data-pres>${partnerHere() ? `${p.name} burada` : ''}</div></div>
        <button type="button" class="btn btn-primary" data-done style="height:44px;padding:0 16px" disabled>Bitti</button>
      </div>
      <div class="canvas-wrap"><div class="canvas-box"><canvas></canvas><div class="cur" style="opacity:0;background:${p.color};box-shadow:0 0 16px ${p.color}"></div><div class="ph">Parmağınla bir şey çiz</div></div></div>
      <div class="tools glass-strong" style="border-radius:26px 26px 0 0;border-bottom:0">
        <div class="swatches">${COLORS.map((c, i) => `<button type="button" class="sw ${i === initColorIdx ? 'on' : ''}" aria-label="Renk ${i + 1}"><i style="background:${c}"></i></button>`).join('')}</div>
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
    el.animate([{ transform: 'translateY(100%)' }, { transform: 'none' }], {
      duration: reduced() ? 150 : 460,
      easing: 'cubic-bezier(.2,.9,.25,1)',
    });
    const cv = $<HTMLCanvasElement>('canvas', el);
    const box = $('.canvas-box', el);
    const curEl = $('.cur', el);
    const titleEl = $('[data-title]', el);
    const liveBtn = $('[data-live]', el);
    const liveLbl = $('[data-live] span:last-child', el);
    const sizeDot = $('[data-size] i', el);

    const updateHeader = () => {
      titleEl.textContent = collab ? 'Beraber çiziyorsunuz' : `${p.to} çizim`;
      liveBtn.classList.toggle('on', live);
      liveLbl.textContent = collab ? 'Canlı · birlikte' : live ? `${p.name} izleyebilir` : 'Canlı izlet';
    };

    const setSize = () => {
      const s = [5, 9, 15][size];
      sizeDot.style.width = sizeDot.style.height = `${s}px`;
    };
    setSize();
    const redraw = () => renderDrawing(cv, strokes);
    const update = () => {
      if (!submitting) ($('[data-done]', el) as HTMLButtonElement).disabled = !strokes.length;
      $('.ph', el).style.opacity = strokes.length ? '0' : '1';
      if (!collab) saveDrawingDraft(strokes);
    };
    requestAnimationFrame(() => {
      redraw();
      update();
    });

    // Karşı tarafın ışıklı parmak imleci
    let lastCursor: { x: number; y: number; ts: number } | null = null;
    let cursorRaf = 0;
    let cursorHideTimer = 0;
    const showPartnerCursor = (lx: number, ly: number) => {
      lastCursor = { x: lx, y: ly, ts: performance.now() };
      if (!cursorRaf && !closed && el.isConnected) {
        cursorRaf = requestAnimationFrame(() => {
          cursorRaf = 0;
          if (closed || !el.isConnected || !lastCursor) return;
          const r = box.getBoundingClientRect();
          const k = Math.min(r.width / LW, r.height / LH);
          curEl.style.transform = `translate3d(${(r.width - LW * k) / 2 + lastCursor.x * k}px, ${(r.height - LH * k) / 2 + lastCursor.y * k}px, 0)`;
          curEl.style.opacity = '1';
        });
      }
      clearTimeout(cursorHideTimer);
      cursorHideTimer = window.setTimeout(() => {
        if (!closed && el.isConnected) curEl.style.opacity = '0';
      }, 650);
    };

    // ≥ 80 ms toplu nokta gönderimi
    let pendingPts: [number, number, number][] = [];
    let pendingMeta: { k: Stroke['k']; c: string; s: number } | null = null;
    let batchTimer = 0;

    const sendPkt = (pkt: DrawLivePacket) => {
      if (!live && pkt.t !== 'djoin') return;
      core.sendDrawPacket(pkt);
    };

    const sendMySnap = () => {
      const mine = strokes.filter((s) => (s.by ?? state.me) === state.me);
      sendPkt({ t: 'dsnap', seq: ++seq, strokes: mine, sid, collab });
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
        t: 'dpts',
        seq: ++seq,
        k: pendingMeta.k,
        c: pendingMeta.c,
        s: pendingMeta.s,
        pts: batch,
        sid,
      });
    };

    const unsubDraw = core.onDrawPacket((pkt) => {
      if (closed || !el.isConnected) return;

      if (pkt.t === 'djoin') {
        if (pkt.sid && !isInitiator) sid = pkt.sid;
        const wasCollab = collab;
        live = true;
        collab = true;
        everCollab = true;
        updateHeader();
        if (!wasCollab) {
          toast(`${p.name} çizime katıldı`, I.pen(14));
        }
        core.setMyLiveActivity('drawing');
        sendMySnap();
        return;
      }

      if (!live) return;

      if (pkt.t === 'dreq' || pkt.t === 'hello') {
        sendMySnap();
        return;
      }
      if (pkt.t === 'react') {
        spawnReactionHeart(el);
        return;
      }

      // Sıra numarası kontrolü: kayıp paket varsa karşıdan anlık görüntü (dreq) iste
      if (
        (pkt.t === 'dstart' || pkt.t === 'dpts' || pkt.t === 'pts') &&
        lastPartnerSeq > 0 &&
        pkt.seq > lastPartnerSeq + 1 &&
        performance.now() - lastReqAt > 900
      ) {
        lastReqAt = performance.now();
        core.requestDraw();
      }
      if (pkt.seq > 0 && pkt.t !== 'dsnap' && pkt.t !== 'snap') {
        if (pkt.seq <= lastPartnerSeq && pkt.t !== 'dfin' && pkt.t !== 'done' && pkt.t !== 'dleave' && pkt.t !== 'bye') {
          return;
        }
        lastPartnerSeq = pkt.seq;
      }

      if (pkt.t === 'dsnap' || pkt.t === 'snap') {
        if (pkt.sid && !isInitiator) sid = pkt.sid;
        if (pkt.seq > 0) lastPartnerSeq = pkt.seq;
        if (pkt.collab && !collab) {
          collab = true;
          everCollab = true;
          live = true;
          updateHeader();
        }
        // dsnap yalnızca gönderenin kendi çizgilerini taşır; alıcı sadece karşı tarafın çizgilerini değiştirir
        const mine = strokes.filter((s) => (s.by ?? state.me) === state.me);
        const theirs = (pkt.strokes || []).map((s) => ({
          ...s,
          by: state.partner,
          p: s.p.map((q) => [...q] as [number, number, number]),
        }));
        strokes.splice(0, strokes.length, ...theirs, ...mine);
        partnerCur = theirs.length ? theirs[theirs.length - 1] : null;
        totalPts = strokes.reduce((acc, s) => acc + s.p.length, 0);
        redraw();
        update();
      } else if (pkt.t === 'dstart') {
        if (pkt.sid && !isInitiator) sid = pkt.sid;
        partnerCur = { k: pkt.k, c: pkt.c, s: pkt.s, p: [pkt.pt], by: state.partner };
        strokes.push(partnerCur);
        partnerRedo.length = 0;
        totalPts++;
        showPartnerCursor(pkt.pt[0], pkt.pt[1]);
        redraw();
        update();
      } else if (pkt.t === 'dpts' || pkt.t === 'pts') {
        if (pkt.sid && !isInitiator) sid = pkt.sid;
        if (!partnerCur || !strokes.includes(partnerCur)) {
          for (let i = strokes.length - 1; i >= 0; i--) {
            if (strokes[i].by === state.partner) {
              partnerCur = strokes[i];
              break;
            }
          }
          if (!partnerCur) {
            partnerCur = {
              k: pkt.k ?? 'pen',
              c: pkt.c ?? p.color,
              s: pkt.s ?? 9,
              p: [],
              by: state.partner,
            };
            strokes.push(partnerCur);
          }
        }
        partnerCur.p.push(...pkt.pts);
        totalPts += pkt.pts.length;
        const tail = pkt.pts[pkt.pts.length - 1];
        if (tail) showPartnerCursor(tail[0], tail[1]);
        redraw();
        update();
      } else if (pkt.t === 'dundo' || pkt.t === 'undo') {
        for (let i = strokes.length - 1; i >= 0; i--) {
          if (strokes[i].by === state.partner) {
            const [removed] = strokes.splice(i, 1);
            totalPts = Math.max(0, totalPts - removed.p.length);
            partnerRedo.push(removed);
            if (partnerCur === removed) partnerCur = null;
            break;
          }
        }
        redraw();
        update();
      } else if (pkt.t === 'dredo' || pkt.t === 'redo') {
        const restored = pkt.stroke ? { ...pkt.stroke, by: state.partner } : partnerRedo.pop();
        if (restored) {
          strokes.push(restored);
          totalPts += restored.p.length;
          redraw();
          update();
        }
      } else if (pkt.t === 'dclear' || pkt.t === 'clear') {
        strokes.length = 0;
        redo.length = 0;
        partnerRedo.length = 0;
        totalPts = 0;
        partnerCur = null;
        redraw();
        update();
      } else if (pkt.t === 'dleave' || pkt.t === 'bye') {
        toast(`${p.name} çizimden ayrıldı`, I.pen(14));
        collab = false;
        partnerCur = null;
        lastCursor = null;
        curEl.style.opacity = '0';
        updateHeader();
      } else if (pkt.t === 'dfin' || pkt.t === 'done') {
        if (pkt.sid) sid = pkt.sid;
        const finalStrokes = (pkt.strokes || []).map((s) => ({
          ...s,
          p: s.p.map((q) => [...q] as [number, number, number]),
        }));
        strokes.splice(0, strokes.length, ...finalStrokes);
        redraw();
        submitting = true;
        saveDrawingDraft(null);
        void close({ strokes: finalStrokes, sid, collab: true, remoteFin: true }, true).then(() => {
          core.onCollabFin(finalStrokes, sid, true);
        });
      }
    });

    // İzleme ekranından "Birlikte çiz" ile girildiyse karşı tarafa djoin yolla
    let joinRetryTimer = 0;
    if (collab) {
      core.setMyLiveActivity('drawing');
      sendPkt({ t: 'djoin', seq: ++seq, sid });
      joinRetryTimer = window.setTimeout(() => {
        if (!closed && el.isConnected && lastPartnerSeq === 0) {
          sendPkt({ t: 'djoin', seq: ++seq, sid });
        }
      }, 700);
    }

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
      if (batchTimer) {
        clearTimeout(batchTimer);
        flushBatch();
      }
      cv.setPointerCapture(e.pointerId);
      if (!t0) t0 = performance.now();
      const [x, y] = toL(e);
      const pr = e.pointerType === 'pen' ? 0.6 + e.pressure * 0.8 : 1;
      const pt: [number, number, number] = [x, y, Math.round(performance.now() - t0)];
      cur = {
        k: tool,
        c: color,
        s: SIZES[size] * (tool === 'erase' ? 2.2 : 1) * pr,
        p: [pt],
        by: state.me,
      };
      strokes.push(cur);
      totalPts++;
      redo.length = 0;
      pendingMeta = { k: cur.k, c: cur.c, s: cur.s };
      if (live) {
        core.setMyLiveActivity('drawing');
        sendPkt({ t: 'dstart', seq: ++seq, k: cur.k, c: cur.c, s: cur.s, pt, sid });
      }
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
        core.setMyLiveActivity('drawing');
        batchTimer = window.setTimeout(flushBatch, 80);
      }
      redraw();
    });

    const up = () => {
      if (!cur) return;
      cur = null;
      if (batchTimer) {
        clearTimeout(batchTimer);
      }
      flushBatch();
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

    // Geri al YALNIZCA kendi son çizgini geri alır (karşı tarafın çizgilerine dokunmaz)
    $('[data-undo]', el).addEventListener('click', () => {
      for (let i = strokes.length - 1; i >= 0; i--) {
        if ((strokes[i].by ?? state.me) === state.me) {
          const [removed] = strokes.splice(i, 1);
          totalPts = Math.max(0, totalPts - removed.p.length);
          redo.push(removed);
          sendPkt({ t: 'dundo', seq: ++seq, sid });
          break;
        }
      }
      redraw();
      update();
    });

    $('[data-redo]', el).addEventListener('click', () => {
      const s = redo.pop();
      if (s) {
        totalPts += s.p.length;
        strokes.push(s);
        sendPkt({ t: 'dredo', seq: ++seq, stroke: s, sid });
      }
      redraw();
      update();
    });

    // Temizle ikisini de temizler (onay sorar)
    $('[data-clear]', el).addEventListener('click', async () => {
      if (!strokes.length) return;
      const bodyText = collab ? 'İkinizin de çizdikleri silinecek.' : 'Çizdiklerin silinecek.';
      if (await confirmSheet('Tuval temizlensin mi?', bodyText, 'Temizle', true)) {
        strokes.length = 0;
        redo.length = 0;
        partnerRedo.length = 0;
        totalPts = 0;
        partnerCur = null;
        sendPkt({ t: 'dclear', seq: ++seq, sid });
        redraw();
        update();
      }
    });

    $('[data-live]', el).addEventListener('click', () => {
      if (collab) {
        toast('Beraber çizerken canlı bağlantı açık kalır', I.pen(14));
        return;
      }
      live = !live;
      updateHeader();
      if (live) {
        core.setMyLiveActivity('drawing');
        sendMySnap();
      } else {
        core.sendDrawPacket({ t: 'dleave', seq: ++seq, sid });
        core.setMyLiveActivity('idle');
      }
    });

    const close = async (res: BoardResult | null, silent = false) => {
      if (closed) return;
      closed = true;
      core.setInDrawView(false);
      clearInterval(presTimer);
      clearTimeout(batchTimer);
      clearTimeout(joinRetryTimer);
      clearTimeout(cursorHideTimer);
      cancelAnimationFrame(cursorRaf);
      unsubDraw();
      if ((live || collab) && !silent) {
        if (res && !res.remoteFin) {
          core.sendDrawPacket({ t: 'dfin', seq: ++seq, strokes: res.strokes, sid: res.sid, collab: res.collab });
        } else if (!res) {
          core.sendDrawPacket({ t: 'dleave', seq: ++seq, sid });
        }
      }
      core.setMyLiveActivity('idle');
      try {
        await el.animate([{ transform: 'none' }, { transform: 'translateY(100%)' }], {
          duration: 340,
          easing: 'cubic-bezier(.4,0,.8,.4)',
          fill: 'forwards',
        }).finished;
      } catch {
        // Ignore animation cancel
      }
      el.remove();
      core.setInDrawView(false);
      resolve(res);
    };

    $('[data-cancel]', el).addEventListener('click', async () => {
      if (submitting) return;
      const hasMyStrokes = strokes.some((s) => (s.by ?? state.me) === state.me);
      const confirmBody = collab ? `${p.name} çizmeye devam edebilecek.` : 'Çizdiklerin kaydedilmeyecek.';
      if (!hasMyStrokes || (await confirmSheet('Çizimden çıkılsın mı?', confirmBody, 'Çık', true))) {
        saveDrawingDraft(null);
        await close(null);
      }
    });

    $('[data-done]', el).addEventListener('click', () => {
      if (submitting || !strokes.length) return;
      submitting = true;
      if (batchTimer) {
        clearTimeout(batchTimer);
        flushBatch();
      }
      const doneBtn = $<HTMLButtonElement>('[data-done]', el);
      doneBtn.disabled = true;
      doneBtn.textContent = 'Gönderiliyor…';
      saveDrawingDraft(null);
      const isCollabDraw = everCollab || strokes.some((s) => s.by && s.by !== state.me);
      void close({
        strokes: strokes.slice(),
        sid,
        collab: isCollabDraw,
        remoteFin: false,
      });
    });
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
  return [{ k: 'glow', c: PEOPLE[state.partner].color, s: 9, p: heart, by: state.partner }];
}

/** Karşı tarafın canlı çizimini izle + "Birlikte çiz" ile aynı tuvalde beraber çizime katıl (HOTFIX 22). */
export function openWatch(
  onDone?: (strokes: Stroke[], sid?: string, collab?: boolean) => void,
  simStrokes?: Stroke[]
) {
  if (document.querySelector('.watch,.board')) return;
  core.setInDrawView(true);
  void closeIsland();

  const p = PEOPLE[state.partner];
  const strokes: Stroke[] = [];
  const redo: Stroke[] = [];
  let sid = '';
  let lastSeq = 0;
  let lastReqAt = 0;
  let lastCursor: { x: number; y: number; ts: number } | null = null;

  const el = h(`<div class="watch" role="dialog" aria-label="${p.name} çiziyor">
    <div class="board-top"><span style="width:60px"></span>
      <div class="mid"><div class="h2">${p.name} çiziyor</div><div class="livebtn on" style="pointer-events:none"><span class="d"></span><span>Canlı</span></div></div>
      <button type="button" class="btn btn-ghost" data-close style="height:44px;padding:0 10px">Kapat</button></div>
    <div class="canvas-wrap"><div class="canvas-box"><canvas></canvas><div class="cur" style="opacity:0;background:${p.color};box-shadow:0 0 16px ${p.color}"></div></div></div>
    <div class="center" style="padding:16px 0 calc(var(--safe-b) + 20px)">
      <div style="display:flex;gap:10px;justify-content:center;align-items:center">
        <button type="button" class="btn btn-primary" data-join>${I.pen(17)}<span>Birlikte çiz</span></button>
        <button type="button" class="btn btn-soft" data-heart>${I.heart(18)}<span>Kalp gönder</span></button>
      </div>
      <div class="small" style="margin-top:10px">Aynı tuvalde birlikte çiz ya da kalp gönder</div></div></div>`);

  const app = core.homeEl.parentElement!;
  app.appendChild(el);
  el.animate([{ opacity: 0, transform: 'scale(.98)' }, { opacity: 1, transform: 'none' }], {
    duration: 380,
    easing: 'ease-out',
  });
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
    if (pkt.t === 'hello' || pkt.t === 'dreq' || pkt.t === 'react' || pkt.t === 'djoin') return;
    if ('sid' in pkt && pkt.sid) sid = pkt.sid;

    if (
      (pkt.t === 'dstart' || pkt.t === 'dpts' || pkt.t === 'pts') &&
      lastSeq > 0 &&
      pkt.seq > lastSeq + 1 &&
      performance.now() - lastReqAt > 900
    ) {
      lastReqAt = performance.now();
      core.requestDraw();
    }
    if (pkt.seq > 0 && pkt.t !== 'dsnap' && pkt.t !== 'snap') {
      if (pkt.seq <= lastSeq && pkt.t !== 'dfin' && pkt.t !== 'done' && pkt.t !== 'dleave' && pkt.t !== 'bye') {
        return;
      }
      lastSeq = pkt.seq;
    }

    if (pkt.t === 'dsnap' || pkt.t === 'snap') {
      if (pkt.seq > 0) lastSeq = pkt.seq;
      const incoming = (pkt.strokes || []).map((s) => ({
        ...s,
        by: s.by ?? state.partner,
        p: s.p.map((q) => [...q] as [number, number, number]),
      }));
      strokes.splice(0, strokes.length, ...incoming);
      redo.length = 0;
      renderDrawing(cv, strokes);
    } else if (pkt.t === 'dstart') {
      strokes.push({ k: pkt.k, c: pkt.c, s: pkt.s, p: [pkt.pt], by: state.partner });
      redo.length = 0;
      lastCursor = { x: pkt.pt[0], y: pkt.pt[1], ts: performance.now() };
      renderDrawing(cv, strokes);
    } else if (pkt.t === 'dpts' || pkt.t === 'pts') {
      let target: Stroke | undefined;
      if (typeof pkt.si === 'number') {
        while (strokes.length <= pkt.si) {
          strokes.push({ k: pkt.k ?? 'pen', c: pkt.c ?? p.color, s: pkt.s ?? 9, p: [], by: state.partner });
        }
        target = strokes[pkt.si];
      } else {
        target = strokes[strokes.length - 1];
        if (!target) {
          target = { k: pkt.k ?? 'pen', c: pkt.c ?? p.color, s: pkt.s ?? 9, p: [], by: state.partner };
          strokes.push(target);
        }
      }
      if (pkt.k) target.k = pkt.k;
      if (pkt.c) target.c = pkt.c;
      if (pkt.s) target.s = pkt.s;
      target.p.push(...pkt.pts);
      const tail = pkt.pts[pkt.pts.length - 1];
      if (tail) lastCursor = { x: tail[0], y: tail[1], ts: performance.now() };
      renderDrawing(cv, strokes);
    } else if (pkt.t === 'dundo' || pkt.t === 'undo') {
      const s = strokes.pop();
      if (s) redo.push(s);
      renderDrawing(cv, strokes);
    } else if (pkt.t === 'dredo' || pkt.t === 'redo') {
      const s = pkt.stroke ? { ...pkt.stroke, by: state.partner } : redo.pop();
      if (s) strokes.push(s);
      renderDrawing(cv, strokes);
    } else if (pkt.t === 'dclear' || pkt.t === 'clear') {
      strokes.length = 0;
      redo.length = 0;
      renderDrawing(cv, strokes);
    } else if (pkt.t === 'dfin' || pkt.t === 'done') {
      const finalStrokes = (pkt.strokes || []).map((s) => ({
        ...s,
        p: s.p.map((q) => [...q] as [number, number, number]),
      }));
      strokes.splice(0, strokes.length, ...finalStrokes);
      renderDrawing(cv, strokes);
      void finish(pkt.sid || sid, Boolean(pkt.collab));
    } else if (pkt.t === 'dleave' || pkt.t === 'bye') {
      toast(`${p.name} çizimden ayrıldı`, I.pen(14));
      void close();
    }
  });

  // Mevcut çizim anlık görüntüsünü iste
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
    core.requestDraw();
    setTimeout(() => {
      if (!closed && el.isConnected && !strokes.length) {
        core.requestDraw();
      }
    }, 650);
  }

  const close = async () => {
    if (closed) return;
    closed = true;
    core.setInDrawView(false);
    unsub();
    cancelAnimationFrame(raf);
    cancelAnimationFrame(simRaf);
    try {
      await el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, fill: 'forwards' }).finished;
    } catch {
      // Ignore
    }
    el.remove();
    core.setInDrawView(false);
  };

  const finish = async (finSid?: string, finCollab?: boolean) => {
    if (closed) return;
    closed = true;
    core.setInDrawView(false);
    unsub();
    cancelAnimationFrame(raf);
    cancelAnimationFrame(simRaf);
    try {
      await box.animate(
        [{ transform: 'none', opacity: 1 }, { transform: 'scale(.06)', opacity: 0.35 }],
        { duration: 520, easing: 'cubic-bezier(.6,0,.3,1)', fill: 'forwards' }
      ).finished;
    } catch {
      // Ignore
    }
    el.remove();
    core.setInDrawView(false);
    if (onDone) onDone(strokes, finSid, finCollab);
    else core.onCollabFin(strokes, finSid, finCollab);
  };

  $('[data-close]', el).addEventListener('click', () => void close());
  $('[data-heart]', el).addEventListener('click', () => {
    spawnReactionHeart(el);
    if (!simStrokes) core.sendDrawPacket({ t: 'react', seq: Date.now() });
  });
  $('[data-join]', el).addEventListener('click', async () => {
    if (closed) return;
    closed = true;
    unsub();
    cancelAnimationFrame(raf);
    cancelAnimationFrame(simRaf);
    const initial = strokes.map((s) => ({
      ...s,
      by: s.by ?? state.partner,
      p: s.p.map((q) => [...q] as [number, number, number]),
    }));
    const curSid = sid || undefined;
    el.remove();
    const res = await openBoard(initial, { collab: true, sid: curSid });
    if (res && !res.remoteFin && res.strokes.length) {
      await core.landMyDrawing(res.strokes, res.sid, true);
    }
  });
}
