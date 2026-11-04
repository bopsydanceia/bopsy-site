// My videos (18): the signed-in user's videos, newest first; ready opens
// the result, in progress the progress, failed the cause and refund.
import { t } from '../../copy';
import type { Video } from '../../core/types';
import { app, danceById } from '../app-state';
import { ErrorState, Header, Loading } from '../components';
import { useLoad, useStore } from '../hooks';

function Tile({ video }: { video: Video }) {
  const dance = danceById(video.danceId);
  const name = dance?.name ?? 'Dance';
  const label =
    video.status === 'ready' ? name : video.status === 'failed' ? t.tileFailed(name) : video.status === 'queued' ? t.tileQueued(name) : t.tileRendering(name);
  const href = video.status === 'ready' ? `#/video/${video.id}` : `#/generating/${video.id}`;
  return (
    <a class="tile" href={href}>
      {dance?.posterUrl && <img src={dance.posterUrl} alt="" loading="lazy" class={video.status === 'ready' ? '' : 'dim'} />}
      <span class="label">{label}</span>
    </a>
  );
}

export function VideosScreen() {
  const session = useStore(app().session);
  const signedIn = session !== null && !session.guest;
  const [load, retry] = useLoad(() => (signedIn ? app().services.backend.videos() : Promise.resolve([])), [session?.userId, signedIn]);
  return (
    <>
      <Header title={t.myVideos} back="/" />
      <main>
        {!signedIn ? (
          <div class="empty">
            <p class="title-sm">{t.emptyTitle}</p>
            <p class="muted">{t.emptyBody}</p>
            <a class="btn btn-secondary" href="#/unlock">{t.signIn}</a>
          </div>
        ) : load.status === 'loading' ? (
          <Loading label={t.myVideos} />
        ) : load.status === 'error' ? (
          <ErrorState text={t.videosError} retry={retry} />
        ) : load.value.length === 0 ? (
          <div class="empty">
            <p class="title-sm">{t.emptyTitle}</p>
            <p class="muted">{t.emptyBody}</p>
            <a class="btn btn-cta" href="#/">{t.emptyCta}</a>
          </div>
        ) : (
          <div class="tiles">
            {load.value.map((video) => (
              <Tile key={video.id} video={video} />
            ))}
          </div>
        )}
      </main>
    </>
  );
}
