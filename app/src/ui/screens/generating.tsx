// 7. Making your video (15): the row of public.videos by Realtime, the
// estimate from app_config estimated_minutes, capped at 95 % until ready,
// "Taking a bit longer" past the estimate (C21 to C23); ready opens the
// result, failed shows the cause and the coins given back (17).
import { useEffect } from 'preact/hooks';
import { LINKS } from '../../config';
import { t } from '../../copy';
import { displayProgress, isTakingLonger, minutesLeft } from '../../core/progress';
import { navigate } from '../../core/router';
import type { Video } from '../../core/types';
import { app, danceById } from '../app-state';
import { ErrorState, Header, Loading } from '../components';
import { useNow, useStore } from '../hooks';
import { Icon } from '../icons';
import { usePhotoUrl, useVideo } from '../video-hooks';

export function FailedView({ video }: { video: Video }) {
  const wallet = useStore(app().wallet);
  const dance = danceById(video.danceId);
  const photoUrl = usePhotoUrl(video.photoId);
  const cause = video.errorCode === 'body_not_detected' ? t.failedNoBody : video.errorCode === 'timeout' ? t.failedTimeout : t.failedServer;
  return (
    <>
      {photoUrl && <div class="scan"><img src={photoUrl} alt="The photo that could not be animated" style={{ opacity: 0.45 }} /></div>}
      <h1 class="title center">{t.failedTitle}</h1>
      <p class="lede center">{cause}</p>
      {video.coinsRefunded > 0 && <p class="message center ok-text" role="status">{t.failedRefund(video.coinsRefunded, wallet?.total ?? null)}</p>}
      <div class="cta-bar">
        <button
          type="button"
          class="btn btn-cta btn-block"
          onClick={() => {
            app().flow.reset();
            navigate(dance ? `/create/${dance.slug}` : '/', { replace: true });
          }}
        >
          {t.tryAnotherPhoto}
        </button>
        <p class="note"><a href={LINKS.support} target="_blank" rel="noopener">{t.contactSupport}</a></p>
      </div>
    </>
  );
}

export function GeneratingScreen({ id }: { id: string }) {
  const [load, retry] = useVideo(id);
  const minutes = useStore(app().estimatedMinutes);
  const catalog = useStore(app().catalog);
  const now = useNow(1000);
  const video = load.status === 'ok' ? load.video : null;
  const photoUrl = usePhotoUrl(video?.photoId ?? null);

  useEffect(() => {
    if (video?.status === 'ready') navigate(`/${video.isPreview ? 'preview' : 'video'}/${video.id}`, { replace: true });
  }, [video?.status]);

  if (load.status === 'loading') return <Loading label={t.generatingTitle} />;
  if (load.status !== 'ok' || !video) {
    return (
      <>
        <Header title={t.generatingTitle} back="/videos" />
        <main><ErrorState text={load.status === 'missing' ? t.unavailable : t.videoLoadError} retry={retry} /></main>
      </>
    );
  }
  if (video.status === 'failed') {
    return (
      <>
        <Header close={() => navigate('/videos', { replace: true })} />
        <main><FailedView video={video} /></main>
      </>
    );
  }

  const dance = danceById(video.danceId);
  const name = dance?.name ?? 'Dance';
  const percent = displayProgress(video, now, minutes);
  const queued = video.status === 'queued';
  const longer = isTakingLonger(video, now, minutes);
  const trending = catalog.status === 'ready' ? catalog.dances.filter((item) => item.id !== video.danceId).slice(0, 3) : [];

  return (
    <>
      <Header title={t.generatingTitle} close={() => navigate('/videos', { replace: true })} right={<span />} />
      <main>
        <div class="scan">
          {(photoUrl ?? dance?.posterUrl) && <img src={photoUrl ?? dance!.posterUrl!} alt="Your photo being animated" />}
          <div class="veil" style={{ height: `${percent}%` }} />
          <div class="line" style={{ top: `calc(${percent}% - 2px)` }} />
        </div>
        <div class="progress-head" aria-hidden="true">
          <span>{queued ? t.queued : `${percent}%`}</span>
          <span>{queued ? '' : longer ? '' : t.minLeft(minutesLeft(video, now, minutes))}</span>
        </div>
        <div class="bar" role="progressbar" aria-label="Video progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
          <div style={{ width: `${percent}%` }} />
        </div>
        {longer && <p class="message" role="status">{t.takingLonger}</p>}
        <ul class="steps">
          <li><Icon name="check" />{t.stepPhoto}</li>
          <li class={queued ? 'todo' : ''}>{queued ? <span class="dot" /> : <Icon name="check" />}{queued ? t.stepMovesLoading(name) : t.stepMoves(name)}</li>
          <li class="todo"><span class="dot" />{t.stepRendering(dance?.durationSeconds ?? 8)}</li>
        </ul>
        <p class="muted" style={{ marginTop: '18px' }}>{t.generatingCaption(video.cost)}</p>
        {trending.length > 0 && (
          <section class="section">
            <h2 style={{ fontSize: '18px' }}>Trending while you wait</h2>
            <div class="tiles" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
              {trending.map((item) => (
                <a key={item.id} class="tile" href={`#/create/${item.slug}`}>
                  {item.posterUrl && <img src={item.posterUrl} alt="" loading="lazy" />}
                  <span class="label">{item.name}</span>
                </a>
              ))}
            </div>
          </section>
        )}
      </main>
    </>
  );
}
