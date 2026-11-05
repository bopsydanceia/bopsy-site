// The real backend (D117): Supabase tables under RLS, Storage, Realtime and
// the Edge Functions of the contract (check-photo, start-preview,
// preview-url, start-generation, delete-media; supabase/functions/README.md
// of the app repo). The user id always comes from the session's JWT on the
// server, never from a body (D114). Every call reads the common 429 of the
// limits (D131); start-preview sends platform "web" and a fresh Turnstile
// token (D130, D132); a preview plays from a short signed URL, never a
// download.
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { parsePostgrestRateLimit, secondsToUtcMidnight } from '../core/limits';
import { MAX_UPLOAD_BYTES, uploadType } from '../core/image';
import { CaptchaFailed, type Backend } from '../core/ports';
import { browserToken, uuid } from '../core/store';
import {
  isRefusal,
  isRejection,
  type Account,
  type Dance,
  type PhotoCheckResult,
  type PreviewLink,
  type ReportReason,
  type ReportResult,
  type StartResult,
  type UploadedPhoto,
  type Video,
  type Wallet,
} from '../core/types';
import { fetchDances } from './catalog';
import { bodyField, invokeFunction, storageFailure, type FunctionAnswer } from './errors';
import { lazyCaptcha, LiveAuth } from './live-auth';
import { subscriptionFromRow, VIDEO_COLUMNS, videoFromRow, walletFromRow, type SubscriptionRow, type VideoRow, type WalletRow } from './rows';
import type { CaptchaPort } from './turnstile';

const POLL_MS = 5_000;
/** Shared links of a video work this long ("Link copied. It works for 7 days."). */
const SIGNED_URL_SECONDS = 7 * 24 * 3600;
/** A lost answer of check-photo is asked again once after this long (same file, free: the stored verdict). */
export const CHECK_RETRY_MS = 1_000;

const EXTENSIONS: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic' };

/** 200 {"video"}, 409 {"refusal"}, the common 429; previews off for start-preview. */
function startResult(answer: FunctionAnswer<{ video?: VideoRow } | null>, preview: boolean): StartResult {
  if (answer.ok) {
    const row = answer.data?.video;
    return row ? { kind: 'started', video: videoFromRow(row) } : { kind: 'failed' };
  }
  if (answer.kind === 'network') return { kind: 'failed' };
  if (answer.limit) return answer.limit;
  const refusal = bodyField(answer, 'refusal');
  if (answer.status === 409 && isRefusal(refusal)) return { kind: 'refused', refusal };
  // D130: previews switched off (no Turnstile secret or IP secret on the
  // server), or this origin is not the site's: no free preview for now.
  if (preview && ((answer.status === 503 && answer.code === 'preview_unavailable') || (answer.status === 403 && answer.code === 'origin_not_allowed'))) {
    return { kind: 'preview_unavailable' };
  }
  return { kind: 'failed' };
}

