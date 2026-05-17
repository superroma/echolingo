import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { OpenAiTtsEngine } from '../src/tts/openai-tts-engine.js';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => server.resetHandlers());
afterAll(() => server.close());

const MP3 = Buffer.from('MOCK-MP3-BYTES');

describe('OpenAiTtsEngine', () => {
  it('reports its name as openai', () => {
    expect(new OpenAiTtsEngine({ apiKey: 'sk-test' }).name).toBe('openai');
  });

  it('POSTs to /v1/audio/speech and returns mp3 bytes with estimated duration', async () => {
    const captured: { body: { input: string; voice: string; model: string; response_format: string } | null } = { body: null };
    server.use(
      http.post('https://api.openai.com/v1/audio/speech', async ({ request }) => {
        captured.body = (await request.json()) as typeof captured.body;
        return new HttpResponse(MP3, {
          status: 200,
          headers: { 'content-type': 'audio/mpeg' },
        });
      }),
    );
    const engine = new OpenAiTtsEngine({ apiKey: 'sk-test' });
    const result = await engine.synthesize({ text: 'Καλημέρα.', lang: 'el' });
    expect(result.mp3.equals(MP3)).toBe(true);
    expect(result.durationSec).toBeGreaterThan(0);
    expect(captured.body?.input).toBe('Καλημέρα.');
    expect(captured.body?.response_format).toBe('mp3');
  });

  it('uses voice override from request, else default per lang', async () => {
    const captured: { body: { voice: string } | null } = { body: null };
    server.use(
      http.post('https://api.openai.com/v1/audio/speech', async ({ request }) => {
        captured.body = (await request.json()) as typeof captured.body;
        return new HttpResponse(MP3, { status: 200 });
      }),
    );
    const engine = new OpenAiTtsEngine({ apiKey: 'sk-test' });
    await engine.synthesize({ text: 'Hi', lang: 'en' });
    expect(captured.body?.voice).toBeDefined();
    await engine.synthesize({ text: 'Hi', lang: 'en', voice: 'shimmer' });
    expect(captured.body?.voice).toBe('shimmer');
  });

  it('retries on 5xx and succeeds', async () => {
    let calls = 0;
    server.use(
      http.post('https://api.openai.com/v1/audio/speech', () => {
        calls += 1;
        if (calls < 2) return new HttpResponse(null, { status: 502 });
        return new HttpResponse(MP3, { status: 200 });
      }),
    );
    const engine = new OpenAiTtsEngine({ apiKey: 'sk-test', maxAttempts: 3, baseDelayMs: 1 });
    const result = await engine.synthesize({ text: 'x', lang: 'el' });
    expect(result.mp3.equals(MP3)).toBe(true);
    expect(calls).toBe(2);
  });

  it('does not retry on 4xx', async () => {
    let calls = 0;
    server.use(
      http.post('https://api.openai.com/v1/audio/speech', () => {
        calls += 1;
        return new HttpResponse('bad', { status: 400 });
      }),
    );
    const engine = new OpenAiTtsEngine({ apiKey: 'sk-test', maxAttempts: 3, baseDelayMs: 1 });
    await expect(engine.synthesize({ text: 'x', lang: 'el' })).rejects.toThrow();
    expect(calls).toBe(1);
  });
});
