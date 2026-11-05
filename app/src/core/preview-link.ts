// The free preview plays from a short signed URL (preview-url, private
// bucket previews, 120 s by default, D130): asked again a little before it
// expires, and at once when the player says it cannot play it (expired,
// revoked, network), a few times at most. Never a download link.
import type { PreviewLink } from './types';

/** Asked again this long before the link expires (a quarter of its life for short links). */
export const REFRESH_MARGIN_MS = 20_000;
export const MIN_REFRESH_MS = 1_000;
/** Player errors in a row that get a new link; then the error state and its Try again. */
export const MAX_ERROR_RELOADS = 3;

export type PreviewLinkState =
  | { status: 'loading' }
  | { status: 'ready'; link: PreviewLink }
  | { status: 'missing' }
  | { status: 'error' };

/** When to ask preview-url again for [link]. */
export function refreshDelay(link: PreviewLink, now: number): number {
  const life = link.expiresAt - now;
  const margin = Math.min(REFRESH_MARGIN_MS, life / 4);
  return Math.max(MIN_REFRESH_MS, Math.floor(life - margin));
}

export interface KeeperClock {
  now(): number;
  setTimeout(run: () => void, ms: number): unknown;
  clearTimeout(timer: unknown): void;
}

const realClock: KeeperClock = {
  now: () => Date.now(),
  setTimeout: (run, ms) => setTimeout(run, ms),
  clearTimeout: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
};

export class PreviewLinkKeeper {
  private timer: unknown = null;
  private stopped = false;
  private errors = 0;
  private pending: Promise<void> | null = null;

  constructor(
    private readonly load: () => Promise<PreviewLink | null>,
    private readonly onState: (state: PreviewLinkState) => void,
    private readonly clock: KeeperClock = realClock,
  ) {}

  start(): Promise<void> {
    return this.refresh();
  }

  /** The <video> fired error: a new URL, unless it already failed MAX_ERROR_RELOADS times in a row. */
  playerError(): Promise<void> {
    if (this.stopped) return Promise.resolve();
    if (this.errors >= MAX_ERROR_RELOADS) {
      this.cancelTimer();
      this.onState({ status: 'error' });
      return Promise.resolve();
    }
    this.errors++;
    return this.refresh();
  }

  /** The player plays: the error count starts again. */
  playing(): void {
    this.errors = 0;
  }

  /** Try again from the error state. */
  retry(): Promise<void> {
    this.errors = 0;
    this.onState({ status: 'loading' });
    return this.refresh();
  }

  stop(): void {
    this.stopped = true;
    this.cancelTimer();
  }

  private cancelTimer(): void {
    if (this.timer !== null) this.clock.clearTimeout(this.timer);
    this.timer = null;
  }

  private refresh(): Promise<void> {
    if (this.stopped) return Promise.resolve();
    this.pending ??= this.load()
      .then(
        (link) => {
          if (this.stopped) return;
          this.cancelTimer();
          if (!link) {
            this.onState({ status: 'missing' });
            return;
          }
          this.onState({ status: 'ready', link });
          this.timer = this.clock.setTimeout(() => {
            this.timer = null;
            void this.refresh();
          }, refreshDelay(link, this.clock.now()));
        },
        () => {
          if (!this.stopped) this.onState({ status: 'error' });
        },
      )
      .finally(() => {
        this.pending = null;
      });
    return this.pending;
  }
}
