// The flow controller (D113, D139): dance → photo → consent and check →
// preparing → locked video → paywall → email → checkout → generation. Side effects go through the
// Backend port; the screens only call these methods and read the store.
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
  withNotice,
  type CheckOutcome,
  type FlowState,
  type Notice,
} from './flow-state';
import { prepareUpload } from './image';
import type { RateLimited } from './limits';
import type { Backend } from './ports';
import type { Navigate } from './router';
import { restoreDraft, saveDraft } from './draft';
import { createStore, uuid, type Store } from './store';
import type { Account, Dance, PhotoCheckResult, Session, StartResult, UploadedPhoto } from './types';

export type PrimaryAction = 'generate' | 'preview' | 'make';

/** C4: a subscriber spends plan then bought coins; without a plan, bought coins only. */
export function canAfford(account: Account | null, cost: number): boolean {
  if (!account) return false;
  return account.subscription?.active ? account.wallet.total >= cost : account.wallet.bought >= cost;
}

/** Free previews paused for this visitor (IP limit of the day, or off on the server). */
export function previewPaused(flow: FlowState, now: number): boolean {
  return flow.previewPause !== null && now < flow.previewPause.until;
}

/**
 * What the main button of a checked photo does: Generate for a buyer with
 * enough coins; else the free preview when it is on (D130) and still
 * available; else "Make my video" (D139: preparing, then the paywall).
 */
export function primaryAction(
  flow: FlowState,
  session: Session | null,
  account: Account | null,
  cost: number,
  now = Date.now(),
  freePreview = false,
): PrimaryAction {
  if (session && !session.guest && canAfford(account, cost)) return 'generate';
  return freePreview && !flow.previewUsed && !previewPaused(flow, now) ? 'preview' : 'make';
}

export interface FlowDeps {
  backend: Backend;
  navigate: Navigate;
  dance: (slug: string) => Dance | undefined;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
  /** The app's flow store (app-state.ts, restored and saved there); else one made here. */
  store?: Store<FlowState>;
  /** Default false in tests: no localStorage draft. */
  persist?: boolean;
}

/** After a purchase the webhook may lag: start-generation is retried this long (D49 "plan activating"). */
export const ACTIVATION_WAIT_MS = 45_000;
export const ACTIVATION_RETRY_MS = 2_500;
/** Previews switched off on the server (503 preview_unavailable): asked again after this long. */
export const PREVIEW_OFF_PAUSE_MS = 10 * 60_000;

