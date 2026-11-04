// A tiny observable value: the flow, the session and the wallet live in
// stores the screens subscribe to (useStore in ui/hooks.ts).

export interface Store<T> {
  get(): T;
  set(next: T | ((current: T) => T)): void;
  subscribe(listener: (value: T) => void): () => void;
}

export function createStore<T>(initial: T): Store<T> {
  let value = initial;
  const listeners = new Set<(value: T) => void>();
  return {
    get: () => value,
    set(next) {
      const resolved = typeof next === 'function' ? (next as (current: T) => T)(value) : next;
      if (Object.is(resolved, value)) return;
      value = resolved;
      for (const listener of [...listeners]) listener(value);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** A random v4 uuid (idempotency keys, file names, browser token). */
export function uuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** localStorage that never throws (private mode, blocked storage, in-app browsers). */
export const safeStorage = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string | null): void {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch {
      /* storage unavailable: the value lives in memory only */
    }
  },
};

/** One random token per browser for start-preview's device_token (D113, one preview per browser). */
export function browserToken(): string {
  const key = 'bopsy.browser';
  let token = safeStorage.get(key);
  if (!token || token.length < 16) {
    token = `web-${uuid()}`;
    safeStorage.set(key, token);
  }
  return token;
}
