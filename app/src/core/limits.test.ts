// D131: the common 429, its waits, the photo's size and type before upload,
// and the preview link renewed before it expires.
import { describe, expect, test, vi } from 'vitest';
import { encodeUnderLimit, MAX_UPLOAD_BYTES, uploadType } from './image';
import { formatWait, parsePostgrestRateLimit, parseRateLimit, secondsToUtcMidnight } from './limits';
import { MAX_ERROR_RELOADS, PreviewLinkKeeper, refreshDelay, type KeeperClock, type PreviewLinkState } from './preview-link';
import type { PreviewLink } from './types';

const NOW = Date.parse('2026-11-05T10:20:00Z');

describe('the common 429 of the server', () => {
  test('action and retry_after from the body', () => {
    expect(parseRateLimit(429, { error: 'rate_limited', action: 'preview', retry_after: 3600 }, '3600', 'generation')).toEqual({
      kind: 'rate_limited',
      action: 'preview',
      retryAfter: 3600,
    });
  });

  test('the Retry-After header when the body has no wait, in seconds or as a date; one minute without either', () => {
    expect(parseRateLimit(429, { error: 'rate_limited' }, '125', 'generation')).toMatchObject({ action: 'generation', retryAfter: 125 });
    expect(parseRateLimit(429, null, 'Thu, 05 Nov 2026 10:30:00 GMT', 'photo_check', NOW)).toMatchObject({ action: 'photo_check', retryAfter: 600 });
    expect(parseRateLimit(429, 'not json', null, 'report')).toMatchObject({ action: 'report', retryAfter: 60 });
  });

  test('an unknown action falls back; a fractional wait rounds up; another status is not a limit', () => {
    expect(parseRateLimit(429, { action: 'preview_ip', retry_after: 0.2 }, null, 'preview')).toMatchObject({ action: 'preview', retryAfter: 1 });
    expect(parseRateLimit(409, { refusal: 'not_subscribed' }, null, 'generation')).toBeNull();
    expect(parseRateLimit(503, { error: 'rate_limited' }, '10', 'generation')).toBeNull();
  });

  test('reports: PostgREST PT429 with the verdict in details', () => {
    const error = { code: 'PT429', message: 'rate_limited', details: JSON.stringify({ allowed: false, action: 'report', limit: 10, remaining: 0, retry_after: 49_200 }) };
    expect(parsePostgrestRateLimit(error, 429, 'report')).toEqual({ kind: 'rate_limited', action: 'report', retryAfter: 49_200 });
    expect(parsePostgrestRateLimit({ code: 'PT429', message: 'rate_limited', details: 'oops' }, 429, 'report')).toMatchObject({ retryAfter: 60 });
    expect(parsePostgrestRateLimit({ code: '42501', message: 'new row violates row-level security policy' }, 403, 'report')).toBeNull();
    expect(parsePostgrestRateLimit(null, 201, 'report')).toBeNull();
  });

  test('daily windows end at UTC midnight; waits read in minutes, then hours', () => {
    expect(secondsToUtcMidnight(NOW)).toBe(13 * 3600 + 40 * 60);
    expect(secondsToUtcMidnight(Date.parse('2026-11-05T23:59:59.500Z'))).toBe(1);
    expect(formatWait(NOW + 5_000, NOW)).toBe('1 min');
    expect(formatWait(NOW + 12 * 60_000, NOW)).toBe('12 min');
    expect(formatWait(NOW + 60 * 60_000, NOW)).toBe('60 min');
    expect(formatWait(NOW + 13.6 * 3_600_000, NOW)).toBe('14 h');
    expect(formatWait(NOW - 1, NOW)).toBe('1 min');
  });
});

describe('the photo sent (D131: JPEG, PNG, WebP, HEIC, 10 MB)', () => {
  test('types the bucket takes; HEIF goes as HEIC; the rest is refused before any upload', () => {
    expect(uploadType('image/jpeg')).toBe('image/jpeg');
    expect(uploadType('image/HEIF')).toBe('image/heic');
    expect(uploadType('image/gif')).toBeNull();
    expect(uploadType('')).toBeNull();
  });

  test('the 2048 px JPEG stays under 10 MB: lower quality, then smaller', async () => {
    const sizes: Array<[number, number]> = [];
    const encode = vi.fn(async (quality: number, scale: number) => {
      sizes.push([quality, scale]);
      const bytes = quality >= 0.8 ? MAX_UPLOAD_BYTES + 1 : scale === 1 ? MAX_UPLOAD_BYTES + 1 : 4_000_000;
      return { size: bytes } as Blob;
    });
    expect((await encodeUnderLimit(encode))?.size).toBe(4_000_000);
    expect(sizes).toEqual([[0.9, 1], [0.8, 1], [0.7, 1], [0.7, 0.75]]);
  });

  test('the first encoding when it fits; null when nothing fits or the encoder fails', async () => {
    const small = vi.fn(async () => ({ size: 1_500_000 }) as Blob);
    expect((await encodeUnderLimit(small))?.size).toBe(1_500_000);
    expect(small).toHaveBeenCalledOnce();
    expect(await encodeUnderLimit(async () => ({ size: MAX_UPLOAD_BYTES + 1 }) as Blob)).toBeNull();
    expect(await encodeUnderLimit(async () => null)).toBeNull();
  });
});

