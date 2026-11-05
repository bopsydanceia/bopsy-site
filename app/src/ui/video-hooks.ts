import { useEffect, useRef, useState } from 'preact/hooks';
import { PreviewLinkKeeper, type PreviewLinkState } from '../core/preview-link';
import type { Video } from '../core/types';
import { app } from './app-state';

export type VideoLoad = { status: 'loading' } | { status: 'missing' } | { status: 'error' } | { status: 'ok'; video: Video };

/** One video, followed by Realtime (or the demo ticker) until it is final. */
export function useVideo(id: string): [VideoLoad, () => void] {
  const [state, setState] = useState<VideoLoad>({ status: 'loading' });
  const [round, setRound] = useState(0);
  useEffect(() => {
    const { backend } = app().services;
    let alive = true;
    setState({ status: 'loading' });
    backend.video(id).then(
      (video) => alive && setState(video ? { status: 'ok', video } : { status: 'missing' }),
      () => alive && setState({ status: 'error' }),
    );
    const stop = backend.watchVideo(id, (video) => alive && setState({ status: 'ok', video }));
    return () => {
      alive = false;
      stop();
    };
  }, [id, round]);
  return [state, () => setRound((r) => r + 1)];
}

/** A playable URL of a ready paid video (a preview has none: usePreviewLink). */
export function useVideoUrl(video: Video | null, download?: string): string | null {
  const [url, setUrl] = useState<string | null>(null);
  const ready = video?.status === 'ready';
  useEffect(() => {
    if (!video || !ready) return;
    let alive = true;
    app().services.backend.videoUrl(video, download).then((value) => alive && setUrl(value), () => undefined);
    return () => {
      alive = false;
    };
  }, [video?.id, ready, download]);
  return url;
}

/** The photo the video was made from: the local file, else the server copy. */
export function usePhotoUrl(photoId: string | null): string | null {
  const flow = app().flow.store.get();
  const local = flow.photo.kind === 'accepted' && flow.photo.photoId === photoId ? flow.photo.url : null;
  const [url, setUrl] = useState<string | null>(local);
  useEffect(() => {
    if (local || !photoId) return;
    let alive = true;
    app().services.backend.photoUrl(photoId).then((value) => alive && setUrl(value), () => undefined);
    return () => {
      alive = false;
    };
  }, [photoId, local]);
  return local ?? url;
}

export interface PreviewPlayer {
  onError: () => void;
  onPlaying: () => void;
  retry: () => void;
}

/**
 * The URL of a ready preview (preview-url), renewed before it expires and
 * when the player fails on it (D130). Never a download.
 */
export function usePreviewLink(video: Video | null): [PreviewLinkState, PreviewPlayer] {
  const [state, setState] = useState<PreviewLinkState>({ status: 'loading' });
  const keeper = useRef<PreviewLinkKeeper | null>(null);
  const ready = video?.status === 'ready' && video.isPreview;
  useEffect(() => {
    if (!video || !ready) return;
    const current = new PreviewLinkKeeper(() => app().services.backend.previewUrl(video.id), setState);
    keeper.current = current;
    void current.start();
    return () => {
      current.stop();
      keeper.current = null;
    };
  }, [video?.id, ready]);
  return [
    state,
    {
      onError: () => void keeper.current?.playerError(),
      onPlaying: () => keeper.current?.playing(),
      retry: () => void keeper.current?.retry(),
    },
  ];
}