export class Flow {
  readonly store: Store<FlowState>;
  private uploadToken = 0;
  /** The picked file as sent (2048 px JPEG), made once per photo. */
  private prepared: { file: Blob; blob: Blob } | null = null;
  /** The file already in the bucket after a failed check: check-photo is asked again without a new upload. */
  private uploaded: { file: Blob; ref: UploadedPhoto } | null = null;
  private readonly now: () => Date;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly deps: FlowDeps) {
    this.now = deps.now ?? (() => new Date());
    this.sleep = deps.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.store = deps.store ?? createStore<FlowState>(deps.persist ? restoreDraft() : initialFlow);
    if (deps.persist && !deps.store) this.store.subscribe(saveDraft);
  }

  get state(): FlowState {
    return this.store.get();
  }

  private set(update: (state: FlowState) => FlowState): void {
    this.store.set(update);
  }

  notice(notice: Notice | null): void {
    this.set((state) => withNotice(state, notice));
  }

  selectDance(slug: string): void {
    this.set((state) => selectDance(state, slug));
  }

  pickPhoto(file: Blob, name: string): void {
    const previous = this.state.photo;
    if (previous.kind !== 'none' && previous.url?.startsWith('blob:')) URL.revokeObjectURL(previous.url);
    const url = typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : null;
    this.uploadToken++;
    this.prepared = null;
    this.uploaded = null;
    this.set((state) => choosePhoto(state, { file, name, url }));
  }

  /** The consent box. Ticking it sends a photo not sent yet (D50). */
  async setConsent(checked: boolean): Promise<void> {
    this.set((state) => setConsent(state, checked, this.now()));
    if (needsUpload(this.state)) await this.upload();
  }

  /** Try again after a failed upload, under the same ticked box (D94). */
  async retryUpload(): Promise<void> {
    if (needsUpload(this.state)) await this.upload();
  }

  private async upload(): Promise<void> {
    const token = ++this.uploadToken;
    this.set((state) => uploadStarted(state, token));
    const photo = this.state.photo;
    if (photo.kind !== 'sending' || !photo.file) return;
    const file = photo.file;
    const userId = this.deps.backend.auth.current()?.userId ?? null;
    const uploaded = this.uploaded?.file === file && this.uploaded.ref.userId === userId ? this.uploaded.ref : undefined;
    let outcome: PhotoCheckResult;
    try {
      if (this.prepared?.file !== file) this.prepared = { file, blob: await prepareUpload(file) };
      outcome = await this.deps.backend.checkPhoto(this.prepared.blob, photo.name, uploaded);
    } catch {
      outcome = { status: 'failed', reason: 'network' };
    }
    if (token !== this.uploadToken) return; // another photo meanwhile
    this.uploaded = outcome.status === 'failed' && outcome.uploaded ? { file, ref: outcome.uploaded } : null;
    const checked: CheckOutcome =
      outcome.status === 'failed'
        ? { status: 'failed', reason: outcome.reason, until: outcome.retryAfter ? this.until(outcome.retryAfter) : null }
        : outcome;
    this.set((state) => uploadFinished(state, token, checked));
  }

  private until(retryAfter: number): number {
    return this.now().getTime() + retryAfter * 1000;
  }

  private limitNotice(result: RateLimited): Notice {
    return { kind: 'rate_limited', action: result.action, until: this.until(result.retryAfter) };
  }

  private request(): { dance: Dance; photoId: string; consentAt: string } | null {
    const state = this.state;
    const dance = state.danceSlug ? this.deps.dance(state.danceSlug) : undefined;
    if (!dance || !canStart(state) || state.photo.kind !== 'accepted' || !state.consentAt) return null;
    return { dance, photoId: state.photo.photoId, consentAt: state.consentAt };
  }

  /** "Generate free preview" (S50 on the web: 2 s 480p, one per account, browser and IP). */
  async startPreview(): Promise<void> {
    const request = this.request();
    if (!request) return;
    this.set((state) => ({ ...state, busy: 'preview', notice: null }));
    const result = await this.deps.backend.startPreview({ danceId: request.dance.id, photoId: request.photoId, consentAt: request.consentAt });
    this.set((state) => ({ ...state, busy: null }));
    if (result.kind === 'started') {
      this.set((state) => ({ ...state, previewId: result.video.id, previewUsed: true }));
      this.deps.navigate(`/preview/${result.video.id}`);
      return;
    }
    if (result.kind === 'refused' && result.refusal === 'preview_already_used') {
      this.set((state) => ({ ...state, previewUsed: true, notice: 'preview_used' }));
      await this.unlock();
      return;
    }
    // No free preview for now (IP limit of the day, or off on the server): the full video instead.
    if (result.kind === 'rate_limited' || result.kind === 'preview_unavailable') {
      const limited = result.kind === 'rate_limited';
      const until = limited ? this.until(result.retryAfter) : this.now().getTime() + PREVIEW_OFF_PAUSE_MS;
      const notice: Notice = limited ? this.limitNotice(result) : 'preview_off';
      this.set((state) => ({ ...state, previewPause: { reason: limited ? 'limit' : 'off', until }, notice }));
      await this.unlock();
      return;
    }
    this.onRefusal(result);
  }

  /** "Make my video" (D139): the preparing screen, which waits for the photo check. */
  prepare(): void {
    this.set((state) => ({ ...state, notice: null }));
    this.deps.navigate('/ready');
  }

  /**
   * "Unlock my video": a guest sees the paywall first, the email is asked
   * after a plan is picked (D139); a signed-in buyer goes on to the video or
   * the paywall.
   */
  async unlock(): Promise<void> {
    const session = this.deps.backend.auth.current();
    if (!session || session.guest) {
      this.deps.navigate('/paywall');
      return;
    }
    await this.continueSignedIn(false);
  }

  /** A guest picked a plan: kept while the email is asked, then the checkout opens by itself. */
  holdCheckout(productId: string, waiver: boolean): void {
    this.set((state) => ({ ...state, checkout: { productId, waiver } }));
    // Replaces the paywall: after the code, the paywall comes back in its place and Back goes to the locked video.
    this.deps.navigate('/unlock', { replace: true });
  }

  /** The held checkout, taken once (the paywall opens it). */
  takeCheckout(): FlowState['checkout'] {
    const checkout = this.state.checkout;
    if (checkout) this.set((state) => ({ ...state, checkout: null }));
    return checkout;
  }

  /**
   * After the code is verified. When the email belonged to another account,
   * the photo is sent again under it (same file, same consent).
   */
  async continueSignedIn(userChanged: boolean): Promise<void> {
    const session = this.deps.backend.auth.current();
    const photo = this.state.photo;
    if (session && photo.kind === 'accepted' && (userChanged || photo.userId !== session.userId)) {
      if (!photo.file) {
        this.set((state) => photoNeedsRecheck(state));
        this.goCreate();
        return;
      }
      this.set((state) => ({ ...state, photo: { kind: 'local', file: photo.file, name: photo.name, url: photo.url } }));
      await this.upload();
      if (this.state.photo.kind !== 'accepted') {
        this.goCreate();
        return;
      }
    }
    const dance = this.state.danceSlug ? this.deps.dance(this.state.danceSlug) : undefined;
    if (!dance || this.state.photo.kind !== 'accepted') {
      this.deps.navigate(dance ? `/create/${dance.slug}` : '/', { replace: true });
      return;
    }
    const account = await this.deps.backend.account();
    if (canAfford(account, dance.cost)) {
      // An account that already has the coins: no checkout needed.
      this.set((state) => ({ ...state, checkout: null }));
      await this.generate();
    }
    else this.deps.navigate('/paywall', { replace: true });
  }

  /**
   * Starts the paid video (coins debited server side). After a purchase,
   * not_subscribed and not_enough_coins mean the webhook has not landed yet:
   * retried for ACTIVATION_WAIT_MS with the same key.
   */
  async generate(options: { afterPurchase?: boolean } = {}): Promise<void> {
    const request = this.request();
    if (!request) {
      this.goCreate();
      return;
    }
    const key = this.state.generation?.key ?? uuid();
    this.set((state) => ({ ...state, generation: { key, videoId: null }, busy: 'generation', notice: null }));
    const deadline = this.now().getTime() + (options.afterPurchase ? ACTIVATION_WAIT_MS : 0);
    for (;;) {
      const result = await this.deps.backend.startGeneration({
        danceId: request.dance.id,
        photoId: request.photoId,
        consentAt: request.consentAt,
        idempotencyKey: key,
      });
      if (result.kind === 'rate_limited') {
        // The hourly limit: nothing was debited, the post-purchase wait stops here.
        this.set((state) => ({ ...state, busy: null, generation: null, notice: this.limitNotice(result) }));
        return;
      }
      if (result.kind === 'started') {
        // The box is unchecked after each start (D49); the photo stays for Make another.
        this.set((state) => ({ ...state, generation: { key, videoId: result.video.id }, busy: null, consent: false, consentAt: null }));
        this.deps.navigate(`/generating/${result.video.id}`, { replace: true });
        return;
      }
      const waiting = result.kind === 'refused' && (result.refusal === 'not_subscribed' || result.refusal === 'not_enough_coins');
      if (waiting && options.afterPurchase && this.now().getTime() < deadline) {
        this.notice('plan_activating');
        await this.sleep(ACTIVATION_RETRY_MS);
        continue;
      }
      // A refusal changes nothing on the server: the next try gets a new key.
      // A lost answer keeps the key, so a retry cannot charge twice.
      this.set((state) => ({ ...state, busy: null, generation: result.kind === 'failed' ? state.generation : null }));
      if (waiting) {
        if (options.afterPurchase) this.notice('plan_activating');
        else this.deps.navigate('/paywall');
        return;
      }
      this.onRefusal(result);
      return;
    }
  }

  private onRefusal(result: Exclude<StartResult, { kind: 'started' }>): void {
    switch (result.kind) {
      case 'failed':
        this.notice('error');
        return;
      case 'captcha_failed':
        this.notice('captcha_failed');
        return;
      case 'preview_unavailable':
        this.notice('preview_off');
        return;
      case 'rate_limited':
        this.notice(this.limitNotice(result));
        return;
      case 'refused':
        break;
    }
    switch (result.refusal) {
      case 'consent_missing':
        this.set((state) => ({ ...state, consent: false, consentAt: null, notice: 'consent_missing' }));
        this.goCreate();
        return;
      case 'photo_not_checked':
        this.set((state) => photoNeedsRecheck(state));
        this.goCreate();
        return;
      case 'too_many_in_progress':
        this.notice('too_many');
        return;
      case 'dance_unavailable':
        this.notice('dance_unavailable');
        this.deps.navigate('/', { replace: true });
        return;
      case 'not_subscribed':
      case 'not_enough_coins':
        this.deps.navigate('/paywall');
        return;
      case 'preview_already_used':
        this.set((state) => ({ ...state, previewUsed: true, notice: 'preview_used' }));
        return;
    }
  }

  private goCreate(): void {
    const slug = this.state.danceSlug;
    this.deps.navigate(slug ? `/create/${slug}` : '/', { replace: true });
  }

  /** Make another (C11): the same checked photo, the catalogue to pick a dance. */
  makeAnother(): void {
    this.set((state) => makeAnother(state));
    this.deps.navigate('/');
  }

  /** Sign out or media deleted: nothing of the previous account stays in the flow. */
  reset(): void {
    this.uploadToken++;
    this.prepared = null;
    this.uploaded = null;
    this.store.set({ ...initialFlow, previewUsed: this.state.previewUsed, previewPause: this.state.previewPause });
  }
}
