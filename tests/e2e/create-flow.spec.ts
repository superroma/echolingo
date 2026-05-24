import { test, expect } from './fixture';
import { mockCreateLesson, mockGetLesson } from './helpers';

test.describe('create echo flow', () => {
  test('submitting navigates to new echo page and shows progress', async ({ page }) => {
    const id = 'abc123';
    await mockCreateLesson(page, { kind: 'created', id });
    await mockGetLesson(page, id, [
      { id, status: 'generating_script' },
      {
        id,
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

    await expect(page).toHaveURL(new RegExp(`/echo/${id}/?$`));
    await expect(page.getByText(/writing script…|ready/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/1 \/ 3 ready/)).toBeVisible({ timeout: 10_000 });
  });

  test('adds the new echo to the local echoes list (visible after going home)', async ({
    page,
  }) => {
    const id = 'persisted-1';
    await mockCreateLesson(page, { kind: 'created', id });
    await mockGetLesson(page, id, [{ id, status: 'generating_script' }]);

    await page.goto('/');
    await page.getByPlaceholder(/at the bakery/i).fill('a walk through Plaka');
    await page.getByRole('button', { name: /^go$/i }).click();
    await expect(page).toHaveURL(new RegExp(`/echo/${id}/?$`));

    // Go back to home — echo should be in the list
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page).toHaveURL('http://localhost:3000/');
    await expect(page.getByText('a walk through Plaka')).toBeVisible();
  });
});
