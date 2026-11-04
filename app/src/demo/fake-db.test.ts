// The demo server mirrors the SQL rules (D104, C4, C7, D14, D113).
import { beforeEach, describe, expect, test } from 'vitest';
import { DEMO_DANCES, DEMO_TIMING } from './data';
import * as db from './fake-db';

const T0 = Date.parse('2026-11-04T10:00:00Z');
const dance = DEMO_DANCES[0]!;
let state: db.FakeState;
let seq = 0;

function photo(userId: string, name = 'me.jpg'): string {
  const id = `photo-${++seq}`;
  state.photos[id] = { id, userId, name, status: 'accepted', clip: 'man', erased: false };
  return id;
}

function start(userId: string, photoId: string, key: string, now = T0, consentAt: string | null = new Date(now).toISOString()) {
  return db.startGeneration(state, { userId, danceId: dance.id, photoId, consentAt, now, id: `video-${++seq}`, key });
}

function refusal(run: () => unknown): string | null {
  try {
    run();
    return null;
  } catch (error) {
    return error instanceof db.Refusal ? error.refusal : 'other';
  }
}

function subscribe(userId: string, productId: 'bopsy_weekly' | 'bopsy_yearly' = 'bopsy_weekly', at = T0) {
  db.recordPurchase(state, userId, productId, at - DEMO_TIMING.webhookMs);
  db.settle(state, at);
}

beforeEach(() => {
  state = db.emptyState();
});

describe('photo check by file name', () => {
  test.each([
    ['group-photo.jpg', 'several_subjects'],
    ['selfie.png', 'body_not_visible'],
    ['my-kid.jpg', 'looks_like_child'],
    ['nsfw.jpg', 'unsafe_content'],
    ['landscape.jpg', 'no_subject'],
    ['horse.jpg', 'unsupported_subject'],
    ['offline.jpg', 'upload_failed'],
  ])('%s is refused with %s', (name, code) => {
    expect(db.judgePhoto(name)).toEqual({ rejection: code });
  });

  test.each([
    ['man-sit.jpg', 'man'],
    ['dog-sit.jpg', 'dog'],
    ['kitten.heic', 'cat'],
    ['mamie-sit.jpg', 'mamie'],
    ['IMG_0042.JPG', 'man'],
  ])('%s is accepted (clip %s)', (name, clip) => {
    expect(db.judgePhoto(name)).toEqual({ clip });
  });
});

describe('start_generation, in the order of the server', () => {
  test('consent first, then the photo, then the plan', () => {
    const own = photo('u1');
    expect(refusal(() => start('u1', own, 'k1', T0, null))).toBe('consent_missing');
    expect(refusal(() => start('u1', photo('u2'), 'k2'))).toBe('photo_not_checked');
    expect(refusal(() => start('u1', own, 'k3'))).toBe('not_subscribed');
  });

  test('a plan pays 60 of 180, the same key returns the same video, debited once', () => {
    subscribe('u1');
    const own = photo('u1');
    const first = start('u1', own, 'key');
    const again = start('u1', own, 'key');
    expect(again.id).toBe(first.id);
    expect(state.wallets.u1).toEqual({ plan: 120, bought: 0 });
  });

  test('C7: a fourth video in progress is refused', () => {
    subscribe('u1');
    db.recordPurchase(state, 'u1', 'bopsy_coins_600', T0 - DEMO_TIMING.webhookMs);
    db.settle(state, T0);
    const own = photo('u1');
    for (const key of ['a', 'b', 'c']) start('u1', own, key);
    expect(refusal(() => start('u1', own, 'd'))).toBe('too_many_in_progress');
  });

  test('not enough coins after the plan is spent', () => {
    subscribe('u1');
    const own = photo('u1');
    start('u1', own, 'a');
    start('u1', own, 'b');
    start('u1', own, 'c');
    db.settle(state, T0 + 60_000); // the three are ready, not in progress any more
    expect(refusal(() => start('u1', own, 'd', T0 + 60_000))).toBe('not_enough_coins');
  });

  test('plan coins first, then bought coins', () => {
    subscribe('u1');
    db.recordPurchase(state, 'u1', 'bopsy_coins_600', T0 - DEMO_TIMING.webhookMs);
    db.settle(state, T0);
    state.wallets.u1!.plan = 30;
    const video = start('u1', photo('u1'), 'k');
    expect(video).toMatchObject({ debitedPlan: 30, debitedBought: 30 });
    expect(state.wallets.u1).toEqual({ plan: 0, bought: 570 });
  });

  test('C4: without an active plan, bought coins still pay', () => {
    state.wallets.u1 = { plan: 180, bought: 600 };
    const video = start('u1', photo('u1'), 'k');
    expect(video).toMatchObject({ debitedPlan: 0, debitedBought: 60 });
    expect(state.wallets.u1).toEqual({ plan: 180, bought: 540 });
  });

  test('a failed video gives its coins back to the buckets debited, once', () => {
    subscribe('u1');
    const video = start('u1', photo('u1', 'fail-me.jpg'), 'k');
    expect(state.wallets.u1!.plan).toBe(120);
    db.settle(state, T0 + DEMO_TIMING.queuedMs + DEMO_TIMING.renderMs + 1);
    db.settle(state, T0 + 10 * 60_000);
    expect(state.videos[video.id]).toMatchObject({ status: 'failed', errorCode: 'body_not_detected', coinsRefunded: 60 });
    expect(state.wallets.u1!.plan).toBe(180);
  });

  test('progress stays under 96 until ready', () => {
    subscribe('u1');
    const video = start('u1', photo('u1'), 'k');
    db.settle(state, T0 + DEMO_TIMING.queuedMs + DEMO_TIMING.renderMs - 1);
    expect(state.videos[video.id]!.status).toBe('rendering');
    expect(state.videos[video.id]!.progress).toBeLessThanOrEqual(95);
    db.settle(state, T0 + DEMO_TIMING.queuedMs + DEMO_TIMING.renderMs);
    expect(state.videos[video.id]).toMatchObject({ status: 'ready', progress: 100 });
  });
});

