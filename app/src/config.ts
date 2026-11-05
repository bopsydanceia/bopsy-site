// Build-time configuration (D118): with VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY,
// VITE_REVENUECAT_WEB_KEY and VITE_TURNSTILE_SITE_KEY the app talks to the
// real backend; without them it runs on the in-memory demo backend.
// vite.config.ts decides (__BOPSY_LIVE__), refuses a secret key and a live
// build with one of the four missing.
import type { PublicKeys } from './core/keys';

declare const __BOPSY_LIVE__: boolean;

const env = import.meta.env;

export const KEYS: PublicKeys = {
  supabaseUrl: String(env.VITE_SUPABASE_URL ?? '').trim().replace(/\/+$/, ''),
  supabaseAnonKey: String(env.VITE_SUPABASE_ANON_KEY ?? '').trim(),
  revenueCatWebKey: String(env.VITE_REVENUECAT_WEB_KEY ?? '').trim(),
  turnstileSiteKey: String(env.VITE_TURNSTILE_SITE_KEY ?? '').trim(),
};

export const LIVE: boolean = __BOPSY_LIVE__;
export const DEMO = !LIVE;

/** Public pages of bopsy-site, next to app/ (D106). */
export const LINKS = {
  terms: '../terms/',
  privacy: '../privacy/',
  support: '../support/',
  deleteData: '../delete-data/',
  home: '../',
};
