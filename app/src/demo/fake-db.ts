// The demo server (D118): the rules of the SQL functions and Edge Functions,
// in memory, driven by an explicit clock so tests replay them exactly.
// check-photo by file name keywords, start_preview (one per account, per
// browser and per IP), start_generation in the server's order (idempotency
// key, consent, photo, dance, plan or C4, C7, balance), plan then bought
// coins debited, refund of a failed video, RevenueCat webhook after a delay.
import type { GenerationRefusal, PhotoRejection, UploadFailure, Video } from '../core/types';
import { DEMO_DANCES, DEMO_PRODUCTS, DEMO_TIMING, type DemoClip, type DemoProductId } from './data';

export interface FakeUser { id: string; email: string | null; guest: boolean }
export interface FakePhoto { id: string; userId: string; name: string; status: 'accepted' | 'rejected'; clip: DemoClip; erased: boolean }
export interface FakeVideo extends Video {
  userId: string;
  key: string | null;
  debitedPlan: number;
  debitedBought: number;
  clip: DemoClip;
  outcome: { status: 'ready' } | { status: 'failed'; errorCode: string };
  renderMs: number;
  refunded: boolean;
}
export interface FakeSubscription { productId: 'bopsy_weekly' | 'bopsy_yearly'; since: number; expiresAt: number }
export interface FakeCredit { userId: string; productId: DemoProductId; at: number }

export interface FakeState {
  users: Record<string, FakeUser>;
  sessionUserId: string | null;
  photos: Record<string, FakePhoto>;
  videos: Record<string, FakeVideo>;
  wallets: Record<string, { plan: number; bought: number }>;
  subscriptions: Record<string, FakeSubscription>;
  /** Users who already had the launch offer (not eligible any more). */
  introUsed: string[];
  pending: FakeCredit[];
  devicePreviews: Record<string, string>;
  ipPreviews: Record<string, string>;
  reports: Array<{ userId: string; videoId: string; reason: string; note: string | null }>;
  codes: Record<string, string>;
  freePreviewEnabled: boolean;
  /** Files in the photos bucket, by path: check-photo can be asked again without a new upload. */
  uploads: Record<string, { userId: string; name: string }>;
}

export function emptyState(): FakeState {
  return {
    users: {}, sessionUserId: null, photos: {}, videos: {}, wallets: {}, subscriptions: {}, introUsed: [],
    pending: [], devicePreviews: {}, ipPreviews: {}, reports: [], codes: {}, freePreviewEnabled: true, uploads: {},
  };
}

/** The demo's one visitor address: per-IP limits apply to the whole demo. */
export const DEMO_IP = '203.0.113.7';

/** Refusals before the moderation: the upload (bucket rules) or check-photo's own limit. */
export type DemoFailure = Exclude<UploadFailure, 'captcha'>;

type Keyword = [RegExp, PhotoRejection | DemoFailure];
const KEYWORDS: Keyword[] = [
  [/offline|uploadfail/, 'network'],
  [/toolarge|too-large|huge/, 'too_large'],
  [/badtype|bad-type/, 'bad_type'],
  [/dailycap|daily-cap/, 'daily_cap'],
  [/checklimit|check-limit/, 'rate_limited'],
  [/group|friends|couple|crowd|team/, 'several_subjects'],
  [/face|selfie|portrait|headshot|closeup/, 'body_not_visible'],
  [/kid|child|baby|toddler|teen/, 'looks_like_child'],
  [/nsfw|nude|naked|gun|weapon|blood/, 'unsafe_content'],
  [/empty|landscape|sky|food|car\b|building/, 'no_subject'],
  [/horse|bird|parrot|rabbit|bunny|hamster|fish|snake|lizard|cow/, 'unsupported_subject'],
];

const FAILURES: readonly string[] = ['network', 'too_large', 'bad_type', 'daily_cap', 'rate_limited'];

