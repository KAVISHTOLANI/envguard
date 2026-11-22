import { expect, test } from '@playwright/test';
import { checkMobile, snap } from './helpers';

test('check a .env against a schema without exposing values', async ({ page }) => {
  await page.goto('./');
  await page.waitForTimeout(1000);
  await snap(page, 'landing');
  await checkMobile(page, 'landing-mobile');
  await page.getByRole('link', { name: 'Check a .env file' }).first().click();
  await expect(page.getByTestId('invalid')).toHaveText('2');
  await expect(page.locator('table')).not.toContainText('demo-password');

  await page.getByLabel('.env file').fill('NODE_ENV=production\nPORT=8080\nDATABASE_URL=postgres://localhost:5432/app\nSESSION_SECRET=placeholder-session-secret\nSTRIPE_API_KEY=placeholder\nSUPPORT_EMAIL=help@example.com\nENABLE_SIGNUPS=yes\nMAX_UPLOAD_MB=25');
  await expect(page.getByText('Everything the schema requires is present and valid.')).toBeVisible();
  await page.getByLabel('.env file').fill('NODE_ENV=production\nPORT=99999');
  await expect(page.getByTestId('missing')).not.toHaveText('0');
  await page.evaluate(() => window.scrollTo(0, 0));
  await snap(page, 'check');
  await checkMobile(page);
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }));
  expect(stored).not.toContain('postgres://localhost');
  await page.reload();
  await expect(page.getByTestId('invalid')).toHaveText('2'); // back to the demo; nothing remembered
});
