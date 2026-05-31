import { test, expect } from './fixture';
import { mockCreateEcho, mockGetEchoAny } from './helpers';

// The client mints the 8-char id locally and navigates to /{id}; the server
// just echoes it back. Tests therefore assert the id *shape*, not a fixed value,
// and use the id-agnostic GET mock.
const ID_URL = /\/[0-9A-Za-z]{8}\/?$/;

test.describe('create echo flow', () => {
  test('submitting navigates to new echo page and shows progress', async ({ page }) => {
    await mockCreateEcho(page, { kind: 'created' });
    await mockGetEchoAny(page, [
      { status: 'generating_script' },
      {
        status: 'generating_audio',
        totalSentences: 3,
        readySentences: 1,
        sentences: [
          { i: 0, gr: 'καλημέρα', native: 'good morning', status: 'ready' },
          { i: 1, gr: 'γεια', native: 'hi', status: 'pending' },
          { i: 2, gr: 'αντίο', native: 'bye', status: 'pending' },
        ],
      },
    ]);

    await page.goto('/');
    await page.getByPlaceholder(/at the bakery/i).fill('ordering coffee');
    await page.getByRole('button', { name: /^go$/i }).click();

    await expect(page).toHaveURL(ID_URL);
    await expect(page.getByText(/composing your echo…/i)).toBeVisible({ timeout: 10_000 });
  });

  test('adds the new echo to the local echoes list (visible after going home)', async ({
    page,
  }) => {
    await mockCreateEcho(page, { kind: 'created' });
    await mockGetEchoAny(page, [
      { status: 'generating_script', topic: 'a walk through Plaka' },
    ]);

    await page.goto('/');
    await page.getByPlaceholder(/at the bakery/i).fill('a walk through Plaka');
    await page.getByRole('button', { name: /^go$/i }).click();
    await expect(page).toHaveURL(ID_URL);

    // Go back to home — echo should be in the list
    await page.getByRole('link', { name: 'echolingo' }).click();
    await expect(page).toHaveURL(/localhost:\d+\/$/);
    await expect(page.getByText('a walk through Plaka')).toBeVisible();
  });
});