/** The fake moderation: a failure before it, a rejection code, or accepted with its demo clip. */
export function judgePhoto(fileName: string): { failure: DemoFailure } | { rejection: PhotoRejection } | { clip: DemoClip } {
  const name = fileName.toLowerCase();
  for (const [pattern, code] of KEYWORDS) {
    if (pattern.test(name)) return FAILURES.includes(code) ? { failure: code as DemoFailure } : { rejection: code as PhotoRejection };
  }
  if (/mamie|grandma|granny|nana/.test(name)) return { clip: 'mamie' };
  if (/dog|puppy|doggo/.test(name)) return { clip: 'dog' };
  if (/cat|kitten|kitty/.test(name)) return { clip: 'cat' };
  if (/woman|girl|lady|her/.test(name)) return { clip: 'woman' };
  return { clip: 'man' };
}

export class Refusal extends Error {
  constructor(readonly refusal: GenerationRefusal) {
    super(refusal);
  }
}

export function subscriptionActive(state: FakeState, userId: string, now: number): boolean {
  const sub = state.subscriptions[userId];
  return sub !== undefined && sub.since <= now && now < sub.expiresAt;
}

export function walletOf(state: FakeState, userId: string): { plan: number; bought: number } {
  return (state.wallets[userId] ??= { plan: 0, bought: 0 });
}

/** Applies what is due at [now]: webhook credits, video progress, failures and their refunds. */
export function settle(state: FakeState, now: number): void {
  const due = state.pending.filter((credit) => credit.at <= now).sort((a, b) => a.at - b.at);
  state.pending = state.pending.filter((credit) => credit.at > now);
  for (const credit of due) applyCredit(state, credit);
  for (const video of Object.values(state.videos)) advance(state, video, now);
}

function applyCredit(state: FakeState, credit: FakeCredit): void {
  const product = DEMO_PRODUCTS[credit.productId];
  const wallet = walletOf(state, credit.userId);
  if (product.kind === 'plan') {
    // grant_plan: the plan is reset to its coins, no carry-over (C3).
    const days = product.period === 'week' ? 7 : 365;
    state.subscriptions[credit.userId] = { productId: credit.productId as FakeSubscription['productId'], since: credit.at, expiresAt: credit.at + days * 86_400_000 };
    wallet.plan = product.coins;
    if (product.introMicros !== null && !state.introUsed.includes(credit.userId)) state.introUsed.push(credit.userId);
  } else {
    wallet.bought += product.coins; // credit_pack
  }
}

function advance(state: FakeState, video: FakeVideo, now: number): void {
  if (video.status === 'ready' || video.status === 'failed') return;
  const elapsed = now - Date.parse(video.createdAt);
  const queuedMs = video.isPreview ? 0 : DEMO_TIMING.queuedMs;
  if (elapsed < queuedMs) return;
  if (elapsed < queuedMs + video.renderMs && elapsed < DEMO_TIMING.timeoutMs) {
    video.status = 'rendering';
    video.progress = Math.min(95, Math.floor(((elapsed - queuedMs) / video.renderMs) * 100));
    return;
  }
  const at = new Date(Date.parse(video.createdAt) + Math.min(queuedMs + video.renderMs, DEMO_TIMING.timeoutMs)).toISOString();
  const outcome = elapsed >= DEMO_TIMING.timeoutMs && queuedMs + video.renderMs > DEMO_TIMING.timeoutMs
    ? ({ status: 'failed', errorCode: 'timeout' } as const)
    : video.outcome;
  if (outcome.status === 'ready') {
    Object.assign(video, { status: 'ready', progress: 100, readyAt: at, resultPath: `${video.userId}/${video.id}.mp4` });
    return;
  }
  Object.assign(video, { status: 'failed', errorCode: outcome.errorCode });
  // fail_and_refund: back to the buckets debited, once (D14).
  if (!video.refunded && video.cost > 0) {
    const wallet = walletOf(state, video.userId);
    wallet.plan += video.debitedPlan;
    wallet.bought += video.debitedBought;
    video.coinsRefunded = video.cost;
    video.refunded = true;
  }
}

export interface StartInput { userId: string; danceId: string; photoId: string; consentAt: string | null; now: number; id: string }

