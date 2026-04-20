import { test, expect } from '@playwright/test';

test.describe('Onboarding overlay', () => {
  test('O01: first-visit player sees 3-step overlay on draft', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'desktop only');
    await page.addInitScript(() => localStorage.clear());

    await page.goto('/');
    await page.getByRole('button', { name: /PLAY/i }).click();
    await page.getByRole('button', { name: /Play vs AI/i }).click();
    await page.getByRole('button', { name: /Tier 1/i }).click();

    await expect(page.getByTestId('onboarding-overlay')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Step 1 of 3/i)).toBeVisible();

    await page.getByTestId('onboarding-next').click();
    await expect(page.getByText(/Step 2 of 3/i)).toBeVisible();

    await page.getByTestId('onboarding-next').click();
    await expect(page.getByText(/Step 3 of 3/i)).toBeVisible();

    await page.getByTestId('onboarding-next').click();
    await expect(page.getByTestId('onboarding-overlay')).not.toBeVisible();
  });

  test('O02: returning player does NOT see overlay', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'desktop only');
    await page.addInitScript(() => localStorage.setItem('alloy.onboarding.seen', 'true'));

    await page.goto('/');
    await page.getByRole('button', { name: /PLAY/i }).click();
    await page.getByRole('button', { name: /Play vs AI/i }).click();
    await page.getByRole('button', { name: /Tier 1/i }).click();

    await expect(page.locator('[data-gem]').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('onboarding-overlay')).not.toBeVisible();
  });
});
