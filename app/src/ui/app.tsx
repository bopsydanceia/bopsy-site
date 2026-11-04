// The shell: one screen per route, the toast, and notices raised outside
// the create screen shown as toasts.
import { useEffect } from 'preact/hooks';
import { routeStore, type Route } from '../core/router';
import { app, showToast } from './app-state';
import { Toast } from './components';
import { useStore } from './hooks';
import { noticeText } from './notices';
import { AccountScreen } from './screens/account';
import { CreateScreen } from './screens/create';
import { DancesScreen } from './screens/dances';
import { GeneratingScreen } from './screens/generating';
import { PaywallScreen } from './screens/paywall';
import { PreviewScreen } from './screens/preview';
import { ResultScreen } from './screens/result';
import { UnlockScreen } from './screens/unlock';
import { VideosScreen } from './screens/videos';
import { Loading } from './components';

function Screen({ route }: { route: Route }) {
  switch (route.name) {
    case 'dances':
      return <DancesScreen />;
    case 'create':
      return <CreateScreen slug={route.slug} />;
    case 'preview':
      return <PreviewScreen id={route.id} />;
    case 'unlock':
      return <UnlockScreen />;
    case 'paywall':
      return <PaywallScreen />;
    case 'generating':
      return <GeneratingScreen id={route.id} />;
    case 'video':
      return <ResultScreen id={route.id} />;
    case 'videos':
      return <VideosScreen />;
    case 'account':
      return <AccountScreen />;
    case 'auth':
      return <Loading label="Signing you in…" />;
  }
}

export function App() {
  const route = useStore(routeStore);
  const flow = useStore(app().flow.store);
  // Notices of the flow: inline on the create screen, a toast elsewhere.
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
