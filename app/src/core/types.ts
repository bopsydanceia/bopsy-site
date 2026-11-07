// Domain types shared by the screens, the flow and both backends (demo and
// live). Codes mirror the Edge Functions contract (supabase/functions/
// README.md and _shared/contract.ts of the app repo) and the SQL enums.
import type { RateLimited } from './limits';

export type DanceFamily = 'trends' | 'memes' | 'party' | 'victory' | 'pets';

export interface Dance {
  id: string;
  slug: string;
  name: string;
  family: DanceFamily;
  posterUrl: string | null;
  /** Muted looping demo of the move (dances.preview_video_url), played by the catalogue cards; null: poster only. */
  previewVideoUrl: string | null;
  cost: number;
  durationSeconds: number;
  isNew: boolean;
  isHot: boolean;
  sort: number;
}

/** photos.rejection_code, check-photo {"status":"rejected","reason"}. */
export const PHOTO_REJECTIONS = [
  'several_subjects',
  'body_not_visible',
  'looks_like_child',
  'unsafe_content',
  'no_subject',
  'unsupported_subject',
] as const;
export type PhotoRejection = (typeof PHOTO_REJECTIONS)[number];

/** start-generation and start-preview 409 {"refusal"}. */
export const GENERATION_REFUSALS = [
  'not_subscribed',
  'not_enough_coins',
  'consent_missing',
  'photo_not_checked',
  'too_many_in_progress',
  'preview_already_used',
  'dance_unavailable',
] as const;
export type GenerationRefusal = (typeof GENERATION_REFUSALS)[number];

export const REPORT_REASONS = ['sexual', 'violent', 'child', 'no_permission', 'other'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export type VideoStatus = 'queued' | 'rendering' | 'ready' | 'failed';

/** A row of public.videos, as the app needs it. */
export interface Video {
  id: string;
  danceId: string;
  photoId: string | null;
  status: VideoStatus;
  /** Server estimate, 0 to 95 before ready, 100 once ready (C22). */
  progress: number;
  /** body_not_detected, timeout, provider_error (or unknown). */
  errorCode: string | null;
  isPreview: boolean;
  cost: number;
  coinsRefunded: number;
  createdAt: string;
  readyAt: string | null;
  resultPath: string | null;
}

/** public.wallets: plan coins (reset each period) and bought coins. */
export interface Wallet {
  plan: number;
  bought: number;
  total: number;
}

export interface Subscription {
  active: boolean;
  period: 'weekly' | 'yearly';
  renewsAt: string | null;
}

export interface Account {
  wallet: Wallet;
  subscription: Subscription | null;
}

/** The visitor's Supabase session. A guest has no email yet (see DECISIONS). */
export interface Session {
  userId: string;
  email: string | null;
  guest: boolean;
}

/**
 * Why a photo was not checked: network (or the server failed: try again),
 * the limits of check-photo (rate_limited) and of the photos bucket
 * (daily_cap: uploads per day; too_large: over 10 MB; bad_type: not JPEG,
 * PNG, WebP or HEIC), or the CAPTCHA of the guest session.
 */
export type UploadFailure = 'network' | 'rate_limited' | 'daily_cap' | 'too_large' | 'bad_type' | 'captcha';

/** A photo already in the bucket: check-photo can be asked again without a new upload. */
export interface UploadedPhoto {
  photoPath: string;
  userId: string;
}

export type PhotoCheckResult =
  | { status: 'accepted'; photoId: string; userId: string }
  | { status: 'rejected'; reason: PhotoRejection }
  | { status: 'failed'; reason: UploadFailure; retryAfter?: number; uploaded?: UploadedPhoto };

export interface StartRequest {
  danceId: string;
  photoId: string;
  consentAt: string;
}

/**
 * The answer of start-preview and start-generation. preview_unavailable:
 * free previews are off on the server (503 preview_unavailable, 403
 * origin_not_allowed); captcha_failed: Turnstile refused twice.
 */
export type StartResult =
  | { kind: 'started'; video: Video }
  | { kind: 'refused'; refusal: GenerationRefusal }
  | RateLimited
  | { kind: 'preview_unavailable' }
  | { kind: 'captcha_failed' }
  | { kind: 'failed' };

/** A signed URL of a ready preview (preview-url, private bucket previews): it expires. */
export interface PreviewLink {
  url: string;
  /** Epoch ms after which the URL no longer plays. */
  expiresAt: number;
  thumbnailUrl: string | null;
}

export type ReportResult = { kind: 'sent' } | RateLimited | { kind: 'failed' };

export function isRefusal(value: unknown): value is GenerationRefusal {
  return typeof value === 'string' && (GENERATION_REFUSALS as readonly string[]).includes(value);
}

export function isRejection(value: unknown): value is PhotoRejection {
  return typeof value === 'string' && (PHOTO_REJECTIONS as readonly string[]).includes(value);
}

/** True once the video will not change any more. */
export function isFinal(video: Pick<Video, 'status'>): boolean {
  return video.status === 'ready' || video.status === 'failed';
}
