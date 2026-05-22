import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { OpenAiLlmEngine } from '../src/llm/openai-llm-engine.js';
import { buildPrompt } from '../src/_shared/index.js';

const CANNED = ['Καλημέρα.||Good morning.', 'Γεια σου.||Hello.'].join('\n');

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => server.resetHandlers());
afterAll(() => server.close());

const prompt = buildPrompt({
  topic: 'at the bakery',
  lengthMin: 5,
  level: 3,
  style: 'dialogue',
  mode: 'bilingual',
  bilingualOrder: 'gr_first',
  nativeLang: 'en',
  ttsEngine: 'openai',
});

describe('OpenAiLlmEngine', () => {
  it('reports its name as openai', () => {
    expect(
      new OpenAiLlmEngine({ auth: { kind: 'direct', apiKey: 'sk-test' }, model: 'gpt-4o-mini' })
        .name,
    ).toBe('openai');
  });

  it('sends a chat completion request and returns the assistant content', async () => {
    type CapturedBody = {
      model: string;
      messages: Array<{ role: string; content: string }>;
    };
    const captured: { body: CapturedBody | null } = { body: null };
    server.use(
      http.post('https://api.openai.com/v1/chat/completions', async ({ request }) => {
        captured.body = (await request.json()) as CapturedBody;
        return HttpResponse.json({
          id: 'cmpl-1',
          choices: [
            { index: 0, message: { role: 'assistant', content: CANNED }, finish_reason: 'stop' },
          ],
        });
      }),
    );
    const engine = new OpenAiLlmEngine({
      auth: { kind: 'direct', apiKey: 'sk-test' },
      model: 'gpt-4o-mini',
    });
    const raw = await engine.generateScript(prompt);
    expect(raw).toBe(CANNED);
    expect(captured.body?.model).toBe('gpt-4o-mini');
    expect(captured.body?.messages[0]).toEqual({ role: 'system', content: prompt.system });
    expect(captured.body?.messages[1]).toEqual({ role: 'user', content: prompt.user });
  });

  it('retries on transient 5xx and eventually succeeds', async () => {
    let calls = 0;
    server.use(
      http.post('https://api.openai.com/v1/chat/completions', async () => {
        calls += 1;
        if (calls < 3) return new HttpResponse(null, { status: 503 });
        return HttpResponse.json({
          id: 'cmpl-2',
          choices: [
            { index: 0, message: { role: 'assistant', content: CANNED }, finish_reason: 'stop' },
          ],
        });
      }),
    );
    const engine = new OpenAiLlmEngine({
      auth: { kind: 'direct', apiKey: 'sk-test' },
      model: 'gpt-4o-mini',
      maxAttempts: 5,
      baseDelayMs: 1,
    });
    expect(await engine.generateScript(prompt)).toBe(CANNED);
    expect(calls).toBe(3);
  });

  it('does not retry on 4xx', async () => {
    let calls = 0;
    server.use(
      http.post('https://api.openai.com/v1/chat/completions', () => {
        calls += 1;
        return new HttpResponse(JSON.stringify({ error: { message: 'bad request' } }), {
          status: 400,
          headers: { 'content-type': 'application/json' },
        });
      }),
    );
    const engine = new OpenAiLlmEngine({
      auth: { kind: 'direct', apiKey: 'sk-test' },
      model: 'gpt-4o-mini',
      maxAttempts: 5,
      baseDelayMs: 1,
    });
    await expect(engine.generateScript(prompt)).rejects.toThrow();
    expect(calls).toBe(1);
  });

  it('throws when choices[0].message.content is missing', async () => {
    server.use(
      http.post('https://api.openai.com/v1/chat/completions', () =>
        HttpResponse.json({ id: 'cmpl-3', choices: [{ index: 0, finish_reason: 'stop' }] }),
      ),
    );
    const engine = new OpenAiLlmEngine({
      auth: { kind: 'direct', apiKey: 'sk-test' },
      model: 'gpt-4o-mini',
    });
    await expect(engine.generateScript(prompt)).rejects.toThrow(/empty/i);
  });
});
