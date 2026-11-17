// Sanat: palmiyeye asılı cam fener (kavanoz mum), ahududu motifi. (Zambak: lily.ts)
// Hepsi özgün, el çizimi hissinde ince çizgiler; renkler kişinin temasından (CSS değişkenleri).

/* ---------------- ahududu ---------------- */
let rbUid = 0;
export function raspberry(size = 18, mono = false) {
  const gid = `rb${++rbUid}`;
  const dots: string[] = [];
  const rows = [[0, 3], [5, 4], [10, 5], [15, 4], [20, 3], [24.5, 2]];
  rows.forEach(([y, n], ri) => {
    const w = [9, 11, 12, 11, 9, 5][ri];
    for (let i = 0; i < n; i++) {
      const x = n === 1 ? 0 : -w / 2 + (w / (n - 1)) * i + (ri % 2 ? 1 : 0);
      dots.push(`<circle cx="${x}" cy="${y}" r="3.1" ${mono ? 'fill="currentColor" opacity=".9"' : `fill="url(#${gid})"`}/>${mono ? '' : `<circle cx="${x - 0.9}" cy="${y - 1}" r=".8" fill="#fff" opacity=".55"/>`}`);
    }
  });
  const leaves = mono ? '' : `<path d="M0 -4 C -6 -8 -10 -6 -11 -3 C -6 -3 -3 -3 0 -2 C 3 -3 6 -3 11 -3 C 10 -6 6 -8 0 -4 Z" fill="#5f8f4e"/><path d="M0 -3 V -9" stroke="#4d7a3e" stroke-width="1.4" stroke-linecap="round"/>`;
  return `<svg width="${size}" height="${size * 1.25}" viewBox="-14 -10 28 36" aria-hidden="true">${mono ? '' : `<defs><radialGradient id="${gid}" cx=".35" cy=".35" r=".8"><stop offset="0" stop-color="#ff7aa2"/><stop offset=".6" stop-color="#d81e5b"/><stop offset="1" stop-color="#8e0f3a"/></radialGradient></defs>`}${dots.join('')}${leaves}</svg>`;
}

/* ---------------- kumdaki / palmiyedeki cam kavanoz mum ---------------- */
let jarUid = 0;
export function jarSVG(owner: 'ham' | 'beto') {
  const wax = owner === 'beto' ? ['#f4a6be', '#e46b93', '#b8436b'] : ['#f8f1e2', '#e9dcc0', '#cbb894'];
  const id = `j${owner}${++jarUid}`;
  return `<div class="jar ${owner}" role="button" tabindex="0" aria-label="Mum: dokun, kalp gönder">
    <div class="jar-halo"></div>
    <svg width="58" height="78" viewBox="0 0 58 78" aria-hidden="true">
      <defs>
        <linearGradient id="${id}g" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="rgba(255,255,255,.34)"/><stop offset=".12" stop-color="rgba(255,255,255,.06)"/>
          <stop offset=".55" stop-color="rgba(255,255,255,.02)"/><stop offset=".86" stop-color="rgba(255,255,255,.16)"/><stop offset="1" stop-color="rgba(255,255,255,.05)"/>
        </linearGradient>
        <linearGradient id="${id}w" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${wax[2]}"/><stop offset=".4" stop-color="${wax[0]}"/><stop offset="1" stop-color="${wax[1]}"/></linearGradient>
        <radialGradient id="${id}i" cx=".5" cy=".42" r=".62"><stop offset="0" stop-color="var(--jar-inner)"/><stop offset="1" stop-color="rgba(255,180,100,0)"/></radialGradient>
      </defs>
      <ellipse class="jar-shadow" cx="29" cy="74.5" rx="25" ry="3.2" fill="rgba(0,0,0,.28)"/>
      <rect x="7" y="14" width="44" height="58" rx="9" fill="url(#${id}i)" class="jar-inner"/>
      <path d="M12 42 Q29 38.5 46 42 V 68 Q29 71 12 68 Z" fill="url(#${id}w)" opacity=".95"/>
      <ellipse cx="29" cy="42" rx="17" ry="3" fill="${wax[0]}"/>
      <ellipse cx="29" cy="42.2" rx="11" ry="1.8" fill="${wax[1]}" opacity=".8"/>
      <path d="M29 41.8 V 35.6" stroke="#2a211d" stroke-width="1.1" stroke-linecap="round"/>
      <path d="M7 12 Q7 10 9 10 H49 Q51 10 51 12 V67 Q51 74 44 74 H14 Q7 74 7 67 Z" fill="url(#${id}g)" stroke="rgba(255,255,255,.30)" stroke-width=".9"/>
      <path d="M8.5 69.5 Q29 73 49.5 69.5" stroke="rgba(255,255,255,.25)" stroke-width="1.6" fill="none"/>
      <ellipse cx="29" cy="10.6" rx="21.6" ry="2.6" fill="none" stroke="rgba(255,255,255,.42)" stroke-width="1"/>
      <path d="M11 18 V 62" stroke="rgba(255,255,255,.42)" stroke-width="1.4" stroke-linecap="round"/>
      <path d="M14.5 20 V 40" stroke="rgba(255,255,255,.16)" stroke-width="1" stroke-linecap="round"/>
      <path d="M46.5 22 V 48" stroke="rgba(255,255,255,.14)" stroke-width="1" stroke-linecap="round"/>
      <path d="M7.4 15.5 Q29 19 50.6 15.5" stroke="${owner === 'beto' ? '#c9a27a' : '#9fb0d8'}" stroke-width="1.2" fill="none"/>
    </svg>
    ${owner === 'beto' ? `<div class="charm">${raspberry(9)}</div>` : ''}
    <div class="flame"><i></i></div>
  </div>`;
}

