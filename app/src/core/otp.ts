// Email sign-in with a 6 or 8-digit code (D110), pure state: the code is typed in
// the page so the in-app browsers of TikTok and Instagram keep the flow (a
// magic link would open Safari or Chrome).

/**
 * Supabase sends 6 digits, or 8 with its newer default (Authentication >
 * Email OTP Length): both are taken. Typing auto-submits at the longest;
 * a pasted code is submitted at once; 6 or 7 typed digits wait for Verify.
 */
export const CODE_MIN = 6;
export const CODE_MAX = 8;
export const RESEND_AFTER_MS = 60_000;

/** captcha: Turnstile gave no token or Supabase Auth refused it twice (D132). */
export type OtpError = 'invalid_email' | 'invalid_code' | 'rate_limited' | 'captcha' | 'network';

export interface OtpState {
  step: 'email' | 'code';
  email: string;
  code: string;
  busy: boolean;
  error: OtpError | null;
  sentAt: number | null;
  /** Demo only: the code, shown on screen (D118). */
  demoCode: string | null;
}

export const initialOtp: OtpState = { step: 'email', email: '', code: '', busy: false, error: null, sentAt: null, demoCode: null };

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidEmail(value: string): boolean {
  const email = normalizeEmail(value);
  return email.length <= 254 && /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(email);
}

/** Keeps digits only (pasted "123 456" or "Code: 123456"), at most 8. */
export function sanitizeCode(value: string): string {
  return value.replace(/\D/g, '').slice(0, CODE_MAX);
}

export function emailChanged(state: OtpState, value: string): OtpState {
  return { ...state, email: value, error: null };
}

export function canSendCode(state: OtpState): boolean {
  return !state.busy && isValidEmail(state.email);
}

export function sending(state: OtpState): OtpState {
  return { ...state, email: normalizeEmail(state.email), busy: true, error: null };
}

export function codeSent(state: OtpState, now: number, demoCode?: string): OtpState {
  return { ...state, step: 'code', busy: false, error: null, code: '', sentAt: now, demoCode: demoCode ?? null };
}

export function failed(state: OtpState, error: OtpError): OtpState {
  return { ...state, busy: false, error, code: error === 'invalid_code' ? '' : state.code };
}

export function codeChanged(state: OtpState, value: string): OtpState {
  return { ...state, code: sanitizeCode(value), error: null };
}

export function canVerify(state: OtpState): boolean {
  return state.step === 'code' && !state.busy && state.code.length >= CODE_MIN && state.code.length <= CODE_MAX;
}

/** Submit without waiting for Verify: the longest code typed, or a whole code pasted or autofilled. */
export function autoSubmit(next: OtpState, pasted: boolean): boolean {
  return canVerify(next) && (pasted || next.code.length === CODE_MAX);
}

export function verifying(state: OtpState): OtpState {
  return { ...state, busy: true, error: null };
}

export function resendIn(state: OtpState, now: number): number {
  if (state.sentAt === null) return 0;
  return Math.max(0, Math.ceil((state.sentAt + RESEND_AFTER_MS - now) / 1000));
}

export function canResend(state: OtpState, now: number): boolean {
  return state.step === 'code' && !state.busy && resendIn(state, now) === 0;
}

export function changeEmail(state: OtpState): OtpState {
  return { ...initialOtp, email: state.email };
}
