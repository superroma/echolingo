import { test, expect } from './fixture';
import { mockCreateEcho, mockGetEcho, mockGetEchoAny } from './helpers';

// The client mints the 8-char id locally; assert id shape, not a fixed value.
const ID_URL = /\/[0-9A-Za-z]{8}\/?$/;

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

    // Submit links straight to the deterministic /{id} (no round-trip); that
    // page PUTs and surfaces the rate-limit card.
    await expect(page).toHaveURL(ID_URL);
    await expect(page.getByText('Daily limit reached')).toBeVisible();
    await expect(page.getByText('Used 5 of 5')).toBeVisible();
  });

  test('network error on PUT shows retry; retry succeeds', async ({ page }) => {
    let calls = 0;
    await page.route('**/api/echo/*', async (route) => {
      if (route.request().method() !== 'PUT') {
        await route.fallback();
        return;
      }
      calls++;
      if (calls === 1) {
        await route.abort('failed');
      } else {
        const id = new URL(route.request().url()).pathname.split('/').filter(Boolean).pop();
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ id, status: 'generating_script' }),
        });
      }
    });
    await mockGetEchoAny(page, [{ status: 'generating_script' }]);

    await page.goto('/');
    await page.getByPlaceholder(/at the bakery/i).fill('anything');
    await page.getByRole('button', { name: /^go$/i }).click();

    await expect(page.getByText("Couldn't reach the server")).toBeVisible();
    await page.getByRole('button', { name: 'Retry' }).click();

    await expect(page).toHaveURL(ID_URL);
  });

  test('failed echo shows Retry; retry posts again and navigates to new id', async ({
    page,
  }) => {
    const originalId = 'orig-1';

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

    // Register the id-agnostic GET first so the originalId-specific mock (below)
    // takes precedence for orig-1, and the freshly-minted retry id falls through
    // to the agnostic one.
    await mockGetEchoAny(page, [{ status: 'generating_script' }]);
    await mockCreateEcho(page, { kind: 'created' });
    await mockGetEcho(page, originalId, [
      { id: originalId, status: 'failed', error: 'LLM exploded' },
    ]);

    await page.goto(`/${originalId}/`);
    await expect(page.getByText('Generation failed')).toBeVisible();
    await expect(page.getByText('LLM exploded')).toBeVisible();

    await page.getByRole('button', { name: 'Retry' }).click();
    // Retry recomputes the id from the echo's params and navigates there — a
    // fresh 8-char id, distinct from the seeded orig-1.
    await expect(page).toHaveURL(ID_URL);
  });

  test('GET 404 on existing echo shows not-found view', async ({ page }) => {
    const id = 'gone';
    await mockGetEcho(page, id, [{ kind: 'not_found' }]);
    await page.goto(`/${id}/`);
    await expect(page.getByText('Echo not found')).toBeVisible();
  });
});
