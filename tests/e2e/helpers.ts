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

/** The client mints the id and PUTs to `/api/echo/{id}`; we echo that id back. */
function idFromUrl(url: string): string {
  return decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() ?? '');
}

export async function mockCreateEcho(
  page: Page,
  response:
    | { kind: 'created' }
    | { kind: 'rate_limited'; limit: number; used: number; resetAt: string }
    | { kind: 'server_error'; status: number; message: string }
    | { kind: 'network_error' },
) {
  await page.route('**/api/echo/*', async (route: Route) => {
    if (route.request().method() !== 'PUT') {
      await route.fallback();
      return;
    }
    if (response.kind === 'created') {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ id: idFromUrl(route.request().url()), status: 'generating_script' }),
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

type GetStep = EchoFixture | { kind: 'not_found' } | { kind: 'network_error' };

async function fulfillGet(route: Route, step: GetStep, id: string): Promise<void> {
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
    body: JSON.stringify(buildEcho({ ...(step as EchoFixture), id })),
  });
}

export async function mockGetEcho(page: Page, id: string, sequence: GetStep[]) {
  let i = 0;
  await page.route(`**/api/echo/${id}`, async (route: Route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    const step = sequence[Math.min(i, sequence.length - 1)]!;
    i++;
    await fulfillGet(route, step, id);
  });
}

/**
 * Id-agnostic GET mock for the create flow, where the client mints the id so the
 * test can't know it up front. Serves `sequence` for any `/api/echo/{id}` GET,
 * stamping the id parsed from the URL into the response body.
 */
export async function mockGetEchoAny(page: Page, sequence: Array<Omit<EchoFixture, 'id'> | { kind: 'not_found' } | { kind: 'network_error' }>) {
  let i = 0;
  await page.route('**/api/echo/*', async (route: Route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    const step = sequence[Math.min(i, sequence.length - 1)]!;
    i++;
    await fulfillGet(route, step as GetStep, idFromUrl(route.request().url()));
  });
}
