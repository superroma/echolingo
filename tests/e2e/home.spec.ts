import { test, expect } from './fixture';

test.describe('home page', () => {
  test('renders wordmark, form, and first-run hero (empty library)', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'echolingo' })).toBeVisible();
    await expect(page.getByPlaceholder(/at the bakery/i)).toBeVisible();
    await expect(page.getByLabel('I speak')).toBeVisible();
    await expect(page.getByLabel('learning')).toBeVisible();
    await expect(page.getByRole('button', { name: /^go$/i })).toBeDisabled();
    // First-run hero stands in for the (hidden) empty echoes list.
    await expect(page.getByRole('heading', { name: /listening lessons/i })).toBeVisible();
  });

  test('enables Go once topic is non-empty', async ({ page }) => {
    await page.goto('/');
    const go = page.getByRole('button', { name: /^go$/i });
    await expect(go).toBeDisabled();
    await page.getByPlaceholder(/at the bakery/i).fill('ordering coffee');
    await expect(go).toBeEnabled();
  });

  test('language dropdown disables the other side to prevent collision', async ({ page }) => {
    await page.goto('/');
    // Open the "I speak" dropdown; the current target (Greek) must be disabled.
    await page.getByLabel('I speak').click();
    const greek = page.getByRole('option', { name: 'Greek' });
    await expect(greek).toHaveAttribute('aria-disabled', 'true');
  });
});
