// OTP, paywall, prices, EU waiver, progress, router, keys, share: the pure modules.
import { describe, expect, test } from 'vitest';
import { demoOffer } from '../demo/fake-billing';
import { isLikelyEuBuyer } from './eu';
import { isLiveConfig, keyProblems, missingLiveKeys } from './keys';
import * as otp from './otp';
import * as pw from './paywall';
import { formatMoney, introWeeks, money, perWeek, planSubtitle, planTitle, renewalTerms, savePercent } from './prices';
import { displayProgress, isTakingLonger, minutesLeft } from './progress';
import { parseHash, pathOf } from './router';
import { downloadName, shareVideo } from './share';

describe('email code (OTP)', () => {
  test('emails and codes', () => {
    expect(otp.isValidEmail(' Dancer@Example.com ')).toBe(true);
    expect(otp.isValidEmail('dancer@example')).toBe(false);
    expect(otp.isValidEmail('no spaces@example.com')).toBe(false);
    expect(otp.sanitizeCode('Code: 123 456 789')).toBe('123456');
  });

  test('send, type, verify, fail, resend after 60 s', () => {
    let state = otp.emailChanged(otp.initialOtp, 'A@B.co');
    expect(otp.canSendCode(state)).toBe(true);
    state = otp.sending(state);
    expect(state.email).toBe('a@b.co');
    expect(otp.canSendCode(state)).toBe(false);
    state = otp.codeSent(state, 1_000, '424242');
    expect(state).toMatchObject({ step: 'code', demoCode: '424242', busy: false });
    state = otp.codeChanged(state, '4242');
    expect(otp.canVerify(state)).toBe(false);
    state = otp.codeChanged(state, '424242');
    expect(otp.canVerify(state)).toBe(true);
    state = otp.failed(otp.verifying(state), 'invalid_code');
    expect(state).toMatchObject({ code: '', error: 'invalid_code', busy: false });
    expect(otp.canResend(state, 30_000)).toBe(false);
    expect(otp.resendIn(state, 30_000)).toBe(31);
    expect(otp.canResend(state, 61_000)).toBe(true);
    expect(otp.changeEmail(state)).toMatchObject({ step: 'email', email: 'a@b.co', code: '' });
  });
});

describe('prices from the offerings', () => {
  const offer = demoOffer(true, false);
  const weekly = offer.plans.find((plan) => plan.period === 'week')!;
  const yearly = offer.plans.find((plan) => plan.period === 'year')!;

  test('titles and subtitles of 07, with the launch offer', () => {
    expect(planTitle(weekly)).toBe('$7.99 / week');
    expect(planSubtitle(weekly)).toBe('for your first 2 weeks, then $9.99 / week');
    expect(planTitle(yearly)).toBe('$79.99 / year');
    expect(planSubtitle(yearly)).toBe('$1.54 / week · 240 coins every month');
    expect(savePercent(weekly.price, yearly.price)).toBe(85);
  });

  test('no launch offer when not eligible', () => {
    const plain = demoOffer(false, false).plans.find((plan) => plan.period === 'week')!;
    expect(plain.intro).toBeNull();
    expect(planTitle(plain)).toBe('$9.99 / week');
    expect(planSubtitle(plain)).toBe('Billed weekly · cancel anytime');
    expect(renewalTerms(plain)).toMatch(/^\$9\.99 \/ week, charged today and every week until you cancel/);
  });

  test('the store string is shown as it is; computed prices follow its currency', () => {
    const euro = money(79_990_000, 'EUR', '79,99 €');
    expect(euro.formatted).toBe('79,99 €');
    expect(perWeek(euro).formatted).toBe(formatMoney(1_540_000, 'EUR'));
    expect(savePercent(money(9_990_000, 'USD'), euro)).toBeNull();
  });

  test('intro durations', () => {
    expect(introWeeks('P1W', 2)).toBe(2);
    expect(introWeeks('P14D', 1)).toBe(2);
    expect(introWeeks('P1M', 1)).toBe(4);
    expect(introWeeks('P3D', 1)).toBeNull();
    expect(introWeeks(null, 1)).toBeNull();
  });
});

