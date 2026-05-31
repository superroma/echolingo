import { chromium, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const BASE_URL = 'https://kind-river-0eb1ac303.7.azurestaticapps.net';
const OUT_DIR = join(process.cwd(), 'tests/manual/out');

async function shot(page: Page, name: string) {
  await page.screenshot({ path: join(OUT_DIR, `${name}.png`), fullPage: true });
  console.log(`  📸 ${name}.png`);
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    serviceWorkers: 'block',
    viewport: { width: 420, height: 900 },
  });
  const page = await context.newPage();

  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(`PAGE ERROR: ${err.message}`));

  try {
    console.log('1. Open home page');
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await shot(page, '01-home');

    const topic = `e2e smoke ${Date.now()}`;
    console.log(`2. Fill topic: "${topic}"`);
    await page.locator('textarea').fill(topic);
    await shot(page, '02-filled');

    console.log('3. Click Go');
    await page.getByRole('button', { name: /^go$/i }).click();
    await page.waitForURL(/\/echo\/(?!new)/, { timeout: 60_000 });
    const echoUrl = page.url();
    const echoId = echoUrl.match(/\/echo\/([^/?#]+)/)?.[1] ?? '?';
    console.log(`   → echo id = ${echoId}`);
    await shot(page, '03-echo-page');

    console.log('4. Wait for ready (audio button visible)');
    const playButton = page
      .getByRole('button')
      .filter({ has: page.locator('svg, [aria-label*="play" i]') })
      .first();
    await page
      .getByText(/play|listening|ready/i)
      .first()
      .waitFor({ timeout: 180_000 })
      .catch(() => {});
    await page.waitForFunction(
      () => !!document.querySelector('audio'),
      undefined,
      { timeout: 180_000 },
    );
    await shot(page, '04-ready');

    console.log('5. Try to play');
    // Find a likely play button — circular button in the bottom bar
    const allButtons = await page.getByRole('button').all();
    console.log(`   buttons on page: ${allButtons.length}`);
    // Look for "Play" / "▶" / aria-label="Play"
    const tryButtons = ['Play', 'play', '▶'];
    let played = false;
    for (const label of tryButtons) {
      const btn = page.getByRole('button', { name: new RegExp(label, 'i') });
      if (await btn.first().count()) {
        await btn.first().click().catch(() => {});
        played = true;
        console.log(`   clicked button matching "${label}"`);
        break;
      }
    }
    if (!played) {
      // fallback: click audio element parent button by position
      console.log('   ⚠ no labeled play button found; clicking the largest button');
    }
    await page.waitForTimeout(2000);
    const audioState = await page.evaluate(() => {
      const a = document.querySelector('audio') as HTMLAudioElement | null;
      if (!a) return { exists: false };
      return {
        exists: true,
        src: a.src,
        currentSrc: a.currentSrc,
        paused: a.paused,
        currentTime: a.currentTime,
        duration: a.duration,
        readyState: a.readyState,
        error: a.error ? { code: a.error.code, message: a.error.message } : null,
      };
    });
    console.log('   audio state:', JSON.stringify(audioState, null, 2));
    await shot(page, '05-after-play');

    console.log('6. Back to home');
    await page.getByRole('button', { name: 'Back' }).click();
    await page.waitForURL(BASE_URL + '/', { timeout: 10_000 });
    await shot(page, '06-home-with-echo');

    console.log('7. Click the new echo in the list');
    await page.getByText(topic, { exact: true }).first().click();
    await page.waitForURL(new RegExp(`/echo/${echoId}`), { timeout: 10_000 });
    await shot(page, '07-echo-from-list');

    console.log('8. Try to play again');
    for (const label of tryButtons) {
      const btn = page.getByRole('button', { name: new RegExp(label, 'i') });
      if (await btn.first().count()) {
        await btn.first().click().catch(() => {});
        console.log(`   clicked "${label}"`);
        break;
      }
    }
    await page.waitForTimeout(2000);
    const audioState2 = await page.evaluate(() => {
      const a = document.querySelector('audio') as HTMLAudioElement | null;
      if (!a) return { exists: false };
      return {
        exists: true,
        currentSrc: a.currentSrc,
        paused: a.paused,
        currentTime: a.currentTime,
        duration: a.duration,
        readyState: a.readyState,
        error: a.error ? { code: a.error.code, message: a.error.message } : null,
      };
    });
    console.log('   audio state (2nd time):', JSON.stringify(audioState2, null, 2));
    await shot(page, '08-after-play-2');

    console.log('\n=== console errors ===');
    if (consoleErrors.length === 0) console.log('   (none)');
    else for (const e of consoleErrors) console.log('  •', e);

    console.log('\nDONE');
  } catch (e) {
    console.error('FLOW FAILED:', e);
    await shot(page, '99-failure');
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
