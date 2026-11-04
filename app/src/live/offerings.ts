// RevenueCat offerings (purchases-js) to the app's Offer, by product id
// (the same ids as the App Store and the webhook: bopsy_weekly,
// bopsy_yearly, bopsy_coins_600, bopsy_coins_1500). Prices and the launch
// offer only from the SDK: getOfferings lists the intro phase only when the
// customer is eligible to it.
import type { Offer, PackItem, PlanItem } from '../core/ports';
import { introWeeks, money } from '../core/prices';

/** The subset of purchases-js types read here (kept structural for tests). */
export interface RcPrice { amountMicros: number; currency: string; formattedPrice: string }
export interface RcPhase { periodDuration: string | null; price: RcPrice | null; cycleCount: number }
export interface RcProduct {
  identifier: string;
  price: RcPrice;
  normalPeriodDuration: string | null;
  introPricePhase: RcPhase | null;
}
export interface RcPackage { identifier: string; product: RcProduct }
export interface RcOffering { identifier: string; availablePackages: RcPackage[] }
export interface RcOfferings { current: RcOffering | null; all: Record<string, RcOffering> }

/** Coins per product, mirror of public.products (server side source). */
export const PRODUCT_COINS: Record<string, number> = {
  bopsy_weekly: 180,
  bopsy_yearly: 240,
  bopsy_coins_600: 600,
  bopsy_coins_1500: 1500,
};

const toMoney = (price: RcPrice) => money(price.amountMicros, price.currency, price.formattedPrice);

function plan(pkg: RcPackage): PlanItem | null {
  const { product } = pkg;
  const period = product.identifier === 'bopsy_weekly' ? 'week' : product.identifier === 'bopsy_yearly' ? 'year' : null;
  if (!period) return null;
  const phase = product.introPricePhase;
  const weeks = phase?.price ? introWeeks(phase.periodDuration, phase.cycleCount) : null;
  return {
    kind: 'plan',
    productId: product.identifier as PlanItem['productId'],
    period,
    price: toMoney(product.price),
    // A launch offer in weeks only: "$7.99 / week for your first 2 weeks".
    intro: phase?.price && weeks && period === 'week' ? { price: toMoney(phase.price), weeks } : null,
    coins: PRODUCT_COINS[product.identifier]!,
    ref: pkg,
  };
}

function pack(pkg: RcPackage): PackItem | null {
  const id = pkg.product.identifier;
  if (id !== 'bopsy_coins_600' && id !== 'bopsy_coins_1500') return null;
  return { kind: 'pack', productId: id, coins: PRODUCT_COINS[id]!, price: toMoney(pkg.product.price), bestValue: false, ref: pkg };
}

/**
 * Plans from the current offering; packs from it or, when the dashboard
 * keeps them apart, from any other offering. The pack with the lowest
 * price per coin gets "Best value" when there are several.
 */
export function offerFromOfferings(offerings: RcOfferings, proActive: boolean, managementUrl: string | null): Offer {
  const current = offerings.current?.availablePackages ?? [];
  const plans = current.map(plan).filter((item): item is PlanItem => item !== null);
  plans.sort((a, b) => (a.period === b.period ? 0 : a.period === 'week' ? -1 : 1));
  const seen = new Set<string>();
  const packs: PackItem[] = [];
  const candidates = [...current, ...Object.values(offerings.all).flatMap((offering) => offering.availablePackages)];
  for (const pkg of candidates) {
    const item = pack(pkg);
    if (item && !seen.has(item.productId)) {
      seen.add(item.productId);
      packs.push(item);
    }
  }
  if (packs.length > 1) {
    const best = packs.reduce((a, b) => (b.price.micros / b.coins < a.price.micros / a.coins ? b : a));
    best.bestValue = true;
  }
  return { plans, packs, proActive, managementUrl };
}
