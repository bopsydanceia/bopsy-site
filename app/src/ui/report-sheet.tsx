// Report a video (D09, D54): a reason, an optional note, one row in
// public.reports (the only table the client writes, own videos only).
// D131: a limit per account and per day, answered with its wait.
import { useState } from 'preact/hooks';
import { LINKS } from '../config';
import { reportReasonText, t } from '../copy';
import { formatWait } from '../core/limits';
import { REPORT_REASONS, type ReportReason } from '../core/types';
import { app } from './app-state';
import { Sheet } from './components';

type SheetState = { status: 'idle' | 'sending' | 'sent' | 'failed' } | { status: 'limited'; until: number };

export function ReportSheet({ videoId, onClose }: { videoId: string; onClose: () => void }) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState('');
  const [state, setState] = useState<SheetState>({ status: 'idle' });

  if (state.status === 'sent') {
    return (
      <Sheet title={t.reportTitle} onClose={onClose}>
        <p role="status">{t.reportThanks}</p>
        <button type="button" class="btn btn-secondary btn-block" onClick={onClose}>OK</button>
      </Sheet>
    );
  }

  if (state.status === 'limited') {
    return (
      <Sheet title={t.reportTitle} onClose={onClose}>
        <p role="alert">{t.reportLimited(formatWait(state.until, Date.now()))}</p>
        <p class="muted small"><a href={LINKS.support} target="_blank" rel="noopener">{t.contactSupport}</a></p>
        <button type="button" class="btn btn-secondary btn-block" onClick={onClose}>OK</button>
      </Sheet>
    );
  }

  const send = async () => {
    if (!reason) return;
    setState({ status: 'sending' });
    const result = await app().services.backend.report(videoId, reason, note);
    if (result.kind === 'rate_limited') setState({ status: 'limited', until: Date.now() + result.retryAfter * 1000 });
    else setState({ status: result.kind === 'sent' ? 'sent' : 'failed' });
  };

  return (
    <Sheet title={t.reportTitle} onClose={onClose}>
      <div role="radiogroup" aria-label={t.reportTitle}>
        {REPORT_REASONS.map((value) => (
          <button key={value} type="button" role="radio" class="choice" aria-checked={reason === value} onClick={() => setReason(value)}>
            {reportReasonText[value]}
          </button>
        ))}
      </div>
      <label class="sr-only" for="report-note">{t.reportNote}</label>
      <textarea id="report-note" maxLength={1000} placeholder={t.reportNote} value={note} onInput={(event) => setNote((event.target as HTMLTextAreaElement).value)} />
      {state.status === 'failed' && <p class="error-text" role="alert">{t.reportFailed}</p>}
      <button type="button" class="btn btn-cta btn-block" style={{ marginTop: '14px' }} disabled={!reason || state.status === 'sending'} onClick={() => void send()}>
        {state.status === 'sending' ? '…' : t.reportSubmit}
      </button>
    </Sheet>
  );
}
