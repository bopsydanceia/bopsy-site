// The app's singletons: services (demo or live), the flow, and the stores
// the screens read (session, catalogue, wallet, estimate, toast).
import { Flow } from '../core/flow';
import type { Services } from '../core/ports';
import { navigate } from '../core/router';
import { createStore, type Store } from '../core/store';
import type { Dance, Session, Wallet } from '../core/types';

export type Catalog = { status: 'loading' } | { status: 'ready'; dances: Dance[] } | { status: 'error' };

export interface AppState {
  services: Services;
  flow: Flow;
  session: Store<Session | null>;
  catalog: Store<Catalog>;
  wallet: Store<Wallet | null>;
  estimatedMinutes: Store<number>;
  toast: Store<string | null>;
}

let state: AppState | null = null;

export function app(): AppState {
  if (!state) throw new Error('app not started');
  return state;
}

export function danceBySlug(slug: string): Dance | undefined {
  const catalog = app().catalog.get();
  return catalog.status === 'ready' ? catalog.dances.find((dance) => dance.slug === slug) : undefined;
}

export function danceById(id: string): Dance | undefined {
  const catalog = app().catalog.get();
  return catalog.status === 'ready' ? catalog.dances.find((dance) => dance.id === id) : undefined;
}

export function loadCatalog(): void {
  const { catalog, services } = app();
  catalog.set({ status: 'loading' });
  services.backend.dances().then(
    (dances) => catalog.set({ status: 'ready', dances }),
    () => catalog.set({ status: 'error' }),
  );
}

/** Resolves once the catalogue is loaded (or failed). */
export function catalogReady(): Promise<void> {
  const { catalog } = app();
  if (catalog.get().status !== 'loading') return Promise.resolve();
  return new Promise((resolve) => {
    const stop = catalog.subscribe((value) => {
      if (value.status === 'loading') return;
      stop();
      resolve();
    });
  });
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;

export function showToast(message: string, ms = 6000): void {
  const { toast } = app();
  clearTimeout(toastTimer);
  toast.set(message);
  toastTimer = setTimeout(() => toast.set(null), ms);
}

export function startApp(services: Services): AppState {
  const { backend } = services;
  const session = createStore<Session | null>(backend.auth.current());
  const wallet = createStore<Wallet | null>(null);
  state = {
    services,
    flow: new Flow({ backend, navigate, dance: (slug) => danceBySlug(slug), persist: true }),
    session,
    catalog: createStore<Catalog>({ status: 'loading' }),
    wallet,
    estimatedMinutes: createStore(2),
    toast: createStore<string | null>(null),
  };
  backend.auth.subscribe((next) => session.set(next));

  // The wallet of a signed-in (email) user, by Realtime.
  let stopWallet: (() => void) | null = null;
  const followWallet = (current: Session | null) => {
    stopWallet?.();
    stopWallet = null;
    wallet.set(null);
    if (current && !current.guest) stopWallet = backend.watchWallet((value) => wallet.set(value));
  };
  session.subscribe(followWallet);
  // A returning visitor's wallet waits for the first screen to be drawn.
  const idle = (run: () => void) => ('requestIdleCallback' in window ? requestIdleCallback(run, { timeout: 2000 }) : setTimeout(run, 300));
  idle(() => followWallet(session.get()));

  loadCatalog();
  return state;
}
