import { render } from 'preact';
import './styles.css';
import { t } from './copy';
import { navigate, routeStore, startRouter, type Route } from './core/router';
import { startAnalytics, track } from './core/analytics';
import { KEYS, LIVE } from './config';
import { LOCALE } from './locale';
import { createServices } from '#services';
import { App, preloadScreens } from './ui/app';
import { catalogReady, loadFlow, showToast, startApp } from './ui/app-state';

startRouter();
// D152: first-party analytics, live site only.
startAnalytics(LIVE ? { url: KEYS.supabaseUrl, key: KEYS.supabaseAnonKey } : null, LOCALE);
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

// D152: a page view per screen, and the funnel steps a screen stands for.
let previous: Route | null = null;
const onRoute = (route: Route) => {
  if (route.name === 'auth') return;
  if (previous === null) track('app_view');
  track('page_view', { screen: route.name });
  if (route.name === 'trend') track('trend_open', { slug: route.slug });
  if (route.name === 'paywall') track('paywall_view');
  if (route.name === 'shop') track('shop_view');
  if (route.name === 'unlock') track('email_view');
  if (route.name === 'generating') track('video_started');
  if (route.name === 'video' && previous?.name === 'generating') track('video_ready');
  previous = route;
};
onRoute(routeStore.get());
routeStore.subscribe(onRoute);
let photoKind = state.flowStore.get().photo.kind;
state.flowStore.subscribe((flow) => {
  const kind = flow.photo.kind;
  if (kind === photoKind) return;
  photoKind = kind;
  const slug = flow.danceSlug ?? '';
  if (kind === 'local') track('photo_picked', { slug });
  if (kind === 'accepted') track('photo_accepted', { slug });
  if (kind === 'rejected') track('photo_rejected', { slug, reason: flow.photo.kind === 'rejected' ? flow.photo.reason : '' });
});
let signedUser: string | null = null;
state.session.subscribe((session) => {
  if (!session || session.guest || session.userId === signedUser) return;
  signedUser = session.userId;
  track('signed_in', { uid: session.userId });
});

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
    if (state.flowStore.get().photo.kind !== 'accepted') return;
    await (await loadFlow()).continueSignedIn(false);
  });
}