export interface LiveBackendDeps {
  auth?: LiveAuth;
  captcha?: CaptchaPort;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export class LiveBackend implements Backend {
  readonly demo = false;
  readonly auth: LiveAuth;
  private readonly captcha: CaptchaPort;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;

  constructor(deps: LiveBackendDeps = {}) {
    this.captcha = deps.captcha ?? lazyCaptcha;
    this.auth = deps.auth ?? new LiveAuth({ captcha: this.captcha });
    this.sleep = deps.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.now = deps.now ?? Date.now;
  }

  private client(): Promise<SupabaseClient> {
    return this.auth.client();
  }

  async dances(): Promise<Dance[]> {
    return fetchDances();
  }

  async estimatedMinutes(): Promise<number> {
    // app_config is read by signed-in users only; a new visitor keeps the
    // default without loading supabase-js on the first screen.
    if (!this.auth.current()) return 2;
    try {
      const client = await this.client();
      const { data } = await client.from('app_config').select('value').eq('key', 'estimated_minutes').maybeSingle();
      const minutes = Number((data as { value?: unknown } | null)?.value);
      return Number.isFinite(minutes) && minutes > 0 ? minutes : 2;
    } catch {
      return 2;
    }
  }

  async checkPhoto(file: Blob, _fileName: string, uploaded?: UploadedPhoto): Promise<PhotoCheckResult> {
    let client: SupabaseClient;
    let userId: string;
    try {
      userId = (await this.auth.ensureSession()).userId;
      client = await this.client();
    } catch (error) {
      return { status: 'failed', reason: error instanceof CaptchaFailed ? 'captcha' : 'network' };
    }
    let path: string;
    if (uploaded && uploaded.userId === userId) {
      path = uploaded.photoPath; // already in the bucket: no second upload (30 per day, D131)
    } else {
      // The bucket's own rules, checked before sending anything.
      const type = uploadType(file.type);
      if (!type) return { status: 'failed', reason: 'bad_type' };
      if (file.size > MAX_UPLOAD_BYTES) return { status: 'failed', reason: 'too_large' };
      path = `${userId}/${uuid()}.${EXTENSIONS[type]}`;
      try {
        const upload = await client.storage.from('photos').upload(path, file, { contentType: type, upsert: false });
        if (upload.error) {
          const reason = storageFailure(upload.error);
          return reason === 'daily_cap' ? { status: 'failed', reason, retryAfter: secondsToUtcMidnight(this.now()) } : { status: 'failed', reason };
        }
      } catch {
        return { status: 'failed', reason: 'network' };
      }
    }
    const ref: UploadedPhoto = { photoPath: path, userId };
    for (let attempt = 1; ; attempt++) {
      const answer = await invokeFunction<{ status?: string; photo_id?: string; reason?: unknown }>(client, 'check-photo', { photo_path: path }, 'photo_check');
      if (answer.ok) {
        const body = answer.data ?? {};
        if (body.status === 'accepted' && body.photo_id) return { status: 'accepted', photoId: body.photo_id, userId };
        if (body.status === 'rejected' && isRejection(body.reason)) return { status: 'rejected', reason: body.reason };
        return { status: 'failed', reason: 'network', uploaded: ref };
      }
      if (answer.kind === 'http' && answer.limit) return { status: 'failed', reason: 'rate_limited', retryAfter: answer.limit.retryAfter, uploaded: ref };
      if (answer.kind === 'network' && attempt === 1) {
        await this.sleep(CHECK_RETRY_MS);
        continue;
      }
      // The file stays usable after a lost answer or a server failure (502
      // moderation silent); not after 403, 404 or 409 (not this user's, gone).
      const keep = answer.kind === 'network' || answer.status >= 500;
      return keep ? { status: 'failed', reason: 'network', uploaded: ref } : { status: 'failed', reason: 'network' };
    }
  }

  async photoUrl(photoId: string): Promise<string | null> {
    try {
      const client = await this.client();
      const { data } = await client.from('photos').select('storage_path,erased_at').eq('id', photoId).maybeSingle();
      const row = data as { storage_path: string; erased_at: string | null } | null;
      if (!row || row.erased_at) return null;
      const signed = await client.storage.from('photos').createSignedUrl(row.storage_path, 3600);
      return signed.data?.signedUrl ?? null;
    } catch {
      return null;
    }
  }

  /**
   * D130, D132: platform "web" and a Turnstile token used once; a refused
   * token (403 captcha_failed) gets one more try with a fresh one.
   */
  async startPreview(request: { danceId: string; photoId: string; consentAt: string }): Promise<StartResult> {
    let client: SupabaseClient;
    try {
      client = await this.client();
    } catch {
      return { kind: 'failed' };
    }
    const body = { dance_id: request.danceId, photo_id: request.photoId, consent_at: request.consentAt, device_token: browserToken(), platform: 'web' };
    for (let attempt = 1; ; attempt++) {
      let captchaToken: string;
      try {
        captchaToken = await this.captcha.token('preview');
      } catch {
        return { kind: 'captcha_failed' };
      }
      const answer = await invokeFunction<{ video?: VideoRow } | null>(client, 'start-preview', { ...body, captcha_token: captchaToken }, 'preview');
      const refusedToken = !answer.ok && answer.kind === 'http' && answer.status === 403 && answer.code === 'captcha_failed';
      if (!refusedToken) return startResult(answer, true);
      if (attempt >= 2) return { kind: 'captcha_failed' };
    }
  }

  async startGeneration(request: { danceId: string; photoId: string; consentAt: string; idempotencyKey: string }): Promise<StartResult> {
    let client: SupabaseClient;
    try {
      client = await this.client();
    } catch {
      return { kind: 'failed' };
    }
    const answer = await invokeFunction<{ video?: VideoRow } | null>(
      client,
      'start-generation',
      { dance_id: request.danceId, photo_id: request.photoId, consent_at: request.consentAt, idempotency_key: request.idempotencyKey },
      'generation',
    );
    return startResult(answer, false);
  }

  async video(id: string): Promise<Video | null> {
    const client = await this.client();
    const { data, error } = await client.from('videos').select(VIDEO_COLUMNS).eq('id', id).maybeSingle();
    if (error) throw error;
    return data ? videoFromRow(data as unknown as VideoRow) : null;
  }

  watchVideo(id: string, listener: (video: Video) => void): () => void {
    let stopped = false;
    let channel: RealtimeChannel | null = null;
    const refresh = () => void this.video(id).then((video) => !stopped && video && listener(video)).catch(() => undefined);
    const poll = setInterval(refresh, POLL_MS); // Realtime blocked or late: the row is read again
    void this.client().then((client) => {
      if (stopped) return;
      channel = client
        .channel(`video-${id}`)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'videos', filter: `id=eq.${id}` }, (payload) => {
          if (!stopped) listener(videoFromRow(payload.new as VideoRow));
        })
        .subscribe();
      refresh();
    });
    return () => {
      stopped = true;
      clearInterval(poll);
      if (channel) void this.client().then((client) => client.removeChannel(channel!));
    };
  }

  async videos(): Promise<Video[]> {
    const client = await this.client();
    const { data, error } = await client.from('videos').select(VIDEO_COLUMNS).eq('is_preview', false).order('created_at', { ascending: false }).limit(60);
    if (error) throw error;
    return (data as unknown as VideoRow[]).map(videoFromRow);
  }

  async videoUrl(video: Video, download?: string): Promise<string | null> {
    // A preview lives in the private bucket previews: preview-url only, never a download.
    if (video.isPreview || !video.resultPath) return null;
    const client = await this.client();
    const { data } = await client.storage.from('results').createSignedUrl(video.resultPath, SIGNED_URL_SECONDS, download ? { download } : undefined);
    return data?.signedUrl ?? null;
  }

  /** preview-url: null when the preview is not found (404), throws when the server could not be reached. */
  async previewUrl(videoId: string): Promise<PreviewLink | null> {
    const client = await this.client();
    const asked = this.now();
    const answer = await invokeFunction<{ url?: unknown; expires_in?: unknown; thumbnail_url?: unknown }>(client, 'preview-url', { video_id: videoId }, 'preview');
    if (!answer.ok) {
      if (answer.kind === 'http' && answer.status === 404) return null;
      throw new Error(answer.kind === 'http' ? `preview-url ${answer.status}` : 'preview-url unreachable');
    }
    const { url, expires_in: expiresIn, thumbnail_url: thumbnail } = answer.data ?? {};
    if (typeof url !== 'string' || !url) throw new Error('preview-url without url');
    const seconds = typeof expiresIn === 'number' && expiresIn > 0 ? expiresIn : 120;
    return { url, expiresAt: asked + seconds * 1000, thumbnailUrl: typeof thumbnail === 'string' && thumbnail ? thumbnail : null };
  }

  async account(): Promise<Account | null> {
    if (!this.auth.current()) return null;
    const client = await this.client();
    const [wallet, subscription] = await Promise.all([
      client.from('wallets').select('plan_balance,bought_balance,total').maybeSingle(),
      client.from('subscriptions').select('period,status,expires_at,renews_at').maybeSingle(),
    ]);
    if (wallet.error || subscription.error) return null;
    const sub = subscriptionFromRow(subscription.data as SubscriptionRow | null, this.now());
    return { wallet: walletFromRow(wallet.data as WalletRow | null, sub?.active === true), subscription: sub };
  }

  watchWallet(listener: (wallet: Wallet | null) => void): () => void {
    let stopped = false;
    let channel: RealtimeChannel | null = null;
    const refresh = () => void this.account().then((account) => !stopped && listener(account?.wallet ?? null)).catch(() => undefined);
    const userId = this.auth.current()?.userId;
    if (!userId) {
      listener(null);
      return () => undefined;
    }
    void this.client().then((client) => {
      if (stopped) return;
      channel = client
        .channel(`wallet-${userId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'wallets', filter: `user_id=eq.${userId}` }, refresh)
        .subscribe();
      refresh();
    });
    return () => {
      stopped = true;
      if (channel) void this.client().then((client) => client.removeChannel(channel!));
    };
  }

  /** D131: the daily limit is a PostgREST error PT429 (HTTP 429), verdict in details. */
  async report(videoId: string, reason: ReportReason, note: string): Promise<ReportResult> {
    try {
      const client = await this.client();
      const { error, status } = await client.from('reports').insert({ video_id: videoId, reason, note: note.trim() || null });
      if (!error) return { kind: 'sent' };
      return parsePostgrestRateLimit(error, status, 'report') ?? { kind: 'failed' };
    } catch {
      return { kind: 'failed' };
    }
  }

  async deleteMedia(): Promise<boolean> {
    try {
      const client = await this.client();
      // delete-media has no limit; a 429 would only be named after the fallback action.
      const answer = await invokeFunction(client, 'delete-media', {}, 'generation');
      return answer.ok;
    } catch {
      return false;
    }
  }
}
