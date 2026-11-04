import { render } from 'preact';
import './styles.css';
import { t } from './copy';
import { navigate, routeStore, startRouter } from './core/router';
import { createServices } from '#services';
import { App, preloadScreens } from './ui/app';
import { catalogReady, showToast, startApp } from './ui/app-state';

startRouter();
const state = startApp(createServices());
render(<App />, document.getElementById('app')!);

// The other screens: at the first touch, or 3 s after the page loaded,
// so they never compete with the first screen's images.
let preloaded = false;
const preload = () => {
  if (preloaded) return;
  preloaded = true;
  preloadScreens();
};
for (const type of ['pointerdown', 'keydown']) addEventListener(type, preload, { once: true, passive: true });
addEventListener('load', () => setTimeout(preload, 3000), { once: true });

// app_config estimated_minutes (C21), read again once a session exists.
const readEstimate = () =>
  state.services.backend.estimatedMinutes().then(
    (minutes) => state.estimatedMinutes.set(minutes),
    () => undefined,
  );
void readEstimate();
state.session.subscribe((session) => session && void readEstimate());

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
