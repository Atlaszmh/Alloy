import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/responsive/global-setup.ts',
  timeout: 120_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [['html', { open: 'never' }], ['list']],

  projects: [
    {
      name: 'desktop',
      testIgnore: ['responsive/**'],
      use: {
        browserName: 'chromium',
        viewport: { width: 1280, height: 800 },
      },
    },
    {
      // The Delve e2e again at 1080p (Delve UI v1, Phase 4A): its design size, --ui-scale 1.
      name: 'desktop-1080',
      testMatch: 'delve*.spec.ts',
      testIgnore: ['responsive/**'],
      use: {
        browserName: 'chromium',
        viewport: { width: 1920, height: 1080 },
      },
    },
    {
      name: 'responsive',
      testMatch: /responsive\/.*\.spec\.ts$/,
      use: {
        browserName: 'chromium',
        // Default only; probes call page.setViewportSize per test.
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
    // The container's /dev/shm is 64 MB: Chromium's renderer crashes at random without this.
    launchOptions: { args: ['--disable-dev-shm-usage'] },
  },
});
