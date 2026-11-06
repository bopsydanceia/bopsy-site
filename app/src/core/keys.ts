// D114: only public keys may reach the client bundle. Used by vite.config.ts
// (the build fails) and by config.ts (the app falls back to demo).

export interface PublicKeys {
  supabaseUrl: string;
  supabaseAnonKey: string;
  revenueCatWebKey: string;
  /** Cloudflare Turnstile site key (D132): the CAPTCHA of Supabase Auth and of start-preview. */
  turnstileSiteKey: string;
}

/**
 * The build variables of live mode, all three needed. The Turnstile site key
 * is optional (D143): without it, no CAPTCHA (Supabase Auth CAPTCHA left off,
 * the free preview stays off) and the IP limits of Auth and the server remain.
 */
export const LIVE_VARIABLES: ReadonlyArray<[keyof PublicKeys, string]> = [
  ['supabaseUrl', 'VITE_SUPABASE_URL'],
  ['supabaseAnonKey', 'VITE_SUPABASE_ANON_KEY'],
  ['revenueCatWebKey', 'VITE_REVENUECAT_WEB_KEY'],
];

function jwtRole(token: string): string | null {
  const part = token.split('.')[1];
  if (!part) return null;
  try {
    const json = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/'))) as { role?: unknown };
    return typeof json.role === 'string' ? json.role : null;
  } catch {
    return null;
  }
}

/** Problems that make these keys unfit for a browser bundle (empty list: fine). */
export function keyProblems(keys: PublicKeys): string[] {
  const problems: string[] = [];
  const anon = keys.supabaseAnonKey.trim();
  if (anon.startsWith('sb_secret_') || jwtRole(anon) === 'service_role') {
    problems.push('VITE_SUPABASE_ANON_KEY is a secret (service role) key: use the anon or publishable key');
  }
  const rc = keys.revenueCatWebKey.trim();
  if (rc.startsWith('sk_')) problems.push('VITE_REVENUECAT_WEB_KEY is a secret key: use the public Web Billing key (rcb_...)');
  const url = keys.supabaseUrl.trim();
  if (url && !/^https:\/\/[^/]+$/.test(url.replace(/\/+$/, '')) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(url)) {
    problems.push('VITE_SUPABASE_URL must be the project origin (https://<ref>.supabase.co)');
  }
  // Site keys are 24 characters (0x4AAAAAAA...), secret keys 35: the secret goes to Supabase and the functions only.
  const site = keys.turnstileSiteKey.trim();
  if (site && (site.length >= 30 || !/^[0-9]x[0-9A-Za-z_-]+$/.test(site))) {
    problems.push('VITE_TURNSTILE_SITE_KEY must be the Turnstile site key (0x4AAAAAAA..., 24 characters), never the secret key');
  }
  return problems;
}

/**
 * The live variables left empty while others are set: a live build with a
 * missing key fails instead of silently becoming the demo. Empty list: all
 * three set (live) or none (demo).
 */
export function missingLiveKeys(keys: PublicKeys): string[] {
  const empty = LIVE_VARIABLES.filter(([field]) => !keys[field].trim()).map(([, name]) => name);
  return empty.length === LIVE_VARIABLES.length ? [] : empty;
}

/** Live mode needs all four values; none of them means demo mode. */
export function isLiveConfig(keys: PublicKeys): boolean {
  return LIVE_VARIABLES.every(([field]) => keys[field].trim() !== '') && keyProblems(keys).length === 0;
}