describe('paywall state', () => {
  const buyer = { timeZone: 'America/Chicago' };

  test('plans for everyone, weekly preselected; packs for subscribers (C5)', () => {
    const plans = pw.offerLoaded(pw.initialPaywall, demoOffer(true, false), buyer);
    expect(plans).toMatchObject({ mode: 'plans', selected: 'bopsy_weekly', status: 'ready', waiverRequired: false });
    const packs = pw.offerLoaded(pw.initialPaywall, demoOffer(false, true), buyer);
    expect(packs).toMatchObject({ mode: 'packs', selected: 'bopsy_coins_600' });
    expect(pw.itemsOf(packs).map((item) => item.productId)).toEqual(['bopsy_coins_600', 'bopsy_coins_1500']);
  });

  test('EU buyer: Continue waits for the waiver, which goes into the metadata (D115)', () => {
    let state = pw.offerLoaded(pw.initialPaywall, demoOffer(true, false), { timeZone: 'Europe/Paris' });
    expect(state.waiverRequired).toBe(true);
    expect(pw.canContinue(state)).toBe(false);
    expect(pw.purchaseMetadata(state, new Date(0))).toEqual({});
    state = pw.setWaiver(state, true);
    expect(pw.canContinue(state)).toBe(true);
    expect(pw.purchaseMetadata(state, new Date(0))).toMatchObject({ withdrawal_waiver_at: '1970-01-01T00:00:00.000Z' });
  });

  test('selection: known products only, frozen while buying; empty offer is an error', () => {
    const state = pw.offerLoaded(pw.initialPaywall, demoOffer(true, false), buyer);
    expect(pw.select(state, 'bopsy_yearly').selected).toBe('bopsy_yearly');
    expect(pw.select(state, 'bopsy_coins_600')).toBe(state);
    expect(pw.select({ ...state, status: 'buying' }, 'bopsy_yearly').selected).toBe('bopsy_weekly');
    expect(pw.canContinue({ ...state, status: 'buying' })).toBe(false);
    const empty = pw.offerLoaded(pw.initialPaywall, { plans: [], packs: [], proActive: false, managementUrl: null }, buyer);
    expect(empty).toMatchObject({ status: 'error', error: 'load_failed' });
  });
});

describe('EU buyers', () => {
  test.each([
    ['Europe/Paris', null, true],
    ['Atlantic/Canary', null, true],
    ['Europe/Oslo', null, true],
    ['Europe/London', null, false],
    ['Europe/Zurich', null, false],
    ['America/New_York', null, false],
    ['America/New_York', 'EUR', true],
    [null, 'usd', false],
  ])('%s %s → %s', (timeZone, currency, expected) => {
    expect(isLikelyEuBuyer({ timeZone, currency })).toBe(expected);
  });
});

describe('progress (C21 to C23)', () => {
  const created = '2026-11-04T10:00:00.000Z';
  const at = (seconds: number) => Date.parse(created) + seconds * 1000;
  const rendering = { status: 'rendering' as const, progress: 10, createdAt: created };

  test('rises, never above 95 before ready, 100 once ready, 0 while queued', () => {
    expect(displayProgress(rendering, at(30), 2)).toBeGreaterThan(10);
    expect(displayProgress(rendering, at(3600), 2)).toBe(95);
    expect(displayProgress({ ...rendering, progress: 99 }, at(1), 2)).toBe(95);
    expect(displayProgress({ ...rendering, status: 'ready' }, at(1), 2)).toBe(100);
    expect(displayProgress({ ...rendering, status: 'queued' }, at(500), 2)).toBe(0);
  });

  test('taking longer past the estimate, minutes left at least 1', () => {
    expect(isTakingLonger(rendering, at(119), 2)).toBe(false);
    expect(isTakingLonger(rendering, at(120), 2)).toBe(true);
    expect(isTakingLonger({ ...rendering, status: 'ready' }, at(500), 2)).toBe(false);
    expect(minutesLeft(rendering, at(10), 2)).toBe(2);
    expect(minutesLeft(rendering, at(100), 2)).toBe(1);
    expect(minutesLeft(rendering, at(500), 2)).toBe(1);
  });
});

describe('router', () => {
  test.each([
    ['', { name: 'dances' }],
    ['#/', { name: 'dances' }],
    ['#/create/street-bounce', { name: 'create', slug: 'street-bounce' }],
    ['#/video/5f0c', { name: 'video', id: '5f0c' }],
    ['#/paywall', { name: 'paywall' }],
    ['#/create/../../etc', { name: 'dances' }],
    ['#/nowhere', { name: 'dances' }],
    ['#access_token=abc&type=magiclink', { name: 'auth' }],
    ['#error_code=otp_expired&error_description=x', { name: 'auth' }],
  ])('%s', (hash, route) => {
    expect(parseHash(hash)).toEqual(route);
  });

  test('paths round-trip', () => {
    for (const path of ['/', '/create/hip-sway', '/generating/abc', '/account']) expect(pathOf(parseHash(`#${path}`))).toBe(path);
  });
});

