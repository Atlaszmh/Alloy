import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    // The container has a 2-CPU, 4 GB cgroup: vitest's default of one worker a core (16) thrashes it
    // (the suite took over 600 s and workers were OOM-killed; 3 workers: 200 s).
    maxWorkers: 4,
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test-setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
