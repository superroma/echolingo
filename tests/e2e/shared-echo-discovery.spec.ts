import { test, expect } from './fixture';
import { mockGetLesson } from './helpers';

test.describe('shared echo discovery', () => {
  test('opening a shared echo adopts it into the local library', async ({ page }) => {
    // Friend arrives with an empty library
    await mockGetLesson(page, 'shared-1', [
      { id: 'shared-1', status: 'ready', topic: 'a walk through Plaka' },
    ]);

    await page.goto('/echo/shared-1/');
    // Wait for the lesson to load (the title in the AppBar reflects the topic)
    await expect(page.getByRole('heading', { name: 'a walk through Plaka' })).toBeVisible();

    // Navigate home via the AppBar wordmark
    await page.getByRole('link', { name: 'echolingo' }).click();
    await expect(page).toHaveURL(/localhost:\d+\/$/);

    // The shared echo is now in the friend's library
    await expect(page.getByText('a walk through Plaka')).toBeVisible();
  });

  test('AppBar +new pill navigates from the echo screen to the create form', async ({ page }) => {
    await mockGetLesson(page, 'shared-2', [
      { id: 'shared-2', status: 'ready', topic: 'morning at the bakery' },
    ]);

    await page.goto('/echo/shared-2/');
    await expect(page.getByRole('heading', { name: 'morning at the bakery' })).toBeVisible();

    await page.getByRole('link', { name: '+ new' }).click();
    await expect(page).toHaveURL(/\/echo\/new\/?$/);
  });

  test('shared visitor sees the conversion card; owner does not after adoption', async ({
    page,
  }) => {
    await mockGetLesson(page, 'shared-3', [
      { id: 'shared-3', status: 'ready', topic: 'a day trip to Hydra' },
    ]);

    // Fresh visitor (empty library): conversion card is shown.
    await page.goto('/echo/shared-3/');
    await expect(page.getByRole('heading', { name: 'a day trip to Hydra' })).toBeVisible();
    await expect(page.getByText('make your own echo')).toBeVisible();

    // After silent adoption, reloading makes it "owned" — no conversion card.
    await page.reload();
    await expect(page.getByRole('heading', { name: 'a day trip to Hydra' })).toBeVisible();
    await expect(page.getByText('make your own echo')).toHaveCount(0);
  });
});
