// Runs the diagnostic traces in tests/debug (excluded from the normal test run).
// Usage: npx vitest run --config vitest.debug.config.ts tests/debug/<file> --silent=false
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@': resolve(import.meta.dirname, 'src') } },
  test: { include: ['tests/debug/**/*.test.ts'], environment: 'node' },
});
