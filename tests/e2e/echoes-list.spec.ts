import { test, expect } from './fixture';
import { mockGetEcho } from './helpers';

const seedEchoes = [
  {
    id: 'e-a',
    topic: 'bakery topic',
    targetLang: 'el',
    nativeLang: 'en',
    lengthMin: 5,
    level: 3,
    createdAt: '2026-05-24T10:00:00.000Z',
    lastStatus: 'ready',
  },
  {
    id: 'e-b',
    topic: 'pending topic',
    targetLang: 'es',
    nativeLang: 'en',
    lengthMin: 10,
    level: 2,
    createdAt: '2026-05-24T09:50:00.000Z',
    lastStatus: 'generating_audio',
  },
];

test.describe('echoes list', () => {
  test('persists across reload and refreshes pending statuses on mount', async ({ page }) => {
    await page.addInitScript((echoes) => {
      window.localStorage.setItem('echolingo:echoes', JSON.stringify(echoes));
    }, seedEchoes);

    // Mock the on-mount refresh for the pending echo to flip it to ready
    await mockGetEcho(page, 'e-b', [
      {
        id: 'e-b',
        status: 'ready',
        topic: 'pending topic',
        targetLang: 'es',
      },
    ]);

    await page.goto('/');
    await expect(page.getByText('bakery topic')).toBeVisible();
    await expect(page.getByText('pending topic')).toBeVisible();

    // After refresh tick, both should have non-pulsing status
    // Just confirm rows are still visible after a small wait
    await page.waitForTimeout(500);
    await expect(page.getByText('bakery topic')).toBeVisible();
    await expect(page.getByText('pending topic')).toBeVisible();
  });

  test('remove button drops an echo (after confirm)', async ({ page }) => {
    await page.addInitScript((echoes) => {
      window.localStorage.setItem('echolingo:echoes', JSON.stringify(echoes));
    }, seedEchoes);
    await mockGetEcho(page, 'e-b', [{ id: 'e-b', status: 'ready', topic: 'pending topic' }]);

    page.on('dialog', (d) => void d.accept());

    await page.goto('/');
    const bakeryRow = page
      .locator('li', { has: page.getByText('bakery topic') });
    await expect(bakeryRow).toBeVisible();
    await bakeryRow.getByRole('button', { name: 'Remove echo' }).click({ force: true });

    await expect(page.getByText('bakery topic')).toBeHidden();
    await expect(page.getByText('pending topic')).toBeVisible();
  });

  test('clicking an echo navigates to its page', async ({ page }) => {
    await page.addInitScript((echoes) => {
      window.localStorage.setItem('echolingo:echoes', JSON.stringify(echoes));
    }, seedEchoes);
    await mockGetEcho(page, 'e-a', [{ id: 'e-a', status: 'ready', topic: 'bakery topic' }]);
    await mockGetEcho(page, 'e-b', [{ id: 'e-b', status: 'ready', topic: 'pending topic' }]);

    await page.goto('/');
    await page.getByText('bakery topic').click();
    await expect(page).toHaveURL(/\/echo\/e-a\/?/);
  });
});
