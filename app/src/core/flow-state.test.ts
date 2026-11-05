// Consent gating (D49, D50): nothing is sent before the box is ticked.
import { describe, expect, test } from 'vitest';
import {
  canStart,
  choosePhoto,
  initialFlow,
  makeAnother,
  needsUpload,
  photoNeedsRecheck,
  selectDance,
  setConsent,
  uploadFinished,
  uploadStarted,
  type FlowState,
} from './flow-state';

const now = new Date('2026-11-04T10:00:00Z');
const file = new Blob(['x'], { type: 'image/jpeg' });
const picked = (state: FlowState = selectDance(initialFlow, 'street-bounce')) => choosePhoto(state, { file, name: 'me.jpg', url: 'blob:1' });

describe('consent gating', () => {
  test('a picked photo stays on the device, box unchecked, nothing to send', () => {
    const state = picked();
    expect(state.photo.kind).toBe('local');
    expect(state.consent).toBe(false);
    expect(needsUpload(state)).toBe(false);
    expect(canStart(state)).toBe(false);
  });

  test('ticking the box records the time and asks for the upload', () => {
    const state = setConsent(picked(), true, now);
    expect(state.consentAt).toBe(now.toISOString());
    expect(needsUpload(state)).toBe(true);
  });

  test('unticking stops any new upload', () => {
    const state = setConsent(setConsent(picked(), true, now), false, now);
    expect(needsUpload(state)).toBe(false);
    expect(uploadStarted(state, 1)).toBe(state);
  });

  test('the box cannot be ticked without a photo', () => {
    const state = setConsent(selectDance(initialFlow, 'street-bounce'), true, now);
    expect(state.consent).toBe(false);
  });

  test('accepted photo plus ticked box: Generate works', () => {
    let state = uploadStarted(setConsent(picked(), true, now), 7);
    expect(state.photo.kind).toBe('sending');
    state = uploadFinished(state, 7, { status: 'accepted', photoId: 'p1', userId: 'u1' });
    expect(state.photo.kind).toBe('accepted');
    expect(canStart(state)).toBe(true);
  });

  test('an answer for a replaced photo is ignored', () => {
    const sending = uploadStarted(setConsent(picked(), true, now), 1);
    const replaced = choosePhoto(sending, { file, name: 'other.jpg', url: 'blob:2' });
    expect(uploadFinished(replaced, 1, { status: 'accepted', photoId: 'p1', userId: 'u1' })).toBe(replaced);
    expect(replaced.consent).toBe(false);
  });

  test('a rejected photo unchecks the box; a failed upload keeps it for Try again', () => {
    const sending = uploadStarted(setConsent(picked(), true, now), 1);
    const rejected = uploadFinished(sending, 1, { status: 'rejected', reason: 'several_subjects' });
    expect(rejected.consent).toBe(false);
    const failed = uploadFinished(sending, 1, { status: 'failed', reason: 'network' });
    expect(failed.consent).toBe(true);
    expect(failed.notice).toBe('upload_failed');
    expect(needsUpload(failed)).toBe(true);
  });

  test('another dance unchecks the box but keeps the checked photo', () => {
    let state = uploadFinished(uploadStarted(setConsent(picked(), true, now), 1), 1, { status: 'accepted', photoId: 'p1', userId: 'u1' });
    state = selectDance(state, 'hip-sway');
    expect(state.photo.kind).toBe('accepted');
    expect(state.consent).toBe(false);
    expect(canStart(state)).toBe(false);
    expect(canStart(setConsent(state, true, now))).toBe(true);
  });

  test('Make another keeps the photo and asks for the box again (C11)', () => {
    const state = uploadFinished(uploadStarted(setConsent(picked(), true, now), 1), 1, { status: 'accepted', photoId: 'p1', userId: 'u1' });
    const next = makeAnother({ ...state, previewId: 'v1', generation: { key: 'k', videoId: 'v2' } });
    expect(next.photo.kind).toBe('accepted');
    expect(next.consent).toBe(false);
    expect(next.generation).toBeNull();
  });

  test('photo_not_checked: back on the device, or gone without the file', () => {
    const accepted = uploadFinished(uploadStarted(setConsent(picked(), true, now), 1), 1, { status: 'accepted', photoId: 'p1', userId: 'u1' });
    const recheck = photoNeedsRecheck(accepted);
    expect(recheck.photo.kind).toBe('local');
    expect(recheck.consent).toBe(false);
    expect(recheck.notice).toBe('recheck');
    const restored: FlowState = { ...accepted, photo: { kind: 'accepted', photoId: 'p1', userId: 'u1', file: null, name: 'me.jpg', url: null } };
    expect(photoNeedsRecheck(restored).photo.kind).toBe('none');
    expect(photoNeedsRecheck(restored).notice).toBe('photo_gone');
  });
});
