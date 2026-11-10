// The shell: one screen per route, the toast, and notices raised outside
// the create screen shown as toasts. Only the catalogue is in the first
// chunk; the other screens load in idle time just after it.
import { useEffect } from 'preact/hooks';
import { routeStore, type Route } from '../core/router';
import { t } from '../copy';
import { app, loadFlow, showToast } from './app-state';
import { Loading, Toast } from './components';
import { useStore } from './hooks';
import { lazyScreen } from './lazy';
import { noticeText } from './notices';
import { DancesScreen } from './screens/dances';

/** A screen after the catalogue: its chunk and the flow controller, loaded together. */
const withFlow = <T,>(screen: Promise<T>): Promise<T> => Promise.all([screen, loadFlow()]).then(([module]) => module);
const CreateScreen = lazyScreen(() => withFlow(import('./screens/create')).then((m) => m.CreateScreen));
const PreviewScreen = lazyScreen(() => withFlow(import('./screens/preview')).then((m) => m.PreviewScreen));
const TrendScreen = lazyScreen(() => withFlow(import('./screens/trend')).then((m) => m.TrendScreen));
const ReadyScreen = lazyScreen(() => withFlow(import('./screens/ready')).then((m) => m.ReadyScreen));
const UnlockScreen = lazyScreen(() => withFlow(import('./screens/unlock')).then((m) => m.UnlockScreen));
const PaywallScreen = lazyScreen(() => withFlow(import('./screens/paywall')).then((m) => m.PaywallScreen));
const GeneratingScreen = lazyScreen(() => withFlow(import('./screens/generating')).then((m) => m.GeneratingScreen));
const ResultScreen = lazyScreen(() => withFlow(import('./screens/result')).then((m) => m.ResultScreen));
const VideosScreen = lazyScreen(() => withFlow(import('./screens/videos')).then((m) => m.VideosScreen));
const AdminScreen = lazyScreen(() => import('./screens/admin').then((m) => m.AdminScreen));
const AccountScreen = lazyScreen(() => withFlow(import('./screens/account')).then((m) => m.AccountScreen));

/** Fetches the other screens once the first one is on screen. */
export function preloadScreens(): void {
  for (const screen of [TrendScreen, CreateScreen, ReadyScreen, PreviewScreen, UnlockScreen, PaywallScreen, GeneratingScreen, ResultScreen, VideosScreen, AccountScreen]) {
    void screen.preload().catch(() => undefined);
  }
}

function Screen({ route }: { route: Route }) {
  switch (route.name) {
    case 'dances':
      return <DancesScreen />;
    case 'trend':
      return <TrendScreen slug={route.slug} />;
    case 'create':
      return <CreateScreen slug={route.slug} />;
    case 'preview':
      return <PreviewScreen id={route.id} />;
    case 'ready':
      return <ReadyScreen />;
    case 'unlock':
      return <UnlockScreen />;
    case 'paywall':
      return <PaywallScreen />;
    case 'shop':
      return <PaywallScreen shop />;
    case 'admin':
      return <AdminScreen />;
    case 'generating':
      return <GeneratingScreen id={route.id} />;
    case 'video':
      return <ResultScreen id={route.id} />;
    case 'videos':
      return <VideosScreen />;
    case 'account':
      return <AccountScreen />;
    case 'auth':
      return <Loading label={t.signingIn} />;
  }
}

export function App() {
  const route = useStore(routeStore);
  const flow = useStore(app().flowStore);
  // Notices of the flow: inline on the create and paywall screens, a toast elsewhere.
  useEffect(() => {
    if (flow.notice && route.name !== 'create' && route.name !== 'paywall') showToast(noticeText(flow.notice));
  }, [flow.notice]);
  // Keyed by route so each screen starts fresh (focus, scroll, local state).
  const key = JSON.stringify(route);
  return (
    <div class="shell">
      <Screen key={key} route={route} />
      <Toast />
    </div>
  );
}
