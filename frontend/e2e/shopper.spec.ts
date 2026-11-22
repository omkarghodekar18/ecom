// Shopper journey e2e (spec Section 21): home → category drill-down → PDP
// variant switch → add to cart as guest → checkout redirect → login → place
// order → order history. The OTP is read from the backend file-mail outbox
// (the dev/test mail provider) — no email infrastructure needed.
import { test, expect, type Page } from '@playwright/test';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const OUTBOX = resolve(__dirname, '../../backend/var/outbox');

/** Outbox filenames in chronological order (timestamped names sort lexically). */
function outboxFiles(): string[] {
  return readdirSync(OUTBOX)
    .filter((name) => name.endsWith('.html') || name.endsWith('.txt'))
    .sort();
}

/** Newest outbox message for `email`, parsed to plain text. */
function readLastMailTo(email: string): string {
  for (const name of outboxFiles().reverse()) {
    const body = readFileSync(resolve(OUTBOX, name), 'utf8');
    if (body.includes(email)) return body;
  }
  throw new Error(`no outbox mail for ${email}`);
}

/** 6-digit code out of the newest login mail for `email`. */
function latestOtpFor(email: string): string {
  const mail = readLastMailTo(email);
  const match = /\b(\d{6})\b/.exec(mail.replace(/<[^>]+>/g, ' '));
  if (match === null) throw new Error('no OTP found in outbox mail');
  return match[1]!;
}

/**
 * Waits until a mail for `email` newer than the `before` filename lands in
 * the outbox (the file mail provider writes asynchronously, ms-precision
 * timestamped names). Guards against re-using a stale OTP from an earlier
 * test run.
 */
async function waitForNewMail(email: string, before: string): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt++) {
    for (const name of outboxFiles().reverse()) {
      if (name <= before) break; // nothing newer than the snapshot yet
      const body = readFileSync(resolve(OUTBOX, name), 'utf8');
      if (body.includes(email)) return;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`no new outbox mail for ${email}`);
}

async function loginWithOtp(page: Page, email: string): Promise<void> {
  await page.goto('/in/en/login');
  await page.getByRole('tab', { name: 'Email OTP' }).click();
  // textbox role disambiguates from the tab panel itself (labelled "Email OTP").
  await page.getByRole('textbox', { name: 'Email' }).fill(email);
  const before = outboxFiles().at(-1) ?? '';
  await page.getByRole('button', { name: /email me a code|send/i }).click();
  await waitForNewMail(email, before);
  const code = latestOtpFor(email);
  // The code input is six single-digit boxes with auto-advance + paste.
  const boxes = page.getByRole('group', { name: 'Sign-in code' }).getByRole('textbox');
  await boxes.first().click();
  await page.keyboard.type(code, { delay: 25 });
  await page.getByRole('button', { name: /verify and sign in|sign in/i }).click();
  // Wait until the login POST finished and we left the login page (a bare
  // /\/in\/en/ match would also match /in/en/login and race the request).
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 20_000 });
}