describe('purchases (RevenueCat webhook after a delay)', () => {
  test('a plan is active only once the webhook lands; a renewal resets to 180 (C3)', () => {
    db.recordPurchase(state, 'u1', 'bopsy_weekly', T0);
    db.settle(state, T0 + 100);
    expect(db.subscriptionActive(state, 'u1', T0 + 100)).toBe(false);
    db.settle(state, T0 + DEMO_TIMING.webhookMs);
    expect(db.subscriptionActive(state, 'u1', T0 + DEMO_TIMING.webhookMs)).toBe(true);
    expect(state.wallets.u1).toEqual({ plan: 180, bought: 0 });
    state.wallets.u1!.plan = 60;
    db.recordPurchase(state, 'u1', 'bopsy_weekly', T0 + 10_000);
    db.settle(state, T0 + 20_000);
    expect(state.wallets.u1!.plan).toBe(180);
  });

  test('packs add bought coins; the yearly plan gives 240', () => {
    db.recordPurchase(state, 'u1', 'bopsy_yearly', T0);
    db.recordPurchase(state, 'u1', 'bopsy_coins_1500', T0);
    db.settle(state, T0 + DEMO_TIMING.webhookMs);
    expect(state.wallets.u1).toEqual({ plan: 240, bought: 1500 });
  });
});

describe('start_preview: one per account, per browser and per IP', () => {
  const preview = (userId: string, photoId: string, deviceHash: string, ip: string) =>
    db.startPreview(state, { userId, danceId: dance.id, photoId, consentAt: new Date(T0).toISOString(), now: T0, id: `p-${++seq}`, deviceHash, ip });

  test('free, not debited, then refused on the same account, browser or IP', () => {
    const video = preview('u1', photo('u1'), 'browser-a', 'ip-1');
    expect(video).toMatchObject({ isPreview: true, cost: 0 });
    expect(refusal(() => preview('u1', photo('u1'), 'browser-b', 'ip-2'))).toBe('preview_already_used');
    expect(refusal(() => preview('u2', photo('u2'), 'browser-a', 'ip-2'))).toBe('preview_already_used');
    expect(refusal(() => preview('u3', photo('u3'), 'browser-c', 'ip-1'))).toBe('preview_already_used');
    expect(preview('u4', photo('u4'), 'browser-d', 'ip-4').isPreview).toBe(true);
  });

  test('off by the remote flag: refused as already used', () => {
    state.freePreviewEnabled = false;
    expect(refusal(() => preview('u1', photo('u1'), 'b', 'i'))).toBe('preview_already_used');
  });
});
