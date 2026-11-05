// The live adapters against a fake supabase-js client: the CAPTCHA of Auth
// (D132), start-preview's platform and Turnstile token, the common 429
// (D131), the photos bucket's refusals, check-photo asked again without a
// new upload, preview-url, and the report limit.
import type { SupabaseClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { CaptchaFailed } from '../core/ports';
import type { Video } from '../core/types';
import { functionFailure, storageFailure } from './errors';
import { LiveAuth } from './live-auth';
import { CHECK_RETRY_MS, LiveBackend } from './live-backend';
import type { CaptchaPort } from './turnstile';

const NOW = Date.parse('2026-11-05T10:20:00Z');
const GUEST = 'aaaaaaaa-0000-4000-8000-000000000001';

type Result = { data: unknown; error: unknown };
const ok = (data: unknown): Result => ({ data, error: null });
/** A FunctionsHttpError as functions-js gives it: the Response in context. */
function httpError(status: number, body: unknown, headers: Record<string, string> = {}): Result {
  const response = new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
  return { data: null, error: Object.assign(new Error('Edge Function returned a non-2xx status code'), { name: 'FunctionsHttpError', context: response }) };
}
const fetchError = (): Result => ({ data: null, error: Object.assign(new Error('Failed to send a request'), { name: 'FunctionsFetchError', context: new TypeError('fetch failed') }) });

interface AuthCall { method: string; args: unknown }

function fakeClient(options: {
  session?: { id: string; email?: string; anonymous: boolean } | null;
  invoke?: (name: string, body: Record<string, unknown>) => Result | Promise<Result>;
  upload?: (path: string, options: unknown) => { error: unknown };
  auth?: Partial<Record<'signInAnonymously' | 'signInWithOtp' | 'updateUser' | 'verifyOtp', (args: unknown) => unknown>>;
  insert?: (row: unknown) => { error: unknown; status: number };
}) {
  const calls = { invoke: [] as Array<[string, Record<string, unknown>]>, uploads: [] as string[], auth: [] as AuthCall[], signed: [] as string[] };
  const toSupabase = (user: { id: string; email?: string; anonymous: boolean }) => ({ user: { id: user.id, email: user.email ?? '', is_anonymous: user.anonymous } });
  const authMethod = (method: keyof NonNullable<typeof options.auth>, fallback: (args: unknown) => unknown) => async (...args: unknown[]) => {
    calls.auth.push({ method, args: args[0] });
    return (options.auth?.[method] ?? fallback)(args[0]);
  };
  const client = {
    auth: {
      getSession: async () => ({ data: { session: options.session ? toSupabase(options.session) : null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signInAnonymously: authMethod('signInAnonymously', () => ({ data: { session: toSupabase({ id: GUEST, anonymous: true }) }, error: null })),
      signInWithOtp: authMethod('signInWithOtp', () => ({ data: {}, error: null })),
      updateUser: authMethod('updateUser', () => ({ data: {}, error: null })),
      verifyOtp: authMethod('verifyOtp', () => ({ data: { session: toSupabase({ id: GUEST, email: 'a@b.co', anonymous: false }) }, error: null })),
      signOut: async () => ({ error: null }),
    },
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string, _file: Blob, uploadOptions: unknown) => {
          calls.uploads.push(path);
          return { data: options.upload ? null : { path }, ...(options.upload?.(path, uploadOptions) ?? { error: null }) };
        },
        createSignedUrl: async (path: string) => {
          calls.signed.push(`${bucket}/${path}`);
          return { data: { signedUrl: `https://cdn.test/${bucket}/${path}?token=x` } };
        },
      }),
    },
    functions: {
      invoke: async (name: string, { body }: { body: Record<string, unknown> }) => {
        calls.invoke.push([name, body]);
        return options.invoke ? options.invoke(name, body) : ok(null);
      },
    },
    from: () => ({ insert: async (row: unknown) => options.insert?.(row) ?? { error: null, status: 201 } }),
  };
  return { client: client as unknown as SupabaseClient, calls };
}

