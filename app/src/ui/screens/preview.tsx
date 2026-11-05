// 4. The free preview (20 on the web): a 2 s 480p clip with the bopsy
// watermark over it, the report flag, and "Unlock full video". It plays
// from a short signed URL renewed before it expires or when the player
// fails (preview-url, D130); no download, no controls.
import { useState } from 'preact/hooks';
import { t } from '../../copy';
import { canAfford } from '../../core/flow';
import { displayProgress } from '../../core/progress';
import { app, danceById } from '../app-state';
import { ErrorState, Header, Loading } from '../components';
import { useLoad, useNow, useStore } from '../hooks';
import { Icon } from '../icons';
import { ReportSheet } from '../report-sheet';
import { usePhotoUrl, usePreviewLink, useVideo } from '../video-hooks';

export function PreviewScreen({ id }: { id: string }) {
  const [load, retry] = useVideo(id);
  const minutes = useStore(app().estimatedMinutes);
  const session = useStore(app().session);
  const flowState = useStore(app().flow.store);
  const now = useNow(500);
  const [seconds, setSeconds] = useState(2);
  const [reporting, setReporting] = useState(false);
  const video = load.status === 'ok' ? load.video : null;
  const [link, player] = usePreviewLink(video);
  const photoUrl = usePhotoUrl(video?.photoId ?? null);
  const [account] = useLoad(() => (session && !session.guest ? app().services.backend.account() : Promise.resolve(null)), [session?.userId, session?.guest]);
  const dance = video ? danceById(video.danceId) : undefined;
  const back = dance ? `/create/${dance.slug}` : '/';

  if (load.status === 'loading') return <Loading label={t.previewMaking} />;
  if (load.status !== 'ok' || !video) {
    return (
      <>
        <Header title={t.previewTitle} back="/" />
        <main><ErrorState text={load.status === 'missing' ? t.unavailable : t.videoLoadError} retry={load.status === 'error' ? retry : undefined} /></main>
      </>
    );
  }

  const cost = dance?.cost ?? 60;
  const generate = session && !session.guest && account.status === 'ready' && canAfford(account.value, cost);
  const busy = flowState.busy !== null;
  const progress = displayProgress(video, now, Math.max(0.1, 6 / 60));

  return (
    <>
      <Header title={t.previewTitle} back={back} right={<span />} />
      <main>
        {video.status === 'ready' && (link.status === 'error' || link.status === 'missing') ? (
          <ErrorState text={link.status === 'missing' ? t.unavailable : t.videoLoadError} retry={link.status === 'error' ? player.retry : undefined} />
        ) : video.status === 'ready' && link.status === 'ready' ? (
          <div class="player">
            <video
              src={link.link.url}
              poster={link.link.thumbnailUrl ?? undefined}
              autoplay
              muted
              loop
              playsInline
              disablePictureInPicture
              controlsList="nodownload noplaybackrate noremoteplayback"
              onContextMenu={(event) => event.preventDefault()}
              onLoadedMetadata={(event) => setSeconds(Math.max(1, Math.round((event.target as HTMLVideoElement).duration)))}
              onPlaying={player.onPlaying}
              onError={player.onError}
              aria-label="Preview of your photo dancing"
            />
            <div class="watermark" aria-hidden="true">bopsy</div>
            <span class="tag">{t.previewTag(seconds)}</span>
            <button type="button" class="icon-btn filled flag" aria-label={t.reportTitle} onClick={() => setReporting(true)}>
              <Icon name="flag" />
            </button>
            {photoUrl && <div class="inset"><img src={photoUrl} alt="Original photo" /></div>}
            {dance && <span class="pill dance-pill">{dance.name}</span>}
          </div>
        ) : video.status === 'failed' ? (
          <div class="message error" role="alert">{video.errorCode === 'body_not_detected' ? t.previewFailedNoBody : t.previewFailed}</div>
        ) : (
          <div class="player" aria-busy="true">
            {photoUrl && <img src={photoUrl} alt="" style={{ opacity: 0.5 }} />}
            {video.status !== 'ready' && (
              <div class="watermark" style={{ transform: 'none', fontSize: '22px', color: 'var(--text)' }} role="status">
                {t.previewMaking}… {progress}%
              </div>
            )}
          </div>
        )}
        {video.status !== 'failed' && (
          <p class="pitch"><b>{t.previewPitchLead}</b> {t.previewPitchBody(dance?.durationSeconds ?? 8)}</p>
        )}
        <div class="cta-bar">
          <button type="button" class="btn btn-cta btn-block btn-stack" disabled={busy} onClick={() => void app().flow.unlock()}>
            <span>{busy ? '…' : generate ? t.generate(cost) : t.unlock}</span>
            {!generate && <span class="sub">{t.unlockSubtitle(minutes)}</span>}
          </button>
          <p class="refund-note">{t.videoFailedQ} <b>{t.coinsComeBack}</b></p>
        </div>
      </main>
      {reporting && <ReportSheet videoId={video.id} onClose={() => setReporting(false)} />}
    </>
  );
}
