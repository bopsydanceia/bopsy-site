// Moving catalogue cards (D145): each card plays the muted demo of its move
// while it is on screen, so a scroll shows every move at once. Loaded lazily
// by the catalogue (never in the first chunk), after its first paint.
//
// Budget for in-app browsers on 4G (TikTok, Instagram): the poster stays
// under the video; a clip gets its src and plays only while its card is at
// least half visible, and is paused and released (src removed, load()) when
// it leaves; at most 4 clips play at once on a phone, 8 on a computer
// (>= 900 px); preload="none"; nothing moves with prefers-reduced-motion or
// Save-Data.

/** A card clip the pool can start and stop. */
export interface Clip {
  start(): void;
  stop(): void;
}

/**
 * Which visible clips play: the first ones to come into view, up to [cap];
 * when a playing clip leaves, the longest-waiting visible one takes its place.
 */
export class PlaybackPool<T extends Clip = Clip> {
  private readonly playing = new Set<T>();
  /** Visible clips waiting for a free slot, oldest first. */
  private readonly waiting: T[] = [];

  constructor(private readonly cap: number) {}

  show(clip: T): void {
    if (this.playing.has(clip) || this.waiting.includes(clip)) return;
    if (this.playing.size < this.cap) {
      this.playing.add(clip);
      clip.start();
    } else {
      this.waiting.push(clip);
    }
  }

  hide(clip: T): void {
    const index = this.waiting.indexOf(clip);
    if (index >= 0) this.waiting.splice(index, 1);
    if (!this.playing.delete(clip)) return;
    clip.stop();
    const next = this.waiting.shift();
    if (next) {
      this.playing.add(next);
      next.start();
    }
  }

  isPlaying(clip: T): boolean {
    return this.playing.has(clip);
  }

  get playingCount(): number {
    return this.playing.size;
  }
}

/** Simultaneous clips: 8 on a computer (>= 900 px), 4 on a phone. */
export function playCap(wide: boolean): number {
  return wide ? 8 : 4;
}

interface ConnectionLike {
  saveData?: boolean;
}

/** False when the visitor asked for less motion or less data: posters only. */
export function motionAllowed(win: Window = window): boolean {
  const reduced = typeof win.matchMedia === 'function' && win.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const saveData = (win.navigator as Navigator & { connection?: ConnectionLike }).connection?.saveData === true;
  return !reduced && !saveData && typeof (win as Window & { IntersectionObserver?: unknown }).IntersectionObserver === 'function';
}

class VideoClip implements Clip {
  constructor(
    readonly video: HTMLVideoElement,
    private readonly src: string,
  ) {}

  start(): void {
    const video = this.video;
    video.muted = true;
    video.defaultMuted = true;
    if (video.getAttribute('src') !== this.src) video.setAttribute('src', this.src);
    try {
      // iOS and in-app WebViews may refuse or reject play(): the poster stays.
      const played = video.play();
      if (played && typeof played.catch === 'function') played.catch(() => undefined);
    } catch {
      /* the poster stays */
    }
  }

  stop(): void {
    const video = this.video;
    video.pause();
    video.classList.remove('on');
    video.removeAttribute('src');
    video.load(); // releases the decoder and the buffered bytes
  }
}

let pool: PlaybackPool<VideoClip> | null = null;
let observer: IntersectionObserver | null = null;
const clips = new WeakMap<Element, VideoClip>();

function shared(): { pool: PlaybackPool<VideoClip>; observer: IntersectionObserver } {
  if (!pool || !observer) {
    const wide = window.matchMedia('(min-width: 900px)').matches;
    const p = new PlaybackPool<VideoClip>(playCap(wide));
    pool = p;
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const clip = clips.get(entry.target);
          if (!clip) continue;
          if (entry.isIntersecting && entry.intersectionRatio >= 0.5) p.show(clip);
          else p.hide(clip);
        }
      },
      { threshold: [0, 0.5] },
    );
  }
  return { pool, observer };
}

/** Plays [video] with [src] while its card is half visible; returns the cleanup. */
export function watchCardVideo(video: HTMLVideoElement, src: string): () => void {
  if (!motionAllowed()) return () => undefined;
  const { pool: p, observer: o } = shared();
  const clip = new VideoClip(video, src);
  const reveal = () => video.classList.add('on');
  video.addEventListener('playing', reveal);
  clips.set(video, clip);
  o.observe(video);
  return () => {
    o.unobserve(video);
    p.hide(clip);
    clips.delete(video);
    video.removeEventListener('playing', reveal);
  };
}
