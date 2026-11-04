import { defineConfig, devices } from '@playwright/test';

// Smoke test of the demo flow on the installed Chrome (channel 'chrome'):
// no browser download. Runs against `vite preview` of a demo build.
export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    ...devices['iPhone 13'],
    browserName: 'chromium',
    channel: 'chrome',
    baseURL: 'http://localhost:4173/',
    timezoneId: 'America/New_York',
    locale: 'en-US',
    screenshot: 'only-on-failure',
    trace: 'off',
  },
  webServer: {
    command: 'npm run preview',
    url: 'http://localhost:4173/',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