export const ART_CSS = `
.scene-fg { position: absolute; left: 0; top: 0; height: 100%; z-index: 4; pointer-events: none; will-change: transform; }
.lantern { position: absolute; width: 0; height: 0; }
.lantern .swing { position: absolute; left: 0; top: 0; transform-origin: 0 0; will-change: transform; }
.lantern .rope { position: absolute; left: -20px; top: 0; overflow: visible; }
.lantern.partner { opacity: 0; transition: opacity 1.4s ease; }
.lantern.partner.on { opacity: 1; }
.lantern .jar { margin: 0 0 0 -29px !important; transform: scale(.78); transform-origin: 50% 0; }
.jar { position: absolute; width: 58px; height: 78px; margin: -78px 0 0 -29px; pointer-events: auto; cursor: pointer; }
.jar svg { position: absolute; inset: 0; transition: transform .15s; }
.jar:active svg { transform: scale(.96); }

.jar .charm { position: absolute; left: 41px; top: 11px; transform: rotate(10deg); transform-origin: 50% 0; animation: charm 3.4s ease-in-out infinite; }
@keyframes charm { 0%,100% { transform: rotate(8deg); } 50% { transform: rotate(-6deg); } }
.jar-halo { position: absolute; left: 50%; top: 42%; width: 200px; height: 200px; margin: -100px 0 0 -100px; border-radius: 50%;
  background: radial-gradient(circle, rgba(255,196,120,.26), rgba(255,170,90,.07) 40%, rgba(255,160,80,0) 66%);
  opacity: calc(.15 + .85 * (1 - var(--daylight, 0))); animation: halo 3.2s ease-in-out infinite; pointer-events: none; }
@keyframes halo { 0%,100% { transform: scale(1); } 40% { transform: scale(1.05); } 70% { transform: scale(.97); } }
.flame { position: absolute; left: 29px; top: 22px; width: 0; height: 0; }
.flame i { position: absolute; left: -4.5px; top: -2px; width: 9px; height: 15px; border-radius: 50% 50% 46% 46% / 64% 64% 36% 36%;
  background: radial-gradient(ellipse at 50% 80%, #fffef6 0 22%, #ffe49c 42%, #ffad4f 66%, rgba(255,140,40,0) 82%);
  transform-origin: 50% 100%; animation: flick 2.4s ease-in-out infinite; }
.jar.beto .flame i { animation-delay: -1.1s; }
@keyframes flick { 0%,100% { transform: scale(1,1) rotate(0); } 22% { transform: scale(.94,1.07) rotate(-2deg); } 47% { transform: scale(1.04,.95) rotate(1.4deg); } 71% { transform: scale(.97,1.03) rotate(-.8deg); } }
.heart-fly { position: absolute; z-index: 9; color: #fff; pointer-events: none; }
.lantern .jar-shadow { display: none; }
#app[data-me] .lantern .rope { color: inherit; }
`;
