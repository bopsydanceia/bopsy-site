// The create flow as pure state transitions, tested on their own: photo,
// consent (D49, D50: nothing is sent before the box is checked), preview,
// generation. The Flow controller (flow.ts) runs the side effects.
import type { PhotoRejection } from './types';

export interface LocalPhoto {
  /** The picked file, kept in memory to send it again after a sign-in switch. */
  file: Blob | null;
  name: string;
  /** Object URL (or a server URL once the file is gone). */
  url: string | null;
}

export type PhotoState =
  | { kind: 'none' }
  | ({ kind: 'local' } & LocalPhoto)
  | ({ kind: 'sending'; token: number } & LocalPhoto)
  | ({ kind: 'accepted'; photoId: string; userId: string } & LocalPhoto)
  | ({ kind: 'rejected'; reason: PhotoRejection } & LocalPhoto)
  | ({ kind: 'failed' } & LocalPhoto);

export type Notice =
  | 'consent_missing'
  | 'recheck'
  | 'photo_gone'
  | 'upload_failed'
  | 'preview_used'
  | 'dance_unavailable'
  | 'too_many'
  | 'plan_activating'
  | 'error';

export interface FlowState {
  danceSlug: string | null;
  photo: PhotoState;
  consent: boolean;
  consentAt: string | null;
  previewId: string | null;
  /** The visitor already had their free preview (refusal seen or preview made). */
  previewUsed: boolean;
  /** The paid video being started: one idempotency key per attempt (D49). */
  generation: { key: string; videoId: string | null } | null;
  notice: Notice | null;
  busy: 'preview' | 'generation' | null;
}

export const initialFlow: FlowState = {
  danceSlug: null,
  photo: { kind: 'none' },
  consent: false,
  consentAt: null,
  previewId: null,
  previewUsed: false,
  generation: null,
  notice: null,
  busy: null,
};

function local(photo: PhotoState): LocalPhoto | null {
  return photo.kind === 'none' ? null : { file: photo.file, name: photo.name, url: photo.url };
}

/** Another dance: the consent box is unchecked again (D49), the photo is kept. */
export function selectDance(state: FlowState, slug: string): FlowState {
  if (state.danceSlug === slug) return state;
  return { ...state, danceSlug: slug, consent: false, consentAt: null, previewId: null, generation: null, notice: null };
}

/** A new photo: shown from the device only, the box unchecked (D50). */
export function choosePhoto(state: FlowState, photo: LocalPhoto): FlowState {
  return {
    ...state,
    photo: { kind: 'local', ...photo },
    consent: false,
    consentAt: null,
    previewId: null,
    generation: null,
    notice: null,
  };
}

/** True when ticking the box must send the photo now. */
export function needsUpload(state: FlowState): boolean {
  return state.consent && (state.photo.kind === 'local' || state.photo.kind === 'failed');
}

/**
 * The box: ticking records the consent time and asks for the upload of a
 * photo not sent yet; unticking stops any new upload (an upload already
 * running finishes, D94) and blocks Generate.
 */
export function setConsent(state: FlowState, checked: boolean, now: Date): FlowState {
  if (!checked) return { ...state, consent: false, consentAt: null };
  if (state.photo.kind === 'none') return state;
  return { ...state, consent: true, consentAt: now.toISOString(), notice: null };
}

export function uploadStarted(state: FlowState, token: number): FlowState {
  const photo = local(state.photo);
  if (!photo || !needsUpload(state)) return state;
  return { ...state, photo: { kind: 'sending', token, ...photo }, notice: null };
}

export type CheckOutcome =
  | { status: 'accepted'; photoId: string; userId: string }
  | { status: 'rejected'; reason: PhotoRejection }
  | { status: 'failed' };

/** The answer of check-photo, ignored when the photo changed meanwhile. */
export function uploadFinished(state: FlowState, token: number, outcome: CheckOutcome): FlowState {
  if (state.photo.kind !== 'sending' || state.photo.token !== token) return state;
  const photo = local(state.photo)!;
  switch (outcome.status) {
    case 'accepted':
      return { ...state, photo: { kind: 'accepted', photoId: outcome.photoId, userId: outcome.userId, ...photo } };
    case 'rejected':
      return { ...state, photo: { kind: 'rejected', reason: outcome.reason, ...photo }, consent: false, consentAt: null };
    case 'failed':
      return { ...state, photo: { kind: 'failed', ...photo }, notice: 'upload_failed' };
  }
}

/** The server no longer knows the photo as checked: back on the device, box unchecked (D94). */
export function photoNeedsRecheck(state: FlowState): FlowState {
  const photo = local(state.photo);
  if (!photo) return state;
  if (!photo.file) return { ...state, photo: { kind: 'none' }, consent: false, consentAt: null, notice: 'photo_gone' };
  return { ...state, photo: { kind: 'local', ...photo }, consent: false, consentAt: null, notice: 'recheck' };
}

/** Preview and Generate need a checked photo and the box ticked. */
export function canStart(state: FlowState): boolean {
  return state.photo.kind === 'accepted' && state.consent && state.consentAt !== null && state.danceSlug !== null && state.busy === null;
}

/** Make another (C11): same checked photo, another dance, the box to tick again. */
export function makeAnother(state: FlowState): FlowState {
  return { ...state, consent: false, consentAt: null, previewId: null, generation: null, notice: null, busy: null };
}

export function withNotice(state: FlowState, notice: Notice | null): FlowState {
  return { ...state, notice };
}
