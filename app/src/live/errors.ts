// Answers of the server as the live adapters read them: one helper for every
// Edge Function call (status, error code, the common 429 of D131 with its
// Retry-After), and the refusals of the photos bucket (D131: types, 10 MB,
// uploads per day). Duck-typed on purpose: no runtime import of supabase-js,
// which loads later than the first screen.
import type { SupabaseClient } from '@supabase/supabase-js';
import { parseRateLimit, type LimitedAction, type RateLimited } from '../core/limits';
import type { UploadFailure } from '../core/types';

export type FunctionAnswer<T> =
  | { ok: true; data: T }
  /** No answer: offline, timeout, or the answer was lost on the way back. */
  | { ok: false; kind: 'network' }
  | { ok: false; kind: 'http'; status: number; code: string | null; body: unknown; limit: RateLimited | null };

type Failure = Exclude<FunctionAnswer<never>, { ok: true }>;

interface ResponseLike {
  status: number;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
}

function isResponse(value: unknown): value is ResponseLike {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as ResponseLike).status === 'number' &&
    typeof (value as ResponseLike).headers?.get === 'function' &&
    typeof (value as ResponseLike).json === 'function'
  );
}

/**
 * The error of functions.invoke: FunctionsHttpError and FunctionsRelayError
 * carry the Response (status, JSON body {"error"} or {"refusal"}, headers);
 * FunctionsFetchError has none (network).
 */
export async function functionFailure(error: unknown, action: LimitedAction): Promise<Failure> {
  const context = (error as { context?: unknown } | null)?.context;
  if (!isResponse(context)) return { ok: false, kind: 'network' };
  const body = await context.json().catch(() => null);
  const code = body && typeof body === 'object' && typeof (body as { error?: unknown }).error === 'string' ? (body as { error: string }).error : null;
  const limit = parseRateLimit(context.status, body, context.headers.get('retry-after'), action);
  return { ok: false, kind: 'http', status: context.status, code, body, limit };
}

/** functions.invoke with the failures read once for all calls; [action] names a 429 without one. */
export async function invokeFunction<T>(client: SupabaseClient, name: string, body: Record<string, unknown>, action: LimitedAction): Promise<FunctionAnswer<T>> {
  try {
    const { data, error } = await client.functions.invoke(name, { body });
    if (!error) return { ok: true, data: data as T };
    return await functionFailure(error, action);
  } catch {
    return { ok: false, kind: 'network' };
  }
}

/** The JSON field [key] of a failed answer's body. */
export function bodyField(answer: FunctionAnswer<unknown>, key: string): unknown {
  return !answer.ok && answer.kind === 'http' && answer.body && typeof answer.body === 'object' ? (answer.body as Record<string, unknown>)[key] : undefined;
}

/**
 * A refused upload to the photos bucket (StorageApiError: status, statusCode
 * and message of the Storage API): over 10 MB, a type the bucket does not
 * take, or the upload policy's daily cap (a row-level security refusal: the
 * path is always the caller's own folder). Anything else is the network.
 */
export function storageFailure(error: unknown): UploadFailure {
  const fields = (error ?? {}) as { status?: unknown; statusCode?: unknown; message?: unknown; error?: unknown; code?: unknown };
  const status = Number(fields.status);
  const code = String(fields.statusCode ?? '');
  const text = [fields.message, fields.error, fields.code].filter((part) => typeof part === 'string').join(' ');
  if (status === 413 || code === '413' || /too large|maximum allowed size|EntityTooLarge/i.test(text)) return 'too_large';
  if (status === 415 || code === '415' || /mime type|invalid_mime_type|InvalidMimeType/i.test(text)) return 'bad_type';
  if (/row[- ]level security/i.test(text)) return 'daily_cap';
  if ((status === 403 || code === '403') && !/jwt|token|signature|expired/i.test(text)) return 'daily_cap';
  return 'network';
}
