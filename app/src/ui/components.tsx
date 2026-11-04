import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { DEMO } from '../config';
import { coins, t } from '../copy';
import { goBack } from '../core/router';
import { app } from './app-state';
import { useStore } from './hooks';
import { Icon } from './icons';

/** The coin balance of a signed-in user (wallet by Realtime). */
export function CoinPill() {
  const session = useStore(app().session);
  const wallet = useStore(app().wallet);
  if (!session || session.guest) return null;
  return (
    <a class="pill" href="#/account" aria-label={wallet ? `${coins(wallet.total)}, ${t.account}` : t.account}>
      <Icon name="coin" />
      <span aria-hidden="true">{wallet ? wallet.total.toLocaleString('en-US') : '…'}</span>
    </a>
  );
}

export function DemoBadge() {
  return DEMO ? <span class="demo-badge" title="Demo mode: nothing is charged, nothing is sent">{t.demoBadge}</span> : null;
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
  return (
    <header class="top">
      <div class="top-left">
        {brand && (
          <a class="brand" href="../" aria-label="Bopsy home">
            {t.wordmark}
          </a>
        )}
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
        <DemoBadge />
        {right ?? (
          <>
            <CoinPill />
            {(!session || session.guest) && brand && (
              <a class="icon-btn" href="#/account" aria-label={t.account}>
                <Icon name="user" />
              </a>
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
