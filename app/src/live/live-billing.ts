// RevenueCat Web Billing through purchases-js (D111 adjusted by D117),
// loaded only at the paywall. appUserId = the Supabase user id, so the
// webhook (store RC_BILLING) credits the same ledger as the App Store.
// The checkout renders inside the page (htmlTarget): no popup, no redirect,
// which keeps the flow inside the TikTok and Instagram browsers.
import type { Purchases } from '@revenuecat/purchases-js';
import { KEYS } from '../config';
import type { Billing, Offer, OfferItem, PurchaseContext, PurchaseOutcome } from '../core/ports';
import type { Session } from '../core/types';
import { offerFromOfferings, type RcOfferings } from './offerings';

type Sdk = typeof import('@revenuecat/purchases-js');

let sdk: Promise<Sdk> | null = null;

async function instance(userId: string): Promise<{ sdk: Sdk; purchases: Purchases }> {
  const module = await (sdk ??= import('@revenuecat/purchases-js'));
  const { Purchases } = module;
  if (!Purchases.isConfigured()) {
    return { sdk: module, purchases: Purchases.configure({ apiKey: KEYS.revenueCatWebKey, appUserId: userId }) };
  }
  const purchases = Purchases.getSharedInstance();
  if (purchases.getAppUserId() !== userId) await purchases.changeUser(userId);
  return { sdk: module, purchases };
}

export class LiveBilling implements Billing {
  async offer(session: Session): Promise<Offer> {
    const { purchases } = await instance(session.userId);
    const [offerings, info] = await Promise.all([purchases.getOfferings(), purchases.getCustomerInfo()]);
    return offerFromOfferings(offerings as unknown as RcOfferings, 'pro' in info.entitlements.active, info.managementURL);
  }

  async purchase(session: Session, item: OfferItem, context: PurchaseContext): Promise<PurchaseOutcome> {
    const { sdk: module, purchases } = await instance(session.userId);
    try {
      await purchases.purchase({
        rcPackage: item.ref as Parameters<Purchases['purchase']>[0]['rcPackage'],
        htmlTarget: context.target,
        ...(context.email ? { customerEmail: context.email } : {}),
        metadata: context.metadata,
        skipSuccessPage: true,
      });
      return { kind: 'purchased' };
    } catch (error) {
      if (error instanceof module.PurchasesError && error.errorCode === module.ErrorCode.UserCancelledError) return { kind: 'cancelled' };
      return { kind: 'failed' };
    }
  }
}
