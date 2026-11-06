// The whole demo flow in a phone-sized Chrome (D113): dance, photo,
// consent, check, preparing, locked video, paywall, email code, simulated checkout (D139),
// generation, result, report, Make another, My videos, account, sign out.
import { expect, test, type Page } from '@playwright/test';

const SHOTS = process.env.BOPSY_SHOTS; // folder for step screenshots (optional)

async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

/** Videos the demo server made (none before payment, D139). */
async function storedVideos(page: Page): Promise<number> {
  return page.evaluate(() => {
    const raw = sessionStorage.getItem('bopsy.demo.v1');
    return raw ? Object.keys((JSON.parse(raw) as { videos?: object }).videos ?? {}).length : 0;
  });
}

/** Photos the demo server stored (sessionStorage), to prove nothing left before the consent. */
async function storedPhotos(page: Page): Promise<number> {
  return page.evaluate(() => {
    const raw = sessionStorage.getItem('bopsy.demo.v1');
    return raw ? Object.keys((JSON.parse(raw) as { photos: object }).photos).length : 0;
  });
}

test('demo: from a photo to a paid video', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Pick a trend' })).toBeVisible();
  await expect(page.getByText('Demo', { exact: true })).toBeVisible();
  await shot(page, '01-dances');
  await page.getByRole('link', { name: 'Street Bounce' }).click();

  await expect(page.getByRole('heading', { name: 'Join the trend' })).toBeVisible();
  await expect(page.getByText('Whole body in the frame', { exact: true })).toBeVisible();
  await shot(page, '02-add-photo');
  await page.getByRole('button', { name: 'Man' }).click();
  await expect(page.getByText('Not sent yet')).toBeVisible();
  const consent = page.getByLabel("This is me, or I have this person's permission to use their photo.");
  await expect(consent).not.toBeChecked();
  await expect(page.getByText('Your photo is sent to our AI partners to check it and make your video.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Make my video' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Generate free preview' })).toHaveCount(0); // D139: off
  expect(await storedPhotos(page)).toBe(0); // D50: nothing sent before the box
  await shot(page, '03-consent');
  await consent.check();
  await expect(page.getByText('Full body detected')).toBeVisible();
  expect(await storedPhotos(page)).toBe(1);
  await shot(page, '04-checked');
  await page.getByRole('button', { name: 'Make my video' }).click();

  // About 10 s of preparing, then the locked video; nothing is generated before payment.
  await expect(page.getByRole('heading', { name: 'Getting your trend ready' })).toBeVisible();
  await expect(page.getByRole('progressbar')).toBeVisible();
  await shot(page, '05-preparing');
  await expect(page.getByRole('heading', { name: 'Your video is one tap away' })).toBeVisible({ timeout: 15_000 });
  expect(await storedVideos(page)).toBe(0);
  await shot(page, '05b-locked');
  await page.getByRole('button', { name: 'Unlock my video' }).click();

  // The paywall first, for a guest.
  await expect(page.getByRole('heading', { name: 'Unlock Bopsy' })).toBeVisible();
  await expect(page.getByText('LAUNCH OFFER')).toBeVisible();
  await expect(page.getByRole('radio', { name: /\$7\.99 \/ week/ })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('radio', { name: /\$79\.99 \/ year/ })).toContainText('Save 85%');
  await expect(page.getByLabel(/give up my 14-day right of withdrawal/)).toHaveCount(0); // US time zone
  await expect(page.getByRole('link', { name: 'Terms' })).toHaveAttribute('href', '../terms/');
  await shot(page, '06-paywall');
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByRole('heading', { name: 'Where should we send your video?' })).toBeVisible();
  const news = page.getByLabel('Email me when the iPhone app is out and when new trends drop.');
  await expect(news).not.toBeChecked();
  await news.check();
  await page.getByLabel('Email', { exact: true }).fill('dancer@example.com');
  await page.getByRole('button', { name: 'Send code' }).click();
  const demo = page.getByTestId('demo-code');
  await expect(demo).toBeVisible();
  const code = ((await demo.textContent()) ?? '').replace(/\D/g, '');
  expect(code).toHaveLength(6);
  await shot(page, '07-code');
  await page.getByLabel('6-digit code').fill(code);

  // Back on the paywall, the checkout of the picked plan opens by itself.
  await expect(page.getByRole('dialog', { name: 'Demo checkout' })).toBeVisible();
  await shot(page, '08-checkout');
  await page.getByRole('button', { name: 'Pay $7.99' }).click();

  await expect(page.getByRole('heading', { name: 'Making your video' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('progressbar')).toBeVisible();
  await shot(page, '09-generating');
  await expect(page.getByRole('heading', { name: "It's dancing!" })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText('120 left')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Download' })).toHaveAttribute('download', 'bopsy-street-bounce.mp4');
  await shot(page, '10-result');

  await page.getByRole('button', { name: 'Report this video' }).click();
  await page.getByRole('radio', { name: 'Something else' }).click();
  await page.getByRole('button', { name: 'Send report' }).click();
  await expect(page.getByText("Thanks for letting us know. We'll take a look.")).toBeVisible();
  await page.getByRole('button', { name: 'OK' }).click();

  await page.getByRole('button', { name: 'Make another' }).click();
  await expect(page.getByText('Pick a trend for your photo.')).toBeVisible();
  await page.getByRole('link', { name: 'Hip Sway' }).click();
  await expect(page.getByText('Full body detected')).toBeVisible();
  await expect(page.getByLabel("This is me, or I have this person's permission to use their photo.")).not.toBeChecked();
  await expect(page.getByRole('button', { name: 'Generate · 60 coins' })).toBeDisabled();

  await page.goto('./#/videos');
  await expect(page.getByRole('heading', { name: 'My videos' })).toBeVisible();
  await expect(page.locator('.tile')).toHaveCount(1);
  await page.goto('./#/account');
  await expect(page.getByText('Signed in as dancer@example.com')).toBeVisible();
  await shot(page, '11-account');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Pick a trend' })).toBeVisible();
});

test('demo: a refused photo shows its reason, an EU buyer sees the waiver', async ({ browser }) => {
  const context = await browser.newContext({ timezoneId: 'Europe/Paris', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await page.goto('./#/create/paws-up');
  await expect(page.getByRole('heading', { name: 'Join the trend' })).toBeVisible();
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  await page.locator('input[type=file]:not([capture])').first().setInputFiles({ name: 'group-photo.png', mimeType: 'image/png', buffer: png });
  await page.getByLabel("This is me, or I have this person's permission to use their photo.").check();
  await expect(page.getByText('We found more than one person or pet. Use a photo with just one.')).toBeVisible();
  await expect(page.getByText("Can't use this photo")).toBeVisible();
  await shot(page, '12-rejected');

  // A good photo, then straight to the paywall in an EU time zone.
  await page.locator('input[type=file]').first().setInputFiles({ name: 'my-dog.png', mimeType: 'image/png', buffer: png });
  await page.getByLabel("This is me, or I have this person's permission to use their photo.").check();
  await expect(page.getByText('Full body detected')).toBeVisible();
  await page.getByRole('button', { name: 'Make my video' }).click();
  await page.getByRole('button', { name: 'Unlock my video' }).click({ timeout: 15_000 });
  await expect(page.getByRole('heading', { name: 'Unlock Bopsy' })).toBeVisible();
  const waiver = page.getByLabel(/give up my 14-day right of withdrawal/);
  await expect(waiver).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled();
  await waiver.check();
  await expect(page.getByRole('button', { name: 'Continue' })).toBeEnabled();
  await shot(page, '13-paywall-eu');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('Email', { exact: true }).fill('eu@example.com');
  await page.getByRole('button', { name: 'Send code' }).click();
  const code = ((await page.getByTestId('demo-code').textContent()) ?? '').replace(/\D/g, '');
  await page.getByLabel('6-digit code').fill(code);
  // The ticked waiver came along: the checkout opens by itself.
  await expect(page.getByRole('dialog', { name: 'Demo checkout' })).toBeVisible();
  await context.close();
});

test('demo ?sim=: check limit then Try again, CAPTCHA refused then passed, report limit', async ({ page }) => {
  await page.goto('./?sim=check-limit,captcha-preview,report-limit,free-preview#/create/street-bounce');
  await expect(page.getByRole('heading', { name: 'Join the trend' })).toBeVisible();
  await page.getByRole('button', { name: 'Man' }).click();
  await page.getByLabel("This is me, or I have this person's permission to use their photo.").check();
  await expect(page.getByText(/^Too many photo checks\. Try again in \d+ s\./)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try again' })).toHaveCount(0); // not before the wait is over
  await shot(page, '14-check-limit');
  await page.getByRole('button', { name: 'Try again' }).click({ timeout: 15_000 });
  await expect(page.getByText('Full body detected')).toBeVisible();
  await page.getByRole('button', { name: 'Generate free preview' }).click();
  await expect(page.getByText("We couldn't confirm you're not a bot. Try again.")).toBeVisible();
  await page.getByRole('button', { name: 'Generate free preview' }).click();
  await expect(page.getByText('PREVIEW · 2 S')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('a[download]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Report this video' }).click();
  await page.getByRole('radio', { name: 'Something else' }).click();
  await page.getByRole('button', { name: 'Send report' }).click();
  await expect(page.getByText(/^You reached today's report limit\. Try again in \d+ (min|h)\.$/)).toBeVisible();
  await shot(page, '15-report-limit');
});

test('demo ?sim=: free previews (when on) limited per IP, then off; the main button becomes Make my video', async ({ page }) => {
  await page.goto('./?sim=preview-limit,free-preview#/create/street-bounce');
  await page.getByRole('button', { name: 'Man' }).click();
  await page.getByLabel("This is me, or I have this person's permission to use their photo.").check();
  await expect(page.getByText('Full body detected')).toBeVisible();
  await page.getByRole('button', { name: 'Generate free preview' }).click();
  await expect(page.getByRole('heading', { name: 'Unlock Bopsy' })).toBeVisible();
  await expect(page.getByText(/^Too many free previews from your connection today\. Try again in \d+ (min|h), or unlock the full video now\.$/)).toBeVisible();
  await shot(page, '16-preview-limit');
  await page.goBack();
  await expect(page.getByRole('button', { name: 'Make my video' })).toBeEnabled();

  // A new visitor (no draft, no demo server state), previews switched off.
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto('./?sim=preview-off,free-preview#/create/hip-sway');
  await page.reload();
  await page.getByRole('button', { name: 'Dog' }).click();
  await page.getByLabel("This is me, or I have this person's permission to use their photo.").check();
  await expect(page.getByText('Full body detected')).toBeVisible();
  await page.getByRole('button', { name: 'Generate free preview' }).click();
  await expect(page.getByText('Free previews are paused right now. Unlock the full video to make yours.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Unlock Bopsy' })).toBeVisible();
});

test('demo ?lang=fr: the catalogue in French, the choice kept, the switch back to English', async ({ page }) => {
  await page.goto('./?lang=fr');
  await expect(page.getByRole('heading', { name: 'Choisis ta trend' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Tes animaux vont adorer' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await page.goto('./#/create/street-bounce'); // no ?lang= any more: the stored choice
  await page.getByRole('button', { name: 'Homme' }).click();
  await expect(page.getByRole('link', { name: 'Confidentialité' })).toHaveAttribute('href', '../fr/privacy/');
  await page.goto('./#/account');
  await expect(page.getByRole('heading', { name: 'Mon compte' })).toBeVisible();
  await page.getByRole('button', { name: 'English' }).click();
  await expect(page.getByRole('heading', { name: 'My account' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});
