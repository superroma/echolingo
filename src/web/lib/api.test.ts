import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createEcho, getEcho, downloadEcho } from './api.js';
import type { EchoParams } from '@echolingo/shared/types';

const params: EchoParams = {
  topic: 'at the market',
  targetLang: 'el',
  nativeLang: 'en',
  lengthMin: 5,
  level: 3,
  mode: 'bilingual',
  bilingualOrder: 'target_first',
  ttsEngine: 'openai',
};

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('createEcho', () => {
  it('PUTs JSON params to /api/echo/{id} and returns the id', async () => {
    fetchMock.mockResolvedValue(jsonResponse(201, { id: 'k7Xp2qB9', status: 'generating_script' }));
    const result = await createEcho('k7Xp2qB9', params);
    expect(result).toEqual({ kind: 'created', id: 'k7Xp2qB9', status: 'generating_script' });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/echo/k7Xp2qB9');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body)).toEqual(params);
  });

  it('returns kind=existing on 200', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { id: 'k7Xp2qB9', status: 'ready' }));
    const result = await createEcho('k7Xp2qB9', params);
    expect(result).toEqual({ kind: 'existing', id: 'k7Xp2qB9', status: 'ready' });
  });

  it('returns kind=rate_limited on 429', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(429, { limit: 20, used: 20, resetAt: '2026-05-20T00:00:00Z' }),
    );
    const result = await createEcho('k7Xp2qB9', params);
    expect(result).toEqual({
      kind: 'rate_limited',
      limit: 20,
      used: 20,
      resetAt: '2026-05-20T00:00:00Z',
    });
  });

  it('returns kind=error on 400/500', async () => {
    fetchMock.mockResolvedValue(jsonResponse(400, { error: 'invalid EchoParams' }));
    const result = await createEcho('k7Xp2qB9', params);
    expect(result).toEqual({ kind: 'error', status: 400, message: 'invalid EchoParams' });
  });
});

describe('getEcho', () => {
  it('GETs /api/echo/{id} and returns the echo', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        id: 'abc',
        params,
        status: 'ready',
        totalSentences: 2,
        readySentences: 2,
        sentences: [],
        createdAt: 'x',
        updatedAt: 'x',
      }),
    );
    const result = await getEcho('abc');
    expect(result.kind).toBe('found');
    if (result.kind === 'found') {
      expect(result.echo.id).toBe('abc');
    }
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/echo/abc');
  });

  it('returns kind=not_found on 404', async () => {
    fetchMock.mockResolvedValue(jsonResponse(404, { error: 'echo not found' }));
    expect(await getEcho('missing')).toEqual({ kind: 'not_found' });
  });
});

describe('downloadEcho', () => {
  it('POSTs and returns the url on 200', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { url: 'https://s/x/full.mp3' }));
    const result = await downloadEcho('abc');
    expect(result).toEqual({ kind: 'ready', url: 'https://s/x/full.mp3' });
  });

  it('returns kind=not_ready on 409', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(409, { error: 'echo is generating_audio, not ready' }),
    );
    expect(await downloadEcho('abc')).toEqual({
      kind: 'not_ready',
      message: 'echo is generating_audio, not ready',
    });
  });
});
