// Email sign-in with a 6-digit code (D110), pure state: the code is typed in
// the page so the in-app browsers of TikTok and Instagram keep the flow (a
// magic link would open Safari or Chrome).

export const CODE_LENGTH = 6;
export const RESEND_AFTER_MS = 60_000;

export type OtpError = 'invalid_email' | 'invalid_code' | 'rate_limited' | 'network';

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

/** Keeps digits only (pasted "123 456" or "Code: 123456"), at most 6. */
export function sanitizeCode(value: string): string {
  return value.replace(/\D/g, '').slice(0, CODE_LENGTH);
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
  return state.step === 'code' && !state.busy && state.code.length === CODE_LENGTH;
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
