import { test, expect } from '@playwright/test';

test('app shell and login form render', async ({ page, baseURL }) => {
  await page.goto(baseURL || '/');
  await expect(page.locator('#login-email')).toBeVisible();
  await expect(page.locator('#login-pass')).toBeVisible();
  await expect(page.locator('button:has-text("Giriş yap")')).toBeVisible();
});
