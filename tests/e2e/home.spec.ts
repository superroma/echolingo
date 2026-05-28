import { test, expect } from './fixture';

test.describe('home page', () => {
  test('renders title, form, and empty echoes list', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'echolingo' })).toBeVisible();
    await expect(page.getByPlaceholder(/at the bakery/i)).toBeVisible();
    await expect(page.getByLabel('I speak')).toBeVisible();
    await expect(page.getByLabel('Learning')).toBeVisible();
    await expect(page.getByRole('button', { name: /^go$/i })).toBeDisabled();
    await expect(page.getByRole('heading', { name: 'echoes' })).toBeVisible();
    await expect(page.getByText('your echoes will appear here')).toBeVisible();
  });

  test('enables Go once topic is non-empty', async ({ page }) => {
    await page.goto('/');
    const go = page.getByRole('button', { name: /^go$/i });
    await expect(go).toBeDisabled();
    await page.getByPlaceholder(/at the bakery/i).fill('ordering coffee');
    await expect(go).toBeEnabled();
  });

  test('language selects exclude the other side', async ({ page }) => {
    await page.goto('/');
    const native = page.getByLabel('I speak');
    const target = page.getByLabel('Learning');
    const nativeOptions = await native.locator('option').allInnerTexts();
    const targetOptions = await target.locator('option').allInnerTexts();
    // English is default native; should not appear in target options
    expect(targetOptions).not.toContain('English');
    // Greek is default target; should not appear in native options
    expect(nativeOptions).not.toContain('Greek');
  });
});
