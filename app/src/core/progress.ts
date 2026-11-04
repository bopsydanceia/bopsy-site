// Progress of a video (15, C21 to C23): the server estimate and an estimate
// from app_config estimated_minutes, whichever is further, capped at 95 %
// until the video is ready; past the estimate, "Taking a bit longer".
import type { Video } from './types';

export const PROGRESS_CAP = 95;

/** Rises fast then slows down: about 78 % at the estimate, never above the cap. */
export function estimatedProgress(elapsedMs: number, estimateMs: number): number {
  if (elapsedMs <= 0 || estimateMs <= 0) return 0;
  return Math.min(PROGRESS_CAP, Math.floor(PROGRESS_CAP * (1 - Math.exp((-1.7 * elapsedMs) / estimateMs))));
}

function elapsed(video: Pick<Video, 'createdAt'>, now: number): number {
  const created = Date.parse(video.createdAt);
  return Number.isNaN(created) ? 0 : now - created;
}

export function displayProgress(video: Pick<Video, 'status' | 'progress' | 'createdAt'>, now: number, estimatedMinutes: number): number {
  if (video.status === 'ready') return 100;
  if (video.status === 'queued') return 0;
  if (video.status === 'failed') return Math.min(PROGRESS_CAP, video.progress);
  const estimate = estimatedProgress(elapsed(video, now), estimatedMinutes * 60_000);
  return Math.min(PROGRESS_CAP, Math.max(video.progress, estimate));
}

/** Past createdAt + estimatedMinutes while still queued or rendering (E14). */
export function isTakingLonger(video: Pick<Video, 'status' | 'createdAt'>, now: number, estimatedMinutes: number): boolean {
  if (video.status !== 'queued' && video.status !== 'rendering') return false;
  return Date.parse(video.createdAt) + estimatedMinutes * 60_000 <= now;
}

/** "About N min left", at least 1 while rendering. */
export function minutesLeft(video: Pick<Video, 'createdAt'>, now: number, estimatedMinutes: number): number {
  const leftMs = estimatedMinutes * 60_000 - elapsed(video, now);
  return Math.max(1, Math.ceil(leftMs / 60_000));
}
