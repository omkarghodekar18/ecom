// Admin e2e (spec Section 21): password login → create a product with an
// image → import a valid Excel file (dry run + commit) → import an invalid
// file and inspect the error report codes.
import { test, expect, type Locator } from '@playwright/test';
import { resolve } from 'node:path';

const FIXTURES = resolve(__dirname, '../../backend/tests/fixtures/import');
const BACKEND_FIXTURE = resolve(__dirname, '../../backend/prisma/seed/sample-import.xlsx');

/** Tiny 1×1 PNG for the image upload. */
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/**
 * Snapshots the newest job's id, uploads `fixture`, then waits for a NEW job
 * row (different id) showing `fileName` at the top of the table, and returns
 * that row. Robust against pagination (the table caps at 20 rows, so a count
 * delta is NOT observable once the page is full) and against same-named jobs
 * left over from earlier runs — the row is tracked by its unique job id.
 */
async function uploadAndTrackNewJob(
  jobs: Locator,
  fileInput: Locator,
  fixture: string,
  fileName: string,
): Promise<Locator> {
  const idOf = (row: Locator) => row.locator('[data-job-id]');
  const previousId = (await idOf(jobs.first()).count())
    ? ((await idOf(jobs.first()).getAttribute('data-job-id')) ?? '')
    : '';
  await fileInput.setInputFiles(fixture);
  const row = jobs.first();
  await expect(row).toContainText(fileName, { timeout: 60_000 });
  if (previousId !== '') {
    await expect(idOf(row)).not.toHaveAttribute('data-job-id', previousId, { timeout: 60_000 });
  }
  return row;
}

test.beforeEach(async ({ page }) => {
  await page.goto('/in/en/login');
  // textbox role disambiguates from the OTP tab panel (labelled "Email OTP").
  await page.getByRole('textbox', { name: 'Email' }).fill('admin@example.com');
  await page.getByRole('textbox', { name: 'Password' }).fill('Admin123!secure');
  // Wait for the login response (Set-Cookie th_rt) BEFORE navigating on —
  // a bare waitForURL(/\/in\/en/) would match /in/en/login and race the POST.
  await Promise.all([
    page.waitForResponse(
      (res) => res.url().includes('/auth/login/password') && res.status() === 200,
      { timeout: 20_000 },
    ),
    page.getByRole('button', { name: 'Sign in' }).click(),
  ]);
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 20_000 });
});

test('admin creates a product with an image', async ({ page }) => {
  await page.goto('/admin/products/new');
  await page.getByLabel('Name *').fill('E2E Test Drill');
  await page.getByLabel('Brand *').click();
  // Radix-style select: the first option is the "Please select…"
  // placeholder — pick a real seeded brand instead.
  await page.getByRole('option', { name: 'Garaveta' }).click();
  await page.getByLabel(/Category \(leaf\) \*/).click();
  await page.getByRole('option', { name: /Centre drills/ }).click();
  await page.getByRole('button', { name: 'Save product' }).click();
  await expect(page.getByText(/Product created/i)).toBeVisible({ timeout: 30_000 });

  // Images tab: drag-and-drop area is a file input — attach the PNG.
  await page.getByRole('tab', { name: 'Images' }).click();
  const fileInput = page.locator('input[type="file"]').first();
  await fileInput.setInputFiles({ name: 'e2e.png', mimeType: 'image/png', buffer: PNG_1X1 });
  await expect(page.getByText(/upload|saved|image/i).first()).toBeVisible({ timeout: 30_000 });

  // Variants tab: add one variant with attributes.
  await page.getByRole('tab', { name: /Variants & attributes/ }).click();
  await page.getByRole('button', { name: /add (a )?variant|add row/i }).first().click();
  await expect(page.getByText(/article/i).first()).toBeVisible();
});

test('admin imports a valid Excel file end-to-end', async ({ page }) => {
  await page.goto('/admin/imports');
  // The jobs table lists every past import too (newest first, capped at the
  // page size) — track the NEW row by its unique job id, not by row count.
  const jobsRegion = page.getByRole('region', { name: 'Import jobs' });
  await expect(jobsRegion.locator('table')).toBeVisible({ timeout: 20_000 });
  const jobs = jobsRegion.locator('tbody tr');
  const fileInput = page.locator('input[type="file"]').first();
  const job = await uploadAndTrackNewJob(jobs, fileInput, BACKEND_FIXTURE, 'sample-import.xlsx');
  // Dry run completes inline (dev queue): status → ready to commit.
  await expect(job).toContainText('ready to commit', { timeout: 60_000 });
  await job.getByRole('button', { name: 'Report' }).click();
  await expect(page.getByText('will create')).toBeVisible();
  await page.getByRole('button', { name: 'Commit import' }).click();
  await page.getByRole('button', { name: 'Commit', exact: true }).click();
  await expect(job).toContainText('completed', { timeout: 60_000 });

  // Roll back to keep the catalog clean for re-runs.
  await job.getByRole('button', { name: 'Report' }).click();
  await page.getByRole('button', { name: 'Roll back' }).first().click();
  await page.getByRole('button', { name: 'Roll back', exact: true }).click();
  await expect(job).toContainText('rolled back', { timeout: 60_000 });
});

test('admin imports an invalid file and sees the error codes', async ({ page }) => {
  await page.goto('/admin/imports');
  const jobsRegion = page.getByRole('region', { name: 'Import jobs' });
  await expect(jobsRegion.locator('table')).toBeVisible({ timeout: 20_000 });
  const jobs = jobsRegion.locator('tbody tr');
  const fileInput = page.locator('input[type="file"]').first();
  const job = await uploadAndTrackNewJob(
    jobs,
    fileInput,
    resolve(FIXTURES, 'invalid-ean-checksum.xlsx'),
    'invalid-ean-checksum.xlsx',
  );
  await expect(job).toContainText('validated with errors', { timeout: 60_000 });
  await job.getByRole('button', { name: 'Report' }).click();
  await expect(page.getByText('EAN_CHECKSUM').first()).toBeVisible();
  // The error report downloads as a workbook.
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /error report/i }).click();
  expect((await download).suggestedFilename()).toContain('.xlsx');
});