function tokens(script: Array<string | Error> = []): CaptchaPort & { asked: string[] } {
  let n = 0;
  const asked: string[] = [];
  return {
    asked,
    token: async (action) => {
      asked.push(action);
      const next = script.shift();
      if (next instanceof Error) throw next;
      return next ?? `tok-${++n}`;
    },
  };
}

function live(fake: ReturnType<typeof fakeClient>, captcha = tokens()) {
  const auth = new LiveAuth({ load: async () => fake.client, captcha });
  const sleep = vi.fn(async () => undefined);
  return { backend: new LiveBackend({ auth, captcha, sleep, now: () => NOW }), auth, captcha, sleep };
}

const jpeg = (size = 2_000_000) => new Blob([new Uint8Array(size)], { type: 'image/jpeg' });
const captchaError = { data: { session: null, user: null }, error: Object.assign(new Error('captcha protection: request disallowed (invalid-input-response)'), { code: 'captcha_failed', status: 400 }) };

beforeEach(() => {
  localStorage.clear();
});

describe('Supabase Auth with the CAPTCHA (D132)', () => {
  test('the guest session sends a fresh token; a refused token gets one more try with a new one', async () => {
    let refused = true;
    const fake = fakeClient({
      auth: {
        signInAnonymously: () => {
          if (refused) {
            refused = false;
            return captchaError;
          }
          return { data: { session: { user: { id: GUEST, email: '', is_anonymous: true } } }, error: null };
        },
      },
    });
    const { auth, captcha } = live(fake);
    expect(await auth.ensureSession()).toEqual({ userId: GUEST, email: null, guest: true });
    expect(fake.calls.auth.map((call) => call.args)).toEqual([{ options: { captchaToken: 'tok-1' } }, { options: { captchaToken: 'tok-2' } }]);
    expect(captcha.asked).toEqual(['guest', 'guest']);
  });

  test('refused twice, or no token from Turnstile: CaptchaFailed; two ticks at once sign in once', async () => {
    const twice = live(fakeClient({ auth: { signInAnonymously: () => captchaError } }));
    await expect(twice.auth.ensureSession()).rejects.toBeInstanceOf(CaptchaFailed);
    const blocked = live(fakeClient({}), tokens([new CaptchaFailed('error_300030')]));
    await expect(blocked.auth.ensureSession()).rejects.toBeInstanceOf(CaptchaFailed);
    const fake = fakeClient({});
    const both = live(fake);
    const [a, b] = await Promise.all([both.auth.ensureSession(), both.auth.ensureSession()]);
    expect(a).toEqual(b);
    expect(fake.calls.auth.filter((call) => call.method === 'signInAnonymously')).toHaveLength(1);
  });

  test('a guest: updateUser without a token; an email with an account: signInWithOtp with a token', async () => {
    const fake = fakeClient({
      session: { id: GUEST, anonymous: true },
      auth: { updateUser: () => ({ data: {}, error: Object.assign(new Error('already registered'), { code: 'email_exists', status: 422 }) }) },
    });
    const { auth, captcha } = live(fake);
    expect(await auth.sendCode('Dancer@Example.com')).toEqual({ ok: true });
    expect(fake.calls.auth.map((call) => call.method)).toEqual(['updateUser', 'signInWithOtp']);
    expect(fake.calls.auth[0]!.args).toEqual({ email: 'dancer@example.com' });
    expect(fake.calls.auth[1]!.args).toMatchObject({ email: 'dancer@example.com', options: { shouldCreateUser: true, captchaToken: 'tok-1' } });
    expect(captcha.asked).toEqual(['code']);
    expect(await auth.verifyCode('dancer@example.com', '123456')).toMatchObject({ ok: true });
    expect(fake.calls.auth.at(-1)).toEqual({ method: 'verifyOtp', args: { email: 'dancer@example.com', token: '123456', type: 'email' } });
  });

  test('Send code: a refused token is retried once, then the captcha error; no token at all too', async () => {
    const fake = fakeClient({ auth: { signInWithOtp: () => ({ data: {}, error: captchaError.error }) } });
    expect(await live(fake).auth.sendCode('a@b.co')).toEqual({ ok: false, error: 'captcha' });
    expect(fake.calls.auth.map((call) => (call.args as { options: { captchaToken: string } }).options.captchaToken)).toEqual(['tok-1', 'tok-2']);
    expect(await live(fakeClient({}), tokens([new CaptchaFailed('timeout')])).auth.sendCode('a@b.co')).toEqual({ ok: false, error: 'captcha' });
  });
});

