import { limitText, t } from '../copy';
import type { Notice } from '../core/flow-state';
import { formatWait } from '../core/limits';

export function noticeText(notice: Notice, now: number = Date.now()): string {
  if (typeof notice === 'object') return limitText(notice.action, formatWait(notice.until, now));
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
    case 'preview_off':
      return t.previewOff;
    case 'captcha_failed':
      return t.captchaFailed;
    case 'photo_too_large':
      return t.photoTooLarge;
    case 'photo_type':
      return t.photoType;
    case 'dance_unavailable':
      return t.danceUnavailable;
    case 'too_many':
      return t.tooMany(3);
    case 'plan_activating':
      return t.planActivating;
    case 'error':
      return t.error;
  }
}
