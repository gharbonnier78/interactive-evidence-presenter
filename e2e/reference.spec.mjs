import { test, expect } from '@playwright/test';

test('reference evidence navigation remains grounded', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveTitle(/Interactive Evidence Presenter/);
  await expect(page.locator('#evidence-copy')).toContainText('C-NI-001: NOT_DEMONSTRATED');
  await expect(page.locator('#evidence-copy')).toContainText('did not demonstrate non-inferiority');

  await page.getByRole('button', { name: /Next/ }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Compression did not demonstrate non-inferiority');

  await page.getByRole('button', { name: 'PCA' }).click();
  await expect(page.locator('#concept-title')).toHaveText('PCA');
  await expect(page.locator('#emma-copy')).toContainText('unsupervised linear projection');
});

test('Emma bounded commands preserve the inferential limit', async ({ page }) => {
  await page.goto('/');

  const command = page.locator('#command');
  await command.fill('conclusion');
  await page.getByRole('button', { name: 'Ask' }).click();

  await expect(page.locator('#emma-copy')).toContainText('failure to demonstrate non-inferiority');
  await expect(page.locator('#emma-copy')).toContainText('not proof of inferiority');

  await command.fill('bootstrap');
  await page.getByRole('button', { name: 'Ask' }).click();
  await expect(page.locator('#concept-title')).toHaveText('Subject-slot bootstrap');
});
