// Supabase Auth for the web (D110 as adjusted, see DECISIONS): a guest
// (anonymous) session owns the photo and the free preview; at "Unlock" the
// email is asked with a 6-digit code. A guest becomes that email account
// (updateUser, code of type email_change: same user id, photo and preview
// kept); an email that already has an account signs in to it instead
// (signInWithOtp, code of type email) and the photo is sent again under it.
// D132: the CAPTCHA of Supabase Auth guards the guest sign-in and the code
// sent by signInWithOtp, a fresh Turnstile token each call (updateUser and
// verifyOtp need none); a refused token gets one more try with a new one.
import type { AuthError, Session as SupabaseSession, SupabaseClient } from '@supabase/supabase-js';
import { KEYS } from '../config';
import { CaptchaFailed, type AuthPort, type SendCodeResult, type VerifyCodeResult } from '../core/ports';
import { normalizeEmail } from '../core/otp';
import type { Session } from '../core/types';
import { appUrl, storedUser, supabase } from './client';
import type { CaptchaAction, CaptchaPort } from './turnstile';

/** Turnstile, loaded the first time a token is needed (not with this module). */
export const lazyCaptcha: CaptchaPort = {
  token: (action: CaptchaAction) => import('./turnstile').then((module) => module.siteTurnstile(KEYS.turnstileSiteKey).token(action)),
};

function toSession(session: SupabaseSession | null): Session | null {
  const user = session?.user;
  if (!user) return null;
  return { userId: user.id, email: user.email || null, guest: user.is_anonymous === true };
}

function isEmailTaken(error: AuthError): boolean {
  return error.code === 'email_exists' || error.code === 'user_already_exists' || /already (been )?registered/i.test(error.message);
}

/** GoTrue refused the CAPTCHA token (missing, used, expired or invalid). */
export function isCaptchaError(error: AuthError | null | undefined): boolean {
  return Boolean(error && (error.code === 'captcha_failed' || /captcha/i.test(error.message)));
}

function sendError(error: AuthError): SendCodeResult {
  if (isCaptchaError(error)) return { ok: false, error: 'captcha' };
  if (error.status === 429 || /rate limit/i.test(error.code ?? '')) return { ok: false, error: 'rate_limited' };
  if (error.code === 'email_address_invalid' || error.code === 'validation_failed') return { ok: false, error: 'invalid_email' };
  return { ok: false, error: 'network' };
}

export interface LiveAuthDeps {
  /** supabase-js, loaded on demand (tests pass a fake client). */
  load?: () => Promise<SupabaseClient>;
  captcha?: CaptchaPort;
}

export class LiveAuth implements AuthPort {
  private session: Session | null;
  private readonly listeners = new Set<(session: Session | null) => void>();
  private ready: Promise<SupabaseClient> | null = null;
  private signingIn: Promise<Session> | null = null;
  /** The kind of code the last sendCode asked for. */
  private pending: 'email' | 'email_change' = 'email';
  private readonly load: () => Promise<SupabaseClient>;
  private readonly captcha: CaptchaPort;

  constructor(deps: LiveAuthDeps = {}) {
    this.load = deps.load ?? supabase;
    this.captcha = deps.captcha ?? lazyCaptcha;
    const stored = storedUser();
    this.session = stored ? { userId: stored.id, email: stored.email, guest: stored.anonymous } : null;
  }

  /** Loads supabase-js and follows its session (also picks up a magic link). */
  client(): Promise<SupabaseClient> {
    this.ready ??= this.load().then(async (client) => {
      const { data } = await client.auth.getSession();
      this.update(toSession(data.session));
      client.auth.onAuthStateChange((_event, session) => this.update(toSession(session)));
      return client;
    });
    return this.ready;
  }

  private update(session: Session | null): void {
    const same = JSON.stringify(session) === JSON.stringify(this.session);
    this.session = session;
    if (!same) for (const listener of [...this.listeners]) listener(session);
  }

  current(): Session | null {
    return this.session;
  }

  async restore(): Promise<Session | null> {
    await this.client();
    return this.session;
  }

  subscribe(listener: (session: Session | null) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Runs an Auth call that needs a CAPTCHA with a fresh token; when GoTrue
   * refuses the token, once more with a new one. Throws CaptchaFailed when
   * Turnstile gives no token.
   */
  private async withCaptcha<T extends { error: AuthError | null }>(action: CaptchaAction, call: (captchaToken: string) => Promise<T>): Promise<T> {
    let result = await call(await this.captcha.token(action));
    if (isCaptchaError(result.error)) result = await call(await this.captcha.token(action));
    return result;
  }

  async ensureSession(): Promise<Session> {
    const client = await this.client();
    if (this.session) return this.session;
    // One guest sign-in at a time: each one spends a CAPTCHA token.
    this.signingIn ??= this.withCaptcha('guest', (captchaToken) => client.auth.signInAnonymously({ options: { captchaToken } }))
      .then(({ data, error }) => {
        if (isCaptchaError(error)) throw new CaptchaFailed('captcha_failed');
        if (error || !data.session) throw error ?? new Error('no session');
        this.update(toSession(data.session));
        return this.session!;
      })
      .finally(() => {
        this.signingIn = null;
      });
    return this.signingIn;
  }

  async sendCode(rawEmail: string): Promise<SendCodeResult> {
    const email = normalizeEmail(rawEmail);
    try {
      const client = await this.client();
      if (this.session?.guest) {
        const { error } = await client.auth.updateUser({ email }, { emailRedirectTo: appUrl() });
        if (!error) {
          this.pending = 'email_change';
          return { ok: true };
        }
        if (!isEmailTaken(error)) return sendError(error);
      }
      const { error } = await this.withCaptcha('code', (captchaToken) =>
        client.auth.signInWithOtp({ email, options: { shouldCreateUser: true, emailRedirectTo: appUrl(), captchaToken } }),
      );
      if (error) return sendError(error);
      this.pending = 'email';
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof CaptchaFailed ? 'captcha' : 'network' };
    }
  }

  async verifyCode(rawEmail: string, token: string): Promise<VerifyCodeResult> {
    const email = normalizeEmail(rawEmail);
    const before = this.session?.userId ?? null;
    try {
      const client = await this.client();
      const { data, error } = await client.auth.verifyOtp({ email, token, type: this.pending });
      if (error || !data.session) {
        if (error?.status === 429) return { ok: false, error: 'rate_limited' };
        return { ok: false, error: error && error.status !== undefined && error.status < 500 ? 'invalid_code' : 'network' };
      }
      const session = toSession(data.session)!;
      this.update(session);
      return { ok: true, session, userChanged: before !== null && before !== session.userId };
    } catch {
      return { ok: false, error: 'network' };
    }
  }

  async signOut(): Promise<void> {
    const client = await this.client();
    await client.auth.signOut({ scope: 'local' });
    this.update(null);
  }
}
