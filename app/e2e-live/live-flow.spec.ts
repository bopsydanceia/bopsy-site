// Live mode against a mock Supabase: the first screen loads without
// supabase-js, nothing leaves before the consent box, then a guest session
// uploads into its own folder, check-photo and start-preview get the
// contract's bodies, the preview plays from a signed URL, and the email
// code turns the guest into the email account (type email_change).
import { expect, test } from '@playwright/test';

const MOCK = 'http://localhost:54321';

interface Logged { method: string; path: string; query: string; user: string | null; body: Record<string, unknown> | null }

async function mockLog(): Promise<Logged[]> {
  return (await (await fetch(`${MOCK}/__log`)).json()) as Logged[];
}

test('live adapters: catalogue, consent, guest upload, preview, email code, paywall', async ({ page }) => {
  const scripts: string[] = [];
  page.on('request', (request) => {
    if (request.resourceType() === 'script') scripts.push(new URL(request.url()).pathname);
  });
  await page.route(/revenuecat\.com/, (route) => route.abort()); // no external call
  await page.goto('./');
  await expect(page.getByRole('link', { name: /Street Bounce/ })).toBeVisible();
  await expect(page.getByText('Demo', { exact: true })).toHaveCount(0);
  expect(scripts.filter((path) => /\/assets\/dist-|Purchases/.test(path))).toEqual([]); // no supabase-js, no purchases-js yet
  const catalogue = (await mockLog()).filter((entry) => entry.path === '/rest/v1/dances');
  expect(catalogue).toHaveLength(1);
  expect(catalogue[0]!.query).toContain('active=eq.true');

  await page.getByRole('link', { name: /Street Bounce/ }).click();
  await page.locator('input[type=file]:not([capture])').first().setInputFiles('public/demo/man-sit.jpg');
  await expect(page.getByText('Not sent yet')).toBeVisible();
  expect((await mockLog()).filter((entry) => entry.path !== '/rest/v1/dances')).toEqual([]); // D50: nothing sent

  await page.getByLabel("This is me, or I have this person's permission to use their photo.").check();
  await expect(page.getByText('Full body detected')).toBeVisible();
  let log = await mockLog();
  const guest = log.find((entry) => entry.path === '/auth/v1/signup');
  const upload = log.find((entry) => entry.path.startsWith('/storage/v1/object/photos/'));
  const check = log.find((entry) => entry.path === '/functions/v1/check-photo');
  expect(guest).toBeTruthy();
  expect(upload?.user).toBeTruthy();
  expect(upload!.path).toMatch(new RegExp(`^/storage/v1/object/photos/${upload!.user}/[0-9a-f-]{36}\\.jpg$`));
  expect(check?.body).toEqual({ photo_path: upload!.path.replace('/storage/v1/object/photos/', '') });

  await page.getByRole('button', { name: 'Generate free preview' }).click();
  await expect(page.getByText('PREVIEW · 2 S')).toBeVisible({ timeout: 20_000 });
  log = await mockLog();
  const preview = log.find((entry) => entry.path === '/functions/v1/start-preview');
  expect(Object.keys(preview!.body!).sort()).toEqual(['consent_at', 'dance_id', 'device_token', 'photo_id']);
  expect(String(preview!.body!.device_token)).toMatch(/^web-/);
  await expect(page.locator('video')).toHaveAttribute('src', /\/storage\/v1\/object\/sign\/results\//);

  await page.getByRole('button', { name: /Unlock full video/ }).click();
  await page.getByLabel('Email').fill('dancer@example.com');
  await page.getByRole('button', { name: 'Send code' }).click();
  await expect(page.getByRole('heading', { name: 'Enter your code' })).toBeVisible();
  await expect(page.getByTestId('demo-code')).toHaveCount(0);
  await page.getByLabel('6-digit code').fill('000000');
  await expect(page.getByText("That code didn't work. Check it or ask for a new one.")).toBeVisible();
  await page.getByLabel('6-digit code').fill('123456');
  await expect(page.getByRole('heading', { name: 'Unlock Bopsy' })).toBeVisible();
  await expect(page.getByText("We couldn't load the plans. Check your connection.")).toBeVisible(); // RevenueCat cut off
  log = await mockLog();
  const change = log.find((entry) => entry.path === '/auth/v1/user' && entry.method === 'PUT');
  expect(change?.body).toMatchObject({ email: 'dancer@example.com' });
  const verify = log.filter((entry) => entry.path === '/auth/v1/verify').pop();
  expect(verify?.body).toMatchObject({ type: 'email_change', email: 'dancer@example.com', token: '123456' });
  expect(scripts.some((path) => /Purchases/.test(path))).toBe(true); // purchases-js only now, at the paywall

  await page.goto('./#/account');
  await expect(page.getByText('Signed in as dancer@example.com')).toBeVisible();
});
