// Cloudflare Turnstile (D132): a fresh token for each call that needs one
// (guest session and email code through Supabase Auth, start-preview). The
// script loads the first time a token is asked (consent tick, Send code,
// preview), never on the catalogue. Each token comes from its own widget,
// removed right after: a token is used once and lives 300 s. The widget is
// "interaction-only": most visitors see nothing; when Cloudflare wants a tap,
// a small sheet shows it. Explicit rendering, no cookie of ours, no popup,
// so it behaves the same in the TikTok and Instagram in-app browsers.
import { t } from '../copy';
import { CaptchaFailed } from '../core/ports';

export type CaptchaAction = 'guest' | 'code' | 'preview';

/** What the live adapters ask for: a one-use token, or CaptchaFailed. */
export interface CaptchaPort {
  token(action: CaptchaAction): Promise<string>;
}

/** The part of window.turnstile used here (explicit rendering). */
export interface TurnstileApi {
  render(container: HTMLElement, options: Record<string, unknown>): string | null | undefined;
  remove(widgetId: string): void;
}

export const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=bopsyTurnstileLoaded';
/** Script download, then a token without interaction. */
export const LOAD_TIMEOUT_MS = 15_000;
export const TOKEN_TIMEOUT_MS = 30_000;
/** Once Cloudflare asks for a tap, the visitor gets time to do it. */
export const INTERACTIVE_TIMEOUT_MS = 180_000;

type TurnstileWindow = Window & { turnstile?: TurnstileApi; bopsyTurnstileLoaded?: () => void };

let loading: Promise<TurnstileApi> | null = null;

/** Loads api.js once; a failed load is tried again at the next call. */
export function loadTurnstile(doc: Document = document, timeoutMs = LOAD_TIMEOUT_MS): Promise<TurnstileApi> {
  const win = (doc.defaultView ?? window) as TurnstileWindow;
  if (win.turnstile) return Promise.resolve(win.turnstile);
  loading ??= new Promise<TurnstileApi>((resolve, reject) => {
    const script = doc.createElement('script');
    let timer: ReturnType<typeof setTimeout> | undefined;
    const fail = (detail: string) => {
      clearTimeout(timer);
      loading = null;
      script.remove();
      reject(new CaptchaFailed(detail));
    };
    timer = setTimeout(() => fail('script_timeout'), timeoutMs);
    win.bopsyTurnstileLoaded = () => {
      clearTimeout(timer);
      if (win.turnstile) resolve(win.turnstile);
      else fail('script_empty');
    };
    script.src = SCRIPT_URL;
    script.async = true;
    script.onerror = () => fail('script_error');
    doc.head.appendChild(script);
  });
  return loading;
}

/** The sheet that holds the widget: invisible unless Cloudflare asks for a tap. */
function openHost(doc: Document, onCancel: () => void) {
  const root = doc.createElement('div');
  root.className = 'captcha';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', t.captchaTitle);
  const sheet = doc.createElement('div');
  sheet.className = 'captcha-sheet';
  const title = doc.createElement('p');
  title.className = 'captcha-title';
  title.textContent = t.captchaTitle;
  const slot = doc.createElement('div');
  slot.className = 'captcha-slot';
  const cancel = doc.createElement('button');
  cancel.type = 'button';
  cancel.className = 'link';
  cancel.textContent = t.cancel;
  cancel.addEventListener('click', onCancel);
  sheet.append(title, slot, cancel);
  root.append(sheet);
  doc.body.appendChild(root);
  return {
    slot,
    show: () => {
      root.classList.add('open');
      cancel.focus();
    },
    quiet: () => root.classList.remove('open'),
    close: () => root.remove(),
  };
}

export interface TurnstileOptions {
  siteKey: string;
  load?: () => Promise<TurnstileApi>;
  doc?: Document;
  tokenTimeoutMs?: number;
  interactiveTimeoutMs?: number;
}

/** CAPTCHA tokens from Turnstile; a widget error gets one more widget, a cancel or a timeout none. */
export function createTurnstile(options: TurnstileOptions): CaptchaPort {
  const doc = options.doc ?? document;
  const load = options.load ?? (() => loadTurnstile(doc));

  const once = (api: TurnstileApi, action: CaptchaAction) =>
    new Promise<string>((resolve, reject) => {
      let done = false;
      let widget: string | null = null;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const finish = (result: string | CaptchaFailed) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (widget) api.remove(widget);
        host.close();
        if (typeof result === 'string') resolve(result);
        else reject(result);
      };
      const host = openHost(doc, () => finish(new CaptchaFailed('cancelled')));
      timer = setTimeout(() => finish(new CaptchaFailed('timeout')), options.tokenTimeoutMs ?? TOKEN_TIMEOUT_MS);
      try {
        const id = api.render(host.slot, {
          sitekey: options.siteKey,
          action,
          theme: 'dark',
          language: 'en',
          size: 'flexible',
          appearance: 'interaction-only',
          retry: 'never',
          'refresh-expired': 'never',
          'refresh-timeout': 'never',
          'response-field': false,
          callback: (token: unknown) => finish(typeof token === 'string' && token ? token : new CaptchaFailed('empty')),
          'error-callback': (code: unknown) => {
            finish(new CaptchaFailed(`error_${String(code ?? '')}`));
            return true;
          },
          'expired-callback': () => finish(new CaptchaFailed('expired')),
          'timeout-callback': () => finish(new CaptchaFailed('timeout')),
          'unsupported-callback': () => finish(new CaptchaFailed('unsupported')),
          'before-interactive-callback': () => {
            host.show();
            clearTimeout(timer);
            timer = setTimeout(() => finish(new CaptchaFailed('timeout')), options.interactiveTimeoutMs ?? INTERACTIVE_TIMEOUT_MS);
          },
          'after-interactive-callback': () => host.quiet(),
        });
        widget = id ?? null;
        if (done && widget) api.remove(widget); // answered inside render()
      } catch {
        finish(new CaptchaFailed('render'));
      }
    });

  return {
    async token(action) {
      const api = await load();
      try {
        return await once(api, action);
      } catch (error) {
        const detail = error instanceof CaptchaFailed ? error.detail ?? '' : '';
        if (!detail.startsWith('error_') && detail !== 'render') throw error;
        return once(api, action);
      }
    },
  };
}

let shared: CaptchaPort | null = null;

/** The site's Turnstile widget (VITE_TURNSTILE_SITE_KEY). */
export function siteTurnstile(siteKey: string): CaptchaPort {
  shared ??= createTurnstile({ siteKey });
  return shared;
}
