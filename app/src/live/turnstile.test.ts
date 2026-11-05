// Turnstile (D132): the script loads at the first token only, one widget per
// token (used once), invisible unless Cloudflare asks for a tap, one more
// widget after a widget error, none after a cancel or a timeout.
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { CaptchaFailed } from '../core/ports';
import { createTurnstile, loadTurnstile, SCRIPT_URL, TOKEN_TIMEOUT_MS, type TurnstileApi } from './turnstile';

type Callbacks = Record<string, (value?: unknown) => unknown>;

/** A fake window.turnstile: each render plays the next scripted outcome. */
function fakeApi(outcomes: Array<(callbacks: Callbacks) => void>) {
  const rendered: Array<Record<string, unknown>> = [];
  const removed: string[] = [];
  const api: TurnstileApi = {
    render(container, options) {
      expect(container.isConnected).toBe(true);
      rendered.push(options);
      const id = `w${rendered.length}`;
      const outcome = outcomes.shift();
      if (outcome) queueMicrotask(() => outcome(options as Callbacks));
      return id;
    },
    remove(id) {
      removed.push(id);
    },
  };
  return { api, rendered, removed };
}

const pass = (token: string) => (callbacks: Callbacks) => callbacks.callback!(token);
const widgetError = (code: string) => (callbacks: Callbacks) => callbacks['error-callback']!(code);

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Turnstile tokens', () => {
  test('one widget per token, invisible, removed once answered; each call gets a fresh token', async () => {
    const { api, rendered, removed } = fakeApi([pass('tok-a'), pass('tok-b')]);
    const captcha = createTurnstile({ siteKey: '0x4AAAAAAADnPIDROrmt1Wwj', load: async () => api });
    expect(await captcha.token('guest')).toBe('tok-a');
    expect(await captcha.token('preview')).toBe('tok-b');
    expect(rendered.map((options) => [options.sitekey, options.action, options.appearance, options.retry])).toEqual([
      ['0x4AAAAAAADnPIDROrmt1Wwj', 'guest', 'interaction-only', 'never'],
      ['0x4AAAAAAADnPIDROrmt1Wwj', 'preview', 'interaction-only', 'never'],
    ]);
    expect(removed).toEqual(['w1', 'w2']);
    expect(document.querySelector('.captcha')).toBeNull();
  });

  test('a widget error gets one more widget; two errors give CaptchaFailed', async () => {
    const once = fakeApi([widgetError('300030'), pass('tok-c')]);
    expect(await createTurnstile({ siteKey: 'k', load: async () => once.api }).token('code')).toBe('tok-c');
    const twice = fakeApi([widgetError('300030'), widgetError('300031')]);
    await expect(createTurnstile({ siteKey: 'k', load: async () => twice.api }).token('code')).rejects.toMatchObject({ detail: 'error_300031' });
    expect(twice.rendered).toHaveLength(2);
  });

  test('a tap asked for: the sheet shows; Cancel ends it without another widget', async () => {
    const { api, rendered } = fakeApi([(callbacks) => callbacks['before-interactive-callback']!()]);
    const pending = createTurnstile({ siteKey: 'k', load: async () => api }).token('preview');
    await vi.waitFor(() => expect(document.querySelector('.captcha.open')).not.toBeNull());
    expect(document.querySelector('.captcha')?.getAttribute('role')).toBe('dialog');
    document.querySelector<HTMLButtonElement>('.captcha button')!.click();
    await expect(pending).rejects.toMatchObject({ detail: 'cancelled' });
    expect(rendered).toHaveLength(1);
    expect(document.querySelector('.captcha')).toBeNull();
  });

  test('no answer: a timeout, not a second wait; an unsupported browser fails at once', async () => {
    vi.useFakeTimers();
    const silent = fakeApi([() => undefined]);
    const pending = createTurnstile({ siteKey: 'k', load: async () => silent.api }).token('guest');
    const settled = expect(pending).rejects.toMatchObject({ detail: 'timeout' });
    await vi.advanceTimersByTimeAsync(TOKEN_TIMEOUT_MS);
    await settled;
    expect(silent.rendered).toHaveLength(1);
    vi.useRealTimers();
    const old = fakeApi([(callbacks) => callbacks['unsupported-callback']!()]);
    await expect(createTurnstile({ siteKey: 'k', load: async () => old.api }).token('guest')).rejects.toBeInstanceOf(CaptchaFailed);
  });
});

describe('the Turnstile script', () => {
  test('loaded on the first token only, explicit rendering; a failed load is tried again', async () => {
    const win = window as Window & { turnstile?: TurnstileApi; bopsyTurnstileLoaded?: () => void };
    delete win.turnstile;
    expect(document.querySelectorAll('script')).toHaveLength(0);
    const failing = loadTurnstile(document);
    const first = document.querySelector('script')!;
    expect(first.src).toBe(SCRIPT_URL);
    expect(first.src).toContain('render=explicit');
    first.onerror!(new Event('error'));
    await expect(failing).rejects.toMatchObject({ detail: 'script_error' });
    expect(document.querySelectorAll('script')).toHaveLength(0);

    const loading = loadTurnstile(document);
    expect(loadTurnstile(document)).toBe(loading); // one script for concurrent calls
    expect(document.querySelectorAll('script')).toHaveLength(1);
    const { api } = fakeApi([]);
    win.turnstile = api;
    win.bopsyTurnstileLoaded!();
    expect(await loading).toBe(api);
    expect(await loadTurnstile(document)).toBe(api);
    delete win.turnstile;
  });
});
