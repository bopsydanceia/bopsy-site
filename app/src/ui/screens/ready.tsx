// "Make my video" (D139): about 10 s of preparing while the photo check
// really runs, then the locked video: the photo blurred behind a play
// button and a lock, and "Unlock my video", which opens the paywall.
// Nothing is generated before payment, and the screen never says the
// video exists: it is made once unlocked.
import { useEffect, useState } from 'preact/hooks';
import { t } from '../../copy';
import { navigate } from '../../core/router';
import { app, danceBySlug } from '../app-state';
import { Header } from '../components';
import { useNow, useStore } from '../hooks';
import { Icon } from '../icons';

/** The shortest preparing time, even when the check answers sooner. */
export const PREPARE_MS = 10_000;

/** Photo and dance already prepared in this visit: Back from the paywall shows the locked video at once. */
let prepared: string | null = null;

export function ReadyScreen() {
  const { flow } = app();
  const state = useStore(flow.store);
  const minutes = useStore(app().estimatedMinutes);
  const [start] = useState(() => Date.now());
  const now = useNow(200);
  const dance = state.danceSlug ? danceBySlug(state.danceSlug) : undefined;
  const photo = state.photo;
  const key = photo.kind === 'accepted' && dance ? `${photo.photoId}:${dance.slug}` : null;

  // Anything but a photo being checked or accepted under the ticked box: back to the photo step,
  // where the refusal or the failure is explained.
  const lost = !dance || !state.consent || (photo.kind !== 'sending' && photo.kind !== 'accepted');
  useEffect(() => {
    if (lost) navigate(dance ? `/create/${dance.slug}` : '/', { replace: true });
  }, [lost]);

  const elapsed = now - start;
  const done = key !== null && (prepared === key || elapsed >= PREPARE_MS);
  useEffect(() => {
    if (done) prepared = key;
  }, [done, key]);

  if (lost || !dance) return null;
  const picture = photo.url ?? dance.posterUrl;

  if (!done) {
    // Up to 95 % while the check is still running after the 10 s.
    const percent = Math.min(photo.kind === 'accepted' ? 100 : 95, Math.round((elapsed / PREPARE_MS) * 100));
    const steps = t.preparingSteps;
    const step = steps[Math.min(steps.length - 1, Math.floor((elapsed / PREPARE_MS) * steps.length))];
    return (
      <>
        <Header back={`/create/${dance.slug}`} />
        <main class="prep" aria-busy="true">
          <div class="orb">{picture && <img src={picture} alt="" />}</div>
          <h1 class="title">{t.preparingTitle}</h1>
          <div class="bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label={t.preparingTitle}>
            <span style={{ width: `${percent}%` }} />
          </div>
          <p class="step" role="status" aria-live="polite">{step}…</p>
        </main>
      </>
    );
  }

  return (
    <>
      <Header back={`/create/${dance.slug}`} />
      <main>
        <button type="button" class="teaser" aria-label={t.teaserPlayLabel} onClick={() => void flow.unlock()}>
          {picture && <img src={picture} alt="" />}
          <span class="lock" aria-hidden="true">
            <span>
              <Icon name="play" />
              <span class="badge-lock"><Icon name="lock" /></span>
            </span>
          </span>
          <span class="pill dance-pill">{dance.name}</span>
        </button>
        <h1 class="title center">{t.teaserTitle}</h1>
        <p class="lede center">{t.teaserBody(dance.name, dance.durationSeconds, minutes)}</p>
        <div class="cta-bar">
          <button type="button" class="btn btn-cta btn-block" disabled={state.busy !== null} onClick={() => void flow.unlock()}>
            {state.busy ? '…' : t.unlockMine}
          </button>
          <p class="note">{t.teaserNote}</p>
        </div>
      </main>
    </>
  );
}
