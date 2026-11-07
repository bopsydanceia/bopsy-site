// A trend in big (between the catalogue and the photo step): its demo plays
// full screen in a loop, muted at first (browsers block autoplay with sound),
// a button turns the sound on; "Use my photo" opens the photo step
// (#/create/<slug>) with its tips. Without a demo clip, the poster.
import { useEffect, useRef, useState } from 'preact/hooks';
import { t } from '../../copy';
import { goBack } from '../../core/router';
import { app, danceBySlug } from '../app-state';
import { ErrorState, Header, Loading } from '../components';
import { useStore } from '../hooks';
import { Icon } from '../icons';

function reducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function TrendScreen({ slug }: { slug: string }) {
  const catalog = useStore(app().catalog);
  const video = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  const still = reducedMotion();

  useEffect(() => {
    const el = video.current;
    if (!el || still) return;
    el.play().catch(() => undefined);
  }, [slug, catalog.status]);

  if (catalog.status === 'loading') return <Loading label={t.loading} />;
  const dance = danceBySlug(slug);
  if (!dance) {
    return (
      <>
        <Header back="/" />
        <main>
          <ErrorState text={catalog.status === 'error' ? t.catalogError : t.danceUnavailable} />
          <a class="btn btn-cta btn-block" href="#/">{t.pickAnother}</a>
        </main>
      </>
    );
  }

  const toggleSound = () => {
    const el = video.current;
    if (!el) return;
    el.muted = !el.muted;
    setMuted(el.muted);
    if (el.paused) el.play().catch(() => undefined);
  };

  return (
    <main class="trend-view">
      <div class="trend-stage">
        {dance.previewVideoUrl ? (
          <video
            ref={video}
            src={dance.previewVideoUrl}
            poster={dance.posterUrl ?? undefined}
            muted
            loop
            playsInline
            autoplay={!still}
            controls={still}
            preload="auto"
            disablePictureInPicture
            aria-label={t.trendVideoLabel(dance.name)}
          />
        ) : (
          dance.posterUrl && <img src={dance.posterUrl} alt="" />
        )}
        <button type="button" class="icon-btn filled trend-back" onClick={() => goBack('/')} aria-label={t.back}>
          <Icon name="back" />
        </button>
        {dance.previewVideoUrl && !still && (
          <button type="button" class="trend-sound" onClick={toggleSound} aria-pressed={!muted}>
            {muted ? t.soundOn : t.soundOff}
          </button>
        )}
        <div class="trend-info">
          <h1>{dance.name}</h1>
          <p>{t.danceMeta(dance.durationSeconds, dance.cost)}</p>
        </div>
      </div>
      <div class="trend-cta">
        <a class="btn btn-cta btn-block" href={`#/create/${dance.slug}`}>{t.usePhoto}</a>
        <p class="note">{t.trendHint}</p>
      </div>
    </main>
  );
}
