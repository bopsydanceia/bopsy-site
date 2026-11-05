// What survives a reload or a magic link (never the photo itself): the
// flow's store is restored from it at start, before the Flow controller
// (flow.ts) loads with the first screen after the catalogue (D108).
import type { FlowState } from './flow-state';
import { safeStorage } from './store';

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
  previewPause: null,
  checkout: null,
};

const DRAFT_KEY = 'bopsy.flow.v1';

interface Draft {
  danceSlug: string | null;
  photo: { photoId: string; userId: string; name: string } | null;
  consentAt: string | null;
  previewId: string | null;
  previewUsed: boolean;
  generation: FlowState['generation'];
  checkout?: FlowState['checkout'];
}

export function saveDraft(state: FlowState): void {
  const draft: Draft = {
    danceSlug: state.danceSlug,
    photo: state.photo.kind === 'accepted' ? { photoId: state.photo.photoId, userId: state.photo.userId, name: state.photo.name } : null,
    consentAt: state.consent ? state.consentAt : null,
    previewId: state.previewId,
    previewUsed: state.previewUsed,
    generation: state.generation,
    checkout: state.checkout,
  };
  safeStorage.set(DRAFT_KEY, JSON.stringify(draft));
}

export function restoreDraft(): FlowState {
  try {
    const draft = JSON.parse(safeStorage.get(DRAFT_KEY) ?? 'null') as Draft | null;
    if (!draft) return initialFlow;
    return {
      ...initialFlow,
      danceSlug: draft.danceSlug,
      photo: draft.photo ? { kind: 'accepted', ...draft.photo, file: null, url: null } : { kind: 'none' },
      consent: draft.photo !== null && draft.consentAt !== null,
      consentAt: draft.photo ? draft.consentAt : null,
      previewId: draft.previewId,
      previewUsed: draft.previewUsed === true,
      generation: draft.generation ?? null,
      checkout: draft.checkout && typeof draft.checkout.productId === 'string' ? { productId: draft.checkout.productId, waiver: draft.checkout.waiver === true } : null,
    };
  } catch {
    return initialFlow;
  }
}
