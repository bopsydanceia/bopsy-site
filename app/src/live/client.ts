// supabase-js, loaded on demand: never on the first screen of a new
// visitor, right after it for a returning one (session in storage) or a
// magic link (tokens in the URL).
import type { SupabaseClient } from '@supabase/supabase-js';
import { KEYS } from '../config';
import { safeStorage } from '../core/store';

export const AUTH_STORAGE_KEY = 'bopsy.auth';

let client: Promise<SupabaseClient> | null = null;

export function supabase(): Promise<SupabaseClient> {
  client ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(KEYS.supabaseUrl, KEYS.supabaseAnonKey, {
      auth: {
        storageKey: AUTH_STORAGE_KEY,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        // Implicit: a magic link opened in another browser still signs in
        // there (PKCE would need the verifier of the browser that asked).
        flowType: 'implicit',
      },
    }),
  );
  return client;
}

/** The session supabase-js stored, read without loading it (user id, email, anonymous). */
export function storedUser(): { id: string; email: string | null; anonymous: boolean } | null {
  try {
    const raw = JSON.parse(safeStorage.get(AUTH_STORAGE_KEY) ?? 'null') as {
      user?: { id?: unknown; email?: unknown; is_anonymous?: unknown };
    } | null;
    const user = raw?.user;
    if (!user || typeof user.id !== 'string') return null;
    return { id: user.id, email: typeof user.email === 'string' && user.email ? user.email : null, anonymous: user.is_anonymous === true };
  } catch {
    return null;
  }
}

/** A magic link brought auth tokens (implicit flow) or an error in the hash. */
export function urlHasAuthResult(): boolean {
  return /(^|[#&])(access_token|error_description)=/.test(location.hash);
}

/** Where the magic link sends the visitor back: the app itself. */
export function appUrl(): string {
  return `${location.origin}${location.pathname}`;
}
