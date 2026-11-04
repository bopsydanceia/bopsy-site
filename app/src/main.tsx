import { render } from 'preact';
import './styles.css';
import { t } from './copy';
import { navigate, routeStore, startRouter } from './core/router';
import { createServices } from '#services';
import { App } from './ui/app';
import { catalogReady, showToast, startApp } from './ui/app-state';

startRouter();
const state = startApp(createServices());
render(<App />, document.getElementById('app')!);

state.services.backend.estimatedMinutes().then(
  (minutes) => state.estimatedMinutes.set(minutes),
  () => undefined,
);

// A magic link lands here with the session in the hash (implicit flow):
// supabase-js reads it, then the flow goes on where it stopped.
if (routeStore.get().name === 'auth') {
  const failed = /error_description=/.test(location.hash);
  void state.services.backend.auth.restore().then(async (session) => {
    navigate('/', { replace: true });
    if (failed || !session || session.guest) {
      if (failed) showToast(t.invalidCode);
      return;
    }
    await catalogReady();
    if (state.flow.state.photo.kind === 'accepted') await state.flow.continueSignedIn(false);
  });
}
