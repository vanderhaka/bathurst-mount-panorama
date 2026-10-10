import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import type { Connect } from 'vite';
import { loadEnv } from 'vite';
import shootout from './api/shootout.js';

const root = import.meta.dirname;
const production = process.env.VERCEL_ENV === 'production';

function shootoutApi(server: { middlewares: Connect.Server; config: { mode: string } }): void {
  const env = loadEnv(server.config.mode, root, 'SHOOTOUT_');
  for (const key of ['SHOOTOUT_SUPABASE_URL', 'SHOOTOUT_SUPABASE_SERVICE_KEY']) {
    if (!process.env[key] && env[key]) process.env[key] = env[key];
  }
  server.middlewares.use('/api/shootout', (request, response) => {
    void shootout(request, response).catch(() => {
      if (!response.headersSent) response.writeHead(503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify({ available: false, entries: [], error: 'The leaderboard is unavailable.' }));
    });
  });
}

export default defineConfig({
  plugins: [{ name: 'shootout-api', configureServer: shootoutApi, configurePreviewServer: shootoutApi }],
  // Dev tools on everywhere except the Vercel production deployment (src/config/build-flags.ts).
  // Anonymous usage events only on the Vercel production deployment (src/config/build-flags.ts).
  define: { __DEV_TOOLS__: JSON.stringify(!production), __USAGE_ANALYTICS__: JSON.stringify(production) },
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
    // Many tests drive whole laps of car physics (up to ~4.5 s each on a quiet machine, 4x that under load).
    // The 5 s default failed them when the CPU was busy; tests with a longer timeout of their own keep it.
    testTimeout: 30_000,
  },
});
