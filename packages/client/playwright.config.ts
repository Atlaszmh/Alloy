import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [['html', { open: 'never' }], ['list']],

  projects: [
    // ── Real mobile devices ──
    {
      name: 'iphone-se',
      use: {
        browserName: 'chromium',
        viewport: { width: 375, height: 667 },  // iPhone SE / 8 — small phone
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 2,
      },
    },
    {
      name: 'iphone-15-pro',
      use: {
        browserName: 'chromium',
        viewport: { width: 393, height: 852 },  // iPhone 15 Pro — standard modern phone
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 3,
      },
    },
    {
      name: 'pixel-7',
      use: {
        browserName: 'chromium',
        viewport: { width: 412, height: 915 },  // Pixel 7 — large Android
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 2.625,
      },
    },
    // ── Desktop (9:16 framed view) ──
    {
      name: 'desktop',
      use: {
        browserName: 'chromium',
        viewport: { width: 1280, height: 800 },
      },
    },
  ],

  webServer: {
    command: 'npx vite --port 5199',
    url: 'http://localhost:5199',
    reuseExistingServer: false,
    timeout: 30_000,
  },
  use: {
    baseURL: 'http://localhost:5199',
  },
});
