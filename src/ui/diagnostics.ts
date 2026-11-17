// Teşhis menüsü (Ayarlar -> Sürüm satırına 5 dokunuş):
// FPS, yavaş kare oranı (%), uzun görevler, worker süreleri, saat kaydırıcısı, "Günü 24 sn'de oynat", hava önizleme.
import { h, $, openSheet } from './ui';
import { core } from './core';
import { Weather, WeatherKind, kindFromCode, KIND_TR } from '../gokyuzu/weather';

const PRE: Record<WeatherKind, [number, number, number, number, number, number]> = {
  clear: [0, 0, 0.1, 15000, 0, 18],
  partly: [2, 35, 0.2, 15000, 0, 16],
  cloudy: [3, 70, 0.3, 12000, 0, 13],
  overcast: [3, 98, 0.3, 9000, 0, 11],
  fog: [45, 60, 0.05, 400, 0, 9],
  drizzle: [53, 90, 0.2, 6000, 0.25, 10],
  rain: [63, 95, 0.35, 5000, 0.6, 9],
  heavyRain: [65, 100, 0.6, 2500, 0.95, 8],
  showers: [81, 80, 0.45, 6000, 0.6, 10],
  snow: [73, 95, 0.15, 3000, 0.55, 1],
  heavySnow: [75, 100, 0.4, 900, 0.9, -2],
  sleet: [67, 100, 0.3, 3000, 0.55, 2],
  thunder: [95, 100, 0.7, 3000, 0.95, 11],
};

export function applyWeatherPreview(kind: WeatherKind, ms = 2500) {
  const [code, cloud, wind, vis, precip, temp] = PRE[kind];
  const wx: Weather = {
    kind: kindFromCode(code, cloud / 100),
    cloud: cloud / 100,
    precip,
    wind,
    windSign: -1,
    fog: vis < 1000 ? 0.85 : 0,
    temp,
    ts: Date.now(),
  };
  core.engine.setWeather(wx, ms);
  core.weatherRenderer.setWeather(wx);
}

export function setTimeHour(hh: number | null, retargetMs = 500) {
  if (hh === null) {
    core.engine.timeOverride = null;
    core.engine.retarget(retargetMs);
    return;
  }
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setTime(d.getTime() + hh * 3600_000);
  core.engine.timeOverride = d;
  core.engine.retarget(retargetMs);
}

