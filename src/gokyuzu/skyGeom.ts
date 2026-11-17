// Gökyüzü geometrisi: TÜM gök cisimleri (gökyüzü dokusu, yıldızlar, güneş, ay, bulut dokusu) aynı
// "kamera"yı kullanır. Yatay ve dikey derece/piksel eşittir → hale ve bulutlar yuvarlak, perspektif doğru.
//
// Sanal azimut: gerçek azimut (−110°…+110°) panoramaya sıkıştırılır; böylece güneş gün boyunca
// kaydırılabilir alanda kalır. Atmosfer ve bulutlar sanal azimutla hesaplanır → çizim ile hesap birebir.

export const ALT_TOP = 68;         // ekranın en üstü kaç derece
export const CELESTIAL_PARALLAX = 0.5;
export const CLOUD_PARALLAX = 0.62;

export type SkyGeom = {
  W: number;            // ekran genişliği (CSS px)
  horizonY: number;     // ufuk çizgisi (çimenin üst kenarı)
  skyW: number;         // uygulamanın kaydırma genişliği
  pxPerDeg: number;
  panoW: number;        // gök panoraması genişliği
  azSpan: number;       // panoramanın sanal azimut genişliği
};

export function makeGeom(W: number, horizonY: number, skyW: number): SkyGeom {
  const pxPerDeg = horizonY / ALT_TOP;
  const panoW = W + (skyW - W) * CELESTIAL_PARALLAX;
  return { W, horizonY, skyW, pxPerDeg, panoW, azSpan: panoW / pxPerDeg };
}

/** Gerçek azimut → sanal azimut (panoramanın %86'sına sığar). */
export const virtualAz = (g: SkyGeom, az: number) =>
  Math.max(-0.5, Math.min(0.5, az / 220)) * g.azSpan * 0.86;

/** Çok yüksek gök cisimleri ekranın üstünde kalmasın: 48°'den sonra yumuşak sıkıştırma. */
export const displayAlt = (alt: number) => (alt < 48 ? alt : 48 + (alt - 48) * 0.45);

/** Panorama koordinatı → ekran x (kaydırma dahil). */
export const panoToScreenX = (_g: SkyGeom, px: number, scrollX: number) => px - scrollX * CELESTIAL_PARALLAX;

/** Sanal (alt, az) → ekran konumu. */
export function skyToScreen(g: SkyGeom, alt: number, vaz: number, scrollX: number) {
  return {
    x: panoToScreenX(g, g.panoW / 2 + vaz * g.pxPerDeg, scrollX),
    y: g.horizonY - alt * g.pxPerDeg,
  };
}
