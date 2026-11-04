import { defineConfig, devices } from '@playwright/test';

// The live adapters (src/live) against a local mock of Supabase
// (e2e-live/mock-supabase.mjs, port 54321) and a live-mode build served on
// 4175: run it with npm run smoke:live (scripts/smoke-live.mjs starts both).
// RevenueCat is cut off (no external call): the paywall shows its error state.
export default defineConfig({
  testDir: 'e2e-live',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  workers: 1,
  reporter: [['list']],
  use: {
    ...devices['iPhone 13'],
    browserName: 'chromium',
    channel: 'chrome',
    baseURL: 'http://localhost:4175/',
    timezoneId: 'America/New_York',
  },
});
