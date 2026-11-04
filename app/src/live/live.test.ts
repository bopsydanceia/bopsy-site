// The live adapters' pure parts: RevenueCat offerings to the Offer, and
// the Supabase rows (C4 on the wallet).
import { describe, expect, test } from 'vitest';
import { planSubtitle, planTitle } from '../core/prices';
import { offerFromOfferings, type RcOfferings, type RcPackage } from './offerings';
import { danceFromRow, subscriptionFromRow, walletFromRow } from './rows';

const price = (micros: number, formatted: string, currency = 'USD') => ({ amountMicros: micros, currency, formattedPrice: formatted });
const pkg = (id: string, micros: number, formatted: string, extra: Partial<RcPackage['product']> = {}): RcPackage => ({
  identifier: `$rc_${id}`,
  product: { identifier: id, price: price(micros, formatted), normalPeriodDuration: null, introPricePhase: null, ...extra },
});

const weeklyWithIntro = pkg('bopsy_weekly', 9_990_000, '$9.99', {
  normalPeriodDuration: 'P1W',
  introPricePhase: { periodDuration: 'P1W', price: price(7_990_000, '$7.99'), cycleCount: 2 },
});
const yearly = pkg('bopsy_yearly', 79_990_000, '$79.99', { normalPeriodDuration: 'P1Y' });
const pack600 = pkg('bopsy_coins_600', 14_990_000, '$14.99');
const pack1500 = pkg('bopsy_coins_1500', 29_990_000, '$29.99');

describe('RevenueCat offerings → Offer', () => {
  test('plans by product id, weekly first, launch offer from the intro phase', () => {
    const offerings: RcOfferings = { current: { identifier: 'default', availablePackages: [yearly, weeklyWithIntro] }, all: {} };
    const offer = offerFromOfferings(offerings, false, null);
    expect(offer.plans.map((plan) => plan.productId)).toEqual(['bopsy_weekly', 'bopsy_yearly']);
    expect(planTitle(offer.plans[0]!)).toBe('$7.99 / week');
    expect(planSubtitle(offer.plans[0]!)).toBe('for your first 2 weeks, then $9.99 / week');
    expect(offer.plans[0]!.coins).toBe(180);
    expect(offer.plans[1]!.coins).toBe(240);
    expect(offer.plans[0]!.ref).toBe(weeklyWithIntro);
  });

  test('not eligible: RevenueCat gives no intro phase, no launch offer', () => {
    const plain = pkg('bopsy_weekly', 9_990_000, '$9.99', { normalPeriodDuration: 'P1W' });
    const offer = offerFromOfferings({ current: { identifier: 'default', availablePackages: [plain] }, all: {} }, false, null);
    expect(offer.plans[0]!.intro).toBeNull();
  });

  test('packs from another offering, once each, "Best value" on the cheapest coin', () => {
    const offerings: RcOfferings = {
      current: { identifier: 'default', availablePackages: [weeklyWithIntro, yearly] },
      all: { coins: { identifier: 'coins', availablePackages: [pack600, pack1500, pack600] } },
    };
    const offer = offerFromOfferings(offerings, true, 'https://pay.rev.cat/manage');
    expect(offer.packs.map((item) => [item.productId, item.coins, item.price.formatted, item.bestValue])).toEqual([
      ['bopsy_coins_600', 600, '$14.99', false],
      ['bopsy_coins_1500', 1500, '$29.99', true],
    ]);
    expect(offer).toMatchObject({ proActive: true, managementUrl: 'https://pay.rev.cat/manage' });
  });

  test('unknown products are left out; no current offering gives an empty offer', () => {
    const offer = offerFromOfferings({ current: { identifier: 'x', availablePackages: [pkg('other', 1, '$0.01')] }, all: {} }, false, null);
    expect(offer.plans).toEqual([]);
    expect(offerFromOfferings({ current: null, all: {} }, false, null).plans).toEqual([]);
  });
});

describe('Supabase rows', () => {
  test('C4: plan coins count only with an active plan', () => {
    const row = { plan_balance: 120, bought_balance: 600, total: 720 };
    expect(walletFromRow(row, true)).toEqual({ plan: 120, bought: 600, total: 720 });
    expect(walletFromRow(row, false)).toEqual({ plan: 0, bought: 600, total: 600 });
    expect(walletFromRow(null, true)).toEqual({ plan: 0, bought: 0, total: 0 });
  });

  test('a subscription past its expiry is not active', () => {
    const row = { period: 'weekly' as const, status: 'active' as const, expires_at: '2026-11-04T10:00:00Z', renews_at: null };
    expect(subscriptionFromRow(row, Date.parse('2026-11-04T09:00:00Z'))?.active).toBe(true);
    expect(subscriptionFromRow(row, Date.parse('2026-11-04T11:00:00Z'))?.active).toBe(false);
    expect(subscriptionFromRow(null, 0)).toBeNull();
  });

  test('dance posters: public https URLs only (no signed URL before a session)', () => {
    const row = { id: 'd', slug: 'x', name: 'X', family: 'pets', preview_url: 'https://cdn.example.com/x.webp', cost: 60, duration_seconds: 8, is_new: true, is_hot: false, sort: 1 };
    expect(danceFromRow(row)).toMatchObject({ family: 'pets', posterUrl: 'https://cdn.example.com/x.webp', isNew: true });
    expect(danceFromRow({ ...row, preview_url: 'references/x.jpg', family: 'unknown' })).toMatchObject({ posterUrl: null, family: 'trends' });
  });
});