describe('check-photo and the photos bucket (D131)', () => {
  const accepted = () => ok({ status: 'accepted', photo_id: 'photo-1' });

  test('refused before any upload: a type the bucket does not take, a file over 10 MB', async () => {
    const fake = fakeClient({});
    const { backend } = live(fake);
    expect(await backend.checkPhoto(new Blob(['gif'], { type: 'image/gif' }), 'a.gif')).toEqual({ status: 'failed', reason: 'bad_type' });
    expect(await backend.checkPhoto(jpeg(10 * 1024 * 1024 + 1), 'big.jpg')).toEqual({ status: 'failed', reason: 'too_large' });
    expect(fake.calls.uploads).toEqual([]);
  });

  test('refused by the bucket: the daily cap (until UTC midnight), the size, the type', async () => {
    const rls = { status: 400, statusCode: '403', message: 'new row violates row-level security policy' };
    let error: unknown = rls;
    const { backend } = live(fakeClient({ upload: () => ({ error }) }));
    expect(await backend.checkPhoto(jpeg(), 'a.jpg')).toEqual({ status: 'failed', reason: 'daily_cap', retryAfter: 13 * 3600 + 40 * 60 });
    error = { status: 413, statusCode: '413', message: 'The object exceeded the maximum allowed size' };
    expect(await backend.checkPhoto(jpeg(), 'a.jpg')).toEqual({ status: 'failed', reason: 'too_large' });
    error = { status: 400, statusCode: '415', message: 'mime type image/heif is not supported' };
    expect(await backend.checkPhoto(jpeg(), 'a.jpg')).toEqual({ status: 'failed', reason: 'bad_type' });
  });

  test('the upload goes to the guest folder as image/jpeg; HEIF is sent as HEIC', async () => {
    const types: unknown[] = [];
    const fake = fakeClient({ invoke: accepted, upload: (_path, options) => (types.push(options), { error: null }) });
    const { backend } = live(fake);
    expect(await backend.checkPhoto(jpeg(), 'a.jpg')).toEqual({ status: 'accepted', photoId: 'photo-1', userId: GUEST });
    await backend.checkPhoto(new Blob(['x'], { type: 'image/heif' }), 'a.heif');
    expect(fake.calls.uploads[0]).toMatch(new RegExp(`^${GUEST}/[0-9a-f-]{36}\\.jpg$`));
    expect(fake.calls.uploads[1]).toMatch(/\.heic$/);
    expect(types).toEqual([{ contentType: 'image/jpeg', upsert: false }, { contentType: 'image/heic', upsert: false }]);
  });

  test('429: "too many checks", with the wait and the file already uploaded; Try again sends no new file', async () => {
    let limited = true;
    const fake = fakeClient({
      invoke: () => {
        if (!limited) return accepted();
        limited = false;
        return httpError(429, { error: 'rate_limited', action: 'photo_check', retry_after: 720 }, { 'retry-after': '720' });
      },
    });
    const { backend } = live(fake);
    const first = await backend.checkPhoto(jpeg(), 'a.jpg');
    expect(first).toEqual({ status: 'failed', reason: 'rate_limited', retryAfter: 720, uploaded: { photoPath: fake.calls.uploads[0], userId: GUEST } });
    const again = await backend.checkPhoto(jpeg(), 'a.jpg', first.status === 'failed' ? first.uploaded : undefined);
    expect(again).toMatchObject({ status: 'accepted' });
    expect(fake.calls.uploads).toHaveLength(1);
    expect(fake.calls.invoke.map(([, body]) => body.photo_path)).toEqual([fake.calls.uploads[0], fake.calls.uploads[0]]);
  });

  test('a lost answer: asked again once with the same photo_path (the stored verdict, free)', async () => {
    let lost = true;
    const fake = fakeClient({
      invoke: () => {
        if (!lost) return accepted();
        lost = false;
        return fetchError();
      },
    });
    const { backend, sleep } = live(fake);
    expect(await backend.checkPhoto(jpeg(), 'a.jpg')).toMatchObject({ status: 'accepted' });
    expect(sleep).toHaveBeenCalledWith(CHECK_RETRY_MS);
    expect(fake.calls.uploads).toHaveLength(1);
    expect(fake.calls.invoke).toHaveLength(2);
  });

  test('still no answer: failed, the file kept for Try again; a file of another account is uploaded again', async () => {
    const fake = fakeClient({ invoke: () => fetchError() });
    const { backend } = live(fake);
    const result = await backend.checkPhoto(jpeg(), 'a.jpg');
    expect(result).toEqual({ status: 'failed', reason: 'network', uploaded: { photoPath: fake.calls.uploads[0], userId: GUEST } });
    await backend.checkPhoto(jpeg(), 'a.jpg', { photoPath: 'someone-else/x.jpg', userId: 'someone-else' });
    expect(fake.calls.uploads).toHaveLength(2);
  });

  test('502 keeps the file, 404 does not; the guest CAPTCHA refused is its own failure', async () => {
    const statuses = [httpError(502, { error: 'moderation_failed' }), httpError(404, { error: 'photo_not_found' })];
    const { backend } = live(fakeClient({ invoke: () => statuses.shift()! }));
    expect(await backend.checkPhoto(jpeg(), 'a.jpg')).toMatchObject({ status: 'failed', reason: 'network', uploaded: { userId: GUEST } });
    expect(await backend.checkPhoto(jpeg(), 'a.jpg')).toEqual({ status: 'failed', reason: 'network' });
    const blocked = live(fakeClient({}), tokens([new CaptchaFailed('unsupported'), new CaptchaFailed('unsupported')]));
    expect(await blocked.backend.checkPhoto(jpeg(), 'a.jpg')).toEqual({ status: 'failed', reason: 'captcha' });
  });
});

