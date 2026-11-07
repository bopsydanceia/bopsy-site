// Hash router: routes live after "#", so the build works under any base
// path (/bopsy-site/app/ on GitHub Pages) and a reload never hits a 404.
import { createStore } from './store';

export type Route =
  | { name: 'dances' }
  | { name: 'trend'; slug: string }
  | { name: 'create'; slug: string }
  | { name: 'preview'; id: string }
  | { name: 'ready' }
  | { name: 'unlock' }
  | { name: 'paywall' }
  | { name: 'generating'; id: string }
  | { name: 'video'; id: string }
  | { name: 'videos' }
  | { name: 'account' }
  | { name: 'auth' };

const SEGMENT = /^[A-Za-z0-9_-]{1,80}$/;

/** The route of a location hash ("#/create/street-bounce"); unknown paths go to the catalogue. */
export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#/, '');
  // A magic link lands with auth tokens in the hash (implicit flow): not a route.
  if (/(^|&)(access_token|error_description|error_code)=/.test(raw)) return { name: 'auth' };
  const path = raw.split('?')[0] ?? '';
  const parts = path.split('/').filter(Boolean);
  const [head, id] = parts;
  const valid = id !== undefined && SEGMENT.test(id) && parts.length === 2;
  switch (head) {
    case undefined:
      return { name: 'dances' };
    case 'trend':
      return valid ? { name: 'trend', slug: id } : { name: 'dances' };
    case 'create':
      return valid ? { name: 'create', slug: id } : { name: 'dances' };
    case 'preview':
      return valid ? { name: 'preview', id } : { name: 'dances' };
    case 'generating':
      return valid ? { name: 'generating', id } : { name: 'dances' };
    case 'video':
      return valid ? { name: 'video', id } : { name: 'dances' };
    case 'ready':
    case 'unlock':
    case 'paywall':
    case 'videos':
    case 'account':
      return parts.length === 1 ? { name: head } : { name: 'dances' };
    default:
      return { name: 'dances' };
  }
}

export function pathOf(route: Route): string {
  switch (route.name) {
    case 'dances':
    case 'auth':
      return '/';
    case 'trend':
    case 'create':
      return `/${route.name}/${route.slug}`;
    case 'preview':
    case 'generating':
    case 'video':
      return `/${route.name}/${route.id}`;
    default:
      return `/${route.name}`;
  }
}

export const routeStore = createStore<Route>(typeof location === 'undefined' ? { name: 'dances' } : parseHash(location.hash));

export type Navigate = (path: string, options?: { replace?: boolean }) => void;

/** In-app history depth, kept in history.state: Back leaves the app only from its first page. */
function depth(): number {
  const state = history.state as { bopsyDepth?: unknown } | null;
  return typeof state?.bopsyDepth === 'number' ? state.bopsyDepth : 0;
}

/** Changes the hash (a new history entry unless replace) and the route store. */
export const navigate: Navigate = (path, options) => {
  const hash = `#${path}`;
  const url = `${location.pathname}${location.search}${hash}`;
  if (options?.replace) history.replaceState({ bopsyDepth: depth() }, '', url);
  else if (location.hash !== hash) history.pushState({ bopsyDepth: depth() + 1 }, '', url);
  routeStore.set(parseHash(hash));
  window.scrollTo(0, 0);
};

export function startRouter(): void {
  if (typeof (history.state as { bopsyDepth?: unknown } | null)?.bopsyDepth !== 'number') {
    history.replaceState({ bopsyDepth: 0 }, '', location.href);
  }
  window.addEventListener('popstate', () => routeStore.set(parseHash(location.hash)));
}

/** Back in the app's history when there is one, else to [fallback]. */
export function goBack(fallback: string): void {
  if (depth() > 0) history.back();
  else navigate(fallback, { replace: true });
}
