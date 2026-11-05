// Rate limits of the server (D114, D131): every call that can be limited
// answers HTTP 429 {"error":"rate_limited","action","retry_after"} with a
// Retry-After header (Edge Functions), or a PostgREST error PT429 whose
// details carry the same verdict (reports). One parser for all of them, and
// the wait as the screens say it.

/** The limited actions of the server, plus the daily upload cap of the photos bucket. */
export const LIMITED_ACTIONS = ['generation', 'photo_check', 'preview', 'report', 'photo_upload'] as const;
export type LimitedAction = (typeof LIMITED_ACTIONS)[number];

export interface RateLimited {
  kind: 'rate_limited';
  action: LimitedAction;
  /** Seconds to wait, at least 1. */
  retryAfter: number;
}

/** When neither the body nor the header says how long: one minute. */
export const DEFAULT_RETRY_AFTER = 60;

function seconds(value: unknown): number | null {
  const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return typeof number === 'number' && Number.isFinite(number) && number >= 0 ? Math.max(1, Math.ceil(number)) : null;
}

function isLimitedAction(value: unknown): value is LimitedAction {
  return typeof value === 'string' && (LIMITED_ACTIONS as readonly string[]).includes(value);
}

/**
 * A 429 answer as {kind:"rate_limited"}: the action of the body (else
 * [fallback]), the wait of retry_after, else of the Retry-After header
 * (seconds or an HTTP date), else one minute. Null for any other status.
 */
export function parseRateLimit(
  status: number,
  body: unknown,
  retryAfterHeader: string | null,
  fallback: LimitedAction,
  now: number = Date.now(),
): RateLimited | null {
  if (status !== 429) return null;
  const json = body && typeof body === 'object' ? (body as { action?: unknown; retry_after?: unknown }) : {};
  const action = isLimitedAction(json.action) ? json.action : fallback;
  let wait = seconds(json.retry_after) ?? seconds(retryAfterHeader);
  if (wait === null && retryAfterHeader) {
    const date = Date.parse(retryAfterHeader);
    if (Number.isFinite(date)) wait = Math.max(1, Math.ceil((date - now) / 1000));
  }
  return { kind: 'rate_limited', action, retryAfter: wait ?? DEFAULT_RETRY_AFTER };
}

/**
 * A PostgREST error of a limit raised in SQL (SQLSTATE PT429, message
 * rate_limited, verdict as JSON in details), or null.
 */
export function parsePostgrestRateLimit(
  error: { code?: unknown; message?: unknown; details?: unknown } | null,
  status: number,
  fallback: LimitedAction,
): RateLimited | null {
  if (!error) return null;
  if (status !== 429 && error.code !== 'PT429' && error.message !== 'rate_limited') return null;
  let verdict: unknown = null;
  if (typeof error.details === 'string') {
    try {
      verdict = JSON.parse(error.details);
    } catch {
      verdict = null;
    }
  }
  return parseRateLimit(429, verdict, null, fallback);
}

/** Seconds to the next UTC midnight: the daily windows (uploads, reports, previews per IP) end there. */
export function secondsToUtcMidnight(now: number): number {
  const date = new Date(now);
  const midnight = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1);
  return Math.max(1, Math.ceil((midnight - now) / 1000));
}

/** "20 s", "12 min", "3 h": how long until [until], rounded up. */
export function formatWait(until: number, now: number): string {
  const left = Math.max(0, until - now) / 1000;
  if (left < 60) return `${Math.max(1, Math.ceil(left))} s`;
  if (left <= 60 * 60) return `${Math.ceil(left / 60)} min`;
  return `${Math.ceil(left / 3600)} h`;
}

/** A limit notice still running at [now] (its Try again waits). */
export function stillLimited(notice: unknown, now: number): boolean {
  return typeof notice === 'object' && notice !== null && (notice as { kind?: unknown }).kind === 'rate_limited' && now < (notice as { until: number }).until;
}