describe('start-preview (D130, D132) and start-generation (D131)', () => {
  const request = { danceId: 'd1', photoId: 'p1', consentAt: '2026-11-05T10:19:00.000Z' };
  const videoRow = { id: 'v1', dance_id: 'd1', photo_id: 'p1', status: 'rendering', progress: 0, error_code: null, is_preview: true, cost: 0, coins_refunded: 0, created_at: '2026-11-05T10:20:00Z', ready_at: null, result_path: null };
  const guest = { id: GUEST, anonymous: true };

  test('platform "web" and a Turnstile token with the contract body', async () => {
    const fake = fakeClient({ session: guest, invoke: () => ok({ video: videoRow }) });
    const { backend, captcha } = live(fake);
    expect(await backend.startPreview(request)).toMatchObject({ kind: 'started', video: { id: 'v1', isPreview: true } });
    const [name, body] = fake.calls.invoke[0]!;
    expect(name).toBe('start-preview');
    expect(Object.keys(body).sort()).toEqual(['captcha_token', 'consent_at', 'dance_id', 'device_token', 'photo_id', 'platform']);
    expect(body).toMatchObject({ platform: 'web', captcha_token: 'tok-1', dance_id: 'd1', photo_id: 'p1' });
    expect(String(body.device_token)).toMatch(/^web-/);
    expect(captcha.asked).toEqual(['preview']);
  });

  test('403 captcha_failed: once more with a new token, then the captcha message', async () => {
    const answers = [httpError(403, { error: 'captcha_failed' }), ok({ video: videoRow })];
    const fake = fakeClient({ session: guest, invoke: () => answers.shift()! });
    expect(await live(fake).backend.startPreview(request)).toMatchObject({ kind: 'started' });
    expect(fake.calls.invoke.map(([, body]) => body.captcha_token)).toEqual(['tok-1', 'tok-2']);

    const always = fakeClient({ session: guest, invoke: () => httpError(403, { error: 'captcha_failed' }) });
    expect(await live(always).backend.startPreview(request)).toEqual({ kind: 'captcha_failed' });
    expect(always.calls.invoke).toHaveLength(2);

    const none = fakeClient({ session: guest });
    expect(await live(none, tokens([new CaptchaFailed('timeout')])).backend.startPreview(request)).toEqual({ kind: 'captcha_failed' });
    expect(none.calls.invoke).toHaveLength(0);
  });

  test('previews off (503 preview_unavailable, 403 origin_not_allowed), the IP limit, a refusal', async () => {
    const answers = [
      httpError(503, { error: 'preview_unavailable' }),
      httpError(403, { error: 'origin_not_allowed' }),
      httpError(429, { error: 'rate_limited', action: 'preview', retry_after: 49_200 }, { 'retry-after': '49200' }),
      httpError(409, { refusal: 'preview_already_used' }),
      httpError(503, { error: 'captcha_unavailable' }),
    ];
    const { backend } = live(fakeClient({ session: guest, invoke: () => answers.shift()! }));
    expect(await backend.startPreview(request)).toEqual({ kind: 'preview_unavailable' });
    expect(await backend.startPreview(request)).toEqual({ kind: 'preview_unavailable' });
    expect(await backend.startPreview(request)).toEqual({ kind: 'rate_limited', action: 'preview', retryAfter: 49_200 });
    expect(await backend.startPreview(request)).toEqual({ kind: 'refused', refusal: 'preview_already_used' });
    expect(await backend.startPreview(request)).toEqual({ kind: 'failed' });
  });

  test('start-generation: the hourly limit with its wait (header only), no token; 503 is a failure', async () => {
    const answers = [httpError(429, { error: 'rate_limited' }, { 'retry-after': '1800' }), httpError(503, { error: 'provider_unavailable' })];
    const fake = fakeClient({ session: { id: GUEST, email: 'a@b.co', anonymous: false }, invoke: () => answers.shift()! });
    const { backend, captcha } = live(fake);
    const generation = { ...request, idempotencyKey: 'k1' };
    expect(await backend.startGeneration(generation)).toEqual({ kind: 'rate_limited', action: 'generation', retryAfter: 1800 });
    expect(await backend.startGeneration(generation)).toEqual({ kind: 'failed' });
    expect(fake.calls.invoke[0]![1]).toEqual({ dance_id: 'd1', photo_id: 'p1', consent_at: request.consentAt, idempotency_key: 'k1' });
    expect(captcha.asked).toEqual([]);
  });
});

