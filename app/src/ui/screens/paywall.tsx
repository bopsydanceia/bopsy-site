// 6. Paywall: the plans (07) for everyone, the coin packs (19) for
// subscribers; prices and the launch offer only from RevenueCat (D112);
// renewal terms, Terms and Privacy; the withdrawal waiver for EU buyers
// (D115); the checkout drawn in the page; then the video starts (coins
// debited by the server). D139: a guest sees it first; Continue keeps the
// pick, asks the email, and the checkout then opens by itself.
// D149: the same screen is the shop (#/shop), on the packs for everyone;
// without a plan, a switch goes between the plans and a one-off pack.
import { useEffect, useRef, useState } from 'preact/hooks';
import { LINKS } from '../../config';
import { t } from '../../copy';
import { LOCALE } from '../../locale';
import { deviceTimeZone } from '../../core/eu';
import * as pw from '../../core/paywall';
import type { OfferItem, PackItem, PlanItem } from '../../core/ports';
import { planSubtitle, planTitle, renewalTerms, savePercent } from '../../core/prices';
import { goBack, navigate } from '../../core/router';
import { app, danceBySlug, showToast } from '../app-state';
import { Checkbox, ErrorState, Header, Sheet } from '../components';
import { useStore } from '../hooks';
import { Icon } from '../icons';
import { noticeText } from '../notices';
import { track } from '../../core/analytics';

function PlanCard({ plan, weekly, selected, onSelect }: { plan: PlanItem; weekly: PlanItem | undefined; selected: boolean; onSelect: () => void }) {
  const save = plan.period === 'year' && weekly ? savePercent(weekly.price, plan.price) : null;
  return (
    <button type="button" role="radio" aria-checked={selected} class="plan" onClick={onSelect}>
      {plan.intro && <span class="offer">{t.launchOffer}</span>}
      <span class="radio" aria-hidden="true" />
      <span>
        <span class="p-title">{planTitle(plan)}</span>
        <br />
        <span class="p-sub">{planSubtitle(plan)}</span>
      </span>
      {save ? <span class="save">{t.saveBadge(save)}</span> : <span />}
    </button>
  );
}

function PackCard({ pack, cost, selected, onSelect }: { pack: PackItem; cost: number; selected: boolean; onSelect: () => void }) {
  return (
    <button type="button" role="radio" aria-checked={selected} class="plan" onClick={onSelect}>
      {pack.bestValue && <span class="offer">{t.bestValue}</span>}
      <span class="radio" aria-hidden="true" />
      <span>
        <span class="p-title">{t.packTitle(pack.coins)}</span>
        <br />
        <span class="p-sub">{t.packSubtitle(Math.floor(pack.coins / cost))}</span>
      </span>
      <span class="p-title">{pack.price.formatted}</span>
    </button>
  );
}

function CoinsInfo({ cost, plans, packs, onClose }: { cost: number; plans: PlanItem[]; packs: PackItem[]; onClose: () => void }) {
  const weekly = plans.find((plan) => plan.period === 'week');
  const yearly = plans.find((plan) => plan.period === 'year');
  const pack = packs[0];
  return (
    <Sheet title={t.whatAreCoins} onClose={onClose}>
      <p><b>{t.coinsInfoCard(cost)}</b><br /><span class="muted">{t.coinsInfoBody}</span></p>
      {weekly && <p><b>{t.coinsInfoWeeklyLabel}</b> {t.coinsInfoWeekly(weekly.coins, Math.floor(weekly.coins / cost))}</p>}
      {yearly && <p><b>{t.coinsInfoYearlyLabel}</b> {t.coinsInfoYearly(yearly.coins, Math.floor(yearly.coins / cost))}</p>}
      {pack && <p><b>{t.coinsInfoPacksLabel}</b> {t.coinsInfoPacks(pack.coins, pack.price.formatted)}</p>}
      <p class="muted small">{t.videoFailedQ} {t.coinsComeBack}</p>
      <button type="button" class="btn btn-secondary btn-block" onClick={onClose}>{t.gotIt}</button>
    </Sheet>
  );
}

