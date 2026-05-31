import { test, expect } from './fixture';
import { mockCreateEcho, mockGetEcho } from './helpers';

test.describe('error states', () => {
  test('rate-limited POST shows daily-limit message', async ({ page }) => {
    await mockCreateEcho(page, {
      kind: 'rate_limited',
      limit: 5,
      used: 5,
      resetAt: 'tomorrow 00:00',
    });

    await page.goto('/');
    await page.getByPlaceholder(/at the bakery/i).fill('anything');
    await page.getByRole('button', { name: /^go$/i }).click();

    // Submit now links straight to the deterministic /echo/{id} (no /echo/new
    // round-trip); that page POSTs and surfaces the rate-limit card.
    await expect(page).toHaveURL(/\/echo\/[^/]+\/?$/);
    await expect(page.getByText('Daily limit reached')).toBeVisible();
    await expect(page.getByText('Used 5 of 5')).toBeVisible();
  });

  test('network error on POST shows retry; retry succeeds', async ({ page }) => {
    const id = 'retried-1';

    let calls = 0;
    await page.route('**/api/echo', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.fallback();
        return;
      }
      calls++;
      if (calls === 1) {
        await route.abort('failed');
      } else {
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ id, status: 'generating_script' }),
        });
      }
    });
    await mockGetEcho(page, id, [{ id, status: 'generating_script' }]);

    await page.goto('/');
    await page.getByPlaceholder(/at the bakery/i).fill('anything');
    await page.getByRole('button', { name: /^go$/i }).click();

    await expect(page.getByText("Couldn't reach the server")).toBeVisible();
    await page.getByRole('button', { name: 'Retry' }).click();

    await expect(page).toHaveURL(new RegExp(`/echo/${id}/?$`));
  });

  test('failed echo shows Retry; retry posts again and navigates to new id', async ({
    page,
  }) => {
    const originalId = 'orig-1';
    const newId = 'new-1';

    // Seed echoes list with a failed echo
    await page.addInitScript(
      ({ id }) => {
        const echoes = [
          {
            id,
            topic: 'broken topic',
            targetLang: 'el',
            nativeLang: 'en',
            lengthMin: 5,
            level: 3,
            createdAt: '2026-05-24T10:00:00.000Z',
            lastStatus: 'failed',
            error: 'LLM exploded',
          },
        ];
        window.localStorage.setItem('echolingo:echoes', JSON.stringify(echoes));
      },
      { id: originalId },
    );

    await mockGetEcho(page, originalId, [
      { id: originalId, status: 'failed', error: 'LLM exploded' },
    ]);
    await mockCreateEcho(page, { kind: 'created', id: newId });
    await mockGetEcho(page, newId, [{ id: newId, status: 'generating_script' }]);

    await page.goto(`/echo/${originalId}/`);
    await expect(page.getByText('Generation failed')).toBeVisible();
    await expect(page.getByText('LLM exploded')).toBeVisible();

    await page.getByRole('button', { name: 'Retry' }).click();
    await expect(page).toHaveURL(new RegExp(`/echo/${newId}/?$`));
  });

  test('GET 404 on existing echo shows not-found view', async ({ page }) => {
    const id = 'gone';
    await mockGetEcho(page, id, [{ kind: 'not_found' }]);
    await page.goto(`/echo/${id}/`);
    await expect(page.getByText('Echo not found')).toBeVisible();
  });
});
