// 2 and 3. Add a photo (tips, camera or gallery), then the consent box,
// unchecked, with the AI notice right under it: nothing is uploaded before
// the box is ticked (D50); then the check (checking, accepted, rejection
// with its reason) and the main button (free preview, Generate, Unlock).
import { useEffect } from 'preact/hooks';
import { LINKS } from '../../config';
import { rejectionText, t } from '../../copy';
import { primaryAction } from '../../core/flow';
import { canRetryUpload, canStart } from '../../core/flow-state';
import type { Dance } from '../../core/types';
import { app, danceBySlug } from '../app-state';
import { Checkbox, ErrorState, Header, Loading } from '../components';
import { useLoad, useStore } from '../hooks';
import { Icon } from '../icons';
import { noticeText } from '../notices';

function PickButton({ label, icon, capture, onFile }: { label: string; icon: 'camera' | 'image'; capture?: boolean; onFile: (file: File) => void }) {
  return (
    <label class="btn btn-secondary file-btn">
      <Icon name={icon} />
      {label}
      <input
        type="file"
        accept="image/*"
        {...(capture ? { capture: 'environment' } : {})}
        aria-label={label}
        onChange={(event) => {
          const input = event.target as HTMLInputElement;
          const file = input.files?.[0];
          if (file) onFile(file);
          input.value = '';
        }}
      />
    </label>
  );
}

function Tips() {
  return (
    <ul class="tips" aria-label={t.tipsTitle}>
      {[t.tipWholeBody, t.tipOneSubject, t.tipSharp].map((tip) => (
        <li key={tip}>
          <span class="ok-text"><Icon name="check" /></span>
          {tip}
        </li>
      ))}
      <li class="no">
        <span class="error-text"><Icon name="x" /></span>
        {t.tipsWontWork}: {t.tipsFaceOnly.toLowerCase()}, {t.tipsGroup.toLowerCase()}, {t.tipsKids.toLowerCase()}
      </li>
    </ul>
  );
}

function Samples({ onFile }: { onFile: (file: Blob, name: string) => void }) {
  const samples = app().services.backend.samples ?? [];
  if (samples.length === 0) return null;
  return (
    <div class="samples">
      <span>{t.samplesLabel}</span>
      {samples.map((sample) => (
        <button
          key={sample.file}
          type="button"
          onClick={async () => onFile(await (await fetch(sample.url)).blob(), sample.file)}
        >
          {sample.label}
        </button>
      ))}
    </div>
  );
}

function DanceRow({ dance }: { dance: Dance }) {
  return (
    <div class="dance-row">
      {dance.posterUrl ? <img src={dance.posterUrl} alt="" width={56} height={70} /> : <span />}
      <div class="meta">
        <div class="label">{t.danceLabel}</div>
        <div class="name">{dance.name}</div>
        <div class="label">{t.danceMeta(dance.durationSeconds, dance.cost)}</div>
      </div>
      <a class="link" href="#/">{t.change}</a>
    </div>
  );
}

export function CreateScreen({ slug }: { slug: string }) {
  const { flow, services } = app();
  const catalog = useStore(app().catalog);
  const state = useStore(flow.store);
  const session = useStore(app().session);
  useEffect(() => flow.selectDance(slug), [slug]);
  const [account] = useLoad(() => (session && !session.guest ? services.backend.account() : Promise.resolve(null)), [session?.userId, session?.guest]);

  if (catalog.status === 'loading') return <Loading label="Loading" />;
  const dance = danceBySlug(slug);
  if (!dance) {
    return (
      <>
        <Header title={t.createTitle} back="/" />
        <main>
          <ErrorState text={catalog.status === 'error' ? t.catalogError : t.danceUnavailable} />
          <a class="btn btn-cta btn-block" href="#/">{t.pickAnother}</a>
        </main>
      </>
    );
  }

  const photo = state.photo;
  const pick = (file: Blob, name: string) => flow.pickPhoto(file, name);
  const action = primaryAction(state, session, account.status === 'ready' ? account.value : null, dance.cost, Date.now());
  const label = action === 'generate' ? t.generate(dance.cost) : action === 'preview' ? t.generateFreePreview : t.unlock;
  const ready = canStart(state);
  const run = () => (action === 'generate' ? flow.generate() : action === 'preview' ? flow.startPreview() : flow.unlock());

  return (
    <>
      <Header title={t.createTitle} back="/" />
      <main>
        <DanceRow dance={dance} />
        {photo.kind === 'none' ? (
          <section class="drop" aria-labelledby="add-photo">
            <h2 id="add-photo">{t.addPhotoTitle}</h2>
            <p class="muted small" style={{ margin: 0 }}>{t.addPhotoBody}</p>
            <div class="pick-row">
              <PickButton label={t.camera} icon="camera" capture onFile={(file) => pick(file, file.name)} />
              <PickButton label={t.gallery} icon="image" onFile={(file) => pick(file, file.name)} />
            </div>
            <Tips />
            <Samples onFile={pick} />
          </section>
        ) : (
          <>
            <div class="photo">
              {photo.url ? <img src={photo.url} alt={t.yourPhoto} /> : <div class="skeleton" style={{ height: '100%' }} />}
              <span class="badge" role="status" aria-live="polite">
                {photo.kind === 'local' && t.notSent}
                {photo.kind === 'sending' && t.checking}
                {photo.kind === 'accepted' && (<><span class="ok-text"><Icon name="check" /></span>{t.fullBody}</>)}
                {(photo.kind === 'rejected' || (photo.kind === 'failed' && !canRetryUpload(photo.failure))) && (
                  <><span class="error-text"><Icon name="alert" /></span>{t.cantUse}</>
                )}
                {photo.kind === 'failed' && canRetryUpload(photo.failure) && t.notSent}
              </span>
              <label class="btn btn-secondary file-btn replace" style={{ minHeight: '44px', padding: '0 16px', fontSize: '15px' }}>
                {t.replace}
                <input type="file" accept="image/*" aria-label={t.replace} onChange={(event) => {
                  const input = event.target as HTMLInputElement;
                  const file = input.files?.[0];
                  if (file) pick(file, file.name);
                  input.value = '';
                }} />
              </label>
            </div>
            {photo.kind === 'rejected' ? (
              <p class="message error" role="alert">{rejectionText[photo.reason]}</p>
            ) : (
              <>
                <Checkbox id="consent" checked={state.consent} onChange={(checked) => void flow.setConsent(checked)}>
                  {t.consent}
                </Checkbox>
                <p class="ai-note">
                  {t.aiNotice} <a href={LINKS.privacy} target="_blank" rel="noopener">{t.privacy}</a>
                </p>
              </>
            )}
          </>
        )}
        {state.notice && (
          <div class={photo.kind === 'failed' && !canRetryUpload(photo.failure) ? 'message error' : 'message'} role="alert">
            {noticeText(state.notice)}{' '}
            {photo.kind === 'failed' && canRetryUpload(photo.failure) && state.consent && (
              <button type="button" class="link" onClick={() => void flow.retryUpload()}>{t.tryAgain}</button>
            )}
          </div>
        )}
        <div class="cta-bar">
          <button type="button" class="btn btn-cta btn-block" disabled={!ready} aria-busy={state.busy !== null} onClick={() => void run()}>
            {state.busy ? '…' : label}
          </button>
          {action === 'generate' && <p class="note">{t.videoFailedQ} {t.coinsComeBack}</p>}
        </div>
      </main>
    </>
  );
}
