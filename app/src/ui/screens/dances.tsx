// 1. Pick a dance (first screen): the catalogue of public.dances, by family,
// with the NEW and HOT tags (one per card, NEW first; D149: pets too).
// D150: a small sticky row of chips jumps to a family (the current one lit).
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
import { useEffect, useRef, useState } from 'preact/hooks';
import { t } from '../../copy';
import type { Dance, DanceFamily } from '../../core/types';
import { app, loadCatalog } from '../app-state';
import { ErrorState, Header } from '../components';
import { useStore } from '../hooks';

const ORDER: DanceFamily[] = ['trends', 'pets', 'memes', 'party', 'victory'];

/** Families whose posters load without waiting for the scroll. */
const EAGER_FAMILIES = 2;

/** Where the catalogue was when a trend was opened: back on it, the page returns there. */
const SCROLL_KEY = 'bopsy.catalogY';

function keepScroll() {
  try {
    sessionStorage.setItem(SCROLL_KEY, String(Math.round(scrollY)));
  } catch {
    // Private mode: back lands at the top, as before.
  }
}

function takeScroll(): number | null {
  try {
    const raw = sessionStorage.getItem(SCROLL_KEY);
    sessionStorage.removeItem(SCROLL_KEY);
    const y = raw === null ? NaN : Number(raw);
    return Number.isFinite(y) && y > 0 ? y : null;
  } catch {
    return null;
  }
}

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
  const tag = dance.isNew ? 'new' : dance.isHot ? 'hot' : null;
  return (
    <a class="card" href={`#/trend/${dance.slug}`} onClick={keepScroll}>
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

function reducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** D150: one chip per family; a tap scrolls to it, the family in view is lit. */
function FamilyChips({ families }: { families: DanceFamily[] }) {
  const [current, setCurrent] = useState<DanceFamily | null>(families[0] ?? null);
  // After a tap, the tapped chip stays lit until the smooth scroll is over.
  const jumping = useRef(0);
  // The lit chip: the last family whose title went under the chips, the last one at the bottom of the page.
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      if (Date.now() < jumping.current) return;
      const atBottom = innerHeight + scrollY >= document.documentElement.scrollHeight - 4;
      let lit = families[0] ?? null;
      for (const family of families) {
        const top = document.getElementById(`fam-${family}`)?.getBoundingClientRect().top ?? Infinity;
        if (top <= 140) lit = family;
      }
      setCurrent(atBottom ? families[families.length - 1] ?? lit : lit);
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    addEventListener('scroll', onScroll, { passive: true });
    update();
    return () => { removeEventListener('scroll', onScroll); if (frame) cancelAnimationFrame(frame); };
  }, [families.join()]);
  const jump = (family: DanceFamily) => {
    setCurrent(family);
    jumping.current = Date.now() + 1000;
    document.getElementById(`fam-${family}`)?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
  };
  return (
    <nav class="chips" aria-label={t.familiesNav}>
      {families.map((family) => (
        <button key={family} type="button" class="chip" aria-current={current === family ? 'true' : undefined} onClick={() => jump(family)}>
          {t.familyChips[family]}
        </button>
      ))}
    </nav>
  );
}

export function DancesScreen() {
  const catalog = useStore(app().catalog);
  const flow = useStore(app().flowStore);
  const minutes = useStore(app().estimatedMinutes);
  const remake = flow.photo.kind === 'accepted';
  const families = catalog.status === 'ready' ? ORDER.filter((family) => catalog.dances.some((dance) => dance.family === family)) : [];
  // Back from a trend: the catalogue where it was (the cards keep their size, so the spot is the same).
  useEffect(() => {
    if (catalog.status !== 'ready') return;
    const y = takeScroll();
    if (y !== null) requestAnimationFrame(() => scrollTo(0, y));
  }, [catalog.status]);
  return (
    <>
      <Header brand />
      <main class="catalog">
        <div class="catalog-head">
          <p class="hook">{t.hook}</p>
          <h1 class="title">{t.pickDance}</h1>
          <p class="lede">{remake ? t.pickForPhoto : `${t.pickDanceBody} ${t.minutes(minutes)}.`}</p>
        </div>
        {families.length > 1 && <FamilyChips families={families} />}
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
              <section class="section" key={family} id={`fam-${family}`} aria-labelledby={`family-${family}`}>
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
