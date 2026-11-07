// Live mode against a mock Supabase (contract of supabase/functions/README.md):
// the first screen loads without supabase-js nor Turnstile, nothing leaves
// before the consent box, then a guest session (with a CAPTCHA token)
// uploads into its own folder; check-photo's 429 is shown and Try again
// checks the same file without a new upload; start-preview sends platform
// "web" and a fresh Turnstile token (a refused token is retried once); the
// preview plays from preview-url (private bucket), renewed on a player
// error and before it expires, never downloadable; the report limit shows;
// the email code turns the guest into the email account (type email_change,
// no CAPTCHA). Then Send code with a CAPTCHA, and the hourly generation limit.
// Turnstile is a local stand-in (no call to Cloudflare), RevenueCat cut off.
import { expect, test, type Page } from '@playwright/test';

const MOCK = 'http://localhost:54321';

interface Logged { method: string; path: string; query: string; user: string | null; origin: string | null; body: Record<string, unknown> | null }

async function mockLog(): Promise<Logged[]> {
  return (await (await fetch(`${MOCK}/__log`)).json()) as Logged[];
}

async function control(flags: Record<string, unknown>): Promise<void> {
  await fetch(`${MOCK}/__control`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(flags) });
}

/** A stand-in for api.js: explicit rendering, one token per widget, onload callback. */
const FAKE_TURNSTILE = `
window.turnstile = {
  n: 0,
  render(el, options) {
    const id = 'w' + (++this.n);
    const token = 'tt-' + Math.random().toString(36).slice(2) + '-' + this.n;
    setTimeout(() => options.callback(token), 30);
    return id;
  },
  remove() {},
};
(() => {
  const name = new URL(document.currentScript.src).searchParams.get('onload');
  if (name && typeof window[name] === 'function') window[name]();
})();
`;

/** Turnstile served locally; returns the list of api.js requests. */
async function fakeTurnstile(page: Page): Promise<string[]> {
  const loads: string[] = [];
  await page.route(/challenges\.cloudflare\.com/, (route) => {
    loads.push(route.request().url());
    return route.fulfill({ status: 200, contentType: 'text/javascript', body: FAKE_TURNSTILE });
  });
  return loads;
}

const captchaOf = (entry: Logged | undefined) => (entry?.body?.gotrue_meta_security as { captcha_token?: string } | undefined)?.captcha_token;

