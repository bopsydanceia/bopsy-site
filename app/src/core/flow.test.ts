// The flow controller against the demo server, with a test clock.
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { DEMO_DANCES, DEMO_TIMING } from '../demo/data';
import { FakeBackend } from '../demo/fake-backend';
import { canAfford, Flow, primaryAction } from './flow';
import { initialFlow } from './flow-state';
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
    expect(last()).toBe('/unlock');
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

  test('free preview first, Generate for a paying account, Unlock once the preview is used', () => {
    expect(primaryAction(initialFlow, null, null, 60)).toBe('preview');
    expect(primaryAction(initialFlow, guest, account(180, 0, true), 60)).toBe('preview');
    expect(primaryAction(initialFlow, user, account(180, 0, true), 60)).toBe('generate');
    expect(primaryAction({ ...initialFlow, previewUsed: true }, user, account(0, 0, false), 60)).toBe('unlock');
  });
});
