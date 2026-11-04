// 8. The result (16): plays muted in a loop, Download the MP4, Share (Web
// Share API with the file, else the link, else copy the link), report the
// video, Make another (C11).
import { useEffect, useState } from 'preact/hooks';
import { t } from '../../copy';
import { navigate } from '../../core/router';
import { downloadName, shareVideo } from '../../core/share';
import { app, danceById, showToast } from '../app-state';
import { ErrorState, Header, Loading } from '../components';
import { useStore } from '../hooks';
import { Icon } from '../icons';
import { ReportSheet } from '../report-sheet';
import { FailedView } from './generating';
import { usePhotoUrl, useVideo, useVideoUrl } from '../video-hooks';

export function ResultScreen({ id }: { id: string }) {
  const [load, retry] = useVideo(id);
  const wallet = useStore(app().wallet);
  const video = load.status === 'ok' ? load.video : null;
  const dance = video ? danceById(video.danceId) : undefined;
  const fileName = downloadName(dance?.name ?? 'dance');
  const url = useVideoUrl(video);
  const downloadUrl = useVideoUrl(video, fileName);
  const photoUrl = usePhotoUrl(video?.photoId ?? null);
  const [file, setFile] = useState<File | null>(null);
  const [reporting, setReporting] = useState(false);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    if (!video) return;
    if (video.isPreview) navigate(`/preview/${video.id}`, { replace: true });
    else if (video.status === 'queued' || video.status === 'rendering') navigate(`/generating/${video.id}`, { replace: true });
  }, [video?.status, video?.isPreview]);

  // The file is fetched ahead so Share runs inside the tap (iOS needs the gesture).
  useEffect(() => {
    if (!url || typeof navigator.canShare !== 'function') return;
    let alive = true;
    fetch(url)
      .then((response) => (response.ok ? response.blob() : null))
      .then((blob) => alive && blob && setFile(new File([blob], fileName, { type: 'video/mp4' })))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [url]);

  if (load.status === 'loading') return <Loading label={t.resultTitle} />;
  if (load.status !== 'ok' || !video) {
    return (
      <>
        <Header back="/videos" />
        <main><ErrorState text={load.status === 'missing' ? t.unavailable : t.videoLoadError} retry={load.status === 'error' ? retry : undefined} /></main>
      </>
    );
  }
  if (video.status === 'failed') {
    return (
      <>
        <Header back="/videos" />
        <main><FailedView video={video} /></main>
      </>
    );
  }

  const share = async () => {
    if (!url) return;
    setSharing(true);
    const outcome = await shareVideo({ file, url, title: dance?.name ?? 'Bopsy' });
    setSharing(false);
    if (outcome === 'copied') showToast(t.linkCopied);
    if (outcome === 'failed') showToast(t.shareFailed);
  };

  return (
    <>
      <Header back="/videos" right={<button type="button" class="icon-btn" aria-label={t.reportTitle} onClick={() => setReporting(true)}><Icon name="flag" /></button>} />
      <main>
        <div class="player">
          {url ? (
            <video src={url} autoplay muted loop playsInline aria-label={`Your finished dance video: ${dance?.name ?? ''}`} onClick={(event) => {
              const player = event.currentTarget as HTMLVideoElement;
              if (player.paused) void player.play();
              else player.pause();
            }} />
          ) : (
            <div class="skeleton" style={{ height: '100%' }} />
          )}
          {photoUrl && <div class="inset"><img src={photoUrl} alt="Original photo" /></div>}
        </div>
        <div class="result-head">
          <div>
            <h2>{t.resultTitle}</h2>
            <div class="muted">{t.resultMeta(dance?.name ?? '', dance?.durationSeconds ?? 8)}</div>
          </div>
          {wallet && <span class="pill"><Icon name="coin" />{t.coinsLeft(wallet.total)}</span>}
        </div>
        <div class="actions">
          <a class="btn btn-secondary" href={downloadUrl ?? url ?? undefined} download={fileName} aria-disabled={!url}>
            <Icon name="download" />
            {t.download}
          </a>
          <button type="button" class="btn btn-cta" disabled={!url || sharing} onClick={() => void share()}>
            <Icon name="share" />
            {t.share}
          </button>
        </div>
        <div class="hint-row">
          <span>{t.hint}</span>
          <button type="button" class="link" onClick={() => app().flow.makeAnother()}>{t.makeAnother}</button>
        </div>
      </main>
      {reporting && <ReportSheet videoId={video.id} onClose={() => setReporting(false)} />}
    </>
  );
}
