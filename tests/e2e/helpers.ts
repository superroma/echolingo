import type { Page, Route } from '@playwright/test';

export interface EchoFixture {
  id: string;
  status: 'generating_script' | 'generating_audio' | 'ready' | 'failed';
  topic?: string;
  targetLang?: string;
  nativeLang?: string;
  totalSentences?: number;
  readySentences?: number;
  sentences?: Array<{
    i: number;
    gr: string;
    native: string;
    status: 'pending' | 'ready' | 'failed';
    grUrl?: string;
    nativeUrl?: string;
    grDurSec?: number;
    nativeDurSec?: number;
  }>;
  error?: string;
}

export function buildEcho(f: EchoFixture) {
  return {
    id: f.id,
    params: {
      topic: f.topic ?? 'at the bakery',
      targetLang: f.targetLang ?? 'el',
      nativeLang: f.nativeLang ?? 'en',
      lengthMin: 5,
      level: 3,
      style: 'dialogue',
      mode: 'bilingual',
      bilingualOrder: 'target_first',
      ttsEngine: 'openai',
    },
    status: f.status,
    createdAt: '2026-05-24T10:00:00.000Z',
    updatedAt: '2026-05-24T10:01:00.000Z',
    totalSentences: f.totalSentences ?? 1,
    readySentences: f.readySentences ?? (f.status === 'ready' ? 1 : 0),
    sentences:
      f.sentences ??
      (f.status === 'ready'
        ? [
            {
              i: 0,
              gr: 'καλημέρα',
              native: 'good morning',
              status: 'ready',
              grUrl: 'about:blank',
              nativeUrl: 'about:blank',
              grDurSec: 1,
              nativeDurSec: 1,
            },
          ]
        : []),
    error: f.error,
  };
}

export async function mockCreateEcho(
  page: Page,
  response:
    | { kind: 'created'; id: string }
    | { kind: 'rate_limited'; limit: number; used: number; resetAt: string }
    | { kind: 'server_error'; status: number; message: string }
    | { kind: 'network_error' },
) {
  await page.route('**/api/echo', async (route: Route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback();
      return;
    }
    if (response.kind === 'created') {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ id: response.id, status: 'generating_script' }),
      });
      return;
    }
    if (response.kind === 'rate_limited') {
      await route.fulfill({
        status: 429,
        contentType: 'application/json',
        body: JSON.stringify({
          limit: response.limit,
          used: response.used,
          resetAt: response.resetAt,
        }),
      });
      return;
    }
    if (response.kind === 'server_error') {
      await route.fulfill({
        status: response.status,
        contentType: 'application/json',
        body: JSON.stringify({ error: response.message }),
      });
      return;
    }
    await route.abort('failed');
  });
}

export async function mockGetEcho(
  page: Page,
  id: string,
  sequence: Array<EchoFixture | { kind: 'not_found' } | { kind: 'network_error' }>,
) {
  let i = 0;
  await page.route(`**/api/echo/${id}`, async (route: Route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    const step = sequence[Math.min(i, sequence.length - 1)];
    i++;
    if ('kind' in step && step.kind === 'not_found') {
      await route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
      return;
    }
    if ('kind' in step && step.kind === 'network_error') {
      await route.abort('failed');
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(buildEcho(step as EchoFixture)),
    });
  });
}
