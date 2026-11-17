import { barsHtml, formatDuration } from '../lib/audioUi';
import { otherWho, PEOPLE } from '../lib/people';
import { formatUnlockAccusative, getServerNowMs, type StarPayloadData } from '../lib/stars';
import { STORAGE_KEYS, store } from '../lib/storage';
import type { StarKind, Who } from '../types';
import { $, setInert } from './dom';
import { attachSheetSwipe } from './sheetSwipe';

const schedLabelFmt = new Intl.DateTimeFormat('tr-TR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

function formatTurkishPickerLabel(d: Date): string {
  const parts = schedLabelFmt.formatToParts(d);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '';
  const day = get('day');
  const month = get('month');
  const year = get('year');
  const hour = get('hour');
  const minute = get('minute');
  if (day && month && year && hour && minute) {
    return `${day} ${month} ${year}, ${hour}:${minute}`;
  }
  return schedLabelFmt.format(d);
}

const CHIPS = ['Seni özledim', 'Günaydın', 'İyi geceler', 'Aklımdasın', 'Seni seviyorum'];
const ICON_X =
  '<svg viewBox="0 0 24 24"><path d="M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12 19 17.6 17.6 19 12 13.4 6.4 19 5 17.6 10.6 12 5 6.4z"/></svg>';
const ICON_STOP = '<svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2.5"/></svg>';
const PLAY_PATH = 'M8 5v14l11-7z';
const PAUSE_PATH = 'M7 5h4v14H7zm6 0h4v14h-4z';

type Attachment =
  | {
      type: 'photo';
      once: boolean;
      bytes: Uint8Array<ArrayBuffer>;
      mime: string;
      preview: string;
    }
  | {
      type: 'voice';
      bytes: Uint8Array<ArrayBuffer>;
      mime: string;
      dur: number;
      peaks: number[];
      url?: string;
      audio?: HTMLAudioElement;
    };

interface RecSession {
  mr: MediaRecorder;
  stream: MediaStream;
  ac: AudioContext | null;
  an: AnalyserNode | null;
  t0: number;
  lv: number[];
  last: number;
  discard: boolean;
  rafId: number;
}

export interface ComposeController {
  open: (me: Who) => void;
  close: () => void;
  destroy: () => void;
  isOpen: () => boolean;
  syncIdentity: (me: Who) => void;
  syncViewport: () => void;
}

function toDatetimeLocalValue(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function computePresetDate(preset: 'tomorrow' | 'week' | 'jan9'): Date {
  const now = new Date(getServerNowMs());
  if (preset === 'tomorrow') {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return d;
  }
  if (preset === 'week') {
    const d = new Date(now);
    d.setDate(d.getDate() + 7);
    d.setHours(9, 0, 0, 0);
    return d;
  }
  const jan9 = new Date(2027, 0, 9, 0, 0, 0, 0);
  if (jan9.getTime() <= now.getTime() + 60_000) {
    const nextYear = new Date(now.getFullYear() + 1, 0, 9, 0, 0, 0, 0);
    return nextYear;
  }
  return jan9;
}

export function initComposeSheet(opts: {
  getMe: () => Who | null;
  onSend: (params: {
    kind: StarKind;
    data: StarPayloadData;
    origin: { x: number; y: number };
    mediaBytes?: Uint8Array<ArrayBuffer>;
    once?: boolean;
    unlockAt?: string | null;
  }) => void;
}): ComposeController {
  const sheet = $('#compose');
  const form = $('#compose-form') as HTMLFormElement;
  const ta = $('#msg') as HTMLTextAreaElement;
  const chipsEl = $('#chips');
  const countEl = $('#count');
  const sendBtn = $('#send') as HTMLButtonElement;
  const sendLbl = $('#send-lbl');
  const attPhotoBtn = $('#att-photo') as HTMLButtonElement;
  const attVoiceBtn = $('#att-voice') as HTMLButtonElement;
  const attTimeBtn = $('#att-time') as HTMLButtonElement;
  const photoIn = $('#photo-in') as HTMLInputElement;
  const attCard = $('#att-card');
  const attErr = $('#att-err');
  const schedBox = $('#sched-box');
  const schedCancel = $('#sched-cancel') as HTMLButtonElement;
  const schedDt = $('#sched-dt') as HTMLInputElement;
  const schedDtLabel = $('#sched-dt-label');
  const schedPresets = $('#sched-presets');
  const schedNote = $('#sched-note');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let att: Attachment | null = null;
  let rec: RecSession | null = null;
  let schedOn = false;
  let activePreset: 'tomorrow' | 'week' | 'jan9' | null = null;

  chipsEl.innerHTML = CHIPS.map((c) => `<button class="chip" type="button">${c}</button>`).join('');

  function showErr(msg: string): void {
    attErr.textContent = msg;
    attErr.hidden = false;
  }

  function hideErr(): void {
    attErr.hidden = true;
  }

  function getParsedScheduleMs(): number {
    return schedDt.value ? new Date(schedDt.value).getTime() : NaN;
  }

  function isScheduleInvalid(): boolean {
    if (!schedOn) return false;
    const ms = getParsedScheduleMs();
    return !Number.isFinite(ms) || ms < getServerNowMs() + 60_000;
  }

  function refreshScheduleUi(snapEmpty = false): void {
    const minMs = getServerNowMs() + 60_000;
    schedDt.min = toDatetimeLocalValue(minMs);

    attTimeBtn.classList.toggle('on', schedOn);
    attTimeBtn.setAttribute('aria-expanded', schedOn ? 'true' : 'false');
    schedBox.hidden = !schedOn;
    document.body.classList.toggle('sched-open', schedOn);
    sendLbl.textContent = schedOn ? 'Zamana bırak' : 'Gökyüzüne bırak';

    schedPresets.querySelectorAll<HTMLButtonElement>('.sched-preset').forEach((btn) => {
      btn.classList.toggle('on', btn.dataset.preset === activePreset);
    });

    if (!schedOn) {
      schedNote.classList.remove('err');
      schedNote.textContent = '';
      schedDtLabel.textContent = '';
      updateCount();
      return;
    }

    if (snapEmpty || !schedDt.value) {
      schedDt.value = toDatetimeLocalValue(getServerNowMs() + 5 * 60_000);
    }

    const parsedMs = getParsedScheduleMs();
    const valid = Number.isFinite(parsedMs) && parsedMs >= minMs;
    const displayDate = Number.isFinite(parsedMs) ? new Date(parsedMs) : new Date(minMs);
    schedDtLabel.textContent = formatTurkishPickerLabel(displayDate);

    if (!valid) {
      schedNote.classList.add('err');
      schedNote.textContent = 'Geçmiş bir tarih seçemezsin. En az 1 dakika sonrasını seç.';
      updateCount();
      return;
    }

    schedNote.classList.remove('err');
    const me = opts.getMe();
    const otherName = me ? PEOPLE[otherWho(me)].name : 'Karşı taraf';
    schedNote.textContent = `${otherName} yıldızı görecek ama ${formatUnlockAccusative(
      displayDate.toISOString(),
      'e'
    )} kadar açamayacak. O an bildirim düşecek.`;
    updateCount();
  }

  function syncViewport(): void {
    if (!sheet.classList.contains('open')) {
      sheet.classList.remove('hide-chips');
      return;
    }

    if (schedOn) {
      sheet.classList.add('hide-chips');
    } else {
      sheet.classList.remove('hide-chips');
      if (form.scrollHeight > form.clientHeight + 2) {
        sheet.classList.add('hide-chips');
      }
    }
  }

  function enableSchedule(preset: 'tomorrow' | 'week' | 'jan9' = 'tomorrow'): void {
    schedOn = true;
    activePreset = preset;
    schedDt.value = toDatetimeLocalValue(computePresetDate(preset).getTime());
    refreshScheduleUi(false);
    syncViewport();
    schedBox.scrollIntoView({ block: 'nearest' });
  }

  function disableSchedule(): void {
    schedOn = false;
    activePreset = null;
    refreshScheduleUi(false);
    syncViewport();
  }

  function updateCount(): void {
    countEl.textContent = `${ta.value.length} / 600`;
    sendBtn.disabled = Boolean(rec) || !(ta.value.trim() || att) || isScheduleInvalid();
  }

  function clearAtt(): void {
    if (att && att.type === 'voice') {
      if (att.audio) att.audio.pause();
      if (att.url) URL.revokeObjectURL(att.url);
    }
    att = null;
    renderAtt();
    updateCount();
  }

  function stopRec(discard: boolean): void {
    if (!rec) return;
    rec.discard = discard;
    cancelAnimationFrame(rec.rafId);
    if (rec.mr.state !== 'inactive') {
      rec.mr.stop();
    }
  }

  function renderAtt(): void {
    attPhotoBtn.hidden = attVoiceBtn.hidden = Boolean(att || rec);
    if (rec) {
      attCard.hidden = false;
      attCard.innerHTML = `<div class="rec-ui"><span class="rec-dot"></span><span class="rec-time" id="rec-time">0:00 / 1:00</span><span class="bars" id="rec-bars">${'<i></i>'.repeat(
        28
      )}</span><button class="att-x stop" id="rec-stop" type="button" aria-label="Kaydı bitir">${ICON_STOP}</button></div>`;
      $('#rec-stop').onclick = () => stopRec(false);
      return;
    }

    if (!att) {
      attCard.hidden = true;
      attCard.innerHTML = '';
      return;
    }

    attCard.hidden = false;
    if (att.type === 'photo') {
      const photoAtt = att;
      attCard.innerHTML = `<img class="att-thumb" id="att-thumb" src="${photoAtt.preview}" alt="Seçilen fotoğraf">
        <div class="att-body">
          <span class="att-title">Fotoğraf</span>
          <div class="seg" role="group" aria-label="Fotoğraf nasıl görünsün">
            <button type="button" data-once="0" aria-pressed="${!photoAtt.once}">Kalıcı</button>
            <button type="button" data-once="1" aria-pressed="${photoAtt.once}">Tek seferlik</button>
          </div>
          <span class="att-note">${photoAtt.once ? 'Açılıp kapatılınca silinir' : 'Yıldız her açıldığında görünür'}</span>
        </div>
        <button class="att-x" id="att-x" type="button" aria-label="Fotoğrafı kaldır">${ICON_X}</button>`;

      attCard.querySelectorAll<HTMLButtonElement>('.seg button').forEach((btn) => {
        btn.onclick = () => {
          photoAtt.once = btn.dataset.once === '1';
          renderAtt();
        };
      });
    } else {
      const voiceAtt = att;
      attCard.innerHTML = `<button class="play sm" id="att-play" type="button" aria-label="Kaydı dinle"><svg viewBox="0 0 24 24"><path id="att-ic" d="${PLAY_PATH}"/></svg></button>
        <div class="att-body">
          <span class="att-title">Ses kaydı · ${formatDuration(voiceAtt.dur)}</span>
          <span class="bars">${barsHtml(voiceAtt.peaks, 28)}</span>
        </div>
        <button class="att-x" id="att-x" type="button" aria-label="Kaydı sil">${ICON_X}</button>`;

      $('#att-play').onclick = () => {
        if (!voiceAtt.url) {
          voiceAtt.url = URL.createObjectURL(new Blob([voiceAtt.bytes], { type: voiceAtt.mime }));
        }
        const a = voiceAtt.audio || (voiceAtt.audio = new Audio(voiceAtt.url));
        const ic = $('#att-ic');
        a.onplay = () => ic.setAttribute('d', PAUSE_PATH);
        a.onpause = a.onended = () => ic.setAttribute('d', PLAY_PATH);
        if (a.paused) {
          a.play().catch(() => undefined);
        } else {
          a.pause();
        }
      };
    }

    $('#att-x').onclick = clearAtt;
  }

  async function startRec(): Promise<void> {
    hideErr();
    if (!navigator.mediaDevices?.getUserMedia || typeof window.MediaRecorder === 'undefined') {
      showErr('Bu tarayıcı ses kaydını desteklemiyor.');
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      showErr('Mikrofona ulaşılamadı. iPhone Ayarlar veya Safari izinlerinden mikrofonu aç.');
      return;
    }

    // iOS Safari expects audio/mp4 (AAC)
    const mime =
      ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'].find(
        (m) => typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported(m)
      ) || '';

    const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    const chunks: BlobPart[] = [];

    let ac: AudioContext | null = null;
    let an: AnalyserNode | null = null;
    try {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctx) {
        ac = new Ctx();
        an = ac.createAnalyser();
        an.fftSize = 512;
        ac.createMediaStreamSource(stream).connect(an);
      }
    } catch {
      // Visualizer optional
    }

    const session: RecSession = {
      mr,
      stream,
      ac,
      an,
      t0: performance.now(),
      lv: Array(28).fill(0),
      last: 0,
      discard: false,
      rafId: 0,
    };
    rec = session;

    mr.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };

    mr.onstop = async () => {
      const dur = Math.min(60, (performance.now() - session.t0) / 1000);
      session.stream.getTracks().forEach((t) => t.stop());
      if (session.ac) session.ac.close().catch(() => undefined);
      rec = null;

      if (session.discard || dur < 0.8) {
        renderAtt();
        updateCount();
        return;
      }

      const blob = new Blob(chunks, { type: mr.mimeType || mime || 'audio/mp4' });
      const ab = await blob.arrayBuffer();
      const bytes = new Uint8Array(new ArrayBuffer(ab.byteLength));
      bytes.set(new Uint8Array(ab));

      const { peaksFromBytes } = await import('../lib/media');
      const peaks = (await peaksFromBytes(bytes)) || session.lv.map((x) => +x.toFixed(2));
      att = {
        type: 'voice',
        bytes,
        mime: blob.type || mime || 'audio/mp4',
        dur,
        peaks,
      };
      renderAtt();
      updateCount();
    };

    const recLoop = () => {
      if (!rec) return;
      const elapsed = (performance.now() - rec.t0) / 1000;
      if (elapsed >= 60) {
        stopRec(false);
        return;
      }
      const tm = document.getElementById('rec-time');
      if (tm) tm.textContent = `${formatDuration(elapsed)} / 1:00`;

      if (rec.an && (!rec.last || performance.now() - rec.last > 90)) {
        rec.last = performance.now();
        const buf = new Uint8Array(rec.an.fftSize);
        rec.an.getByteTimeDomainData(buf);
        let sum = 0;
        for (const v of buf) {
          const x = (v - 128) / 128;
          sum += x * x;
        }
        rec.lv.push(Math.min(1, Math.sqrt(sum / buf.length) * 4));
        rec.lv.shift();
        const bars = document.getElementById('rec-bars');
        if (bars) {
          Array.from(bars.children).forEach((b, i) => {
            (b as HTMLElement).style.setProperty('--h', `${Math.round(12 + rec!.lv[i] * 88)}%`);
            b.classList.add('on');
          });
        }
      }
      rec.rafId = requestAnimationFrame(recLoop);
    };

    mr.start(250);
    renderAtt();
    updateCount();
    rec.rafId = requestAnimationFrame(recLoop);
  }

  chipsEl.addEventListener('click', (e) => {
    const chip = (e.target as HTMLElement).closest('.chip');
    if (!chip) return;
    const v = ta.value.trimEnd();
    ta.value = (v ? v + (/[.!?…]$/.test(v) ? ' ' : '. ') : '') + (chip.textContent ?? '');
    ta.dispatchEvent(new Event('input'));
    ta.focus({ preventScroll: true });
  });

  ta.addEventListener('input', () => {
    updateCount();
    const me = opts.getMe();
    if (me) store.set(STORAGE_KEYS.draftPrefix + me, ta.value);
  });

  attPhotoBtn.addEventListener('click', () => {
    void import('../lib/media');
    photoIn.click();
  });
  photoIn.addEventListener('change', async () => {
    const f = photoIn.files?.[0];
    photoIn.value = '';
    if (!f) return;
    hideErr();
    try {
      const { compressImage } = await import('../lib/media');
      const compressed = await compressImage(f);
      att = { type: 'photo', once: false, ...compressed };
      renderAtt();
      updateCount();
    } catch {
      showErr('Bu fotoğraf açılamadı, başka bir tane dene.');
    }
  });

  attVoiceBtn.addEventListener('click', () => {
    void import('../lib/media');
    void startRec();
  });

  attTimeBtn.addEventListener('click', () => {
    if (schedOn) disableSchedule();
    else enableSchedule('tomorrow');
  });

  schedCancel.addEventListener('click', disableSchedule);

  schedPresets.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.sched-preset');
    if (!btn) return;
    const preset = btn.dataset.preset as 'tomorrow' | 'week' | 'jan9' | undefined;
    if (!preset) return;
    enableSchedule(preset);
  });

  schedDt.addEventListener('change', () => {
    activePreset = null;
    refreshScheduleUi(false);
  });

  schedDt.addEventListener('input', () => {
    activePreset = null;
    refreshScheduleUi(false);
  });

  function close(): void {
    ta.blur();
    stopRec(true);
    sheet.classList.remove('open');
    document.body.classList.remove('sheet-open', 'sched-open');
    syncViewport();
    setInert(sheet, true);
  }

  sheet.addEventListener('click', (e) => {
    if (e.target === sheet) close();
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (rec) return;
    const me = opts.getMe();
    const text = ta.value.trim();
    const currentAtt = att;
    if (!me || (!text && !currentAtt) || isScheduleInvalid()) return;

    let unlockAt: string | null = null;
    if (schedOn) {
      unlockAt = new Date(getParsedScheduleMs()).toISOString();
    }

    const tr = ta.getBoundingClientRect();
    const origin = { x: tr.left + tr.width / 2, y: tr.top + tr.height / 2 };

    // Transform & opacity only (no filter: blur per perf rule 2)
    if (!reducedMotion) {
      const shrink = (el: HTMLElement) => {
        el.animate(
          [
            { opacity: 1, transform: 'scale(1)' },
            { opacity: 0, transform: 'scale(0.06)' },
          ],
          { duration: 560, easing: 'cubic-bezier(.6,0,.35,1)', fill: 'forwards' }
        ).onfinish = () => el.remove();
      };

      if (text) {
        const ghost = document.createElement('div');
        ghost.className = 'ghost';
        ghost.textContent = text;
        Object.assign(ghost.style, {
          left: `${tr.left}px`,
          top: `${tr.top}px`,
          width: `${tr.width}px`,
          height: `${tr.height}px`,
        });
        document.body.appendChild(ghost);
        shrink(ghost);
      }

      const thumb = document.getElementById('att-thumb');
      if (thumb instanceof HTMLImageElement) {
        const ir = thumb.getBoundingClientRect();
        const gImg = document.createElement('img');
        gImg.src = thumb.src;
        gImg.className = 'ghost-img';
        Object.assign(gImg.style, {
          left: `${ir.left}px`,
          top: `${ir.top}px`,
          width: `${ir.width}px`,
          height: `${ir.height}px`,
        });
        document.body.appendChild(gImg);
        shrink(gImg);
      }
    }

    if (currentAtt && currentAtt.type === 'voice') {
      if (currentAtt.audio) currentAtt.audio.pause();
      if (currentAtt.url) URL.revokeObjectURL(currentAtt.url);
    }

    att = null;
    ta.value = '';
    store.del(STORAGE_KEYS.draftPrefix + me);
    disableSchedule();
    renderAtt();
    updateCount();
    close();

    const kind: StarKind = currentAtt ? currentAtt.type : 'note';
    const data: StarPayloadData = { text };
    if (currentAtt) {
      data.mime = currentAtt.mime;
      if (currentAtt.type === 'voice') {
        data.dur = +currentAtt.dur.toFixed(1);
        data.peaks = currentAtt.peaks;
      }
    }

    window.setTimeout(
      () =>
        opts.onSend({
          kind,
          data,
          origin,
          mediaBytes: currentAtt?.bytes,
          once: currentAtt?.type === 'photo' ? currentAtt.once : false,
          unlockAt,
        }),
      reducedMotion ? 0 : 440
    );
  });

  const detachSwipe = attachSheetSwipe(sheet, form, {
    onClose: close,
  });

  sheet.addEventListener(
    'touchmove',
    (e) => {
      if (e.target === sheet) {
        e.preventDefault();
      }
    },
    { passive: false }
  );

  function syncIdentity(me: Who): void {
    const other = PEOPLE[otherWho(me)];
    const cm = $('#c-medal');
    cm.className = `medal ${other.color}`;
    cm.textContent = other.sign;
    $('#c-title').textContent = other.dat;
    $('#c-hint').textContent = `Bu yıldızı sadece ${other.name} açabilir. Gönderdikten sonra sen de okuyamazsın.`;
    ta.placeholder = `${other.name}, aklımdan…`;
    if (schedOn) refreshScheduleUi(false);
  }

  function open(me: Who): void {
    syncIdentity(me);
    ta.value = store.get<string>(STORAGE_KEYS.draftPrefix + me, '');
    disableSchedule();
    hideErr();
    updateCount();
    document.body.classList.add('sheet-open');
    sheet.classList.add('open');
    setInert(sheet, false);
    syncViewport();
    ta.focus({ preventScroll: true });
    syncViewport();
  }

  function destroy(): void {
    detachSwipe();
    stopRec(true);
    clearAtt();
    close();
  }

  return {
    open,
    close,
    destroy,
    isOpen: () => sheet.classList.contains('open'),
    syncIdentity,
    syncViewport,
  };
}
