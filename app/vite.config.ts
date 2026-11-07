/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import { isLiveConfig, keyProblems, missingLiveKeys, type PublicKeys } from './src/core/keys.ts';

/**
 * First screen speed (D108): the CSS (4 KB gzip) goes inline in index.html
 * instead of a render-blocking request; the demo build preloads the first
 * two posters (the LCP image); the live build preconnects to Supabase,
 * where the catalogue and its posters come from.
 */
function firstScreen(live: boolean, supabaseUrl: string): Plugin {
  return {
    name: 'bopsy-first-screen',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const html = bundle['index.html'];
      if (!html || html.type !== 'asset') return;
      let source = String(html.source);
      for (const [name, file] of Object.entries(bundle)) {
        if (file.type !== 'asset' || !name.endsWith('.css')) continue;
        const link = new RegExp(`<link rel="stylesheet"[^>]*href="\\./${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>`);
        if (!link.test(source)) continue;
        source = source.replace(link, () => `<style>${String(file.source).trim()}</style>`);
        delete bundle[name];
      }
      const hints = live
        ? `<link rel="preconnect" href="${new URL(supabaseUrl).origin}" crossorigin>`
        : ['man-dance', 'woman-dance'].map((poster) => `<link rel="preload" as="image" href="./demo/${poster}.webp" fetchpriority="high">`).join('\n');
      source = source.replace('<link rel="preload"', `${hints}\n<link rel="preload"`);
      html.source = source;
    },
  };
}

// base './': the same build works at /, /app/ and /bopsy-site/app/ (GitHub
// Pages), every asset is loaded relative to index.html; routes live in the hash.
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), 'VITE_'), ...process.env };
  const keys: PublicKeys = {
    supabaseUrl: env.VITE_SUPABASE_URL ?? '',
    supabaseAnonKey: env.VITE_SUPABASE_ANON_KEY ?? '',
    revenueCatWebKey: env.VITE_REVENUECAT_WEB_KEY ?? '',
    turnstileSiteKey: env.VITE_TURNSTILE_SITE_KEY ?? '',
  };
  // D114: a secret key never reaches a bundle. A live build needs the three
  // live variables; the Turnstile site key is optional (D143).
  const problems = keyProblems(keys);
  const missing = missingLiveKeys(keys);
  if (missing.length > 0 && mode !== 'test') {
    problems.push(`live mode needs ${missing.join(', ')} (set the three live variables, or none for the demo)`);
  }
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
    plugins: [firstScreen(live, keys.supabaseUrl)],
    build: {
      target: 'es2022',
      modulePreload: { polyfill: false },
      assetsInlineLimit: 0,
      // purchases-js (about 250 KB gzip) loads only at the paywall.
      chunkSizeWarningLimit: 1100,
    },
    test: {
      environment: 'jsdom',
      include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
      setupFiles: ['src/test-setup.ts'],
      restoreMocks: true,
    },
  };
});