test('live adapters: catalogue, consent, guest with CAPTCHA, check limit, preview, preview-url, report limit, email code', async ({ page }) => {
  const scripts: string[] = [];
  page.on('request', (request) => {
    if (request.resourceType() === 'script') scripts.push(new URL(request.url()).pathname);
  });
  await page.route(/revenuecat\.com/, (route) => route.abort()); // no external call
  const turnstile = await fakeTurnstile(page);
  await page.goto('./');
  await expect(page.getByRole('link', { name: /Street Bounce/ })).toBeVisible();
  await expect(page.getByText('Demo', { exact: true })).toHaveCount(0);
  expect(scripts.filter((path) => /\/assets\/dist-|Purchases/.test(path))).toEqual([]); // no supabase-js, no purchases-js yet
  expect(turnstile).toEqual([]); // no Turnstile on the catalogue
  const catalogue = (await mockLog()).filter((entry) => entry.path === '/rest/v1/dances');
  expect(catalogue).toHaveLength(1);
  expect(catalogue[0]!.query).toContain('active=eq.true');

  await page.getByRole('link', { name: /Street Bounce/ }).click();
  await page.locator('input[type=file]:not([capture])').first().setInputFiles('public/demo/man-sit.jpg');
  await expect(page.getByText('Not sent yet')).toBeVisible();
  expect((await mockLog()).filter((entry) => entry.path !== '/rest/v1/dances')).toEqual([]); // D50: nothing sent
  expect(turnstile).toEqual([]);

  // Consent: guest session with a CAPTCHA token, upload, then check-photo's hourly limit (429).
  await control({ checkLimitOnce: true, checkLimitSeconds: 3 });
  await page.getByLabel("This is me, or I have this person's permission to use their photo.").check();
  await expect(page.getByText(/^Too many photo checks\. Try again in [1-3] s\./)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try again' })).toHaveCount(0); // not before the wait is over
  expect(turnstile).toHaveLength(1);
  let log = await mockLog();
  const guest = log.find((entry) => entry.path === '/auth/v1/signup');
  expect(captchaOf(guest)).toMatch(/^tt-/);
  const uploads = log.filter((entry) => entry.path.startsWith('/storage/v1/object/photos/'));
  expect(uploads).toHaveLength(1);
  expect(uploads[0]!.user).toBeTruthy();
  expect(uploads[0]!.path).toMatch(new RegExp(`^/storage/v1/object/photos/${uploads[0]!.user}/[0-9a-f-]{36}\\.jpg$`));
  const photoPath = uploads[0]!.path.replace('/storage/v1/object/photos/', '');

  // Try again, once the wait is over: the same photo_path, no new upload.
  await page.getByRole('button', { name: 'Try again' }).click({ timeout: 10_000 });
  await expect(page.getByText('Full body detected')).toBeVisible();
  log = await mockLog();
  expect(log.filter((entry) => entry.path.startsWith('/storage/v1/object/photos/'))).toHaveLength(1);
  expect(log.filter((entry) => entry.path === '/functions/v1/check-photo').map((entry) => entry.body)).toEqual([{ photo_path: photoPath }, { photo_path: photoPath }]);

  // Preview: platform web and a Turnstile token; the first token refused, a new one sent.
  await control({ previewCaptchaFailOnce: true, brokenPreviewUrlOnce: true, previewUrlSeconds: 4 });
  await page.getByRole('button', { name: 'Generate free preview' }).click();
  await expect(page.getByText('PREVIEW · 2 S')).toBeVisible({ timeout: 20_000 });
  log = await mockLog();
  const previews = log.filter((entry) => entry.path === '/functions/v1/start-preview');
  expect(previews).toHaveLength(2);
  for (const call of previews) {
    expect(Object.keys(call.body!).sort()).toEqual(['captcha_token', 'consent_at', 'dance_id', 'device_token', 'photo_id', 'platform']);
    expect(call.body).toMatchObject({ platform: 'web' });
    expect(call.origin).toBe('http://localhost:4175');
    expect(String(call.body!.device_token)).toMatch(/^web-/);
  }
  expect(previews[0]!.body!.captcha_token).not.toBe(previews[1]!.body!.captcha_token);
  expect(turnstile).toHaveLength(1); // the script once, a widget per token

  // preview-url: the first URL fails in the player, a new one plays; renewed before it expires (4 s here).
  const video = page.locator('video');
  await expect(video).toHaveAttribute('src', /\/storage\/v1\/object\/sign\/previews\/.+token=p\d+/);
  log = await mockLog();
  const before = log.filter((entry) => entry.path === '/functions/v1/preview-url').length;
  expect(before).toBeGreaterThanOrEqual(2);
  expect(log.some((entry) => entry.method === 'GET' && entry.path.startsWith('/storage/v1/object/sign/previews/') && entry.query === '?token=broken')).toBe(true);
  await expect.poll(async () => (await mockLog()).filter((entry) => entry.path === '/functions/v1/preview-url').length, { timeout: 10_000 }).toBeGreaterThan(before);
  expect((await mockLog()).some((entry) => entry.path.startsWith('/storage/v1/object/sign/results/'))).toBe(false);
  await expect(page.locator('a[download]')).toHaveCount(0); // never a download for a preview
  await control({ previewUrlSeconds: 120 });

  // The report limit (PostgREST PT429).
  await control({ reportLimit: true });
  await page.getByRole('button', { name: 'Report this video' }).click();
  await page.getByRole('radio', { name: 'Something else' }).click();
  await page.getByRole('button', { name: 'Send report' }).click();
  await expect(page.getByText(/^You reached today's report limit\. Try again in 2 h\.$/)).toBeVisible();
  await page.getByRole('button', { name: 'OK' }).click();
  await control({ reportLimit: false });

  // The guest becomes the email account: updateUser, no CAPTCHA.
  // D139: Unlock opens the paywall first (RevenueCat is cut off here); the email step directly.
  await page.getByRole('button', { name: /Unlock full video/ }).click();
  await expect(page.getByRole('heading', { name: 'Unlock Bopsy' })).toBeVisible();
  await page.goto('./#/unlock');
  await page.getByLabel('Email', { exact: true }).fill('dancer@example.com');
  await page.getByRole('button', { name: 'Send code' }).click();
  await expect(page.getByRole('heading', { name: 'Enter your code' })).toBeVisible();
  await expect(page.getByTestId('demo-code')).toHaveCount(0);
  await page.getByLabel('Code from the email').fill('000000');
  await expect(page.getByText("That code didn't work. Check it or ask for a new one.")).toBeVisible();
  await page.getByLabel('Code from the email').fill('123456');
  await expect(page.getByRole('heading', { name: 'Unlock Bopsy' })).toBeVisible();
  await expect(page.getByText("We couldn't load the plans. Check your connection.")).toBeVisible(); // RevenueCat cut off
  log = await mockLog();
  const change = log.find((entry) => entry.path === '/auth/v1/user' && entry.method === 'PUT');
  expect(change?.body).toMatchObject({ email: 'dancer@example.com' });
  expect(captchaOf(change)).toBeUndefined(); // updateUser needs no CAPTCHA
  expect(log.some((entry) => entry.path === '/auth/v1/otp')).toBe(false);
  const verify = log.filter((entry) => entry.path === '/auth/v1/verify').pop();
  expect(verify?.body).toMatchObject({ type: 'email_change', email: 'dancer@example.com', token: '123456' });
  expect(captchaOf(verify)).toBeUndefined(); // nor verifyOtp
  expect(scripts.some((path) => /Purchases/.test(path))).toBe(true); // purchases-js only now, at the paywall

  await page.goto('./#/account');
  await expect(page.getByText('Signed in as dancer@example.com')).toBeVisible();
});

test('live adapters: Send code with a CAPTCHA (refused once, retried), then the hourly generation limit', async ({ browser }) => {
  const context = await browser.newContext({ baseURL: 'http://localhost:4175/', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await page.route(/revenuecat\.com/, (route) => route.abort());
  const turnstile = await fakeTurnstile(page);
  const start = (await mockLog()).length;

  await page.goto('./#/unlock');
  await page.getByLabel('Email', { exact: true }).fill('rich@example.com');
  await control({ authCaptchaFailOnce: true });
  await page.getByRole('button', { name: 'Send code' }).click();
  await expect(page.getByRole('heading', { name: 'Enter your code' })).toBeVisible();
  expect(turnstile).toHaveLength(1);
  let log = (await mockLog()).slice(start);
  const otp = log.filter((entry) => entry.path === '/auth/v1/otp');
  expect(otp).toHaveLength(2);
  expect(captchaOf(otp[0])).toMatch(/^tt-/);
  expect(captchaOf(otp[1])).toMatch(/^tt-/);
  expect(captchaOf(otp[0])).not.toBe(captchaOf(otp[1]));
  await page.getByLabel('Code from the email').fill('123456');
  await expect(page.getByText('Signed in as rich@example.com')).toBeVisible();

  // An account with bought coins: Generate, and the hourly limit (429) with its wait.
  await control({ generationLimit: true });
  await page.goto('./#/create/street-bounce');
  await page.locator('input[type=file]:not([capture])').first().setInputFiles('public/demo/man-sit.jpg');
  await page.getByLabel("This is me, or I have this person's permission to use their photo.").check();
  await expect(page.getByText('Full body detected')).toBeVisible();
  await page.getByRole('button', { name: 'Generate · 60 coins' }).click();
  await expect(page.getByText("You've reached the hourly video limit. Try again in 25 min. No coins were used.")).toBeVisible();
  log = (await mockLog()).slice(start);
  expect(log.filter((entry) => entry.path === '/functions/v1/start-generation')).toHaveLength(1);
  expect(log.some((entry) => entry.path === '/auth/v1/signup')).toBe(false); // signed in: no guest session
  await control({ generationLimit: false });
  await context.close();
});
