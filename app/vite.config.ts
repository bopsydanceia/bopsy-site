/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import { isLiveConfig, keyProblems, type PublicKeys } from './src/core/keys.ts';

// base './': the same build works at /, /app/ and /bopsy-site/app/ (GitHub
// Pages), every asset is loaded relative to index.html; routes live in the hash.
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), 'VITE_'), ...process.env };
  const keys: PublicKeys = {
    supabaseUrl: env.VITE_SUPABASE_URL ?? '',
    supabaseAnonKey: env.VITE_SUPABASE_ANON_KEY ?? '',
    revenueCatWebKey: env.VITE_REVENUECAT_WEB_KEY ?? '',
  };
  // D114: a secret key never reaches a bundle.
  const problems = keyProblems(keys);
  if (problems.length > 0) throw new Error(`Refusing to build: ${problems.join('; ')}`);
  const live = mode !== 'test' && isLiveConfig(keys);

  return {
    base: './',
    define: { __BOPSY_LIVE__: JSON.stringify(live) },
    // One backend per build: the other one is not even in the output.
    resolve: {
      alias: { '#services': fileURLToPath(new URL(`./src/services.${live ? 'live' : 'demo'}.ts`, import.meta.url)) },
    },
    oxc: { jsx: { runtime: 'automatic', importSource: 'preact' } },
    build: {
      target: 'es2022',
      modulePreload: { polyfill: false },
      assetsInlineLimit: 0,
    },
    test: {
      environment: 'jsdom',
      include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
      restoreMocks: true,
    },
  };
});
