// Price display, from the store's prices only (D112): titles, subtitles,
// per-week price and the "Save N%" badge of the yearly plan, as on 07.
import { t, type PlanPrices } from '../copy';
import { LOCALE_TAG } from '../locale';
import type { Money, PlanItem } from './ports';

/** Formats [micros] of [currency] like the store (active locale, 2 decimals). */
export function formatMoney(micros: number, currency: string, locale: string = LOCALE_TAG): string {
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: 2 }).format(micros / 1e6);
  } catch {
    return `${(micros / 1e6).toFixed(2)} ${currency}`;
  }
}

export function money(micros: number, currency: string, formatted?: string): Money {
  return { micros, currency, formatted: formatted ?? formatMoney(micros, currency) };
}

/** Weeks per year used by the app for the per-week price of the yearly plan (07). */
export const WEEKS_PER_YEAR = 52;

/** The yearly price per week: "$1.54" for $79.99. */
export function perWeek(yearly: Money): Money {
  return money(Math.round(yearly.micros / WEEKS_PER_YEAR / 10_000) * 10_000, yearly.currency);
}

/** "Save 85%": yearly per week against the weekly full price; null if not cheaper or not comparable. */
export function savePercent(weekly: Money, yearly: Money): number | null {
  if (weekly.currency !== yearly.currency || weekly.micros <= 0) return null;
  const percent = Math.round((1 - yearly.micros / WEEKS_PER_YEAR / weekly.micros) * 100);
  return percent > 0 ? percent : null;
}

function prices(plan: PlanItem): PlanPrices {
  return { price: plan.price.formatted, period: plan.period, intro: plan.intro ? { price: plan.intro.price.formatted, weeks: plan.intro.weeks } : null };
}

export function planTitle(plan: PlanItem): string {
  return t.planTitle(prices(plan));
}

export function planSubtitle(plan: PlanItem): string {
  return t.planSubtitle(prices(plan), plan.period === 'year' ? perWeek(plan.price).formatted : '', plan.coins);
}

/** Renewal terms under the button for the selected plan (web wording, NEW). */
export function renewalTerms(plan: PlanItem): string {
  return t.renewalTerms(prices(plan));
}

/** Intro duration in weeks from an ISO 8601 period ("P1W", "P2W", "P14D", "P1M") and its cycles. */
export function introWeeks(periodDuration: string | null, cycles: number): number | null {
  const match = /^P(?:(\d+)W|(\d+)D|(\d+)M)$/.exec(periodDuration ?? '');
  if (!match) return null;
  const perCycle = match[1] ? Number(match[1]) : match[2] ? Number(match[2]) / 7 : Number(match[3]) * 4;
  const weeks = perCycle * Math.max(1, cycles);
  return Number.isInteger(weeks) && weeks > 0 ? weeks : null;
}
