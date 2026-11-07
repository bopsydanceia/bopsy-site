// The flow controller against the demo server, with a test clock.
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { DEMO_DANCES, DEMO_TIMING } from '../demo/data';
import { DEMO_CHECK_LIMIT_SECONDS, DEMO_PREVIEW_URL_SECONDS, FakeBackend } from '../demo/fake-backend';
import { readSimulations, type Simulation } from '../demo/sim';
import { canAfford, Flow, PREVIEW_OFF_PAUSE_MS, previewPaused, primaryAction } from './flow';
import { canPrepare, canRetryUpload, initialFlow } from './flow-state';
import { restoreDraft, saveDraft } from './draft';
import type { Account, Session } from './types';

const T0 = Date.parse('2026-11-04T10:00:00Z');
let clock: number;
let backend: FakeBackend;
let routes: string[];
let flow: Flow;

const photoFile = (name = 'man-sit.jpg') => [new Blob(['jpeg'], { type: 'image/jpeg' }), name] as const;
const last = () => routes[routes.length - 1];

function makeFlow(): Flow {
  return new Flow({
    backend,
    navigate: (path) => routes.push(path),
    dance: (slug) => DEMO_DANCES.find((dance) => dance.slug === slug),
    now: () => new Date(clock),
    sleep: async (ms) => {
      clock += ms;
    },
  });
}

async function checkedPhoto(name?: string): Promise<void> {
  flow.selectDance('street-bounce');
  flow.pickPhoto(...photoFile(name));
  await flow.setConsent(true);
}

async function signIn(email: string): Promise<boolean> {
  const sent = await backend.auth.sendCode(email);
  if (!sent.ok || !sent.demoCode) throw new Error('no code');
  const verified = await backend.auth.verifyCode(email, sent.demoCode);
  if (!verified.ok) throw new Error('bad code');
  return verified.userChanged;
}

beforeEach(() => {
  clock = T0;
  localStorage.clear();
  backend = new FakeBackend({ now: () => clock, sleep: async () => undefined, random: () => 0.5 });
  routes = [];
  flow = makeFlow();
});

describe('photo and consent', () => {
  test('nothing is uploaded before the box is ticked, then one checked photo (D50)', async () => {
    flow.selectDance('street-bounce');
    flow.pickPhoto(...photoFile());
    expect(Object.keys(backend.state.photos)).toHaveLength(0);
    expect(backend.auth.current()).toBeNull(); // no session either
    await flow.setConsent(true);
    expect(Object.keys(backend.state.photos)).toHaveLength(1);
    expect(flow.state.photo.kind).toBe('accepted');
    expect(backend.auth.current()?.guest).toBe(true);
  });

  test('a refused photo shows its reason and unchecks the box', async () => {
    await checkedPhoto('my-kid.jpg');
    expect(flow.state.photo).toMatchObject({ kind: 'rejected', reason: 'looks_like_child' });
    expect(flow.state.consent).toBe(false);
  });

  test('a failed upload is retried under the same box', async () => {
    await checkedPhoto('offline.jpg');
    expect(flow.state.photo.kind).toBe('failed');
    expect(flow.state.notice).toBe('upload_failed');
    const spy = vi.spyOn(backend, 'checkPhoto');
    await flow.retryUpload();
    expect(spy).toHaveBeenCalledOnce();
  });
});

