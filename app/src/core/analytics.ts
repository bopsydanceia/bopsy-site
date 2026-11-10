// First-party analytics (D152): anonymous events written to Supabase
// (public.analytics_events, insert only), read back by the admin dashboard.
// No third party, no advertising cookie, no IP kept: a random visitor id in
// localStorage, a session id per tab, the ad source of the visit (utm_*,
// ttclid, fbclid). Sent in small batches with plain fetch (keepalive), so the
// first screen loads nothing more. Off in demo mode and in tests.

export interface AnalyticsTarget {
  url: string;
  key: string;
}

type Props = Record<string, string | number | boolean | null>;

interface Row {
  visitor_id: string;
  session_id: string;
  name: string;
  path: string;
  props: Props;
  source: string | null;
  medium: string | null;
  campaign: string | null;
  referrer: string | null;
  device: 'mobile' | 'tablet' | 'desktop';
  lang: string;
  in_app: string | null;
}

const VISITOR_KEY = 'bopsy.vid';
const SESSION_KEY = 'bopsy.sid';
const SOURCE_KEY = 'bopsy.src';

/** "/app/trend/nerd-mode" for #/trend/nerd-mode under /app/ (the hash router's page). */
export function pagePath(): string {
  const base = location.pathname.replace(/\/+$/, '');
  const route = location.hash.replace(/^#/, '').split('?')[0] || '/';
  return `${base}${route}`;
}

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function stored(storage: () => Storage, key: string, make: () => string): string {
  try {
    const value = storage().getItem(key);
    if (value) return value;
    const fresh = make();
    storage().setItem(key, fresh);
    return fresh;
  } catch {
    return make();
  }
}

/** The ad source of this visit: utm_* first, else a click id, else the referring site. */
export function sourceOf(search: string, referrer: string, host: string): { source: string | null; medium: string | null; campaign: string | null; referrer: string | null } {
  const q = new URLSearchParams(search);
  const cut = (v: string | null, n: number) => (v ? v.slice(0, n) : null);
  let refHost: string | null = null;
  try {
    const h = referrer ? new URL(referrer).hostname.replace(/^www\./, '') : '';
    refHost = h && h !== host.replace(/^www\./, '') ? h : null;
  } catch {
    refHost = null;
  }
  const source = q.get('utm_source') ?? (q.has('ttclid') ? 'tiktok' : q.has('fbclid') ? 'facebook' : q.has('gclid') ? 'google' : null);
  const medium = q.get('utm_medium') ?? (q.has('ttclid') || q.has('fbclid') || q.has('gclid') ? 'paid' : null);
  return { source: cut(source, 100), medium: cut(medium, 100), campaign: cut(q.get('utm_campaign'), 150), referrer: cut(refHost, 200) };
}

export function deviceOf(ua: string, width: number): Row['device'] {
  if (/iPad|Tablet/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))) return 'tablet';
  if (/Mobi|iPhone|Android/i.test(ua) || width < 700) return 'mobile';
  return 'desktop';
}

/** The app a link was opened in (their in-app browsers convert differently). */
export function inAppOf(ua: string): string | null {
  if (/musical_ly|BytedanceWebview|TikTok/i.test(ua)) return 'tiktok';
  if (/Instagram/i.test(ua)) return 'instagram';
  if (/FBAN|FBAV|FB_IAB/i.test(ua)) return 'facebook';
  if (/Snapchat/i.test(ua)) return 'snapchat';
  return null;
}

export class Analytics {
  private queue: Row[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly base: Omit<Row, 'name' | 'path' | 'props'> | null;

  constructor(private readonly target: AnalyticsTarget | null, lang: string) {
    if (!target || typeof window === 'undefined') {
      this.base = null;
      return;
    }
    const visitor = stored(() => localStorage, VISITOR_KEY, uuid);
    const session = stored(() => sessionStorage, SESSION_KEY, uuid);
    // The source is the one the session started with (internal navigation keeps it).
    const src = stored(() => sessionStorage, SOURCE_KEY, () => JSON.stringify(sourceOf(location.search, document.referrer, location.hostname)));
    let parsed: ReturnType<typeof sourceOf>;
    try {
      parsed = JSON.parse(src) as ReturnType<typeof sourceOf>;
    } catch {
      parsed = { source: null, medium: null, campaign: null, referrer: null };
    }
    const ua = navigator.userAgent;
    this.base = {
      visitor_id: visitor,
      session_id: session,
      ...parsed,
      device: deviceOf(ua, innerWidth),
      lang: lang.slice(0, 8),
      in_app: inAppOf(ua),
    };
    addEventListener('pagehide', () => this.flush());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.flush();
    });
  }

  track(name: string, props: Props = {}, path?: string): void {
    if (!this.base) return;
    this.queue.push({ ...this.base, name, path: (path ?? pagePath()).slice(0, 200), props });
    if (this.queue.length >= 10) this.flush();
    else if (!this.timer) this.timer = setTimeout(() => this.flush(), 1500);
  }

  flush(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (!this.target || this.queue.length === 0) return;
    const rows = this.queue.splice(0, this.queue.length);
    void fetch(`${this.target.url}/rest/v1/analytics_events`, {
      method: 'POST',
      keepalive: true,
      headers: { apikey: this.target.key, 'content-type': 'application/json', prefer: 'return=minimal' },
      body: JSON.stringify(rows),
    }).catch(() => undefined);
  }
}

let current: Analytics = new Analytics(null, 'en');

export function startAnalytics(target: AnalyticsTarget | null, lang: string): Analytics {
  current = new Analytics(target, lang);
  return current;
}

/** One event; a no-op until startAnalytics (demo, tests). */
export function track(name: string, props: Props = {}): void {
  current.track(name, props);
}
