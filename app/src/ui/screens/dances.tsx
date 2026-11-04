// 1. Pick a dance (first screen): the catalogue of public.dances, by family,
// with the NEW and HOT tags (one per card, NEW first, none on pets, D46).
import { t } from '../../copy';
import type { Dance, DanceFamily } from '../../core/types';
import { app, loadCatalog } from '../app-state';
import { ErrorState, Header } from '../components';
import { useStore } from '../hooks';

const ORDER: DanceFamily[] = ['trends', 'pets', 'memes', 'party', 'victory'];

function DanceCard({ dance, eager }: { dance: Dance; eager: boolean }) {
  const tag = dance.family === 'pets' ? null : dance.isNew ? 'new' : dance.isHot ? 'hot' : null;
  return (
    <a class="card" href={`#/create/${dance.slug}`} aria-label={dance.name}>
      {dance.posterUrl && (
        <img
          src={dance.posterUrl}
          alt=""
          width={360}
          height={450}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          {...(eager ? { fetchpriority: 'high' } : {})}
        />
      )}
      {tag && <span class={`tag ${tag}`}>{tag === 'new' ? t.badgeNew : t.badgeHot}</span>}
      <span class="card-name" aria-hidden="true">
        {dance.name}
      </span>
    </a>
  );
}

export function DancesScreen() {
  const catalog = useStore(app().catalog);
  const flow = useStore(app().flow.store);
  const minutes = useStore(app().estimatedMinutes);
  const remake = flow.photo.kind === 'accepted';
  return (
    <>
      <Header brand />
      <main>
        <h1 class="title">{t.pickDance}</h1>
        <p class="lede">
          {remake ? 'Pick a dance for your photo.' /* NEW (C11) */ : `${t.pickDanceBody} ${minutes === 1 ? '1 minute' : `${minutes} minutes`}.`}
        </p>
        {catalog.status === 'loading' && (
          <div class="grid" aria-busy="true" aria-label="Loading dances">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} class="card skeleton" />
            ))}
          </div>
        )}
        {catalog.status === 'error' && <ErrorState text={t.catalogError} retry={loadCatalog} />}
        {catalog.status === 'ready' && catalog.dances.length === 0 && <p class="empty muted">{t.catalogEmpty}</p>}
        {catalog.status === 'ready' &&
          ORDER.map((family) => {
            const dances = catalog.dances.filter((dance) => dance.family === family);
            if (dances.length === 0) return null;
            const first = catalog.dances.indexOf(dances[0]!);
            return (
              <section class="section" key={family} aria-labelledby={`family-${family}`}>
                <h2 id={`family-${family}`}>{t.families[family]}</h2>
                <div class="grid">
                  {dances.map((dance, index) => (
                    <DanceCard key={dance.id} dance={dance} eager={first === 0 && index < 2} />
                  ))}
                </div>
              </section>
            );
          })}
      </main>
    </>
  );
}