describe('the preview link (preview-url, D130)', () => {
  const link = (url: string, expiresAt: number): PreviewLink => ({ url, expiresAt, thumbnailUrl: null });

  function fakeClock(start: number) {
    let now = start;
    const timers: Array<{ at: number; run: () => void; id: number }> = [];
    let ids = 0;
    const clock: KeeperClock = {
      now: () => now,
      setTimeout: (run, ms) => {
        const id = ++ids;
        timers.push({ at: now + ms, run, id });
        return id;
      },
      clearTimeout: (id) => {
        const index = timers.findIndex((timer) => timer.id === id);
        if (index >= 0) timers.splice(index, 1);
      },
    };
    const advance = async (ms: number) => {
      now += ms;
      for (const timer of timers.filter((item) => item.at <= now)) {
        timers.splice(timers.indexOf(timer), 1);
        timer.run();
      }
      await new Promise((resolve) => setTimeout(resolve, 0));
    };
    return { clock, advance, pending: () => timers.length };
  }

  test('asked again 20 s before a 120 s link expires, a quarter of the life for short ones', () => {
    expect(refreshDelay(link('a', NOW + 120_000), NOW)).toBe(100_000);
    expect(refreshDelay(link('a', NOW + 8_000), NOW)).toBe(6_000);
    expect(refreshDelay(link('a', NOW - 1_000), NOW)).toBe(1_000);
  });

  test('renewed before it expires, without the player noticing', async () => {
    const { clock, advance } = fakeClock(NOW);
    let n = 0;
    const load = vi.fn(async () => link(`u${++n}`, clock.now() + 120_000));
    const states: PreviewLinkState[] = [];
    const keeper = new PreviewLinkKeeper(load, (state) => states.push(state), clock);
    await keeper.start();
    expect(states.at(-1)).toMatchObject({ status: 'ready', link: { url: 'u1' } });
    await advance(99_000);
    expect(load).toHaveBeenCalledTimes(1);
    await advance(1_000);
    expect(load).toHaveBeenCalledTimes(2);
    expect(states.at(-1)).toMatchObject({ status: 'ready', link: { url: 'u2' } });
    keeper.stop();
  });

  test('a player error asks for a new URL at once; after three in a row, the error state and Try again', async () => {
    const { clock } = fakeClock(NOW);
    let n = 0;
    const load = vi.fn(async () => link(`u${++n}`, clock.now() + 120_000));
    const states: PreviewLinkState[] = [];
    const keeper = new PreviewLinkKeeper(load, (state) => states.push(state), clock);
    await keeper.start();
    for (let i = 0; i < MAX_ERROR_RELOADS; i++) await keeper.playerError();
    expect(load).toHaveBeenCalledTimes(1 + MAX_ERROR_RELOADS);
    await keeper.playerError();
    expect(load).toHaveBeenCalledTimes(1 + MAX_ERROR_RELOADS);
    expect(states.at(-1)).toEqual({ status: 'error' });
    await keeper.retry();
    expect(states.slice(-2)).toEqual([{ status: 'loading' }, { status: 'ready', link: link('u5', NOW + 120_000) }]);
  });

  test('playing resets the count; not found and unreachable are told apart; stop ends it', async () => {
    const { clock, advance, pending } = fakeClock(NOW);
    const answers: Array<PreviewLink | null | Error> = [link('a', NOW + 120_000), link('b', NOW + 120_000), null];
    const load = vi.fn(async () => {
      const next = answers.shift();
      if (next instanceof Error || next === undefined) throw next ?? new Error('unreachable');
      return next;
    });
    const states: PreviewLinkState[] = [];
    const keeper = new PreviewLinkKeeper(load, (state) => states.push(state), clock);
    await keeper.start();
    await keeper.playerError();
    keeper.playing();
    await keeper.playerError();
    expect(states.at(-1)).toEqual({ status: 'missing' });
    expect(pending()).toBe(0);
    await keeper.retry();
    expect(states.at(-1)).toEqual({ status: 'error' }); // load threw
    keeper.stop();
    await advance(200_000);
    expect(load).toHaveBeenCalledTimes(4);
  });
});
