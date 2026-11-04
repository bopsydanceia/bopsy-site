import { useEffect, useState } from 'preact/hooks';
import type { Store } from '../core/store';

/** The current value of [store], re-rendering on change. */
export function useStore<T>(store: Store<T>): T {
  const [value, setValue] = useState(store.get());
  useEffect(() => {
    setValue(store.get());
    return store.subscribe(setValue);
  }, [store]);
  return value;
}

/** Date.now(), refreshed every [ms] while mounted. */
export function useNow(ms: number): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(timer);
  }, [ms]);
  return now;
}

export type Loadable<T> = { status: 'loading' } | { status: 'ready'; value: T } | { status: 'error' };

/** Runs [load] when [key] changes; retry() runs it again. */
export function useLoad<T>(load: () => Promise<T>, key: unknown[]): [Loadable<T>, () => void] {
  const [state, setState] = useState<Loadable<T>>({ status: 'loading' });
  const [round, setRound] = useState(0);
  useEffect(() => {
    let alive = true;
    setState({ status: 'loading' });
    load().then(
      (value) => alive && setState({ status: 'ready', value }),
      () => alive && setState({ status: 'error' }),
    );
    return () => {
      alive = false;
    };
  }, [...key, round]);
  return [state, () => setRound((r) => r + 1)];
}
