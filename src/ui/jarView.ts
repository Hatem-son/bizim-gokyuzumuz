// Ortak Anı Kavanozu & Vintage Günlük Sayfaları:
// İki kişi de gününü vintage kağıda yazıp mühürleyerek ortak cam kavanoza bırakır.
// Herkes kavanozdaki tüm katlı notları görür; ancak yalnızca kendi yazdığı sayfaları okuyabilir.
import { h, $, $$, pushPage, popPage, openSheet, confirmSheet, toast, reduced } from './ui';
import { I } from './icons';
import { state, PEOPLE, toDbWho } from './state';
import { core } from './core';
import { hash } from '../gokyuzu/util';
import {
  fetchDiaryJar,
  openMyDiaryEntry,
  saveDiaryEntry,
  deleteMyDiaryEntry,
  type DiaryEntryMeta,
  type DiaryMood,
} from '../lib/diary';

const MOODS: { id: DiaryMood; label: string; icon: string }[] = [
  { id: 'heart', label: 'Huzurlu', icon: I.heart(14) },
  { id: 'sun', label: 'Güneşli', icon: I.sun(14) },
  { id: 'coffee', label: 'Sakin', icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M5 9h11v5a5 5 0 0 1-5 5H10a5 5 0 0 1-5-5V9Z"/><path d="M16 10h2a2.5 2.5 0 0 1 0 5h-2"/><path d="M8 4c0 1.2.8 1.8.8 2.8M12 4c0 1.2.8 1.8.8 2.8"/></svg>` },
  { id: 'moon', label: 'Gece', icon: I.moon(14) },
  { id: 'rain', label: 'Yağmurlu', icon: I.rain(14) },
  { id: 'spark', label: 'Özel', icon: I.spark(14) },
];

const MOOD_MAP = Object.fromEntries(MOODS.map((m) => [m.id, m])) as Record<DiaryMood, (typeof MOODS)[number]>;

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function fmtVintageDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function foldedNoteSVG(who: 'hamham' | 'beto'): string {
  const ribbon = who === 'beto' ? '#e7749c' : '#6e97f5';
  const seal = who === 'beto' ? '#c84b76' : '#4a72d4';
  return `<svg viewBox="0 0 42 30" width="42" height="30" aria-hidden="true">
    <rect x="2" y="3" width="38" height="24" rx="3.5" fill="#f3e6cc" stroke="#b99c72" stroke-width="1"/>
    <path d="M2.5 4.5 L21 17 L39.5 4.5" fill="#ebd9b7" stroke="#b99c72" stroke-width="0.9"/>
    <path d="M21 3 V27" stroke="${ribbon}" stroke-width="2.2" opacity=".88"/>
    <circle cx="21" cy="15.5" r="4.2" fill="${seal}" stroke="#fff4" stroke-width="0.7"/>
  </svg>`;
}

function jarModelSVG(): string {
  return `<svg class="jar-svg" viewBox="0 0 260 320" width="240" height="296" aria-hidden="true">
    <defs>
      <linearGradient id="gkJarGlass" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="rgba(220,235,255,0.22)"/>
        <stop offset="18%" stop-color="rgba(255,255,255,0.06)"/>
        <stop offset="80%" stop-color="rgba(210,230,255,0.04)"/>
        <stop offset="100%" stop-color="rgba(225,240,255,0.20)"/>
      </linearGradient>
      <linearGradient id="gkJarBase" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="rgba(255,255,255,0.10)"/>
        <stop offset="100%" stop-color="rgba(255,255,255,0.24)"/>
      </linearGradient>
      <linearGradient id="gkCork" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#9e7248"/>
        <stop offset="35%" stop-color="#cfa375"/>
        <stop offset="72%" stop-color="#b8895a"/>
        <stop offset="100%" stop-color="#875d37"/>
      </linearGradient>
    </defs>

    <!-- Kavanoz cam gövde -->
    <path d="M78 72 H182 C185 88 214 96 220 124 V268 C220 292 200 304 176 304 H84 C60 304 40 292 40 268 V124 C46 96 75 88 78 72 Z"
          fill="url(#gkJarGlass)" stroke="rgba(255,255,255,0.34)" stroke-width="1.6"/>
    <!-- Cam kalın taban -->
    <path d="M46 274 C46 290 64 298 86 298 H174 C196 298 214 290 214 274"
          fill="url(#gkJarBase)" stroke="rgba(255,255,255,0.18)" stroke-width="1"/>
    <!-- Cam boyun halkası -->
    <rect x="70" y="60" width="120" height="14" rx="7" fill="rgba(235,244,255,0.16)" stroke="rgba(255,255,255,0.38)" stroke-width="1.4"/>
    <!-- Jüt ip + minik etiket -->
    <path d="M74 77 Q130 85 186 77" fill="none" stroke="#d5bc96" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M168 79 L176 96" fill="none" stroke="#d5bc96" stroke-width="1.3"/>
    <g transform="translate(166,94) rotate(-8)">
      <rect x="0" y="0" width="32" height="17" rx="3" fill="#efe0c2" stroke="#b99c72" stroke-width="0.9"/>
      <circle cx="5" cy="8.5" r="1.4" fill="#8b6944"/>
      <line x1="10" y1="6.5" x2="27" y2="6.5" stroke="#8b6944" stroke-width="1.1" opacity=".7"/>
      <line x1="10" y1="10.5" x2="23" y2="10.5" stroke="#8b6944" stroke-width="1.1" opacity=".55"/>
    </g>

    <!-- Mantar tıpa (animasyonla açılıp kapanır) -->
    <g class="jar-lid">
      <path d="M84 28 C84 22 90 18 98 18 H162 C170 18 176 22 176 28 L170 62 H90 Z"
            fill="url(#gkCork)" stroke="#704a29" stroke-width="1.2"/>
      <circle cx="104" cy="34" r="1.2" fill="#6f4a28" opacity=".45"/>
      <circle cx="136" cy="29" r="1.4" fill="#6f4a28" opacity=".4"/>
      <circle cx="152" cy="43" r="1.1" fill="#6f4a28" opacity=".45"/>
      <circle cx="116" cy="47" r="1.3" fill="#6f4a28" opacity=".35"/>
      <ellipse cx="130" cy="23" rx="34" ry="3.2" fill="rgba(255,244,225,0.22)"/>
    </g>
  </svg>`;
}

function jarFrontSheenSVG(): string {
  return `<svg class="jar-sheen" viewBox="0 0 260 320" width="240" height="296" aria-hidden="true">
    <path d="M56 128 V264 C56 276 62 284 72 288" fill="none" stroke="rgba(255,255,255,0.28)" stroke-width="4" stroke-linecap="round"/>
    <path d="M66 134 V246" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="2" stroke-linecap="round"/>
    <path d="M204 128 V256" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="2.5" stroke-linecap="round"/>
    <ellipse cx="130" cy="82" rx="46" ry="3.5" fill="rgba(255,255,255,0.10)"/>
  </svg>`;
}

function vintageCornerSVG(cls: string): string {
  return `<svg class="v-corner ${cls}" width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden="true">
    <path d="M2 22 V6 C2 3.8 3.8 2 6 2 H22" stroke="currentColor" stroke-width="1.2" opacity=".55"/>
    <path d="M6 16 V8 C6 6.8 6.8 6 8 6 H16" stroke="currentColor" stroke-width="0.9" opacity=".38"/>
    <circle cx="5.5" cy="5.5" r="1.4" fill="currentColor" opacity=".48"/>
  </svg>`;
}

function waxSealIcon(): string {
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M12 2.5l2.2 1.6 2.7-.3 1.1 2.5 2.5 1.1-.3 2.7 1.6 2.2-1.6 2.2.3 2.7-2.5 1.1-1.1 2.5-2.7-.3-2.2 1.6-2.2-1.6-2.7.3-1.1-2.5-2.5-1.1.3-2.7L2.5 12l1.6-2.2-.3-2.7 2.5-1.1 1.1-2.5 2.7.3Z" fill="currentColor" opacity=".92"/>
    <circle cx="12" cy="12" r="5.6" stroke="#f7ebd4" stroke-width="1" opacity=".55"/>
    <path d="M12 15.2s-3-1.8-3-4a1.7 1.7 0 0 1 3-1.1 1.7 1.7 0 0 1 3 1.1c0 2.2-3 4-3 4Z" fill="#f7ebd4"/>
  </svg>`;
}

export function openDiaryJar(): void {
  const pa = PEOPLE[state.partner];
  const el = h(`<div class="screen page jar-page">
    <div class="page-head">
      <button type="button" class="icon-btn" data-back aria-label="Geri">${I.back()}</button>
      <div class="title" style="font-size:32px;display:flex;align-items:center;gap:8px">Ortak Kavanoz</div>
      <span class="grow"></span>
      <span class="pill glass small" data-counts>…</span>
    </div>
    <p class="small jar-sub">İkiniz de gününüzü mühürleyip bu kavanoza koyarsınız. Karşı tarafın sayfalarını göremezsin; sadece kavanozda biriktiklerini bilirsin.</p>
    <div class="jar-sql-note hide" data-sql>Kavanoz şu an bu cihazda saklanıyor. İki telefon arasında senkron için Supabase SQL Editör'de <code>09-diary-jar.sql</code> dosyasını çalıştır.</div>

    <div class="jar-stage" data-stage>
      <div class="jar-ambient"></div>
      <div class="jar-wrap" data-jar-wrap>
        ${jarModelSVG()}
        <div class="jar-notes" data-notes></div>
        ${jarFrontSheenSVG()}
      </div>
      <div class="jar-sparks" data-sparks></div>
    </div>

    <div class="jar-cta-row">
      <button type="button" class="btn btn-primary btn-block jar-write-btn" data-write>
        ${I.pen(17)}<span>Bugünü yaz &amp; kavanoza koy</span>
      </button>
    </div>

    <div class="jar-list-head">
      <div class="eyebrow">Senin vintage sayfaların</div>
      <span class="small" data-mine-count></span>
    </div>
    <div class="jar-entries" data-entries></div>
  </div>`);

  pushPage(el, core.homeEl);
  const notesEl = $('[data-notes]', el);
  const jarWrap = $('[data-jar-wrap]', el);
  const sparksEl = $('[data-sparks]', el);
  const countsEl = $('[data-counts]', el);
  const mineCountEl = $('[data-mine-count]', el);
  const entriesEl = $('[data-entries]', el);
  const sqlEl = $('[data-sql]', el);

  let entries: DiaryEntryMeta[] = [];

  const renderJarNotes = () => {
    notesEl.innerHTML = '';
    const visible = entries.slice(0, 26).reverse();
    visible.forEach((entry, idx) => {
      const hVal = hash(entry.id);
      const col = idx % 5;
      const row = Math.floor(idx / 5);
      const jitterX = ((hVal % 19) - 9);
      const jitterY = (((hVal >>> 5) % 9) - 4);
      const rot = ((hVal >>> 9) % 36) - 18;
      const leftPct = 14 + col * 16 + jitterX * 0.45;
      const bottomPx = 12 + row * 24 + jitterY * 0.6;
      const btn = h(`<button type="button" class="jar-note ${entry.from} ${entry.mine ? 'mine' : 'sealed'}"
        style="left:${leftPct.toFixed(1)}%;bottom:${bottomPx.toFixed(1)}px;--r:${rot}deg"
        aria-label="${entry.mine ? `${fmtVintageDate(entry.entryDate)} günlüğün` : `${pa.of} mühürlü notu`}">
        ${foldedNoteSVG(entry.from)}
      </button>`);
      btn.addEventListener('click', () => {
        if (entry.mine) {
          void openVintageReader(entry);
        } else {
          btn.animate(
            [
              { transform: `rotate(${rot}deg) translateX(0)` },
              { transform: `rotate(${rot - 7}deg) translateX(-3px)` },
              { transform: `rotate(${rot + 7}deg) translateX(3px)` },
              { transform: `rotate(${rot}deg) translateX(0)` },
            ],
            { duration: 360, easing: 'ease-out' },
          );
          openSealedPartnerSheet(entry);
        }
      });
      notesEl.appendChild(btn);
    });
  };

  const renderMyList = () => {
    const mine = entries.filter((e) => e.mine);
    const theirs = entries.filter((e) => !e.mine);
    countsEl.textContent = `Sen ${mine.length} · ${pa.name} ${theirs.length}`;
    mineCountEl.textContent = mine.length ? `${mine.length} sayfa` : '';
    entriesEl.innerHTML = '';
    if (!mine.length) {
      entriesEl.innerHTML = `<div class="jar-empty">Henüz kavanoza koyduğun bir gün yok.<br><span class="small">Yazdığın her sayfa vintage kağıtta saklanır, ${pa.name} okuyamaz.</span></div>`;
      return;
    }
    for (const entry of mine) {
      const m = MOOD_MAP[entry.mood] ?? MOOD_MAP.heart;
      const card = h(`<button type="button" class="v-mini press">
        <span class="v-mini-seal ${entry.from}">${m.icon}</span>
        <span class="v-mini-body">
          <b>${fmtVintageDate(entry.entryDate)}</b>
          <i>${m.label} · Mühürlü sayfa</i>
        </span>
        <span class="v-mini-chev">${I.chevron(16)}</span>
      </button>`);
      card.addEventListener('click', () => void openVintageReader(entry));
      entriesEl.appendChild(card);
    }
  };

  const reload = async () => {
    try {
      const res = await fetchDiaryJar();
      entries = res.entries;
      sqlEl.classList.toggle('hide', !res.needsSql);
      renderJarNotes();
      renderMyList();
    } catch {
      toast('Kavanoz yüklenemedi', I.info(14));
    }
  };

  const playDropIntoJar = async (who: 'hamham' | 'beto') => {
    if (reduced()) return;
    const lid = $('.jar-lid', jarWrap) as HTMLElement | null;
    lid?.animate(
      [
        { transform: 'translate(0, 0) rotate(0deg)' },
        { transform: 'translate(-22px, -32px) rotate(-24deg)', offset: 0.3 },
        { transform: 'translate(-22px, -32px) rotate(-24deg)', offset: 0.72 },
        { transform: 'translate(0, 0) rotate(0deg)' },
      ],
      { duration: 980, easing: 'cubic-bezier(.2,.8,.2,1)' },
    );

    const dropNote = h(`<div class="jar-drop-note">${foldedNoteSVG(who)}</div>`);
    jarWrap.appendChild(dropNote);
    await dropNote.animate(
      [
        { opacity: 0, transform: 'translate(-50%, -68px) scale(1.25) rotate(-14deg)' },
        { opacity: 1, transform: 'translate(-50%, -18px) scale(1.08) rotate(8deg)', offset: 0.3 },
        { opacity: 1, transform: 'translate(-50%, 155px) scale(0.95) rotate(-6deg)', offset: 0.8 },
        { opacity: 0, transform: 'translate(-50%, 172px) scale(0.86) rotate(4deg)' },
      ],
      { duration: 760, delay: 140, easing: 'cubic-bezier(.22,.82,.28,1)', fill: 'forwards' },
    ).finished;
    dropNote.remove();

    jarWrap.animate(
      [
        { transform: 'translateY(0) scale(1)' },
        { transform: 'translateY(3px) scale(1.015, 0.985)' },
        { transform: 'translateY(0) scale(1)' },
      ],
      { duration: 320, easing: 'ease-out' },
    );

    for (let i = 0; i < 6; i++) {
      const sp = h(`<i class="jar-spark"></i>`);
      const ang = (i / 6) * Math.PI * 2;
      const dist = 24 + (i % 2) * 14;
      sparksEl.appendChild(sp);
      sp.animate(
        [
          { opacity: 1, transform: 'translate(0,0) scale(0.6)' },
          { opacity: 0, transform: `translate(${Math.cos(ang) * dist}px, ${Math.sin(ang) * dist - 14}px) scale(1.2)` },
        ],
        { duration: 560, easing: 'ease-out', fill: 'forwards' },
      ).finished.then(() => sp.remove());
    }
  };

  function openSealedPartnerSheet(entry: DiaryEntryMeta) {
    const m = MOOD_MAP[entry.mood] ?? MOOD_MAP.heart;
    const body = h(`<div class="v-sheet-wrap">
      <div class="v-paper v-sealed-card">
        ${vintageCornerSVG('tl')}${vintageCornerSVG('tr')}${vintageCornerSVG('bl')}${vintageCornerSVG('br')}
        <div class="v-seal-big ${entry.from}">${waxSealIcon()}</div>
        <div class="v-stamp">${fmtVintageDate(entry.entryDate)}</div>
        <div class="v-sealed-title">${pa.of} mühürlü günü</div>
        <p class="v-sealed-sub">Bu sayfa ortak kavanozda saklı; yalnızca yazan okuyabilir.</p>
        <div class="v-mood-tag">${m.icon}<span>${m.label}</span></div>
      </div>
    </div>`);
    openSheet(body, { cls: 'v-sheet' });
  }

  async function openVintageReader(entry: DiaryEntryMeta) {
    try {
      const content = await openMyDiaryEntry(entry.id);
      if (!content) {
        toast('Bu sayfa açılamadı', I.info(14));
        return;
      }
      const m = MOOD_MAP[content.mood] ?? MOOD_MAP.heart;
      const body = h(`<div class="v-sheet-wrap">
        <div class="v-paper v-reader">
          ${vintageCornerSVG('tl')}${vintageCornerSVG('tr')}${vintageCornerSVG('bl')}${vintageCornerSVG('br')}
          <div class="v-paper-head">
            <span class="v-stamp">${fmtVintageDate(content.entryDate)}</span>
            <span class="v-mood-tag">${m.icon}<span>${m.label}</span></span>
          </div>
          ${content.title ? `<h3 class="v-title">${escapeHtml(content.title)}</h3>` : ''}
          <div class="v-ruled-text">${escapeHtml(content.text).replace(/\n/g, '<br>')}</div>
          <div class="v-paper-foot">
            <span class="v-sign">— ${PEOPLE[state.me].name}</span>
            <button type="button" class="v-del-btn" data-del aria-label="Sayfayı sil">${I.trash(16)}<span>Sil</span></button>
          </div>
        </div>
      </div>`);
      const sh = openSheet(body, { cls: 'v-sheet' });
      $('[data-del]', body).addEventListener('click', async () => {
        if (await confirmSheet('Günlük sayfası silinsin mi?', 'Kavanozdaki bu sayfan kalıcı olarak silinir.', 'Sil', true)) {
          await deleteMyDiaryEntry(entry.id);
          await sh.close();
          toast('Sayfa kavanozdan çıkarıldı');
          void reload();
        }
      });
    } catch {
      toast('Şifre çözülemedi', I.info(14));
    }
  }

  function openVintageWriter() {
    let mood: DiaryMood = 'heart';
    const dateIso = todayIso();
    const body = h(`<div class="v-sheet-wrap">
      <div class="v-paper v-writer">
        ${vintageCornerSVG('tl')}${vintageCornerSVG('tr')}${vintageCornerSVG('bl')}${vintageCornerSVG('br')}
        <div class="v-paper-head">
          <span class="v-stamp">${fmtVintageDate(dateIso)}</span>
          <button type="button" class="v-close-btn" data-close aria-label="Kapat">${I.close(18)}</button>
        </div>
        <div class="v-moods" data-moods>
          ${MOODS.map((m) => `<button type="button" class="v-mood ${m.id === mood ? 'on' : ''}" data-m="${m.id}">${m.icon}<span>${m.label}</span></button>`).join('')}
        </div>
        <input class="v-title-inp" type="text" maxlength="70" placeholder="Bugüne kısa bir başlık…" data-nodrag>
        <div class="v-lines-wrap" data-nodrag>
          <textarea class="v-textarea" maxlength="2000" placeholder="Bugün neler yaptın, aklından neler geçti… (Sadece sen okuyabilirsin)"></textarea>
        </div>
        <div class="v-writer-foot">
          <span class="v-cnt" data-cnt>0 / 2000</span>
          <button type="button" class="v-seal-btn" data-seal disabled>
            ${waxSealIcon()}<span>Mühürle &amp; Kavanoza Koy</span>
          </button>
        </div>
      </div>
    </div>`);

    const sh = openSheet(body, { cls: 'v-sheet' });
    const ta = $<HTMLTextAreaElement>('.v-textarea', body);
    const titleInp = $<HTMLInputElement>('.v-title-inp', body);
    const cntEl = $('[data-cnt]', body);
    const sealBtn = $<HTMLButtonElement>('[data-seal]', body);

    $('[data-close]', body).addEventListener('click', () => void sh.close());
    $$('[data-m]', body).forEach((b) =>
      b.addEventListener('click', () => {
        mood = (b as HTMLElement).dataset.m as DiaryMood;
        $$('[data-m]', body).forEach((x) => x.classList.toggle('on', x === b));
      }),
    );

    const sync = () => {
      cntEl.textContent = `${ta.value.length} / 2000`;
      sealBtn.disabled = !ta.value.trim();
    };
    ta.addEventListener('input', sync);

    sealBtn.addEventListener('click', async () => {
      const text = ta.value.trim();
      if (!text) return;
      sealBtn.disabled = true;
      try {
        const res = await saveDiaryEntry({
          title: titleInp.value.trim(),
          text,
          mood,
          entryDate: dateIso,
        });
        await sh.close();
        await playDropIntoJar(toDbWho(state.me));
        await reload();
        toast(res.needsSql ? 'Kavanoza kondu (yerel)' : 'Günün mühürlenip kavanoza kondu', I.heart(14));
      } catch {
        sealBtn.disabled = false;
        toast('Kaydedilemedi, tekrar dene', I.info(14));
      }
    });
  }

  $('[data-back]', el).addEventListener('click', () => void popPage(core.homeEl));
  $('[data-write]', el).addEventListener('click', () => openVintageWriter());
  void reload();
}
