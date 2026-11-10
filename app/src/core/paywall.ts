// Paywall state (07 for plans, 19 for coin packs), pure so it is tested
// without a store: what is shown, what is selected, when Continue works.
import { isLikelyEuBuyer, type BuyerSignals } from './eu';
import type { Offer, OfferItem } from './ports';

export type PaywallMode = 'plans' | 'packs';
export type PaywallStatus = 'loading' | 'ready' | 'error' | 'buying' | 'activating';

export interface PaywallState {
  status: PaywallStatus;
  offer: Offer | null;
  mode: PaywallMode;
  selected: string | null;
  waiverRequired: boolean;
  waiverChecked: boolean;
  error: 'purchase_failed' | 'load_failed' | null;
}

export const initialPaywall: PaywallState = {
  status: 'loading',
  offer: null,
  mode: 'plans',
  selected: null,
  waiverRequired: false,
  waiverChecked: false,
  error: null,
};

/**
 * The paywall of a video opens on the plans, on the packs for a subscriber
 * (C5); the shop (D149) opens on the packs for everyone.
 */
export function modeFor(offer: Offer, shop = false): PaywallMode {
  if (offer.packs.length === 0) return 'plans';
  return offer.proActive || shop ? 'packs' : 'plans';
}

/** D149: someone without a plan may switch between the plans and a one-off pack. */
export function canSwitch(state: Pick<PaywallState, 'offer' | 'status'>): boolean {
  const offer = state.offer;
  return offer !== null && !offer.proActive && offer.plans.length > 0 && offer.packs.length > 0 && state.status !== 'buying';
}

export function setMode(state: PaywallState, mode: PaywallMode): PaywallState {
  if (!state.offer || state.mode === mode || !canSwitch(state)) return state;
  return { ...state, mode, selected: defaultSelection(state.offer, mode), error: null };
}

export function itemsOf(state: Pick<PaywallState, 'offer' | 'mode'>): OfferItem[] {
  if (!state.offer) return [];
  return state.mode === 'packs' ? state.offer.packs : state.offer.plans;
}

/** The weekly plan is preselected (07), the first pack on 19 (store order). */
export function defaultSelection(offer: Offer, mode: PaywallMode): string | null {
  if (mode === 'packs') return offer.packs[0]?.productId ?? null;
  return (offer.plans.find((plan) => plan.period === 'week') ?? offer.plans[0])?.productId ?? null;
}

export function offerLoaded(state: PaywallState, offer: Offer, buyer: Omit<BuyerSignals, 'currency'>, shop = false): PaywallState {
  const mode = modeFor(offer, shop);
  const currency = (mode === 'packs' ? offer.packs[0] : offer.plans[0])?.price.currency ?? null;
  const empty = (mode === 'packs' ? offer.packs : offer.plans).length === 0;
  return {
    ...state,
    status: empty ? 'error' : 'ready',
    error: empty ? 'load_failed' : null,
    offer,
    mode,
    selected: defaultSelection(offer, mode),
    waiverRequired: isLikelyEuBuyer({ timeZone: buyer.timeZone, currency }),
    waiverChecked: false,
  };
}

export function select(state: PaywallState, productId: string): PaywallState {
  if (state.status === 'buying' || !itemsOf(state).some((item) => item.productId === productId)) return state;
  return { ...state, selected: productId, error: null };
}

export function setWaiver(state: PaywallState, checked: boolean): PaywallState {
  return { ...state, waiverChecked: checked };
}

export function selectedItem(state: PaywallState): OfferItem | null {
  return itemsOf(state).find((item) => item.productId === state.selected) ?? null;
}

/** Continue works with a selection, the waiver ticked where it is asked, and no purchase running. */
export function canContinue(state: PaywallState): boolean {
  return state.status === 'ready' && selectedItem(state) !== null && (!state.waiverRequired || state.waiverChecked);
}

/** Metadata stored with the transaction: proof of the waiver (D115). */
export function purchaseMetadata(state: PaywallState, now: Date): Record<string, string> {
  return state.waiverRequired && state.waiverChecked
    ? { withdrawal_waiver_at: now.toISOString(), withdrawal_waiver_text_version: 'web-1' }
    : {};
}
