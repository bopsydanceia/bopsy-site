// My account (21 on the web): email, coins (wallet by Realtime), plan,
// manage the Web Billing subscription, buy coins, My videos, delete the
// photos and videos, sign out, legal links.
import { useState } from 'preact/hooks';
import { LINKS } from '../../config';
import { formatNumber, t } from '../../copy';
import { navigate } from '../../core/router';
import { app, showToast } from '../app-state';
import { Header, LangSwitch, Sheet } from '../components';
import { useLoad, useStore } from '../hooks';
import { Icon } from '../icons';

export function AccountScreen() {
  const { services, flow } = app();
  const session = useStore(app().session);
  const wallet = useStore(app().wallet);
  const signedIn = session !== null && !session.guest;
  const [account] = useLoad(() => (signedIn ? services.backend.account() : Promise.resolve(null)), [session?.userId, signedIn, wallet?.total]);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const manage = async () => {
    if (!session) return;
    setBusy(true);
    try {
      const offer = await (await services.billing()).offer(session);
      if (offer.managementUrl) location.href = offer.managementUrl;
      else showToast(t.manageFallback);
    } catch {
      showToast(t.error);
    }
    setBusy(false);
  };

  const remove = async () => {
    setBusy(true);
    const ok = await services.backend.deleteMedia();
    setBusy(false);
    setConfirm(false);
    showToast(ok ? t.deleteDone : t.deleteFailed);
    if (ok) flow.reset();
  };

  const signOut = async () => {
    await services.backend.auth.signOut();
    flow.reset();
    navigate('/', { replace: true });
  };

  const sub = account.status === 'ready' ? account.value?.subscription ?? null : null;
  const bought = wallet?.bought ?? 0;
  const detail = sub?.active ? (sub.period === 'yearly' ? t.coinsDetailYearly(bought) : t.coinsDetailWeekly(bought)) : t.coinsDetailNoPlan(bought);

  return (
    <>
      <Header title={t.account} back="/" right={<span />} />
      <main class="narrow">
        <div class="row lang-row">
          <span>{t.language}</span>
          <LangSwitch />
        </div>
        {!signedIn ? (
          <div class="empty">
            <p class="muted">{t.signInBody}</p>
            <a class="btn btn-cta" href="#/login">{t.signIn}</a>
          </div>
        ) : (
          <>
            <p class="muted">{t.signedInAs(session.email ?? '')}</p>
            <div class="rows">
              <div class="row">
                <span>
                  {t.coinsTitle}
                  <small>{detail}</small>
                </span>
                <span class="pill"><Icon name="coin" />{wallet ? formatNumber(wallet.total) : '…'}</span>
              </div>
              {sub?.active ? (
                <>
                  <button type="button" class="row" disabled={busy} onClick={() => void manage()}>
                    <span>{sub.period === 'yearly' ? t.yearlyPlan : t.weeklyPlan}<small>{t.manage}</small></span>
                  </button>
                </>
              ) : (
                <a class="row" href="#/paywall"><span>{t.getPro}<small>{t.noPlan}</small></span></a>
              )}
              <a class="row" href="#/shop"><span>{t.buyCoinsLink}<small>{t.shopRowHint}</small></span></a>
              <a class="row" href="#/videos">{t.myVideos}</a>
              <a class="row" href={LINKS.support} target="_blank" rel="noopener">{t.help}</a>
              <a class="row" href={LINKS.terms} target="_blank" rel="noopener">{t.termsOfUse}</a>
              <a class="row" href={LINKS.privacy} target="_blank" rel="noopener">{t.privacyPolicy}</a>
              <button type="button" class="row danger" onClick={() => setConfirm(true)}>{t.deleteMedia}</button>
              <button type="button" class="row" onClick={() => void signOut()}>{t.signOut}</button>
            </div>
          </>
        )}
      </main>
      {confirm && (
        <Sheet title={t.deleteConfirmTitle} onClose={() => setConfirm(false)}>
          <p class="muted">{t.deleteConfirmBody}</p>
          <button type="button" class="btn btn-cta btn-block" disabled={busy} onClick={() => void remove()}>{busy ? '…' : t.deleteAction}</button>
          <button type="button" class="btn btn-ghost btn-block" onClick={() => setConfirm(false)}>{t.cancel}</button>
        </Sheet>
      )}
    </>
  );
}