export function openDiagnostics() {
  const curDate = core.engine.now();
  const curHour = curDate.getHours() + curDate.getMinutes() / 60;
  const c = h(`<div data-nodrag>
    <div class="row-flex" style="margin-bottom:6px">
      <div class="h2">Teşhis</div>
      <span class="grow"></span>
      <button type="button" class="chip" data-reset style="height:36px;min-height:36px">Sıfırla</button>
    </div>
    <div class="diag-grid">
      <div class="diag-cell"><span class="small">FPS</span><b data-fps>—</b></div>
      <div class="diag-cell"><span class="small">Yavaş kare</span><b data-slow>0.0%</b></div>
      <div class="diag-cell"><span class="small">Uzun görev</span><b data-lt>0</b></div>
      <div class="diag-cell"><span class="small">Worker (atmo/bulut)</span><b data-wk>—</b></div>
    </div>
    <div class="eyebrow" style="margin:14px 2px 8px">Saat: <span data-hlbl>${core.engine.timeOverride ? fmtH(curHour) : 'şimdi'}</span></div>
    <input type="range" min="0" max="23.99" step="0.05" value="${curHour.toFixed(2)}" data-hour style="width:100%">
    <div class="row-flex" style="margin-top:8px">
      <button type="button" class="chip grow" data-day24 style="justify-content:center">Günü 24 sn'de oynat</button>
      <button type="button" class="chip" data-now>Gerçek saat</button>
    </div>
    <div class="eyebrow" style="margin:14px 2px 8px">Hava önizleme</div>
    <select class="diag-sel" data-wx>
      ${(Object.keys(PRE) as WeatherKind[]).map((k) => `<option value="${k}" ${core.engine.weather.kind === k ? 'selected' : ''}>${KIND_TR[k]}</option>`).join('')}
    </select>
    <div class="row-flex" style="margin-top:10px">
      <button type="button" class="chip grow" data-plane style="justify-content:center">Uçak</button>
      <button type="button" class="chip grow" data-meteor style="justify-content:center">Meteor</button>
    </div>
  </div>`);

  let dayRaf = 0;
  const stopDayPlay = () => { if (dayRaf) { cancelAnimationFrame(dayRaf); dayRaf = 0; } };

  const s = openSheet(c, {
    onClose: () => {
      stopDayPlay();
      clearInterval(iv);
    },
  });
  void s;

  const updateMetrics = () => {
    if (document.hidden || !c.isConnected) return;
    const st = core.engine.stats;
    const slowPct = st.frames > 0 ? ((st.slow / st.frames) * 100).toFixed(1) : '0.0';
    $('[data-fps]', c).textContent = `${st.fps || 60}${core.engine.lowPower ? ' (DG)' : ''}`;
    $('[data-slow]', c).textContent = `${slowPct}%`;
    $('[data-lt]', c).textContent = String(st.longTasks);
    const tm = core.worker.timings;
    $('[data-wk]', c).textContent = `${tm.atmo || 0} / ${tm.clouds || 0} ms`;
  };
  updateMetrics();
  const iv = window.setInterval(updateMetrics, 500);

  const hourEl = $<HTMLInputElement>('[data-hour]', c);
  const hLbl = $('[data-hlbl]', c);
  hourEl.addEventListener('input', () => {
    stopDayPlay();
    const hh = +hourEl.value;
    hLbl.textContent = fmtH(hh);
    setTimeHour(hh, 500);
    core.engine.busy(400);
  });

  $('[data-now]', c).addEventListener('click', () => {
    stopDayPlay();
    setTimeHour(null, 1000);
    const n = new Date();
    hourEl.value = String(n.getHours() + n.getMinutes() / 60);
    hLbl.textContent = 'şimdi';
  });

  $('[data-day24]', c).addEventListener('click', () => {
    stopDayPlay();
    const t0 = performance.now();
    let lastRetarget = 0;
    const step = (now: number) => {
      if (!c.isConnected || document.hidden) { stopDayPlay(); return; }
      const p = Math.min(1, (now - t0) / 24_000);
      const hh = (p * 24) % 24;
      hourEl.value = hh.toFixed(2);
      hLbl.textContent = fmtH(hh);
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setTime(d.getTime() + hh * 3600_000);
      core.engine.timeOverride = d;
      if (now - lastRetarget > 450) {
        lastRetarget = now;
        core.engine.retarget(450);
      }
      core.engine.busy(250);
      if (p < 1) dayRaf = requestAnimationFrame(step);
      else dayRaf = 0;
    };
    dayRaf = requestAnimationFrame(step);
  });

  $<HTMLSelectElement>('[data-wx]', c).addEventListener('change', (e) => {
    applyWeatherPreview((e.target as HTMLSelectElement).value as WeatherKind);
  });

  $('[data-reset]', c).addEventListener('click', () => {
    core.engine.resetStats();
    updateMetrics();
  });

  $('[data-plane]', c).addEventListener('click', () => {
    void core.plane?.launch();
    core.engine.busy(2000);
  });

  $('[data-meteor]', c).addEventListener('click', () => {
    core.fx.decorative(performance.now());
    core.engine.busy(1200);
  });
}

function fmtH(hh: number) {
  const h2 = Math.floor(hh) % 24;
  const m2 = Math.floor((hh % 1) * 60);
  return `${String(h2).padStart(2, '0')}:${String(m2).padStart(2, '0')}`;
}
