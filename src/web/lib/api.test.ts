import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createLesson, getLesson, downloadLesson } from './api.js';
import type { LessonParams } from '@echolingo/shared/types';

const params: LessonParams = {
  topic: 'at the market',
  lengthMin: 5,
  level: 3,
  style: 'dialogue',
  mode: 'bilingual',
  bilingualOrder: 'gr_first',
  nativeLang: 'en',
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

describe('createLesson', () => {
  it('POSTs JSON body to /api/lesson and returns the id', async () => {
    fetchMock.mockResolvedValue(jsonResponse(201, { id: 'abc', status: 'generating_script' }));
    const result = await createLesson(params);
    expect(result).toEqual({ kind: 'created', id: 'abc', status: 'generating_script' });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/lesson');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'content-type': 'application/json' });
    expect(JSON.parse(init.body)).toEqual(params);
  });

  it('returns kind=existing on 200', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { id: 'abc', status: 'ready' }));
    const result = await createLesson(params);
    expect(result).toEqual({ kind: 'existing', id: 'abc', status: 'ready' });
  });

  it('returns kind=rate_limited on 429', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(429, { limit: 20, used: 20, resetAt: '2026-05-20T00:00:00Z' }),
    );
    const result = await createLesson(params);
    expect(result).toEqual({
      kind: 'rate_limited',
      limit: 20,
      used: 20,
      resetAt: '2026-05-20T00:00:00Z',
    });
  });

  it('returns kind=error on 400/500', async () => {
    fetchMock.mockResolvedValue(jsonResponse(400, { error: 'invalid LessonParams' }));
    const result = await createLesson(params);
    expect(result).toEqual({ kind: 'error', status: 400, message: 'invalid LessonParams' });
  });
});

describe('getLesson', () => {
  it('GETs /api/lesson/{id} and returns the lesson', async () => {
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
    const result = await getLesson('abc');
    expect(result.kind).toBe('found');
    if (result.kind === 'found') {
      expect(result.lesson.id).toBe('abc');
    }
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/lesson/abc');
  });

  it('returns kind=not_found on 404', async () => {
    fetchMock.mockResolvedValue(jsonResponse(404, { error: 'lesson not found' }));
    expect(await getLesson('missing')).toEqual({ kind: 'not_found' });
  });
});

describe('downloadLesson', () => {
  it('POSTs and returns the url on 200', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { url: 'https://s/x/full.mp3' }));
    const result = await downloadLesson('abc');
    expect(result).toEqual({ kind: 'ready', url: 'https://s/x/full.mp3' });
  });

  it('returns kind=not_ready on 409', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(409, { error: 'lesson is generating_audio, not ready' }),
    );
    expect(await downloadLesson('abc')).toEqual({
      kind: 'not_ready',
      message: 'lesson is generating_audio, not ready',
    });
  });
});
