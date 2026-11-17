/** Küçük ses çubuğu ve süre biçimlendirme yardımcıları (ana pakette yer kaplamaması için media.ts'den ayrı). */
export function barsHtml(peaks: number[] | undefined, n = 36): string {
  const list =
    peaks && peaks.length > 0
      ? peaks
      : Array.from({ length: n }, (_, i) => 0.3 + 0.5 * Math.abs(Math.sin(i * 1.7)));
  return list.map((v) => `<i style="--h:${Math.round(16 + v * 84)}%"></i>`).join('');
}

export function formatDuration(seconds: number): string {
  const t = Math.max(0, Math.round(seconds));
  const m = Math.floor(t / 60);
  const s = String(t % 60).padStart(2, '0');
  return `${m}:${s}`;
}
