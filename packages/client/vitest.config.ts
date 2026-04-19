import { defineConfig } from 'vitest/config';
import path from 'path';
import { readFileSync } from 'fs';

// Mirror vite.config.ts `define` so tests see the same injected globals
// (__APP_VERSION__ in particular). Vitest doesn't inherit from vite.config
// when a dedicated vitest.config.ts is present.
const pkg = JSON.parse(
  readFileSync(path.resolve(__dirname, './package.json'), 'utf-8'),
) as { version: string };

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test-setup.ts'],
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