/** Three dancing posters over the title, as on 07 (decorative). */
function Fan() {
  const catalog = useStore(app().catalog);
  const flowState = useStore(app().flow.store);
  if (catalog.status !== 'ready') return null;
  const current = catalog.dances.find((dance) => dance.slug === flowState.danceSlug);
  const others = catalog.dances.filter((dance) => dance !== current && dance.posterUrl && dance.posterUrl !== current?.posterUrl);
  // One dance per poster: the demo catalogue reuses a few photos.
  const unique = others.filter((dance, index) => others.findIndex((other) => other.posterUrl === dance.posterUrl) === index);
  const picks = [unique[0], current ?? unique[1], current ? unique[1] : unique[2]].filter((dance) => dance?.posterUrl);
  if (picks.length < 3) return null;
  return (
    <div class="fan" aria-hidden="true">
      {picks.map((dance) => <img key={dance!.id} src={dance!.posterUrl!} alt="" />)}
    </div>
  );
}

export function PaywallScreen({ shop = false }: { shop?: boolean }) {
  const { services, flow } = app();
  const session = useStore(app().session);
  const flowState = useStore(flow.store);
  const wallet = useStore(app().wallet);
  const [state, setState] = useState<pw.PaywallState>(pw.initialPaywall);
  const [info, setInfo] = useState(false);
  const [round, setRound] = useState(0);
  const host = useRef<HTMLDivElement>(null);
  const dance = flowState.danceSlug ? danceBySlug(flowState.danceSlug) : undefined;
  const cost = dance?.cost ?? 60;
  // The shop only tops up: it never starts a video by itself.
  const canGenerate = !shop && flowState.photo.kind === 'accepted' && dance !== undefined;

  useEffect(() => {
    if (!session) navigate('/unlock', { replace: true });
  }, [session]);

  useEffect(() => {
    if (!session) return;
    let alive = true;
    setState(pw.initialPaywall);
    services
      .billing()
      .then((billing) => billing.offer(session))
      .then(
        (offer) => alive && setState((s) => pw.offerLoaded(s, offer, { timeZone: deviceTimeZone() }, shop)),
        () => alive && setState((s) => ({ ...s, status: 'error', error: 'load_failed' })),
      );
    return () => {
      alive = false;
    };
  }, [session?.userId, round, shop]);

  const afterPurchase = async () => {
    setState((s) => ({ ...s, status: 'activating' }));
    if (canGenerate) await flow.generate({ afterPurchase: true });
    else if (shop) {
      showToast(t.shopThanks);
      goBack('/');
    } else {
      showToast(t.activating);
      navigate('/account', { replace: true });
    }
    setState((s) => ({ ...s, status: s.status === 'activating' ? 'ready' : s.status }));
  };

  const buy = async (current: pw.PaywallState = state) => {
    const item = pw.selectedItem(current);
    if (!session || !item || !pw.canContinue(current) || !host.current) return;
    if (session.guest) {
      flow.holdCheckout(item.productId, current.waiverChecked);
      return;
    }
    setState((s) => ({ ...s, status: 'buying', error: null }));
    track('checkout_start', { product: item.productId, shop });
    const billing = await services.billing();
    const outcome = await billing.purchase(session, item, { email: session.email, target: host.current, metadata: { ...pw.purchaseMetadata(current, new Date()), locale: LOCALE } });
    host.current?.replaceChildren();
    track(outcome.kind === 'purchased' ? 'purchase_done' : outcome.kind === 'failed' ? 'purchase_failed' : 'checkout_closed', { product: item.productId, shop });
    if (outcome.kind === 'purchased') await afterPurchase();
    else setState((s) => ({ ...s, status: 'ready', error: outcome.kind === 'failed' ? 'purchase_failed' : null }));
  };

  // Back from the email step with a held pick: the checkout opens by itself, once.
  useEffect(() => {
    if (state.status !== 'ready' || !state.offer || !session || session.guest || !flowState.checkout) return;
    const held = flow.takeCheckout();
    if (!held || !pw.itemsOf(state).some((item) => item.productId === held.productId)) return;
    let next = pw.select(state, held.productId);
    if (next.waiverRequired) next = pw.setWaiver(next, held.waiver);
    setState(next);
    if (pw.canContinue(next)) void buy(next);
  }, [state.status, session?.userId, session?.guest]);

  const items: OfferItem[] = pw.itemsOf(state);
  const plans = state.offer?.plans ?? [];
  const packs = state.offer?.packs ?? [];
  const weekly = plans.find((plan) => plan.period === 'week');
  const selected = pw.selectedItem(state);
  const working = state.status === 'buying' || state.status === 'activating' || flowState.busy === 'generation';

  return (
    <>
      <Header title={shop ? t.shopTitle : undefined} close={() => goBack('/')} right={<button type="button" class="link" onClick={() => setInfo(true)}>{t.whatAreCoins}</button>} />
      <main class="paywall">
        {state.mode === 'packs' ? (
          <>
            <h1 class="title center">{shop ? t.shopHeading : t.needCoins(cost)}</h1>
            <p class="lede center">{wallet ? t.balance(wallet.total) : shop ? t.shopLede(cost) : ''}</p>
          </>
        ) : (
          <>
            <Fan />
            <h1 class="title center">{t.paywallTitle}</h1>
            <p class="coin-line"><Icon name="coin" />{t.coinLine(weekly?.coins ?? 180, cost)}</p>
          </>
        )}
        {pw.canSwitch(state) && (
          <div class="seg" role="tablist" aria-label={t.shopTitle}>
            <button type="button" role="tab" aria-selected={state.mode === 'plans'} onClick={() => setState((s) => pw.setMode(s, 'plans'))}>
              {t.tabPlans}
            </button>
            <button type="button" role="tab" aria-selected={state.mode === 'packs'} onClick={() => setState((s) => pw.setMode(s, 'packs'))}>
              {t.tabPacks}
            </button>
          </div>
        )}
        {state.status === 'loading' && <div class="plans" aria-busy="true"><div class="plan skeleton" style={{ height: '84px' }} /><div class="plan skeleton" style={{ height: '84px' }} /></div>}
        {state.status === 'error' && <ErrorState text={state.mode === 'packs' ? t.packLoadError : t.paywallLoadError} retry={() => setRound((r) => r + 1)} />}
        {state.offer && state.status !== 'error' && (
          <div class="plans" role="radiogroup" aria-label={state.mode === 'packs' ? t.buyCoinsLink : t.paywallTitle}>
            {items.map((item) =>
              item.kind === 'plan' ? (
                <PlanCard key={item.productId} plan={item} weekly={weekly} selected={state.selected === item.productId} onSelect={() => setState((s) => pw.select(s, item.productId))} />
              ) : (
                <PackCard key={item.productId} pack={item} cost={cost} selected={state.selected === item.productId} onSelect={() => setState((s) => pw.select(s, item.productId))} />
              ),
            )}
          </div>
        )}
        {state.mode === 'packs' && pw.canSwitch(state) && weekly && (
          <button type="button" class="plan-hint" onClick={() => setState((s) => pw.setMode(s, 'plans'))}>
            <Icon name="coin" />
            {t.packsPlanHint(weekly.coins)}
          </button>
        )}
        {state.error === 'purchase_failed' && <p class="message error" role="alert">{t.purchaseFailed}</p>}
        {flowState.notice === 'plan_activating' && state.status !== 'activating' && (
          <div class="message" role="alert">
            {noticeText('plan_activating')}{' '}
            <button type="button" class="link" onClick={() => void flow.generate({ afterPurchase: true })}>{t.tryAgain}</button>
          </div>
        )}
        {/* Other notices of the flow here too, e.g. the hourly limit after a purchase (D131). */}
        {flowState.notice && flowState.notice !== 'plan_activating' && state.status !== 'activating' && (
          <div class="message" role="alert">{noticeText(flowState.notice)}</div>
        )}
        <div class="cta-bar">
          {/* Next to the button it unlocks, so it is never hidden under the sticky bar on a phone. */}
          {state.waiverRequired && (
            <Checkbox id="waiver" class="waiver" checked={state.waiverChecked} onChange={(checked) => setState((s) => pw.setWaiver(s, checked))}>
              {selected?.kind === 'pack' ? t.waiverCoins : t.waiver}
            </Checkbox>
          )}
          <button type="button" class="btn btn-cta btn-block" disabled={!pw.canContinue(state) || working} aria-busy={working} onClick={() => void buy()}>
            {working ? (state.status === 'activating' ? t.activating : '…') : selected?.kind === 'pack' ? t.buyCoins(selected.coins) : t.continue}
          </button>
          <p class="legal">{selected?.kind === 'plan' ? renewalTerms(selected) : selected?.kind === 'pack' ? t.packTerms : ''}</p>
          <p class="legal-links">
            <a href={LINKS.terms} target="_blank" rel="noopener">{t.terms}</a>
            <a href={LINKS.privacy} target="_blank" rel="noopener">{t.privacy}</a>
          </p>
        </div>
      </main>
      <div class="checkout-host" ref={host} />
      {info && <CoinsInfo cost={cost} plans={plans} packs={packs} onClose={() => setInfo(false)} />}
      <span class="sr-only" aria-live="polite">{state.status === 'activating' ? t.activating : ''}</span>
    </>
  );
}
