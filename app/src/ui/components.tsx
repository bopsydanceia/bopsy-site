import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { DEMO, LINKS } from '../config';
import { coins, formatNumber, t } from '../copy';
import { goBack, routeStore } from '../core/router';
import { LOCALE, LOCALES, switchLocale } from '../locale';
import { app } from './app-state';
import { useStore } from './hooks';
import { Icon } from './icons';

/** The coin balance of a signed-in user (wallet by Realtime). */
export function CoinPill() {
  const session = useStore(app().session);
  const wallet = useStore(app().wallet);
  if (!session || session.guest) return null;
  return (
    <a class="pill" href="#/shop" aria-label={wallet ? `${coins(wallet.total)}, ${t.shopTitle}` : t.shopTitle}>
      <Icon name="coin" />
      <span aria-hidden="true">{wallet ? formatNumber(wallet.total) : '…'}</span>
    </a>
  );
}

export function DemoBadge() {
  return DEMO ? <span class="demo-badge" title={t.demoBadgeTitle}>{t.demoBadge}</span> : null;
}

/** FR / EN: stores the choice and reloads the page in that language. */
export function LangSwitch() {
  return (
    <div class="lang" role="group" aria-label={t.language}>
      {LOCALES.map((locale) => (
        <button
          key={locale}
          type="button"
          lang={locale}
          aria-pressed={locale === LOCALE}
          aria-label={t.languageNames[locale]}
          onClick={() => locale !== LOCALE && switchLocale(locale)}
        >
          {locale.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

/** The header links of a computer screen (hidden on phones, where the screens link to each other). */
function DeskNav() {
  const route = useStore(routeStore);
  const session = useStore(app().session);
  const signedIn = session !== null && !session.guest;
  const current = (name: string) => (route.name === name ? 'page' : undefined);
  return (
    <nav class="desk-nav">
      <a href="#/" aria-current={current('dances')}>{t.navDances}</a>
      <a href="#/videos" aria-current={current('videos')}>{t.myVideos}</a>
      <a href="#/shop" aria-current={current('shop')}>{t.shopTitle}</a>
      {signedIn ? (
        <a href="#/account" aria-current={current('account')}>{t.account}</a>
      ) : (
        <a href="#/login" class="nav-login" aria-current={current('unlock')}>{t.signIn}</a>
      )}
      <LangSwitch />
    </nav>
  );
}

interface HeaderProps {
  title?: string;
  /** Back target when there is no in-app history. */
  back?: string;
  close?: () => void;
  brand?: boolean;
  right?: ComponentChildren;
}

export function Header({ title, back, close, brand, right }: HeaderProps) {
  const session = useStore(app().session);
  const routeName = useStore(routeStore).name;
  const onSignIn = routeName === 'unlock';
  const signedIn = session !== null && !session.guest;
  return (
    <header class="top">
      <div class="top-left">
        {/* On a computer the wordmark is always there (desktop-only when the screen has a back or close button). */}
        <a class={brand ? 'brand' : 'brand desk-only'} href={LINKS.home} aria-label={t.homeLabel}>
          {t.wordmark}
        </a>
        {back !== undefined && (
          <button type="button" class="icon-btn" onClick={() => goBack(back)} aria-label={t.back}>
            <Icon name="back" />
          </button>
        )}
        {close && (
          <button type="button" class="icon-btn" onClick={close} aria-label={t.close}>
            <Icon name="close" />
          </button>
        )}
      </div>
      {title ? <h1>{title}</h1> : <span />}
      <div class="top-right">
        <DeskNav />
        <DemoBadge />
        {right ?? (
          <>
            {/* Phone: My videos one tap away once signed in (the computer has it in the nav). */}
            {signedIn && routeName !== 'videos' && (
              <a class={title ? 'login-pill videos-pill compact mobile-only' : 'login-pill videos-pill mobile-only'} href="#/videos" aria-label={title ? t.myVideos : undefined}>
                <Icon name="play" />
                {!title && t.myVideos}
              </a>
            )}
            <CoinPill />
            {/* Phone: the settings behind a small gear, once signed in. */}
            {signedIn && routeName !== 'account' && (
              <a class="icon-btn gear mobile-only" href="#/account" aria-label={t.settings}>
                <Icon name="settings" />
              </a>
            )}
            {!signedIn && !onSignIn && (
              <a class="login-pill mobile-only" href="#/login">{t.signIn}</a>
            )}
          </>
        )}
      </div>
    </header>
  );
}

/** A bottom sheet dialog: focus moves in, Escape and the backdrop close it, focus goes back. */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ComponentChildren }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('button, input, textarea, a')?.focus();
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      opener?.focus?.();
    };
  }, [onClose]);
  return (
    <div class="backdrop" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div class="sheet" role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function Toast() {
  const message = useStore(app().toast);
  return (
    <div aria-live="polite" role="status">
      {message && <div class="toast">{message}</div>}
    </div>
  );
}

export function Checkbox(props: { checked: boolean; onChange: (checked: boolean) => void; children: ComponentChildren; class?: string; id: string }) {
  return (
    <label class={props.class ?? 'consent'} for={props.id}>
      <input id={props.id} type="checkbox" checked={props.checked} onChange={(event) => props.onChange((event.target as HTMLInputElement).checked)} />
      <span>{props.children}</span>
    </label>
  );
}

export function Loading({ label }: { label: string }) {
  return (
    <div class="empty" role="status" aria-live="polite">
      <p class="muted">{label}</p>
    </div>
  );
}

export function ErrorState({ text, retry }: { text: string; retry?: () => void }) {
  return (
    <div class="empty" role="alert">
      <p>{text}</p>
      {retry && (
        <button type="button" class="btn btn-secondary" onClick={retry}>
          {t.tryAgain}
        </button>
      )}
    </div>
  );
}
