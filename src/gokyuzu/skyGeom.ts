// Gökyüzü geometrisi: 360°'lik KESİNTİSİZ panorama (silindir). Kaydırma sınırsızdır; sağa ya da sola ne kadar
// kaydırılırsa kaydırılsın gökyüzü, bulutlar, deniz ve kumsal dönüp devam eder (kenar / boşluk yoktur).
// Yatay ve dikey derece/piksel eşittir → hale ve bulutlar yuvarlak, perspektif doğru.
// Gök cisimleri GERÇEK azimutlarında durur (ay, güneş gerçek yönünde).

export const ALT_TOP = 68;         // ekranın en üstü kaç derece
export const CELESTIAL_PARALLAX = 1; // dönme hareketi: her şey birlikte kayar (sonsuz panoramada paralaks yok)
export const CLOUD_PARALLAX = 1;

export type SkyGeom = {
  W: number;            // ekran genişliği (CSS px)
  horizonY: number;     // ufuk çizgisi
  skyW: number;         // = P (geri uyumluluk)
  pxPerDeg: number;
  panoW: number;        // = P: 360°'nin piksel karşılığı (dünyanın periyodu)
  azSpan: number;       // 360
};

export function makeGeom(W: number, horizonY: number, _skyW?: number): SkyGeom {
  const pxPerDeg = horizonY / ALT_TOP;
  const P = Math.round(360 * pxPerDeg);
  return { W, horizonY, skyW: P, pxPerDeg, panoW: P, azSpan: 360 };
}

/** Gerçek azimut (SunCalc: 0 = güney, + batı) → panorama azimutu. Artık sıkıştırma yok. */
export const virtualAz = (_g: SkyGeom, az: number) => az;

/** Çok yüksek gök cisimleri ekranın üstünde kalmasın: 48°'den sonra yumuşak sıkıştırma. */
export const displayAlt = (alt: number) => (alt < 48 ? alt : 48 + (alt - 48) * 0.45);

/** Pozitif modülo. */
export const mod = (a: number, n: number) => ((a % n) + n) % n;

/**
 * Dünya x'i (0..P periyodik) → ekran x'i. Ekranın ortasına en yakın kopya seçilir;
 * böylece bir nesne asla "kaybolmaz", kaydırdıkça dönüp tekrar gelir.
 */
export const wrapX = (g: SkyGeom, worldX: number, scrollX: number) => {
  const x = worldX - scrollX;
  return x - g.panoW * Math.round((x - g.W / 2) / g.panoW);
};

export const panoToScreenX = wrapX;

/** Panorama x'i: azimut 0 (güney) P/2'de. */
export const azToWorldX = (g: SkyGeom, az: number) => g.panoW / 2 + az * g.pxPerDeg;

/** (alt, az) → ekran konumu (sarmalı). */
export function skyToScreen(g: SkyGeom, alt: number, az: number, scrollX: number) {
  return { x: wrapX(g, azToWorldX(g, az), scrollX), y: g.horizonY - alt * g.pxPerDeg };
}

/** Periyodik bir dokuyu ekranı kaplayacak kadar yan yana çiz. Konum tuvalin GERÇEK piksel ızgarasına yuvarlanır:
 *  komşu döşemeler tam bitişir (ne boşluk ne çift çizim → dikişte ince çizgi oluşmaz, eklemeli ışıkta parlama olmaz). */
export function drawWrapped(
  c: CanvasRenderingContext2D,
  img: CanvasImageSource,
  g: SkyGeom,
  scrollX: number,
  y: number,
  h: number,
  extraOffset = 0,
) {
  const P = g.panoW, f = c.getTransform().a || 1;
  let x = -Math.round(mod(scrollX - extraOffset, P) * f) / f;
  for (; x < g.W; x += P) c.drawImage(img, x, y, P, h);
}