describe('preview-url (D130) and reports (D131)', () => {
  const video = (isPreview: boolean): Video => ({
    id: 'v1', danceId: 'd1', photoId: 'p1', status: 'ready', progress: 100, errorCode: null, isPreview, cost: 0, coinsRefunded: 0,
    createdAt: '2026-11-05T10:20:00Z', readyAt: '2026-11-05T10:20:06Z', resultPath: `${GUEST}/v1.mp4`,
  });

  test('a signed URL that expires, with its thumbnail; 404 is "not found", 500 an error', async () => {
    const answers = [
      ok({ url: 'https://x.supabase.co/storage/v1/object/sign/previews/a.mp4?token=1', expires_in: 120, thumbnail_url: 'https://x/thumb.jpg' }),
      httpError(404, { error: 'preview_not_found' }),
      httpError(500, { error: 'server_error' }),
    ];
    const fake = fakeClient({ session: { id: GUEST, anonymous: true }, invoke: () => answers.shift()! });
    const { backend } = live(fake);
    expect(await backend.previewUrl('v1')).toEqual({ url: 'https://x.supabase.co/storage/v1/object/sign/previews/a.mp4?token=1', expiresAt: NOW + 120_000, thumbnailUrl: 'https://x/thumb.jpg' });
    expect(fake.calls.invoke[0]).toEqual(['preview-url', { video_id: 'v1' }]);
    expect(await backend.previewUrl('v1')).toBeNull();
    await expect(backend.previewUrl('v1')).rejects.toThrow();
  });

  test('a preview never gets a results URL, so no download; a paid video does', async () => {
    const fake = fakeClient({ session: { id: GUEST, email: 'a@b.co', anonymous: false } });
    const { backend } = live(fake);
    expect(await backend.videoUrl(video(true), 'bopsy-x.mp4')).toBeNull();
    expect(await backend.videoUrl(video(false), 'bopsy-x.mp4')).toMatch(/^https:\/\/cdn\.test\/results\//);
    expect(fake.calls.signed).toEqual([`results/${GUEST}/v1.mp4`]);
  });

  test('reports: sent, the daily limit (PT429) with its wait, or failed', async () => {
    const answers = [
      { error: null, status: 201 },
      { error: { code: 'PT429', message: 'rate_limited', details: '{"allowed":false,"action":"report","retry_after":49200}' }, status: 429 },
      { error: { code: '42501', message: 'new row violates row-level security policy' }, status: 403 },
    ];
    const { backend } = live(fakeClient({ session: { id: GUEST, anonymous: true }, insert: () => answers.shift()! }));
    expect(await backend.report('v1', 'other', ' ')).toEqual({ kind: 'sent' });
    expect(await backend.report('v1', 'other', '')).toEqual({ kind: 'rate_limited', action: 'report', retryAfter: 49_200 });
    expect(await backend.report('v1', 'other', '')).toEqual({ kind: 'failed' });
  });
});

describe('the parsers of the live answers', () => {
  test('a function error: status, code and limit from the Response; no Response is the network', async () => {
    const limited = httpError(429, { error: 'rate_limited', action: 'generation', retry_after: 300 }, { 'retry-after': '300' });
    expect(await functionFailure(limited.error, 'preview')).toMatchObject({ kind: 'http', status: 429, code: 'rate_limited', limit: { action: 'generation', retryAfter: 300 } });
    const notJson = { context: new Response('<html>Bad gateway</html>', { status: 502 }) };
    expect(await functionFailure(notJson, 'generation')).toMatchObject({ kind: 'http', status: 502, code: null, limit: null });
    expect(await functionFailure(fetchError().error, 'generation')).toEqual({ ok: false, kind: 'network' });
    expect(await functionFailure(null, 'generation')).toEqual({ ok: false, kind: 'network' });
  });

  test('Storage refusals, in the old (400 with statusCode) and new (real status) shapes', () => {
    expect(storageFailure({ status: 413, statusCode: '413', message: 'Payload too large' })).toBe('too_large');
    expect(storageFailure({ status: 400, statusCode: '413', message: 'The object exceeded the maximum allowed size' })).toBe('too_large');
    expect(storageFailure({ status: 415, statusCode: 'InvalidMimeType', message: 'mime type image/gif is not supported' })).toBe('bad_type');
    expect(storageFailure({ status: 400, statusCode: '403', message: 'new row violates row-level security policy' })).toBe('daily_cap');
    expect(storageFailure({ status: 403, statusCode: 'AccessDenied', message: 'Access denied' })).toBe('daily_cap');
    expect(storageFailure({ status: 400, statusCode: '403', message: 'jwt expired' })).toBe('network');
    expect(storageFailure({ status: 500, statusCode: '500', message: 'Internal Server Error' })).toBe('network');
    expect(storageFailure(new TypeError('Failed to fetch'))).toBe('network');
  });
});
