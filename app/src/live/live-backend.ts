// The real backend (D117): Supabase tables under RLS, Storage, Realtime and
// the Edge Functions of the contract (check-photo, start-preview,
// start-generation, delete-media). The user id always comes from the
// session's JWT on the server, never from a body (D114).
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import type { Backend } from '../core/ports';
import { browserToken, uuid } from '../core/store';
import { isRefusal, isRejection, type Account, type Dance, type PhotoCheckResult, type ReportReason, type StartResult, type Video, type Wallet } from '../core/types';
import { fetchDances } from './catalog';
import { LiveAuth } from './live-auth';
import { subscriptionFromRow, VIDEO_COLUMNS, videoFromRow, walletFromRow, type SubscriptionRow, type VideoRow, type WalletRow } from './rows';

const POLL_MS = 5_000;
/** Shared links of a video work this long ("Link copied. It works for 7 days."). */
const SIGNED_URL_SECONDS = 7 * 24 * 3600;

const EXTENSIONS: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif' };

/** 409 {"refusal"} of the start functions, anything else is a failure to retry. */
async function startResult(call: Promise<{ data: unknown; error: unknown }>): Promise<StartResult> {
  try {
    const { data, error } = await call;
    if (!error) {
      const row = (data as { video?: VideoRow } | null)?.video;
      return row ? { kind: 'started', video: videoFromRow(row) } : { kind: 'failed' };
    }
    const context = (error as { context?: unknown }).context;
    if (context instanceof Response && context.status === 409) {
      const body = (await context.json().catch(() => null)) as { refusal?: unknown } | null;
      if (isRefusal(body?.refusal)) return { kind: 'refused', refusal: body.refusal };
    }
    return { kind: 'failed' };
  } catch {
    return { kind: 'failed' };
  }
}

export class LiveBackend implements Backend {
  readonly demo = false;
  readonly auth = new LiveAuth();

  private client(): Promise<SupabaseClient> {
    return this.auth.client();
  }

  async dances(): Promise<Dance[]> {
    return fetchDances();
  }

  async estimatedMinutes(): Promise<number> {
    try {
      const client = await this.client();
      const { data } = await client.from('app_config').select('value').eq('key', 'estimated_minutes').maybeSingle();
      const minutes = Number((data as { value?: unknown } | null)?.value);
      return Number.isFinite(minutes) && minutes > 0 ? minutes : 2;
    } catch {
      return 2;
    }
  }

  async checkPhoto(file: Blob): Promise<PhotoCheckResult> {
    try {
      const session = await this.auth.ensureSession();
      const client = await this.client();
      const type = EXTENSIONS[file.type] ? file.type : 'image/jpeg';
      const path = `${session.userId}/${uuid()}.${EXTENSIONS[type]}`;
      const upload = await client.storage.from('photos').upload(path, file, { contentType: type, upsert: false });
      if (upload.error) return { status: 'failed' };
      const { data, error } = await client.functions.invoke('check-photo', { body: { photo_path: path } });
      if (error) return { status: 'failed' };
      const body = data as { status?: string; photo_id?: string; reason?: unknown };
      if (body.status === 'accepted' && body.photo_id) return { status: 'accepted', photoId: body.photo_id, userId: session.userId };
      if (body.status === 'rejected' && isRejection(body.reason)) return { status: 'rejected', reason: body.reason };
      return { status: 'failed' };
    } catch {
      return { status: 'failed' };
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

  async startPreview(request: { danceId: string; photoId: string; consentAt: string }): Promise<StartResult> {
    const client = await this.client();
    return startResult(
      client.functions.invoke('start-preview', {
        body: { dance_id: request.danceId, photo_id: request.photoId, consent_at: request.consentAt, device_token: browserToken() },
      }),
    );
  }

  async startGeneration(request: { danceId: string; photoId: string; consentAt: string; idempotencyKey: string }): Promise<StartResult> {
    const client = await this.client();
    return startResult(
      client.functions.invoke('start-generation', {
        body: { dance_id: request.danceId, photo_id: request.photoId, consent_at: request.consentAt, idempotency_key: request.idempotencyKey },
      }),
    );
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
    if (!video.resultPath) return null;
    const client = await this.client();
    const { data } = await client.storage.from('results').createSignedUrl(video.resultPath, SIGNED_URL_SECONDS, download ? { download } : undefined);
    return data?.signedUrl ?? null;
  }

  async account(): Promise<Account | null> {
    if (!this.auth.current()) return null;
    const client = await this.client();
    const [wallet, subscription] = await Promise.all([
      client.from('wallets').select('plan_balance,bought_balance,total').maybeSingle(),
      client.from('subscriptions').select('period,status,expires_at,renews_at').maybeSingle(),
    ]);
    if (wallet.error || subscription.error) return null;
    const sub = subscriptionFromRow(subscription.data as SubscriptionRow | null, Date.now());
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

  async report(videoId: string, reason: ReportReason, note: string): Promise<boolean> {
    try {
      const client = await this.client();
      const { error } = await client.from('reports').insert({ video_id: videoId, reason, note: note.trim() || null });
      return !error;
    } catch {
      return false;
    }
  }

  async deleteMedia(): Promise<boolean> {
    try {
      const client = await this.client();
      const { error } = await client.functions.invoke('delete-media', { body: {} });
      return !error;
    } catch {
      return false;
    }
  }
}
