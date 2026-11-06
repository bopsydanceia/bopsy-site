// The demo RevenueCat (D118): offerings built like the SDK's (prices in
// micros with the store's formatted string), eligibility to the launch
// offer, and a simulated checkout drawn into the page target the way
// purchases-js draws its own. Paying records the purchase; the fake webhook
// credits it a moment later.
import { t } from '../copy';
import type { Billing, Offer, OfferItem, PackItem, PlanItem, PurchaseContext, PurchaseOutcome } from '../core/ports';
import { money } from '../core/prices';
import type { Session } from '../core/types';
import { DEMO_PRODUCTS, type DemoProductId } from './data';
import type { FakeBackend } from './fake-backend';

export function demoOffer(eligible: boolean, proActive: boolean): Offer {
  const plans: PlanItem[] = [];
  const packs: PackItem[] = [];
  for (const [id, product] of Object.entries(DEMO_PRODUCTS) as Array<[DemoProductId, (typeof DEMO_PRODUCTS)[DemoProductId]]>) {
    if (product.kind === 'plan') {
      plans.push({
        kind: 'plan',
        productId: id as PlanItem['productId'],
        period: product.period,
        price: money(product.priceMicros, 'USD'),
        intro: eligible && product.introMicros !== null ? { price: money(product.introMicros, 'USD'), weeks: product.introWeeks } : null,
        coins: product.coins,
        ref: id,
      });
    } else {
      packs.push({ kind: 'pack', productId: id as PackItem['productId'], coins: product.coins, price: money(product.priceMicros, 'USD'), bestValue: product.bestValue, ref: id });
    }
  }
  return { plans, packs, proActive, managementUrl: null };
}

export class FakeBilling implements Billing {
  constructor(private readonly backend: FakeBackend) {}

  async offer(_session: Session): Promise<Offer> {
    await new Promise((resolve) => setTimeout(resolve, 300));
    return demoOffer(this.backend.launchOfferEligible(), this.backend.proActive());
  }

  async purchase(_session: Session, item: OfferItem, context: PurchaseContext): Promise<PurchaseOutcome> {
    const paid = await showCheckout(context.target, item);
    if (!paid) return { kind: 'cancelled' };
    this.backend.recordPurchase(item.productId);
    return { kind: 'purchased' };
  }
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** The simulated checkout: amount due today, Pay and Cancel. */
function showCheckout(target: HTMLElement, item: OfferItem): Promise<boolean> {
  return new Promise((resolve) => {
    const due = item.kind === 'plan' ? (item.intro?.price ?? item.price) : item.price;
    const panel = el('div', 'checkout');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-label', t.checkoutDemoTitle);
    const title = el('h2', 'checkout-title', t.checkoutDemoTitle);
    const line = el('p', 'checkout-line', item.kind === 'plan' ? t.checkoutPlanLine(item.period, due.formatted) : t.checkoutPackLine(item.coins, due.formatted));
    const body = el('p', 'checkout-body', t.checkoutDemoBody);
    const pay = el('button', 'btn btn-cta', t.pay(due.formatted));
    pay.type = 'button';
    const cancel = el('button', 'btn btn-ghost', t.cancel);
    cancel.type = 'button';
    const done = (paid: boolean) => {
      panel.remove();
      resolve(paid);
    };
    pay.addEventListener('click', () => {
      pay.disabled = true;
      pay.textContent = '…';
      setTimeout(() => done(true), 700);
    });
    cancel.addEventListener('click', () => done(false));
    panel.append(title, line, body, pay, cancel);
    target.replaceChildren(panel);
    pay.focus();
  });
}