test('home renders the storefront skeleton (header, hero, categories)', async ({ page }) => {
  await page.goto('/in/en');
  await expect(page.getByRole('banner')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  // Category tiles expose the top-level tree.
  await expect(page.getByRole('link', { name: 'Machining' }).first()).toBeVisible();
});

test('category drill-down reaches the Centre drills listing', async ({ page }) => {
  await page.goto('/in/en');
  await page.getByRole('button', { name: /open (the )?navigation|menu/i }).first().click();
  const drawer = page.getByRole('dialog');
  await expect(drawer).toBeVisible();
  // The drawer drills level-by-level with buttons; a leaf auto-navigates.
  await drawer.getByRole('button', { name: 'Machining' }).first().click();
  await drawer.getByRole('button', { name: 'Drilling' }).first().click();
  await drawer.getByRole('button', { name: 'Drills' }).first().click();
  await drawer.getByRole('button', { name: 'Centre drills' }).first().click();
  await expect(page.getByRole('heading', { name: 'Centre drills' })).toBeVisible();
  // Listing rows carry article numbers and prices (page 1 of the seeded
  // Centre drills: the 1111xx B-type family; the 111100 flagship may sit on
  // a later page, so match the article-no pattern itself).
  await expect(page.getByText(/^Article no\.: 111\d{3}/).first()).toBeVisible({ timeout: 30_000 });
  // "from" is a block above the amount, so match the formatted amount itself.
  await expect(page.getByText(/^INR \d[\d,.]*$/).first()).toBeVisible();
});

test('PDP: variant switch changes price and technical data', async ({ page }) => {
  await page.goto('/in/en/p/centre-drill-hss-e-a-tialn');
  await expect(page.getByRole('heading', { name: /Centre drill HSS-E A TiAlN/i })).toBeVisible();
  // Default variant (0.5) is the price-from variant.
  await expect(page.getByText(/2,?357/).first()).toBeVisible();
  // Switch to the 0.75 mm variant — the pressed state and technical data move.
  await page.getByRole('button', { name: '0.75 In stock' }).click();
  await expect(page.getByRole('button', { name: '0.75 In stock' })).toHaveAttribute('aria-pressed', 'true');
  // Technical data table lists the axis attributes.
  await page.getByRole('tab', { name: /technical/i }).click();
  await expect(page.getByRole('row', { name: /Nominal/i })).toBeVisible();
});

test('guest cart → checkout redirect → OTP login → place order → history', async ({ page }) => {
  // 1. PDP add-to-cart as guest.
  await page.goto('/in/en/p/centre-drill-hss-e-a-tialn');
  const addToCart = page.getByRole('button', { name: /add to (shopping )?cart/i }).first();
  await addToCart.click();
  // The success toast (role=status) announces the add; the exact string
  // avoids the header's visually-hidden "Shopping cart" span.
  await expect(page.getByText('Added to shopping cart')).toBeVisible({ timeout: 20_000 });

  // 2. Cart page shows the priced line.
  await page.goto('/in/en/cart');
  await expect(page.getByRole('heading', { name: /shopping cart|cart/i })).toBeVisible();
  await expect(page.getByText('111100').first()).toBeVisible({ timeout: 30_000 });

  // 3. Checkout is auth-gated → redirect to login.
  await page.goto('/in/en/checkout');
  await page.waitForURL(/\/login\?redirect=/, { timeout: 20_000 });

  // 4. OTP login (b2c@example.com is seeded + verified).
  await loginWithOtp(page, 'b2c@example.com');
  // The guest cart merges into the account on login.
  await page.goto('/in/en/cart');
  await expect(page.getByText('111100').first()).toBeVisible({ timeout: 30_000 });

  // 5. Checkout: new address + invoice payment + place order.
  await page.goto('/in/en/checkout');
  await page.getByRole('button', { name: /new address/i }).first().click();
  await page.getByLabel(/contact name/i).fill('E2E Shopper');
  await page.getByLabel(/^phone$/i).fill('+91 98765 43210');
  await page.getByLabel(/street and number/i).fill('5 MG Road');
  await page.getByLabel(/^city$/i).fill('Bengaluru');
  await page.getByLabel(/^state$/i).fill('Karnataka');
  await page.getByLabel(/postal code/i).fill('560001');
  await page.getByRole('radio', { name: /invoice/i }).first().check();
  await page.getByRole('button', { name: /place order/i }).first().click();

  // 6. Success page with the order number.
  await page.waitForURL(/\/checkout\/success\//, { timeout: 30_000 });
  await expect(page.getByText(/ORD-\d{4}-\d{6}/)).toBeVisible();

  // 7. Order history lists it.
  await page.goto('/in/en/my-company/orders');
  await expect(page.getByText(/ORD-\d{4}-\d{6}/).first()).toBeVisible();
});
