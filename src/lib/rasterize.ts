import { sharedSvgDefs } from './illustrations';

export interface RasterPair {
  x2: string;
  x3: string;
  width: number;
  height: number;
}

export interface RasterBank {
  rasterize: (
    viewBox: string,
    width: number,
    height: number,
    innerSvg: string,
    extraDefs?: string
  ) => Promise<RasterPair>;
  apply: (img: HTMLImageElement, pair: RasterPair) => void;
  dispose: () => void;
}

const THEME_VAR_FALLBACKS: Record<string, string> = {
  '--leaf-1': '#1f5a38',
  '--leaf-2': '#429a5b',
  '--petal-base': '#c7265c',
  '--petal-mid': '#ff7da8',
  '--petal-mid2': '#ee598c',
  '--petal-tip': '#ffeef5',
  '--petal-tip2': '#ffd6e6',
  '--spot': '#860c38',
  '--rib': '#ff2e7a',
  '--paper-accent': '#b8255f',
};

const SHARED_DEFS_INNER = (() => {
  const m = sharedSvgDefs().match(/<defs>([\s\S]*?)<\/defs>/);
  return m ? m[1] : '';
})();

function readThemeVarMap(): Map<string, string> {
  const map = new Map<string, string>();
  const cs = typeof getComputedStyle === 'function' ? getComputedStyle(document.body) : null;
  for (const [k, fallback] of Object.entries(THEME_VAR_FALLBACKS)) {
    const val = cs?.getPropertyValue(k).trim();
    map.set(k, val || fallback);
  }
  return map;
}

function resolveCssVars(markup: string, vars: Map<string, string>): string {
  return markup.replace(/var\((--[a-z0-9-]+)\)/gi, (_m, name: string) => vars.get(name) ?? 'currentColor');
}

function loadSvgImage(svgText: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const svgBlob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
    const svgUrl = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      URL.revokeObjectURL(svgUrl);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(svgUrl);
      reject(new Error('SVG görseli yüklenemedi'));
    };
    img.src = svgUrl;
  });
}

function encodeCanvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (webpBlob) => {
        if (webpBlob) {
          resolve(webpBlob);
          return;
        }
        canvas.toBlob((pngBlob) => {
          if (pngBlob) resolve(pngBlob);
          else reject(new Error('Canvas WebP/PNG dönüştürme hatası'));
        }, 'image/png');
      },
      'image/webp',
      0.92
    );
  });
}

/** Statik SVG çizimlerini temaya göre @2x/@3x WebP blob URL'lerine dönüştürür ve yaşam döngüsünü yönetir. */
export function createRasterBank(): RasterBank {
  const ownedUrls: string[] = [];
  let disposed = false;

  const trackUrl = (url: string): string => {
    if (disposed) {
      URL.revokeObjectURL(url);
      throw new Error('RasterBank kapatıldı');
    }
    ownedUrls.push(url);
    return url;
  };

  return {
    async rasterize(
      viewBox: string,
      width: number,
      height: number,
      innerSvg: string,
      extraDefs = ''
    ): Promise<RasterPair> {
      const vars = readThemeVarMap();
      const defs = resolveCssVars(SHARED_DEFS_INNER + extraDefs, vars);
      const body = resolveCssVars(innerSvg, vars);
      const svgDoc = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${width}" height="${height}"><defs>${defs}</defs>${body}</svg>`;

      const img = await loadSvgImage(svgDoc);
      if (disposed) throw new Error('RasterBank kapatıldı');

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('2D canvas oluşturulamadı');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      const renderScale = async (scale: number): Promise<string> => {
        const w = Math.max(2, Math.round(width * scale));
        const h = Math.max(2, Math.round(height * scale));
        canvas.width = w;
        canvas.height = h;
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        const blob = await encodeCanvasBlob(canvas);
        return trackUrl(URL.createObjectURL(blob));
      };

      const x2 = await renderScale(2);
      const x3 = await renderScale(3);
      return { x2, x3, width, height };
    },

    apply(img: HTMLImageElement, pair: RasterPair): void {
      if (disposed) return;
      img.width = pair.width;
      img.height = pair.height;
      img.src = pair.x2;
      img.srcset = `${pair.x2} 2x, ${pair.x3} 3x`;
    },

    dispose(): void {
      if (disposed) return;
      disposed = true;
      for (const u of ownedUrls) {
        URL.revokeObjectURL(u);
      }
      ownedUrls.length = 0;
    },
  };
}

