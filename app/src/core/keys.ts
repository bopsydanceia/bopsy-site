// D114: only public keys may reach the client bundle. Used by vite.config.ts
// (the build fails) and by config.ts (the app falls back to demo).

export interface PublicKeys {
  supabaseUrl: string;
  supabaseAnonKey: string;
  revenueCatWebKey: string;
}

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
  return problems;
}

/** Live mode needs all three values; any missing one means demo mode. */
export function isLiveConfig(keys: PublicKeys): boolean {
  return Boolean(keys.supabaseUrl.trim() && keys.supabaseAnonKey.trim() && keys.revenueCatWebKey.trim()) && keyProblems(keys).length === 0;
}