describe('public keys only (D114)', () => {
  const base = { supabaseUrl: 'https://abcd.supabase.co', supabaseAnonKey: 'sb_publishable_x', revenueCatWebKey: 'rcb_x', turnstileSiteKey: '0x4AAAAAAADnPIDROrmt1Wwj' };
  const jwt = (role: string) => `h.${btoa(JSON.stringify({ role })).replace(/=+$/, '')}.s`;

  test('live only with the four values; a live build missing one fails, none is the demo', () => {
    expect(isLiveConfig(base)).toBe(true);
    expect(isLiveConfig({ ...base, revenueCatWebKey: '' })).toBe(false);
    expect(isLiveConfig({ ...base, turnstileSiteKey: '' })).toBe(false);
    const none = { supabaseUrl: '', supabaseAnonKey: '', revenueCatWebKey: '', turnstileSiteKey: '' };
    expect(isLiveConfig(none)).toBe(false);
    expect(missingLiveKeys(none)).toEqual([]);
    expect(missingLiveKeys(base)).toEqual([]);
    expect(missingLiveKeys({ ...base, turnstileSiteKey: ' ' })).toEqual(['VITE_TURNSTILE_SITE_KEY']);
    expect(missingLiveKeys({ ...none, supabaseUrl: base.supabaseUrl })).toEqual(['VITE_SUPABASE_ANON_KEY', 'VITE_REVENUECAT_WEB_KEY', 'VITE_TURNSTILE_SITE_KEY']);
  });

  test('secret keys are refused', () => {
    expect(keyProblems(base)).toEqual([]);
    expect(keyProblems({ ...base, supabaseAnonKey: jwt('anon') })).toEqual([]);
    expect(keyProblems({ ...base, supabaseAnonKey: jwt('service_role') })).toHaveLength(1);
    expect(keyProblems({ ...base, supabaseAnonKey: 'sb_secret_x' })).toHaveLength(1);
    expect(keyProblems({ ...base, revenueCatWebKey: 'sk_live_x' })).toHaveLength(1);
    expect(keyProblems({ ...base, supabaseUrl: 'https://abcd.supabase.co/rest/v1' })).toHaveLength(1);
    expect(keyProblems({ ...base, turnstileSiteKey: '1x00000000000000000000AA' })).toEqual([]); // Cloudflare test site key
    expect(keyProblems({ ...base, turnstileSiteKey: '1x0000000000000000000000000000000AA' })).toHaveLength(1); // a secret key
    expect(keyProblems({ ...base, turnstileSiteKey: 'not a key' })).toHaveLength(1);
  });
});

describe('share', () => {
  const file = new File(['mp4'], 'bopsy-street-bounce.mp4', { type: 'video/mp4' });
  const input = { file, url: 'https://example.com/v.mp4', title: 'Street Bounce' };

  test('the file when the browser can share files', async () => {
    const shared: ShareData[] = [];
    const outcome = await shareVideo(input, { canShare: () => true, share: async (data) => void shared.push(data) });
    expect(outcome).toBe('shared');
    expect(shared[0]?.files).toEqual([file]);
  });

  test('the link when files are refused, cancel is silent, else the link is copied', async () => {
    const shared: ShareData[] = [];
    const outcome = await shareVideo(input, {
      canShare: () => true,
      share: async (data) => {
        if (data.files) throw new DOMException('no', 'NotAllowedError');
        shared.push(data);
      },
    });
    expect(outcome).toBe('shared');
    expect(shared[0]?.url).toBe(input.url);
    expect(await shareVideo(input, { share: async () => Promise.reject(new DOMException('x', 'AbortError')) })).toBe('cancelled');
    let copied = '';
    expect(await shareVideo(input, { writeText: async (text) => void (copied = text) })).toBe('copied');
    expect(copied).toBe(input.url);
    expect(await shareVideo(input, {})).toBe('failed');
  });

  test('download names', () => {
    expect(downloadName('Street Bounce')).toBe('bopsy-street-bounce.mp4');
    expect(downloadName('Café Twirl!')).toBe('bopsy-cafe-twirl.mp4');
  });
});
