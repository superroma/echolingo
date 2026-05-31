import { test, expect } from './fixture';
import { mockGetEcho } from './helpers';

/**
 * Bug: on mobile, scrolling the transcript to the end scrolls the whole page and
 * the bottom player panel rides up out of view — it should stay pinned to the
 * visual viewport.
 *
 * Root cause: the player shell is sized to the *dynamic* viewport
 * (`<div class="flex h-[100dvh] …">` in echo-client.tsx) while the document
 * `<body>` is locked to the *large* viewport (`min-h-screen` = `min-height:100vh`
 * in layout.tsx), and nothing contains document overflow. When a mobile browser's
 * toolbar is visible, `dvh < vh`, so the body grows taller than the visual
 * viewport, the document becomes scrollable, and the `flex-none` footer (pinned
 * only inside the dvh shell) scrolls away with the page.
 *
 * Why this is a structural guard, not a behavioral repro: headless Chromium has
 * no dynamic browser toolbar, so `vh === dvh === svh === lvh` and the document
 * never overflows — verified directly via CDP `Emulation.setDeviceMetricsOverride`
 * (screen-taller-than-viewport, visual-viewport clip, positionY offset — all kept
 * the units equal). A behavioral assertion (“scroll the page, footer must not
 * move”) therefore can’t fail in CI even with the bug present. This test instead
 * asserts the invariant every valid fix must satisfy, so it fails while the bug
 * is live and passes once fixed — by any of: switching the body to the dynamic
 * viewport (`min-h-dvh`/`100dvh`), containing document overflow on `html`/`body`,
 * or pinning the footer with `position: fixed`. The visual behavior itself still
 * warrants a one-time check on a real phone.
 */
test.describe('player panel stays pinned to the viewport', () => {
  test('body is not locked to a taller viewport than the player shell', async ({ page }) => {
    const sentences = Array.from({ length: 40 }, (_, i) => ({
      i,
      gr: `Πρόταση αριθμός ${i} με αρκετό κείμενο ώστε να ξεπεράσει το ύψος της οθόνης`,
      native: `Sentence number ${i} with enough text to overflow the screen height`,
    }));
    await mockGetEcho(page, 'pinned-1', [
      { id: 'pinned-1', status: 'ready', topic: 'long echo', sentences },
    ]);

    await page.setViewportSize({ width: 390, height: 720 }); // iPhone-class portrait
    await page.goto('/echo/pinned-1/');
    await expect(page.getByRole('heading', { name: 'long echo' })).toBeVisible();
    // The <audio> element renders only in the ready/player state, so waiting for
    // it guarantees the dvh player shell is mounted (no silent shell-missing pass).
    await page.locator('audio').waitFor({ state: 'attached' });

    const probe = await page.evaluate(() => {
      const cs = (el: Element) => getComputedStyle(el);
      const shell = document.querySelector('.flex.h-\\[100dvh\\]') as HTMLElement | null;
      const html = document.documentElement;
      const body = document.body;
      // Tailwind v3: `min-h-screen` => `min-height: 100vh` (large, non-dynamic vp).
      const bodyLockedToLargeViewport = body.classList.contains('min-h-screen');
      const documentOverflowContained = [cs(html).overflowY, cs(body).overflowY].some(
        (v) => v === 'hidden' || v === 'clip',
      );
      return {
        shellTracksDynamicViewport: !!shell,
        bodyLockedToLargeViewport,
        documentOverflowContained,
      };
    });

    // Sanity precondition: we're actually on the dvh player shell.
    expect(probe.shellTracksDynamicViewport, 'expected the 100dvh player shell to be mounted').toBe(true);

    // The bug exists iff the shell tracks the dynamic viewport, the body is locked
    // to the large viewport, and nothing contains document overflow. Any valid fix
    // makes at least one of these false.
    const bugPresent =
      probe.shellTracksDynamicViewport &&
      probe.bodyLockedToLargeViewport &&
      !probe.documentOverflowContained;

    expect(
      bugPresent,
      'Player shell uses 100dvh while <body> is min-h-screen (100vh) with no overflow ' +
        'containment — the panel can scroll out of view when a mobile toolbar shrinks dvh.',
    ).toBe(false);
  });
});
