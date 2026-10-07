import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

const root = import.meta.dirname;

export default defineConfig({
  resolve: { alias: { '@': resolve(root, 'src') } },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      input: {
        main: resolve(root, 'index.html'),
        cars: resolve(root, 'harness/cars.html'),
        props: resolve(root, 'harness/props.html'),
        hud: resolve(root, 'harness/hud.html'),
        audio: resolve(root, 'harness/audio.html'),
      },
    },
  },
  test: {
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    environment: 'node',
  },
});
