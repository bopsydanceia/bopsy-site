// Rows of the Supabase tables (PostgREST JSON) mapped to the app's types.
import type { Dance, DanceFamily, Subscription, Video, VideoStatus, Wallet } from '../core/types';

export interface DanceRow {
  id: string;
  slug: string;
  name: string;
  family: string | null;
  preview_url: string | null;
  /** Absent when the catalogue was read without it (anon not granted the column yet). */
  preview_video_url?: string | null;
  cost: number;
  duration_seconds: number;
  is_new: boolean;
  is_hot: boolean;
  sort: number;
}

export const DANCE_COLUMNS = 'id,slug,name,family,preview_url,cost,duration_seconds,is_new,is_hot,sort';
/** The catalogue with the demo clips of the cards (needs the column grant of preview_video_url to anon). */
export const DANCE_COLUMNS_WITH_VIDEO = `${DANCE_COLUMNS},preview_video_url`;

const FAMILIES: DanceFamily[] = ['trends', 'memes', 'party', 'victory', 'pets'];

/** Posters must be public https URLs for the web (no signed URL before a session); http only for a local server. */
function publicUrl(value: string | null): string | null {
  return value && /^(https:\/\/|http:\/\/(localhost|127\.0\.0\.1)[:/])/.test(value) ? value : null;
}

export function danceFromRow(row: DanceRow): Dance {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    family: FAMILIES.includes(row.family as DanceFamily) ? (row.family as DanceFamily) : 'trends',
    posterUrl: publicUrl(row.preview_url),
    previewVideoUrl: publicUrl(row.preview_video_url ?? null),
    cost: row.cost,
    durationSeconds: row.duration_seconds,
    isNew: row.is_new,
    isHot: row.is_hot,
    sort: row.sort,
  };
}

export interface VideoRow {
  id: string;
  dance_id: string;
  photo_id: string | null;
  status: VideoStatus;
  progress: number;
  error_code: string | null;
  is_preview: boolean;
  cost: number;
  coins_refunded: number;
  created_at: string;
  ready_at: string | null;
  result_path: string | null;
}

export const VIDEO_COLUMNS = 'id,dance_id,photo_id,status,progress,error_code,is_preview,cost,coins_refunded,created_at,ready_at,result_path';

export function videoFromRow(row: VideoRow): Video {
  return {
    id: row.id,
    danceId: row.dance_id,
    photoId: row.photo_id,
    status: row.status,
    progress: row.progress ?? 0,
    errorCode: row.error_code,
    isPreview: row.is_preview,
    cost: row.cost ?? 0,
    coinsRefunded: row.coins_refunded ?? 0,
    createdAt: row.created_at,
    readyAt: row.ready_at,
    resultPath: row.result_path,
  };
}

export interface WalletRow {
  plan_balance: number;
  bought_balance: number;
  total: number;
}

export function walletFromRow(row: WalletRow | null, planSpendable: boolean): Wallet {
  if (!row) return { plan: 0, bought: 0, total: 0 };
  // C4: plan coins only count with the entitlement active.
  const plan = planSpendable ? row.plan_balance : 0;
  return { plan, bought: row.bought_balance, total: plan + row.bought_balance };
}

export interface SubscriptionRow {
  period: 'weekly' | 'yearly';
  status: 'active' | 'expired';
  expires_at: string;
  renews_at: string | null;
}

export function subscriptionFromRow(row: SubscriptionRow | null, now: number): Subscription | null {
  if (!row) return null;
  return { active: row.status === 'active' && Date.parse(row.expires_at) > now, period: row.period, renewsAt: row.renews_at };
}
