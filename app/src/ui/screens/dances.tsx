// 1. Pick a dance (first screen): the catalogue of public.dances, by family,
// with the NEW and HOT tags (one per card, NEW first, none on pets, D46).
//
// Posters: the first two families load at once (only the first two cards
// with high priority, the LCP), the others lazily. The "Pets love these" row
// used to show an empty card on phones: its first poster was a lazy image
// whose URL also appeared further down (also lazy), and in-app WebViews
// (TikTok, Instagram) can leave such an image unpainted. Loading the first
// rows eagerly fixes it; a poster that fails anyway is hidden so the card
// shows its gradient and name instead of a blank box.
//
// D145: a card with a demo clip plays it muted, in a loop, over its poster
// while it is half visible (card-motion.ts, loaded after the first paint:
// never in the first chunk; caps, Save-Data and reduced motion there).
import { useEffect, useRef } from 'preact/hooks';
import { t } from '../../copy';
import type { Dance, DanceFamily } from '../../core/types';
import { app, loadCatalog } from '../app-state';
import { ErrorState, Header } from '../components';
import { useStore } from '../hooks';

const ORDER: DanceFamily[] = ['trends', 'pets', 'memes', 'party', 'victory'];

/** Families whose posters load without waiting for the scroll. */
const EAGER_FAMILIES = 2;

function hideBroken(event: Event) {
  (event.currentTarget as HTMLImageElement).hidden = true;
}

function CardVideo({ src }: { src: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    let stop: (() => void) | null = null;
    let gone = false;
    void import('../card-motion').then(({ watchCardVideo }) => {
      if (!gone) stop = watchCardVideo(video, src);
    });
    return () => {
      gone = true;
      stop?.();
    };
  }, [src]);
  return <video ref={ref} class="card-video" muted loop playsInline preload="none" disablePictureInPicture aria-hidden="true" tabIndex={-1} />;
}

function DanceCard({ dance, eager, priority }: { dance: Dance; eager: boolean; priority: boolean }) {
  const tag = dance.family === 'pets' ? null : dance.isNew ? 'new' : dance.isHot ? 'hot' : null;
  return (
    <a class="card" href={`#/trend/${dance.slug}`}>
      {dance.posterUrl && (
        <img
          src={dance.posterUrl}
          alt=""
          width={360}
          height={450}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          fetchpriority={priority ? 'high' : 'auto'}
          onError={hideBroken}
        />
      )}
      {dance.previewVideoUrl && <CardVideo src={dance.previewVideoUrl} />}
      <span class="card-name">{dance.name}</span>
      {tag && <span class={`tag ${tag}`}>{tag === 'new' ? t.badgeNew : t.badgeHot}</span>}
    </a>
  );
}

export function DancesScreen() {
  const catalog = useStore(app().catalog);
  const flow = useStore(app().flowStore);
  const minutes = useStore(app().estimatedMinutes);
  const remake = flow.photo.kind === 'accepted';
  const families = catalog.status === 'ready' ? ORDER.filter((family) => catalog.dances.some((dance) => dance.family === family)) : [];
  return (
    <>
      <Header brand />
      <main class="catalog">
        <div class="catalog-head">
          <p class="hook">{t.hook}</p>
          <h1 class="title">{t.pickDance}</h1>
          <p class="lede">{remake ? t.pickForPhoto : `${t.pickDanceBody} ${t.minutes(minutes)}.`}</p>
        </div>
        {catalog.status === 'loading' && (
          <div class="grid" aria-busy="true" aria-label={t.loadingDances}>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} class="card skeleton" />
            ))}
          </div>
        )}
        {catalog.status === 'error' && <ErrorState text={t.catalogError} retry={loadCatalog} />}
        {catalog.status === 'ready' && catalog.dances.length === 0 && <p class="empty muted">{t.catalogEmpty}</p>}
        {catalog.status === 'ready' &&
          families.map((family, familyIndex) => {
            const dances = catalog.dances.filter((dance) => dance.family === family);
            return (
              <section class="section" key={family} aria-labelledby={`family-${family}`}>
                <h2 id={`family-${family}`}>{t.families[family]}</h2>
                <div class="grid">
                  {dances.map((dance, index) => (
                    <DanceCard key={dance.id} dance={dance} eager={familyIndex < EAGER_FAMILIES} priority={familyIndex === 0 && index < 2} />
                  ))}
                </div>
              </section>
            );
          })}
      </main>
    </>
  );
}
