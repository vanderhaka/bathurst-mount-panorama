import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import { offlinePlugin } from './build/offline-plugin';

const root = import.meta.dirname;
const production = process.env.VERCEL_ENV === 'production';

export default defineConfig({
  plugins: [offlinePlugin()],
  // Dev tools on everywhere except the Vercel production deployment (src/config/build-flags.ts).
  define: { __DEV_TOOLS__: JSON.stringify(!production) },
  resolve: { alias: { '@': resolve(root, 'src') } },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      input: {
        main: resolve(root, 'index.html'),
        ...(!production ? {
          cars: resolve(root, 'harness/cars.html'),
          props: resolve(root, 'harness/props.html'),
          hud: resolve(root, 'harness/hud.html'),
          audio: resolve(root, 'harness/audio.html'),
          track: resolve(root, 'harness/track.html'),
        } : {}),
      },
    },
  },
  test: {
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    // Diagnostic traces (no assertions): run with `npx vitest run tests/debug/<file> --silent=false`.
    exclude: ['tests/debug/**', 'node_modules/**'],
    environment: 'node',
  },
});
