import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';

const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf8')) as {
  version?: string;
};

function stampServiceWorkerVersion() {
  return {
    name: 'stamp-sw-version',
    closeBundle() {
      const swOut = path.resolve(__dirname, 'dist', 'sw.js');
      if (!fs.existsSync(swOut)) return;
      const stamped = `gokyuzu-shell-v${pkg.version ?? '1.0.1'}-${Date.now()}`;
      let next = fs.readFileSync(swOut, 'utf8').replace(
        /const CACHE_NAME = ['"][^'"]+['"];/,
        `const CACHE_NAME = '${stamped}';`
      );

      // Derlenen JS/CSS kabuk dosyalarını da önbelleğe ekle -> çevrimdışı kurulumda tam kabuk hazır
      const assetsDir = path.resolve(__dirname, 'dist', 'assets');
      if (fs.existsSync(assetsDir)) {
        const assetUrls = fs
          .readdirSync(assetsDir)
          .filter((f) => f.endsWith('.js') || f.endsWith('.css'))
          .map((f) => `  '/assets/${f}',`)
          .join('\n');
        if (assetUrls) {
          next = next.replace("  '/fonts/nunito-latin-ext.woff2',", `  '/fonts/nunito-latin-ext.woff2',\n${assetUrls}`);
        }
      }

      fs.writeFileSync(swOut, next, 'utf8');
    },
  };
}

export default defineConfig({
  plugins: [stampServiceWorkerVersion()],
  server: {
    allowedHosts: true,
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          supabase: ['@supabase/supabase-js'],
        },
      },
    },
  },
});
