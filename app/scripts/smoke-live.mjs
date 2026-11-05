// npm run smoke:live: a live-mode build pointed at the local mock of
// Supabase (public test values only), the mock and `vite preview` started
// here (Playwright's own webServer teardown hangs on Windows), the live
// smoke test, then everything stopped.
import { spawn } from 'node:child_process';
import { build } from 'vite';

process.env.VITE_SUPABASE_URL = 'http://localhost:54321';
process.env.VITE_SUPABASE_ANON_KEY = 'sb_publishable_local';
process.env.VITE_REVENUECAT_WEB_KEY = 'rcb_local';
process.env.VITE_FREE_PREVIEW = '1'; // the live smoke still covers the preview adapters (off on the site, D139)
process.env.VITE_TURNSTILE_SITE_KEY = '1x00000000000000000000AA'; // Cloudflare's always-pass test site key; api.js is served by the test
await build({ logLevel: 'warn', build: { outDir: 'dist-live', emptyOutDir: true } });

const node = process.execPath;
const servers = [
  spawn(node, ['e2e-live/mock-supabase.mjs'], { stdio: 'ignore' }),
  spawn(node, ['node_modules/vite/bin/vite.js', 'preview', '--outDir', 'dist-live', '--port', '4175', '--strictPort'], { stdio: 'ignore' }),
];

async function up(url) {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* not yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`${url} did not start`);
}

let code = 1;
try {
  await up('http://localhost:54321/__log');
  await up('http://localhost:4175/');
  const test = spawn(node, ['node_modules/@playwright/test/cli.js', 'test', '-c', 'playwright.live.config.ts'], { stdio: 'inherit' });
  code = await new Promise((resolve) => test.on('exit', (status) => resolve(status ?? 1)));
} finally {
  for (const server of servers) server.kill();
}
process.exit(code);