describe('preview, email, paywall, generation', () => {
  test('preview, then the email: the guest becomes the account, no plan → paywall', async () => {
    await checkedPhoto();
    const guest = backend.auth.current()!;
    await flow.startPreview();
    expect(last()).toMatch(/^\/preview\//);
    await flow.unlock();
    expect(last()).toBe('/paywall'); // D139: the paywall first, the email after a pick
    flow.holdCheckout('bopsy_weekly', false);
    expect(last()).toBe('/unlock');
    const changed = await signIn('dancer@example.com');
    expect(changed).toBe(false);
    expect(backend.auth.current()).toEqual({ userId: guest.userId, email: 'dancer@example.com', guest: false });
    await flow.continueSignedIn(changed);
    expect(last()).toBe('/paywall');
  });

  test('after a purchase, start-generation waits for the webhook, then debits 60', async () => {
    await checkedPhoto();
    await signIn('dancer@example.com');
    backend.recordPurchase('bopsy_weekly');
    const spy = vi.spyOn(backend, 'startGeneration');
    await flow.generate({ afterPurchase: true });
    expect(spy.mock.calls.length).toBeGreaterThan(1); // not_subscribed until the webhook landed
    expect(new Set(spy.mock.calls.map(([request]) => request.idempotencyKey)).size).toBe(1);
    expect(last()).toMatch(/^\/generating\//);
    expect((await backend.account())?.wallet).toEqual({ plan: 120, bought: 0, total: 120 });
    expect(flow.state.consent).toBe(false); // unchecked after each start (D49)
  });

  test('without a purchase, no plan sends to the paywall', async () => {
    await checkedPhoto();
    await signIn('dancer@example.com');
    await flow.generate();
    expect(last()).toBe('/paywall');
  });

  test('an email that already has an account: the photo is sent again under it', async () => {
    await checkedPhoto();
    await signIn('returning@example.com');
    const account = backend.auth.current()!.userId;
    await backend.auth.signOut();
    flow.reset();
    await checkedPhoto();
    expect(flow.state.photo).toMatchObject({ kind: 'accepted' });
    const changed = await signIn('returning@example.com');
    expect(changed).toBe(true);
    await flow.continueSignedIn(changed);
    expect(flow.state.photo).toMatchObject({ kind: 'accepted', userId: account });
    expect(Object.values(backend.state.photos).filter((photo) => photo.userId === account)).toHaveLength(2);
    expect(last()).toBe('/paywall');
  });

  test('a second preview in the same browser is refused: straight to the email', async () => {
    await checkedPhoto();
    await flow.startPreview();
    await backend.auth.signOut();
    flow.reset();
    await checkedPhoto();
    await flow.startPreview();
    expect(flow.state.previewUsed).toBe(true);
    expect(flow.state.notice).toBe('preview_used');
    expect(last()).toBe('/paywall');
  });

  test('a photo the server no longer knows is checked again', async () => {
    await checkedPhoto();
    await signIn('dancer@example.com');
    backend.recordPurchase('bopsy_weekly');
    clock += DEMO_TIMING.webhookMs;
    for (const id of Object.keys(backend.state.photos)) delete backend.state.photos[id];
    await flow.generate();
    expect(flow.state.photo.kind).toBe('local');
    expect(flow.state.notice).toBe('recheck');
    expect(last()).toBe('/create/street-bounce');
  });

  test('a lost answer keeps the idempotency key for the retry', async () => {
    await checkedPhoto();
    await signIn('dancer@example.com');
    backend.recordPurchase('bopsy_weekly');
    clock += DEMO_TIMING.webhookMs;
    const spy = vi.spyOn(backend, 'startGeneration').mockResolvedValueOnce({ kind: 'failed' });
    await flow.generate();
    expect(flow.state.notice).toBe('error');
    await flow.generate();
    expect(spy.mock.calls[0]![0].idempotencyKey).toBe(spy.mock.calls[1]![0].idempotencyKey);
    expect(last()).toMatch(/^\/generating\//);
  });

  test('a failed video gives its coins back', async () => {
    await checkedPhoto('fail-photo.jpg');
    await signIn('dancer@example.com');
    backend.recordPurchase('bopsy_weekly');
    clock += DEMO_TIMING.webhookMs;
    await flow.generate();
    clock += DEMO_TIMING.queuedMs + DEMO_TIMING.renderMs;
    const video = await backend.video(last()!.split('/').pop()!);
    expect(video).toMatchObject({ status: 'failed', coinsRefunded: 60 });
    expect((await backend.account())?.wallet.total).toBe(180);
  });
});

describe('main button and C4', () => {
  const account = (total: number, bought: number, active: boolean): Account => ({
    wallet: { plan: total - bought, bought, total },
    subscription: { active, period: 'weekly', renewsAt: null },
  });
  const user: Session = { userId: 'u', email: 'a@b.co', guest: false };
  const guest: Session = { userId: 'g', email: null, guest: true };

  test('canAfford: plan and bought with a plan, bought only without (C4)', () => {
    expect(canAfford(account(180, 0, true), 60)).toBe(true);
    expect(canAfford(account(180, 0, false), 60)).toBe(false);
    expect(canAfford(account(60, 60, false), 60)).toBe(true);
    expect(canAfford(null, 60)).toBe(false);
  });

  test('free preview first when it is on, Generate for a paying account, Make my video otherwise', () => {
    const now = Date.now();
    expect(primaryAction(initialFlow, null, null, 60, now, true)).toBe('preview');
    expect(primaryAction(initialFlow, guest, account(180, 0, true), 60, now, true)).toBe('preview');
    expect(primaryAction(initialFlow, user, account(180, 0, true), 60, now, true)).toBe('generate');
    expect(primaryAction({ ...initialFlow, previewUsed: true }, user, account(0, 0, false), 60, now, true)).toBe('make');
    // D139: the free preview is off by default.
    expect(primaryAction(initialFlow, null, null, 60)).toBe('make');
    expect(primaryAction(initialFlow, user, account(180, 0, true), 60)).toBe('generate');
  });
});

describe('limits, CAPTCHA and refusals of the server (D130 to D132), through the demo simulations', () => {
  function simulate(...names: Simulation[]): void {
    backend = new FakeBackend({ now: () => clock, sleep: async () => undefined, random: () => 0.5, sim: new Set(names) });
    flow = makeFlow();
  }

  test('check-photo 429: "too many checks" with the wait; Try again checks the same file, no new upload', async () => {
    simulate('check-limit');
    await checkedPhoto();
    expect(flow.state.photo).toMatchObject({ kind: 'failed', failure: 'rate_limited' });
    expect(flow.state.notice).toEqual({ kind: 'rate_limited', action: 'photo_check', until: clock + DEMO_CHECK_LIMIT_SECONDS * 1000 });
    expect(Object.keys(backend.state.uploads)).toHaveLength(1);
    const spy = vi.spyOn(backend, 'checkPhoto');
    await flow.retryUpload();
    expect(spy.mock.calls[0]![2]).toEqual({ photoPath: Object.keys(backend.state.uploads)[0], userId: backend.auth.current()!.userId });
    expect(flow.state.photo.kind).toBe('accepted');
    expect(Object.keys(backend.state.uploads)).toHaveLength(1);
  });

  test('a lost answer keeps the uploaded file for Try again, never for another photo', async () => {
    await checkedPhoto('offline.jpg');
    expect(flow.state.photo).toMatchObject({ kind: 'failed', failure: 'network' });
    expect(flow.state.notice).toBe('upload_failed');
    const spy = vi.spyOn(backend, 'checkPhoto');
    await flow.retryUpload();
    expect(spy.mock.calls[0]![2]?.photoPath).toBe(Object.keys(backend.state.uploads)[0]);
    flow.pickPhoto(...photoFile('offline-2.jpg'));
    await flow.setConsent(true);
    expect(spy.mock.calls[1]![2]).toBeUndefined();
  });

  test('the bucket refuses: too large or wrong type (another photo needed), daily cap (until UTC midnight)', async () => {
    await checkedPhoto('huge-toolarge.jpg');
    expect(flow.state.photo).toMatchObject({ kind: 'failed', failure: 'too_large' });
    expect(flow.state.notice).toBe('photo_too_large');
    expect(canRetryUpload('too_large')).toBe(false);
    await checkedPhoto('scan-badtype.jpg');
    expect(flow.state.notice).toBe('photo_type');
    expect(canRetryUpload('bad_type')).toBe(false);
    await checkedPhoto('dailycap.jpg');
    expect(flow.state.notice).toEqual({ kind: 'rate_limited', action: 'photo_upload', until: Date.parse('2026-11-05T00:00:00Z') });
    expect(canRetryUpload('daily_cap')).toBe(true);
  });

  test('the guest session CAPTCHA refused: its own message, and Try again goes through', async () => {
    simulate('captcha-photo');
    await checkedPhoto();
    expect(flow.state.photo).toMatchObject({ kind: 'failed', failure: 'captcha' });
    expect(flow.state.notice).toBe('captcha_failed');
    expect(backend.auth.current()).toBeNull();
    await flow.retryUpload();
    expect(flow.state.photo.kind).toBe('accepted');
  });

  test('preview: the IP limit pauses free previews until UTC midnight and sends to the email', async () => {
    simulate('preview-limit');
    await checkedPhoto();
    await flow.startPreview();
    const until = Date.parse('2026-11-05T00:00:00Z');
    expect(flow.state.notice).toEqual({ kind: 'rate_limited', action: 'preview', until });
    expect(flow.state.previewPause).toEqual({ reason: 'limit', until });
    expect(flow.state.previewUsed).toBe(false);
    expect(last()).toBe('/paywall');
    expect(primaryAction(flow.state, backend.auth.current(), null, 60, clock, true)).toBe('make');
    expect(primaryAction(flow.state, backend.auth.current(), null, 60, until, true)).toBe('preview');
  });

  test('preview: switched off on the server, a pause of 10 min and the email; kept after a reset', async () => {
    simulate('preview-off');
    await checkedPhoto();
    await flow.startPreview();
    expect(flow.state.notice).toBe('preview_off');
    expect(flow.state.previewPause).toEqual({ reason: 'off', until: clock + PREVIEW_OFF_PAUSE_MS });
    expect(last()).toBe('/paywall');
    flow.reset();
    expect(previewPaused(flow.state, clock)).toBe(true);
  });

  test('preview: the CAPTCHA refused twice is a message on the page; the next tap starts it', async () => {
    simulate('captcha-preview');
    await checkedPhoto();
    await flow.startPreview();
    expect(flow.state.notice).toBe('captcha_failed');
    expect(routes).toEqual([]);
    await flow.startPreview();
    expect(last()).toMatch(/^\/preview\//);
  });

  test('generation: the hourly limit shows its wait and stops the post-purchase retries (D122)', async () => {
    simulate('generation-limit');
    await checkedPhoto();
    await signIn('dancer@example.com');
    backend.recordPurchase('bopsy_weekly');
    const spy = vi.spyOn(backend, 'startGeneration');
    await flow.generate({ afterPurchase: true });
    expect(spy).toHaveBeenCalledOnce();
    expect(flow.state.notice).toEqual({ kind: 'rate_limited', action: 'generation', until: Date.parse('2026-11-04T11:00:00Z') });
    expect(flow.state.busy).toBeNull();
    expect(flow.state.generation).toBeNull();
    expect(routes.filter((route) => route.startsWith('/generating'))).toEqual([]);
  });
});

describe('the demo simulations (?sim=)', () => {
  test('read from the address, unknown names ignored', () => {
    expect([...readSimulations('?sim=preview-off, report-limit,nope')]).toEqual(['preview-off', 'report-limit']);
    expect(readSimulations('').size).toBe(0);
  });

  test('reports, Send code, previews: the server answers simulated, the happy path unchanged without', async () => {
    backend = new FakeBackend({ now: () => clock, sleep: async () => undefined, random: () => 0.5, sim: new Set(['report-limit', 'captcha-code']) });
    flow = makeFlow();
    await checkedPhoto();
    await flow.startPreview();
    const previewId = last()!.split('/').pop()!;
    clock += DEMO_TIMING.previewMs;
    expect(await backend.report(previewId, 'other', '')).toEqual({ kind: 'rate_limited', action: 'report', retryAfter: 14 * 3600 - 6 });
    expect(await backend.sendCode('a@b.co')).toEqual({ ok: false, error: 'captcha' });
    expect(await backend.sendCode('a@b.co')).toMatchObject({ ok: true });
    const link = await backend.previewUrl(previewId);
    expect(link).toMatchObject({ url: expect.stringMatching(/preview\.mp4$/), expiresAt: clock + DEMO_PREVIEW_URL_SECONDS * 1000 });
    const video = (await backend.video(previewId))!;
    expect(await backend.videoUrl(video)).toBeNull(); // never a download for a preview
    expect(await new FakeBackend({ now: () => clock }).previewUrl(previewId)).toBeNull(); // another visitor
  });
});

describe('D139: nothing generated before payment, paywall before the email', () => {
  test('Make my video needs the box and a photo sent or checked; it opens the preparing screen', async () => {
    flow.selectDance('street-bounce');
    flow.pickPhoto(...photoFile());
    expect(canPrepare(flow.state)).toBe(false); // not sent yet
    await flow.setConsent(true);
    expect(canPrepare(flow.state)).toBe(true);
    flow.prepare();
    expect(last()).toBe('/ready');
    expect(Object.values(backend.state.videos ?? {})).toHaveLength(0); // no preview, no video
  });

  test('a guest picks a plan, gives the email, the pick comes back once', async () => {
    await checkedPhoto();
    await flow.unlock();
    expect(last()).toBe('/paywall');
    flow.holdCheckout('bopsy_yearly', true);
    expect(last()).toBe('/unlock');
    expect(flow.state.checkout).toEqual({ productId: 'bopsy_yearly', waiver: true });
    await flow.continueSignedIn(await signIn('new@example.com'));
    expect(last()).toBe('/paywall');
    expect(flow.takeCheckout()).toEqual({ productId: 'bopsy_yearly', waiver: true });
    expect(flow.takeCheckout()).toBeNull();
  });

  test('an email that already has coins skips the checkout and starts the video', async () => {
    await checkedPhoto();
    await signIn('rich@example.com');
    backend.recordPurchase('bopsy_weekly');
    clock += DEMO_TIMING.webhookMs + 1; // the webhook has credited
    await backend.auth.signOut();
    flow = makeFlow();
    await checkedPhoto();
    flow.holdCheckout('bopsy_weekly', false);
    await flow.continueSignedIn(await signIn('rich@example.com'));
    expect(flow.state.checkout).toBeNull();
    expect(last()).toMatch(/^\/generating\//);
  });

  test('the held pick survives a reload (magic link)', () => {
    saveDraft({ ...initialFlow, checkout: { productId: 'bopsy_weekly', waiver: false } });
    expect(restoreDraft().checkout).toEqual({ productId: 'bopsy_weekly', waiver: false });
  });

  test('the news box is kept on the signed-in account only', async () => {
    await checkedPhoto();
    await backend.auth.saveNewsletterChoice(true);
    expect(backend.state.users[backend.auth.current()!.userId]!.newsletter).toBeUndefined(); // guest: nothing
    await signIn('news@example.com');
    await backend.auth.saveNewsletterChoice(true);
    expect(backend.state.users[backend.auth.current()!.userId]!.newsletter).toBe(true);
  });
});

describe('HEIC photos (Samsung and most Android cameras)', () => {
  const heicBytes = () => new Blob([new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63, 0, 0, 0, 0])], { type: '' });

  test('detected by its first bytes, converted to JPEG before the upload, then sent as JPEG', async () => {
    const jpeg = new Blob(['jpeg'], { type: 'image/jpeg' });
    const converter = vi.fn(async () => jpeg);
    flow.heicConverter = converter;
    flow.selectDance('street-bounce');
    flow.pickPhoto(heicBytes(), 'IMG_2026.heic');
    expect(flow.state.photo).toMatchObject({ kind: 'local', url: null }); // no broken preview meanwhile
    const spy = vi.spyOn(backend, 'checkPhoto');
    await flow.setConsent(true);
    expect(converter).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledOnce();
    expect((spy.mock.calls[0]![1] as string)).toBe('IMG_2026.jpg');
    expect(flow.state.photo.kind).toBe('accepted');
  });

  test('a HEIC that cannot be decoded: the photo-type message, nothing sent', async () => {
    flow.heicConverter = vi.fn(async () => {
      throw new Error('libheif');
    });
    flow.selectDance('street-bounce');
    flow.pickPhoto(heicBytes(), 'photo.heic');
    const spy = vi.spyOn(backend, 'checkPhoto');
    await flow.setConsent(true);
    expect(flow.state.notice).toBe('photo_type');
    expect(spy).not.toHaveBeenCalled();
  });

  test('a JPEG is never sent to the converter', async () => {
    const converter = vi.fn(async (b: Blob) => b);
    flow.heicConverter = converter;
    await checkedPhoto();
    expect(converter).not.toHaveBeenCalled();
  });
});
