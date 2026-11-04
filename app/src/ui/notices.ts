import { t } from '../copy';
import type { Notice } from '../core/flow-state';

export function noticeText(notice: Notice): string {
  switch (notice) {
    case 'consent_missing':
      return t.consentMissing;
    case 'recheck':
      return t.recheck;
    case 'photo_gone':
      return t.photoGone;
    case 'upload_failed':
      return t.uploadFailed;
    case 'preview_used':
      return t.previewUsed;
    case 'dance_unavailable':
      return t.danceUnavailable;
    case 'too_many':
      return `${t.rendering(3)}. Wait for one to finish.`; // createReadyTooManyInProgress + NEW
    case 'plan_activating':
      return t.planActivating;
    case 'error':
      return t.error;
  }
}