function checkStart(state: FakeState, input: StartInput): FakePhoto {
  if (!input.consentAt) throw new Refusal('consent_missing');
  const photo = state.photos[input.photoId];
  if (!photo || photo.userId !== input.userId || photo.status !== 'accepted' || photo.erased) throw new Refusal('photo_not_checked');
  if (!DEMO_DANCES.some((dance) => dance.id === input.danceId)) throw new Refusal('dance_unavailable');
  return photo;
}

function newVideo(input: StartInput, photo: FakePhoto, fields: Partial<FakeVideo>): FakeVideo {
  const failing = /fail/.test(photo.name.toLowerCase());
  return {
    id: input.id, userId: input.userId, danceId: input.danceId, photoId: photo.id, status: 'queued', progress: 0,
    errorCode: null, isPreview: false, cost: 0, coinsRefunded: 0, createdAt: new Date(input.now).toISOString(),
    readyAt: null, resultPath: null, key: null, debitedPlan: 0, debitedBought: 0, clip: photo.clip,
    outcome: failing ? { status: 'failed', errorCode: 'body_not_detected' } : { status: 'ready' },
    renderMs: /slow/.test(photo.name.toLowerCase()) ? DEMO_TIMING.slowRenderMs : DEMO_TIMING.renderMs,
    refunded: false,
    ...fields,
  };
}

/** start_preview: free, not counted in C7; one per account, per browser and per IP (D113). */
export function startPreview(state: FakeState, input: StartInput & { deviceHash: string; ip: string }): FakeVideo {
  settle(state, input.now);
  if (!state.freePreviewEnabled) throw new Refusal('preview_already_used');
  const photo = checkStart(state, input);
  const usedByUser = Object.values(state.videos).some((video) => video.userId === input.userId && video.isPreview);
  if (usedByUser || state.devicePreviews[input.deviceHash] || state.ipPreviews[input.ip]) throw new Refusal('preview_already_used');
  const video = newVideo(input, photo, { isPreview: true, renderMs: DEMO_TIMING.previewMs, status: 'rendering' });
  state.videos[video.id] = video;
  state.devicePreviews[input.deviceHash] = input.userId;
  state.ipPreviews[input.ip] = input.userId;
  return video;
}

/** start_generation, in the order of the server (D104). */
export function startGeneration(state: FakeState, input: StartInput & { key: string }): FakeVideo {
  settle(state, input.now);
  const replay = Object.values(state.videos).find((video) => video.userId === input.userId && video.key === input.key);
  if (replay) return replay;
  const photo = checkStart(state, input);
  const dance = DEMO_DANCES.find((item) => item.id === input.danceId)!;
  const wallet = walletOf(state, input.userId);
  const active = subscriptionActive(state, input.userId, input.now);
  if (!active && wallet.bought < dance.cost) throw new Refusal('not_subscribed');
  const inProgress = Object.values(state.videos).filter(
    (video) => video.userId === input.userId && !video.isPreview && (video.status === 'queued' || video.status === 'rendering'),
  );
  if (inProgress.length >= 3) throw new Refusal('too_many_in_progress');
  const plan = active ? wallet.plan : 0;
  if (plan + wallet.bought < dance.cost) throw new Refusal('not_enough_coins');
  const debitedPlan = Math.min(plan, dance.cost);
  const debitedBought = dance.cost - debitedPlan;
  wallet.plan -= debitedPlan;
  wallet.bought -= debitedBought;
  const video = newVideo(input, photo, { key: input.key, cost: dance.cost, debitedPlan, debitedBought });
  state.videos[video.id] = video;
  return video;
}

/** What the RevenueCat webhook will apply once it lands. */
export function recordPurchase(state: FakeState, userId: string, productId: DemoProductId, now: number): void {
  state.pending.push({ userId, productId, at: now + DEMO_TIMING.webhookMs });
}

/** delete_user_media: photos and videos gone, coins and plan kept. */
export function deleteMedia(state: FakeState, userId: string): void {
  for (const photo of Object.values(state.photos)) if (photo.userId === userId) delete state.photos[photo.id];
  for (const video of Object.values(state.videos)) if (video.userId === userId) delete state.videos[video.id];
}
