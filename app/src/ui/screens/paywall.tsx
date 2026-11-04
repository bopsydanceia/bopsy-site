// 6. Paywall: the plans (07) for everyone, the coin packs (19) for
// subscribers; prices and the launch offer only from RevenueCat (D112);
// renewal terms, Terms and Privacy; the withdrawal waiver for EU buyers
// (D115); the checkout drawn in the page; then the video starts (coins
// debited by the server).
import { useEffect, useRef, useState } from 'preact/hooks';
import { LINKS } from '../../config';
import { t } from '../../copy';
import { deviceTimeZone } from '../../core/eu';
import * as pw from '../../core/paywall';
import type { OfferItem, PackItem, PlanItem } from '../../core/ports';
import { planSubtitle, planTitle, renewalTerms, savePercent } from '../../core/prices';
import { navigate } from '../../core/router';
import { app, danceBySlug, showToast } from '../app-state';
import { Checkbox, ErrorState, Header, Sheet } from '../components';
import { useStore } from '../hooks';
import { Icon } from '../icons';
import { noticeText } from '../notices';

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
      {weekly && <p><b>Weekly plan:</b> {t.coinsInfoWeekly(weekly.coins, Math.floor(weekly.coins / cost))}</p>}
      {yearly && <p><b>Yearly plan:</b> {t.coinsInfoYearly(yearly.coins, Math.floor(yearly.coins / cost))}</p>}
      {pack && <p><b>Coin packs</b> {t.coinsInfoPacks(pack.coins, pack.price.formatted)}</p>}
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
  const others = catalog.dances.filter((dance) => dance !== current && dance.posterUrl);
  const picks = [others[1], current ?? others[0], others[2] ?? others[3]].filter((dance) => dance?.posterUrl);
  if (picks.length < 3) return null;
  return (
    <div class="fan" aria-hidden="true">
      {picks.map((dance) => <img key={dance!.id} src={dance!.posterUrl!} alt="" />)}
    </div>
  );
}

export function PaywallScreen() {
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
  const canGenerate = flowState.photo.kind === 'accepted' && dance !== undefined;

  useEffect(() => {
    if (!session || session.guest) navigate('/unlock', { replace: true });
  }, [session]);

  useEffect(() => {
    if (!session || session.guest) return;
    let alive = true;
    setState(pw.initialPaywall);
    services
      .billing()
      .then((billing) => billing.offer(session))
      .then(
        (offer) => alive && setState((s) => pw.offerLoaded(s, offer, { timeZone: deviceTimeZone() })),
        () => alive && setState((s) => ({ ...s, status: 'error', error: 'load_failed' })),
      );
    return () => {
      alive = false;
    };
  }, [session?.userId, round]);

  const afterPurchase = async () => {
    setState((s) => ({ ...s, status: 'activating' }));
    if (canGenerate) await flow.generate({ afterPurchase: true });
    else {
      showToast(t.activating);
      navigate('/account', { replace: true });
    }
    setState((s) => ({ ...s, status: s.status === 'activating' ? 'ready' : s.status }));
  };

  const buy = async () => {
    const item = pw.selectedItem(state);
    if (!session || !item || !pw.canContinue(state) || !host.current) return;
    setState((s) => ({ ...s, status: 'buying', error: null }));
    const billing = await services.billing();
    const outcome = await billing.purchase(session, item, { email: session.email, target: host.current, metadata: pw.purchaseMetadata(state, new Date()) });
    host.current?.replaceChildren();
    if (outcome.kind === 'purchased') await afterPurchase();
    else setState((s) => ({ ...s, status: 'ready', error: outcome.kind === 'failed' ? 'purchase_failed' : null }));
  };

  const items: OfferItem[] = pw.itemsOf(state);
  const plans = state.offer?.plans ?? [];
  const packs = state.offer?.packs ?? [];
  const weekly = plans.find((plan) => plan.period === 'week');
  const selected = pw.selectedItem(state);
  const working = state.status === 'buying' || state.status === 'activating' || flowState.busy === 'generation';

  return (
    <>
      <Header close={() => history.length > 1 ? history.back() : navigate('/')} right={<button type="button" class="link" onClick={() => setInfo(true)}>{t.whatAreCoins}</button>} />
      <main>
        {state.mode === 'packs' ? (
          <>
            <h1 class="title center">{t.needCoins(cost)}</h1>
            <p class="lede center">{wallet ? t.balance(wallet.total) : ''}</p>
          </>
        ) : (
          <>
            <Fan />
            <h1 class="title center">{t.paywallTitle}</h1>
            <p class="coin-line"><Icon name="coin" />{t.coinLine(weekly?.coins ?? 180, cost)}</p>
          </>
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
        {state.waiverRequired && (
          <Checkbox id="waiver" class="waiver" checked={state.waiverChecked} onChange={(checked) => setState((s) => pw.setWaiver(s, checked))}>
            {t.waiver}
          </Checkbox>
        )}
        {state.error === 'purchase_failed' && <p class="message error" role="alert">{t.purchaseFailed}</p>}
        {flowState.notice === 'plan_activating' && state.status !== 'activating' && (
          <div class="message" role="alert">
            {noticeText('plan_activating')}{' '}
            <button type="button" class="link" onClick={() => void flow.generate({ afterPurchase: true })}>{t.tryAgain}</button>
          </div>
        )}
        <div class="cta-bar">
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
