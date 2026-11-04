// Report a video (D09, D54): a reason, an optional note, one row in
// public.reports (the only table the client writes, own videos only).
import { useState } from 'preact/hooks';
import { reportReasonText, t } from '../copy';
import { REPORT_REASONS, type ReportReason } from '../core/types';
import { app } from './app-state';
import { Sheet } from './components';

export function ReportSheet({ videoId, onClose }: { videoId: string; onClose: () => void }) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');

  if (state === 'sent') {
    return (
      <Sheet title={t.reportTitle} onClose={onClose}>
        <p role="status">{t.reportThanks}</p>
        <button type="button" class="btn btn-secondary btn-block" onClick={onClose}>OK</button>
      </Sheet>
    );
  }

  const send = async () => {
    if (!reason) return;
    setState('sending');
    setState((await app().services.backend.report(videoId, reason, note)) ? 'sent' : 'failed');
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
      {state === 'failed' && <p class="error-text" role="alert">{t.reportFailed}</p>}
      <button type="button" class="btn btn-cta btn-block" style={{ marginTop: '14px' }} disabled={!reason || state === 'sending'} onClick={() => void send()}>
        {state === 'sending' ? '…' : t.reportSubmit}
      </button>
    </Sheet>
  );
}
