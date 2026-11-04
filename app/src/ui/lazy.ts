// Screens after the first one load as separate chunks (the first screen
// stays small, D108) and are fetched in idle time right after it, so moving
// on is instant.
import { h, type ComponentType } from 'preact';
import { useEffect, useState } from 'preact/hooks';

export interface LazyScreen<P> {
  (props: P): ReturnType<typeof h> | null;
  preload(): Promise<void>;
}

export function lazyScreen<P extends object>(load: () => Promise<ComponentType<P>>): LazyScreen<P> {
  let loaded: ComponentType<P> | null = null;
  let pending: Promise<void> | null = null;
  const preload = () => (pending ??= load().then((component) => void (loaded = component)));
  const Lazy = ((props: P) => {
    const [, setReady] = useState(loaded !== null);
    useEffect(() => {
      if (!loaded) void preload().then(() => setReady(true), () => setReady(false));
    }, []);
    return loaded ? h(loaded, props) : null;
  }) as LazyScreen<P>;
  Lazy.preload = preload;
  return Lazy;
}
