# Echolingo — Plan 4: Real LLM/TTS Providers + Polish

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Swap the mock LLM and TTS engines for real OpenAI (default) and ElevenLabs (multilingual quality option), add per-IP rate limiting, retries/backoff, named Application Insights events, and an offline MP3 download endpoint — so a real Greek lesson plays end-to-end and the API survives production load shapes.

**Architecture:** Real engines implement the existing `LlmEngine` / `TtsEngine` interfaces from Plan 1+2, so no changes to handlers/workers — only the composition root in `src/api/src/context.ts` picks the engine based on env. A shared `retryWithBackoff` helper wraps remote calls. Rate limiting is enforced in `POST /api/lesson` against a blob-backed counter (`rate-limits/{ip}/{date}.json`) — same storage primitive as the lesson repository. App Insights is wired via the official `applicationinsights` SDK with a thin emit-event abstraction so tests can swap in a fake. Offline download builds an MP3 by concatenating per-sentence chunks; works for OpenAI's constant-bitrate `tts-1` output without re-encoding.

**Tech Stack:** Plan 2 stack + `openai` (^4.68.0), `applicationinsights` (^3.4.0). ElevenLabs is hit via plain `fetch` (no SDK). Tests use vitest + msw for HTTP interception against the OpenAI base URL and ElevenLabs endpoint.

---

## File structure produced by this plan

```
src/
├── shared/
│   └── src/
│       └── util/
│           ├── retry.ts            # retryWithBackoff
│           └── duration.ts         # estimateMp3DurationSec (text-length based, OK for MVP)
└── api/
    ├── src/
    │   ├── llm/
    │   │   └── openai-llm-engine.ts
    │   ├── tts/
    │   │   ├── openai-tts-engine.ts
    │   │   └── elevenlabs-tts-engine.ts
    │   ├── storage/
    │   │   └── blob-rate-limit-store.ts
    │   ├── functions/
    │   │   └── lesson-download.ts  # POST /api/lesson/{id}/download
    │   ├── lib/
    │   │   ├── telemetry.ts        # emitEvent + Application Insights setup
    │   │   └── concat-mp3.ts       # raw Buffer.concat with content-type
    │   ├── config.ts               # MODIFY: add OPENAI_API_KEY, ELEVENLABS_API_KEY, engine selection, RATE_LIMIT_PER_DAY
    │   └── context.ts              # MODIFY: real engines, rate-limit store, telemetry
    └── test/
        ├── retry.test.ts           # for shared retry util (lives in api workspace since we test the wired-up case)
        ├── openai-llm-engine.test.ts
        ├── openai-tts-engine.test.ts
        ├── elevenlabs-tts-engine.test.ts
        ├── blob-rate-limit-store.int.test.ts
        ├── lesson-create.rate-limit.test.ts  # adds rate-limit cases to existing handler
        ├── lesson-download.int.test.ts
        └── telemetry.test.ts
```

Existing files modified: `src/api/src/config.ts`, `src/api/src/context.ts`, `src/api/src/functions/lesson-create.ts`, `src/api/src/index.ts`, `src/shared/src/index.ts`, `src/api/package.json`, `src/api/local.settings.json.example`, `README.md`.

---

## Conventions

- All API workspace imports of shared code go through `@echolingo/shared`.
- All remote HTTP retries use `retryWithBackoff` from `@echolingo/shared`.
- All `*.int.test.ts` files require Azurite running (the blob-rate-limit store tests are in this bucket).
- All other test files mock HTTP via `msw` — they must NOT make real network calls. Tests that would hit OpenAI without a mock are a bug.
- Tests assume the test environment doesn't have real `OPENAI_API_KEY` / `ELEVENLABS_API_KEY`; the engines must accept a constructor-injected `apiKey` for testing.

---

## Task 1: `retryWithBackoff` utility

**Files:**
- Create: `src/shared/src/util/retry.ts`
- Create: `src/api/test/retry.test.ts` (lives in api workspace because shared package has no msw setup; testing pure logic doesn't need msw, but keeping retry-related tests together)
- Modify: `src/shared/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `src/api/test/retry.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { retryWithBackoff } from '@echolingo/shared';

describe('retryWithBackoff', () => {
  it('returns the result of the first successful call', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await retryWithBackoff(fn, { maxAttempts: 3, baseDelayMs: 1 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on transient failure and eventually succeeds', async () => {
    let attempt = 0;
    const fn = vi.fn().mockImplementation(async () => {
      attempt += 1;
      if (attempt < 3) throw new Error('boom');
      return 'ok';
    });
    const result = await retryWithBackoff(fn, { maxAttempts: 5, baseDelayMs: 1 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('throws the last error after maxAttempts', async () => {
    const err = new Error('persistent');
    const fn = vi.fn().mockRejectedValue(err);
    await expect(
      retryWithBackoff(fn, { maxAttempts: 3, baseDelayMs: 1 }),
    ).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does not retry when isRetriable returns false', async () => {
    const err = new Error('client-error') as Error & { status?: number };
    err.status = 400;
    const fn = vi.fn().mockRejectedValue(err);
    await expect(
      retryWithBackoff(fn, {
        maxAttempts: 3,
        baseDelayMs: 1,
        isRetriable: (e) => (e as { status?: number }).status !== 400,
      }),
    ).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('applies exponential backoff between attempts', async () => {
    const sleeps: number[] = [];
    let attempt = 0;
    const fn = vi.fn().mockImplementation(async () => {
      attempt += 1;
      if (attempt < 4) throw new Error('boom');
      return 'ok';
    });
    await retryWithBackoff(fn, {
      maxAttempts: 5,
      baseDelayMs: 10,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });
    expect(sleeps).toEqual([10, 20, 40]);
  });
});
```

- [ ] **Step 2: Run — red**

```bash
npm run test --workspace @echolingo/api
```

- [ ] **Step 3: Implement**

Create `src/shared/src/util/retry.ts`:

```ts
export interface RetryOptions {
  maxAttempts: number;
  baseDelayMs: number;
  isRetriable?: (err: unknown) => boolean;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  opts: RetryOptions,
): Promise<T> {
  const sleep = opts.sleep ?? defaultSleep;
  let lastErr: unknown;
  for (let attempt = 0; attempt < opts.maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const retriable = opts.isRetriable ? opts.isRetriable(err) : true;
      if (!retriable || attempt === opts.maxAttempts - 1) break;
      await sleep(opts.baseDelayMs * Math.pow(2, attempt));
    }
  }
  throw lastErr;
}
```

- [ ] **Step 4: Export from shared barrel**

Edit `src/shared/src/index.ts` — add before `export * from './types.js';`:

```ts
export { retryWithBackoff } from './util/retry.js';
export type { RetryOptions } from './util/retry.js';
```

- [ ] **Step 5: Run — green**

```bash
npm run test --workspaces
```

- [ ] **Step 6: Commit**

```bash
git add src/shared/src/util/retry.ts src/shared/src/index.ts src/api/test/retry.test.ts
git commit -m "feat(shared): add retryWithBackoff utility"
```

---

## Task 2: `estimateMp3DurationSec` utility

**Files:**
- Create: `src/shared/src/util/duration.ts`
- Create: `src/shared/test/duration.test.ts`
- Modify: `src/shared/src/index.ts`

Real OpenAI / ElevenLabs MP3s don't return their duration. We could parse the MP3 with `music-metadata` (extra dep) but for MVP a text-length-derived estimate is adequate — the player computes the precise duration from the `<audio>` element at playback. The estimate is used to pre-populate `Sentence.grDurSec`/`nativeDurSec` and to drive the transcript-highlight cumulative-time lookup; precision will be re-derived on the client when needed.

- [ ] **Step 1: Failing test**

Create `src/shared/test/duration.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { estimateMp3DurationSec } from '../src/util/duration.js';

describe('estimateMp3DurationSec', () => {
  it('scales linearly with text length', () => {
    const short = estimateMp3DurationSec('Γεια.');
    const long = estimateMp3DurationSec(
      'Καλημέρα σε όλους, πώς είστε σήμερα το πρωί;',
    );
    expect(long).toBeGreaterThan(short);
  });

  it('has a minimum floor for tiny inputs', () => {
    expect(estimateMp3DurationSec('Α')).toBeGreaterThanOrEqual(0.3);
    expect(estimateMp3DurationSec('')).toBeGreaterThanOrEqual(0.3);
  });

  it('produces ~3s for a 40-char sentence', () => {
    const d = estimateMp3DurationSec('Σήμερα μιλάμε για ένα νέο θέμα σήμερα.');
    expect(d).toBeGreaterThan(2);
    expect(d).toBeLessThan(5);
  });
});
```

- [ ] **Step 2: Run — red**

```bash
npm run test --workspace @echolingo/shared
```

- [ ] **Step 3: Implement**

Create `src/shared/src/util/duration.ts`:

```ts
const CHARS_PER_SECOND = 14;
const MIN_SECONDS = 0.3;

export function estimateMp3DurationSec(text: string): number {
  return Math.max(MIN_SECONDS, text.length / CHARS_PER_SECOND);
}
```

- [ ] **Step 4: Export from barrel**

Edit `src/shared/src/index.ts` — append after the retry export:

```ts
export { estimateMp3DurationSec } from './util/duration.js';
```

- [ ] **Step 5: Run — green**

```bash
npm run test --workspace @echolingo/shared
```

- [ ] **Step 6: Commit**

```bash
git add src/shared/src/util/duration.ts src/shared/test/duration.test.ts src/shared/src/index.ts
git commit -m "feat(shared): add estimateMp3DurationSec helper"
```

---

## Task 3: `OpenAiLlmEngine`

**Files:**
- Create: `src/api/src/llm/openai-llm-engine.ts`
- Create: `src/api/test/openai-llm-engine.test.ts`
- Modify: `src/api/package.json` — add `openai` dependency

- [ ] **Step 1: Add the OpenAI SDK dependency**

Edit `src/api/package.json` — `dependencies`:

```json
{
  "dependencies": {
    "@azure/functions": "^4.5.1",
    "@azure/storage-blob": "^12.25.0",
    "@azure/storage-queue": "^12.24.0",
    "@echolingo/shared": "*",
    "openai": "^4.68.0"
  }
}
```

Also add `msw` to `devDependencies`:

```json
{
  "devDependencies": {
    "@types/node": "^20.16.10",
    "msw": "^2.6.0",
    "vitest": "^2.1.4"
  }
}
```

From the repo root:

```bash
npm install
```

- [ ] **Step 2: Failing test**

Create `src/api/test/openai-llm-engine.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { OpenAiLlmEngine } from '../src/llm/openai-llm-engine.js';
import { buildPrompt } from '@echolingo/shared';

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
    expect(new OpenAiLlmEngine({ apiKey: 'sk-test' }).name).toBe('openai');
  });

  it('sends a chat completion request and returns the assistant content', async () => {
    let body: { model: string; messages: Array<{ role: string; content: string }> } | null = null;
    server.use(
      http.post('https://api.openai.com/v1/chat/completions', async ({ request }) => {
        body = (await request.json()) as typeof body;
        return HttpResponse.json({
          id: 'cmpl-1',
          choices: [
            { index: 0, message: { role: 'assistant', content: CANNED }, finish_reason: 'stop' },
          ],
        });
      }),
    );
    const engine = new OpenAiLlmEngine({ apiKey: 'sk-test', model: 'gpt-4o-mini' });
    const raw = await engine.generateScript(prompt);
    expect(raw).toBe(CANNED);
    expect(body?.model).toBe('gpt-4o-mini');
    expect(body?.messages[0]).toEqual({ role: 'system', content: prompt.system });
    expect(body?.messages[1]).toEqual({ role: 'user', content: prompt.user });
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
    const engine = new OpenAiLlmEngine({ apiKey: 'sk-test', maxAttempts: 5, baseDelayMs: 1 });
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
    const engine = new OpenAiLlmEngine({ apiKey: 'sk-test', maxAttempts: 5, baseDelayMs: 1 });
    await expect(engine.generateScript(prompt)).rejects.toThrow();
    expect(calls).toBe(1);
  });

  it('throws when choices[0].message.content is missing', async () => {
    server.use(
      http.post('https://api.openai.com/v1/chat/completions', () =>
        HttpResponse.json({ id: 'cmpl-3', choices: [{ index: 0, finish_reason: 'stop' }] }),
      ),
    );
    const engine = new OpenAiLlmEngine({ apiKey: 'sk-test' });
    await expect(engine.generateScript(prompt)).rejects.toThrow(/empty/i);
  });
});
```

- [ ] **Step 3: Run — red**

```bash
npm run test --workspace @echolingo/api
```

- [ ] **Step 4: Implement**

Create `src/api/src/llm/openai-llm-engine.ts`:

```ts
import OpenAI, { APIError } from 'openai';
import { retryWithBackoff, type BuiltPrompt, type LlmEngine } from '@echolingo/shared';

export interface OpenAiLlmEngineOptions {
  apiKey: string;
  model?: string;
  maxAttempts?: number;
  baseDelayMs?: number;
  temperature?: number;
}

const DEFAULT_MODEL = 'gpt-4o-mini';

function isRetriable(err: unknown): boolean {
  if (err instanceof APIError) {
    if (err.status === 429) return true;
    return err.status >= 500;
  }
  return true;
}

export class OpenAiLlmEngine implements LlmEngine {
  readonly name = 'openai' as const;
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly maxAttempts: number;
  private readonly baseDelayMs: number;
  private readonly temperature: number;

  constructor(opts: OpenAiLlmEngineOptions) {
    this.client = new OpenAI({ apiKey: opts.apiKey });
    this.model = opts.model ?? DEFAULT_MODEL;
    this.maxAttempts = opts.maxAttempts ?? 3;
    this.baseDelayMs = opts.baseDelayMs ?? 500;
    this.temperature = opts.temperature ?? 0.7;
  }

  async generateScript(prompt: BuiltPrompt): Promise<string> {
    const res = await retryWithBackoff(
      () =>
        this.client.chat.completions.create({
          model: this.model,
          temperature: this.temperature,
          messages: [
            { role: 'system', content: prompt.system },
            { role: 'user', content: prompt.user },
          ],
        }),
      { maxAttempts: this.maxAttempts, baseDelayMs: this.baseDelayMs, isRetriable },
    );
    const content = res.choices[0]?.message?.content;
    if (!content) throw new Error('OpenAI returned empty content');
    return content;
  }
}
```

- [ ] **Step 5: Run — green**

```bash
npm run test --workspace @echolingo/api
```

- [ ] **Step 6: Commit**

```bash
git add src/api/src/llm/openai-llm-engine.ts src/api/test/openai-llm-engine.test.ts src/api/package.json package-lock.json
git commit -m "feat(api): add OpenAiLlmEngine"
```

---

## Task 4: `OpenAiTtsEngine`

**Files:**
- Create: `src/api/src/tts/openai-tts-engine.ts`
- Create: `src/api/test/openai-tts-engine.test.ts`

- [ ] **Step 1: Failing test**

Create `src/api/test/openai-tts-engine.test.ts`:

```ts
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
    let body: { input: string; voice: string; model: string; response_format: string } | null = null;
    server.use(
      http.post('https://api.openai.com/v1/audio/speech', async ({ request }) => {
        body = (await request.json()) as typeof body;
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
    expect(body?.input).toBe('Καλημέρα.');
    expect(body?.response_format).toBe('mp3');
  });

  it('uses voice override from request, else default per lang', async () => {
    let lastBody: { voice: string } | null = null;
    server.use(
      http.post('https://api.openai.com/v1/audio/speech', async ({ request }) => {
        lastBody = (await request.json()) as typeof lastBody;
        return new HttpResponse(MP3, { status: 200 });
      }),
    );
    const engine = new OpenAiTtsEngine({ apiKey: 'sk-test' });
    await engine.synthesize({ text: 'Hi', lang: 'en' });
    expect(lastBody?.voice).toBeDefined();
    await engine.synthesize({ text: 'Hi', lang: 'en', voice: 'shimmer' });
    expect(lastBody?.voice).toBe('shimmer');
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
```

- [ ] **Step 2: Run — red**

```bash
npm run test --workspace @echolingo/api
```

- [ ] **Step 3: Implement**

Create `src/api/src/tts/openai-tts-engine.ts`:

```ts
import OpenAI, { APIError } from 'openai';
import {
  estimateMp3DurationSec,
  retryWithBackoff,
  type TtsEngine,
  type TtsLang,
  type TtsSynthesizeRequest,
  type TtsSynthesizeResult,
} from '@echolingo/shared';

export interface OpenAiTtsEngineOptions {
  apiKey: string;
  model?: string;
  defaultVoices?: Partial<Record<TtsLang, string>>;
  maxAttempts?: number;
  baseDelayMs?: number;
}

const DEFAULT_MODEL = 'tts-1';
const DEFAULT_VOICES: Record<TtsLang, string> = {
  el: 'alloy',
  en: 'alloy',
  ru: 'alloy',
};

function isRetriable(err: unknown): boolean {
  if (err instanceof APIError) {
    if (err.status === 429) return true;
    return err.status >= 500;
  }
  return true;
}

export class OpenAiTtsEngine implements TtsEngine {
  readonly name = 'openai' as const;
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly defaultVoices: Record<TtsLang, string>;
  private readonly maxAttempts: number;
  private readonly baseDelayMs: number;

  constructor(opts: OpenAiTtsEngineOptions) {
    this.client = new OpenAI({ apiKey: opts.apiKey });
    this.model = opts.model ?? DEFAULT_MODEL;
    this.defaultVoices = { ...DEFAULT_VOICES, ...opts.defaultVoices };
    this.maxAttempts = opts.maxAttempts ?? 3;
    this.baseDelayMs = opts.baseDelayMs ?? 500;
  }

  async synthesize(req: TtsSynthesizeRequest): Promise<TtsSynthesizeResult> {
    const voice = req.voice ?? this.defaultVoices[req.lang];
    const response = await retryWithBackoff(
      () =>
        this.client.audio.speech.create({
          model: this.model,
          voice,
          input: req.text,
          response_format: 'mp3',
        }),
      { maxAttempts: this.maxAttempts, baseDelayMs: this.baseDelayMs, isRetriable },
    );
    const mp3 = Buffer.from(await response.arrayBuffer());
    return { mp3, durationSec: estimateMp3DurationSec(req.text) };
  }
}
```

- [ ] **Step 4: Run — green**

```bash
npm run test --workspace @echolingo/api
```

- [ ] **Step 5: Commit**

```bash
git add src/api/src/tts/openai-tts-engine.ts src/api/test/openai-tts-engine.test.ts
git commit -m "feat(api): add OpenAiTtsEngine"
```

---

## Task 5: `ElevenLabsTtsEngine`

**Files:**
- Create: `src/api/src/tts/elevenlabs-tts-engine.ts`
- Create: `src/api/test/elevenlabs-tts-engine.test.ts`

ElevenLabs API: `POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}` with header `xi-api-key`. Body `{ text, model_id, voice_settings? }`. Response body is MP3 bytes.

- [ ] **Step 1: Failing test**

Create `src/api/test/elevenlabs-tts-engine.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { ElevenLabsTtsEngine } from '../src/tts/elevenlabs-tts-engine.js';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => server.resetHandlers());
afterAll(() => server.close());

const MP3 = Buffer.from('MOCK-EL-MP3');

describe('ElevenLabsTtsEngine', () => {
  it('reports its name as elevenlabs', () => {
    expect(new ElevenLabsTtsEngine({ apiKey: 'eltest' }).name).toBe('elevenlabs');
  });

  it('POSTs to /v1/text-to-speech/{voice} with xi-api-key header', async () => {
    let receivedHeader: string | null = null;
    let receivedBody: { text: string; model_id: string } | null = null;
    let receivedUrl = '';
    server.use(
      http.post(
        'https://api.elevenlabs.io/v1/text-to-speech/:voice',
        async ({ request, params }) => {
          receivedHeader = request.headers.get('xi-api-key');
          receivedBody = (await request.json()) as typeof receivedBody;
          receivedUrl = String(params.voice);
          return new HttpResponse(MP3, {
            status: 200,
            headers: { 'content-type': 'audio/mpeg' },
          });
        },
      ),
    );
    const engine = new ElevenLabsTtsEngine({
      apiKey: 'eltest',
      defaultVoices: { el: 'voice-el', en: 'voice-en', ru: 'voice-ru' },
    });
    const result = await engine.synthesize({ text: 'Καλημέρα.', lang: 'el' });
    expect(result.mp3.equals(MP3)).toBe(true);
    expect(result.durationSec).toBeGreaterThan(0);
    expect(receivedHeader).toBe('eltest');
    expect(receivedBody?.text).toBe('Καλημέρα.');
    expect(receivedUrl).toBe('voice-el');
  });

  it('honors voice override per request', async () => {
    let voiceUsed = '';
    server.use(
      http.post(
        'https://api.elevenlabs.io/v1/text-to-speech/:voice',
        ({ params }) => {
          voiceUsed = String(params.voice);
          return new HttpResponse(MP3, { status: 200 });
        },
      ),
    );
    const engine = new ElevenLabsTtsEngine({
      apiKey: 'eltest',
      defaultVoices: { el: 'voice-el', en: 'voice-en', ru: 'voice-ru' },
    });
    await engine.synthesize({ text: 'x', lang: 'el', voice: 'override-voice' });
    expect(voiceUsed).toBe('override-voice');
  });

  it('retries on 5xx', async () => {
    let calls = 0;
    server.use(
      http.post('https://api.elevenlabs.io/v1/text-to-speech/:voice', () => {
        calls += 1;
        if (calls < 2) return new HttpResponse(null, { status: 503 });
        return new HttpResponse(MP3, { status: 200 });
      }),
    );
    const engine = new ElevenLabsTtsEngine({
      apiKey: 'eltest',
      defaultVoices: { el: 'voice-el', en: 'voice-en', ru: 'voice-ru' },
      maxAttempts: 3,
      baseDelayMs: 1,
    });
    const result = await engine.synthesize({ text: 'x', lang: 'el' });
    expect(result.mp3.equals(MP3)).toBe(true);
    expect(calls).toBe(2);
  });

  it('does not retry on 4xx', async () => {
    let calls = 0;
    server.use(
      http.post('https://api.elevenlabs.io/v1/text-to-speech/:voice', () => {
        calls += 1;
        return new HttpResponse('bad', { status: 400 });
      }),
    );
    const engine = new ElevenLabsTtsEngine({
      apiKey: 'eltest',
      defaultVoices: { el: 'voice-el', en: 'voice-en', ru: 'voice-ru' },
      maxAttempts: 3,
      baseDelayMs: 1,
    });
    await expect(engine.synthesize({ text: 'x', lang: 'el' })).rejects.toThrow();
    expect(calls).toBe(1);
  });
});
```

- [ ] **Step 2: Run — red**

```bash
npm run test --workspace @echolingo/api
```

- [ ] **Step 3: Implement**

Create `src/api/src/tts/elevenlabs-tts-engine.ts`:

```ts
import {
  estimateMp3DurationSec,
  retryWithBackoff,
  type TtsEngine,
  type TtsLang,
  type TtsSynthesizeRequest,
  type TtsSynthesizeResult,
} from '@echolingo/shared';

export interface ElevenLabsTtsEngineOptions {
  apiKey: string;
  defaultVoices: Record<TtsLang, string>; // required — no sane default per lang
  model?: string;
  maxAttempts?: number;
  baseDelayMs?: number;
  baseUrl?: string;
}

class HttpError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'HttpError';
  }
}

const DEFAULT_MODEL = 'eleven_multilingual_v2';
const DEFAULT_BASE_URL = 'https://api.elevenlabs.io';

function isRetriable(err: unknown): boolean {
  if (err instanceof HttpError) {
    if (err.status === 429) return true;
    return err.status >= 500;
  }
  return true;
}

export class ElevenLabsTtsEngine implements TtsEngine {
  readonly name = 'elevenlabs' as const;
  private readonly apiKey: string;
  private readonly defaultVoices: Record<TtsLang, string>;
  private readonly model: string;
  private readonly maxAttempts: number;
  private readonly baseDelayMs: number;
  private readonly baseUrl: string;

  constructor(opts: ElevenLabsTtsEngineOptions) {
    this.apiKey = opts.apiKey;
    this.defaultVoices = opts.defaultVoices;
    this.model = opts.model ?? DEFAULT_MODEL;
    this.maxAttempts = opts.maxAttempts ?? 3;
    this.baseDelayMs = opts.baseDelayMs ?? 500;
    this.baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;
  }

  async synthesize(req: TtsSynthesizeRequest): Promise<TtsSynthesizeResult> {
    const voice = req.voice ?? this.defaultVoices[req.lang];
    const mp3 = await retryWithBackoff(
      async () => {
        const res = await fetch(`${this.baseUrl}/v1/text-to-speech/${voice}`, {
          method: 'POST',
          headers: {
            'xi-api-key': this.apiKey,
            'content-type': 'application/json',
            accept: 'audio/mpeg',
          },
          body: JSON.stringify({
            text: req.text,
            model_id: this.model,
          }),
        });
        if (!res.ok) {
          const detail = await res.text().catch(() => '');
          throw new HttpError(res.status, `ElevenLabs ${res.status}: ${detail}`);
        }
        return Buffer.from(await res.arrayBuffer());
      },
      { maxAttempts: this.maxAttempts, baseDelayMs: this.baseDelayMs, isRetriable },
    );
    return { mp3, durationSec: estimateMp3DurationSec(req.text) };
  }
}
```

- [ ] **Step 4: Run — green**

```bash
npm run test --workspace @echolingo/api
```

- [ ] **Step 5: Commit**

```bash
git add src/api/src/tts/elevenlabs-tts-engine.ts src/api/test/elevenlabs-tts-engine.test.ts
git commit -m "feat(api): add ElevenLabsTtsEngine"
```

---

## Task 6: Engine selection in config + context

**Files:**
- Modify: `src/api/src/config.ts`
- Modify: `src/api/src/context.ts`
- Create: `src/api/test/config.engines.test.ts`

The config picks LLM and TTS engines from env. Defaults: OpenAI for both. If `OPENAI_API_KEY` is unset, fall back to `mock`. If `TTS_ENGINE=elevenlabs`, require `ELEVENLABS_API_KEY` and `ELEVENLABS_VOICE_*` env vars.

- [ ] **Step 1: Failing test**

Create `src/api/test/config.engines.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig } from '../src/config.js';

describe('loadConfig — engine selection', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { AzureWebJobsStorage: 'UseDevelopmentStorage=true' };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('defaults llmEngine to "mock" when OPENAI_API_KEY is unset', () => {
    expect(loadConfig().llmEngine).toBe('mock');
  });

  it('defaults llmEngine to "openai" when OPENAI_API_KEY is set', () => {
    process.env.OPENAI_API_KEY = 'sk-x';
    expect(loadConfig().llmEngine).toBe('openai');
  });

  it('honors LLM_ENGINE=mock even when OPENAI_API_KEY is set', () => {
    process.env.OPENAI_API_KEY = 'sk-x';
    process.env.LLM_ENGINE = 'mock';
    expect(loadConfig().llmEngine).toBe('mock');
  });

  it('exposes openai keys when set', () => {
    process.env.OPENAI_API_KEY = 'sk-x';
    process.env.OPENAI_LLM_MODEL = 'gpt-4o-mini';
    process.env.OPENAI_TTS_MODEL = 'tts-1';
    const cfg = loadConfig();
    expect(cfg.openai?.apiKey).toBe('sk-x');
    expect(cfg.openai?.llmModel).toBe('gpt-4o-mini');
    expect(cfg.openai?.ttsModel).toBe('tts-1');
  });

  it('defaults ttsEngine to mock when no provider env is set', () => {
    expect(loadConfig().ttsEngine).toBe('mock');
  });

  it('defaults ttsEngine to openai when OPENAI_API_KEY is set', () => {
    process.env.OPENAI_API_KEY = 'sk-x';
    expect(loadConfig().ttsEngine).toBe('openai');
  });

  it('honors TTS_ENGINE=elevenlabs', () => {
    process.env.ELEVENLABS_API_KEY = 'el-x';
    process.env.ELEVENLABS_VOICE_EL = 'voice-el';
    process.env.ELEVENLABS_VOICE_EN = 'voice-en';
    process.env.ELEVENLABS_VOICE_RU = 'voice-ru';
    process.env.TTS_ENGINE = 'elevenlabs';
    const cfg = loadConfig();
    expect(cfg.ttsEngine).toBe('elevenlabs');
    expect(cfg.elevenlabs?.voices.el).toBe('voice-el');
  });

  it('throws when TTS_ENGINE=elevenlabs but ELEVENLABS_API_KEY missing', () => {
    process.env.TTS_ENGINE = 'elevenlabs';
    expect(() => loadConfig()).toThrow(/ELEVENLABS_API_KEY/);
  });

  it('exposes rateLimitPerDay (default 20, env override)', () => {
    expect(loadConfig().rateLimitPerDay).toBe(20);
    process.env.RATE_LIMIT_PER_DAY = '5';
    expect(loadConfig().rateLimitPerDay).toBe(5);
  });
});
```

- [ ] **Step 2: Run — red**

```bash
npm run test --workspace @echolingo/api
```

- [ ] **Step 3: Implement**

Replace `src/api/src/config.ts` entirely with:

```ts
export const DEFAULT_LESSON_CONTAINER = 'lessons';
export const DEFAULT_AUDIO_CONTAINER = 'audio';
export const DEFAULT_RATE_LIMIT_CONTAINER = 'rate-limits';
export const DEFAULT_SCRIPT_GEN_QUEUE = 'script-gen';
export const DEFAULT_TTS_SENTENCE_QUEUE = 'tts-sentence';

export type LlmEngineName = 'mock' | 'openai';
export type TtsEngineName = 'mock' | 'openai' | 'elevenlabs';

export interface OpenAiConfig {
  apiKey: string;
  llmModel: string;
  ttsModel: string;
}

export interface ElevenLabsConfig {
  apiKey: string;
  voices: { el: string; en: string; ru: string };
}

export interface Config {
  storageConnectionString: string;
  lessonsContainer: string;
  audioContainer: string;
  rateLimitContainer: string;
  scriptGenQueue: string;
  ttsSentenceQueue: string;
  llmEngine: LlmEngineName;
  ttsEngine: TtsEngineName;
  rateLimitPerDay: number;
  openai?: OpenAiConfig;
  elevenlabs?: ElevenLabsConfig;
  appInsightsConnectionString?: string;
}

export function loadConfig(): Config {
  const storageConnectionString = process.env.AzureWebJobsStorage;
  if (!storageConnectionString) {
    throw new Error('AzureWebJobsStorage environment variable is required');
  }

  const openaiKey = process.env.OPENAI_API_KEY;
  const elevenlabsKey = process.env.ELEVENLABS_API_KEY;

  const llmEnvChoice = process.env.LLM_ENGINE;
  const ttsEnvChoice = process.env.TTS_ENGINE;

  const llmEngine: LlmEngineName =
    llmEnvChoice === 'mock' ? 'mock' :
    llmEnvChoice === 'openai' ? 'openai' :
    openaiKey ? 'openai' : 'mock';

  const ttsEngine: TtsEngineName =
    ttsEnvChoice === 'mock' ? 'mock' :
    ttsEnvChoice === 'openai' ? 'openai' :
    ttsEnvChoice === 'elevenlabs' ? 'elevenlabs' :
    openaiKey ? 'openai' : 'mock';

  if ((llmEngine === 'openai' || ttsEngine === 'openai') && !openaiKey) {
    throw new Error('OPENAI_API_KEY is required when LLM_ENGINE or TTS_ENGINE is openai');
  }
  if (ttsEngine === 'elevenlabs' && !elevenlabsKey) {
    throw new Error('ELEVENLABS_API_KEY is required when TTS_ENGINE=elevenlabs');
  }

  const openai: OpenAiConfig | undefined = openaiKey
    ? {
        apiKey: openaiKey,
        llmModel: process.env.OPENAI_LLM_MODEL ?? 'gpt-4o-mini',
        ttsModel: process.env.OPENAI_TTS_MODEL ?? 'tts-1',
      }
    : undefined;

  const elevenlabs: ElevenLabsConfig | undefined =
    elevenlabsKey
      ? {
          apiKey: elevenlabsKey,
          voices: {
            el: process.env.ELEVENLABS_VOICE_EL ?? '',
            en: process.env.ELEVENLABS_VOICE_EN ?? '',
            ru: process.env.ELEVENLABS_VOICE_RU ?? '',
          },
        }
      : undefined;

  if (ttsEngine === 'elevenlabs') {
    const v = elevenlabs?.voices;
    if (!v?.el || !v.en || !v.ru) {
      throw new Error(
        'TTS_ENGINE=elevenlabs requires ELEVENLABS_VOICE_EL, ELEVENLABS_VOICE_EN, ELEVENLABS_VOICE_RU',
      );
    }
  }

  return {
    storageConnectionString,
    lessonsContainer: process.env.LESSONS_CONTAINER ?? DEFAULT_LESSON_CONTAINER,
    audioContainer: process.env.AUDIO_CONTAINER ?? DEFAULT_AUDIO_CONTAINER,
    rateLimitContainer: process.env.RATE_LIMIT_CONTAINER ?? DEFAULT_RATE_LIMIT_CONTAINER,
    scriptGenQueue: process.env.SCRIPT_GEN_QUEUE ?? DEFAULT_SCRIPT_GEN_QUEUE,
    ttsSentenceQueue: process.env.TTS_SENTENCE_QUEUE ?? DEFAULT_TTS_SENTENCE_QUEUE,
    llmEngine,
    ttsEngine,
    rateLimitPerDay: parseInt(process.env.RATE_LIMIT_PER_DAY ?? '20', 10),
    openai,
    elevenlabs,
    appInsightsConnectionString: process.env.APPLICATIONINSIGHTS_CONNECTION_STRING,
  };
}
```

- [ ] **Step 4: Update `src/api/src/context.ts`**

Replace `src/api/src/context.ts` with:

```ts
import {
  MockLlmEngine,
  MockTtsEngine,
  type AudioStorage,
  type LessonRepository,
  type LlmEngine,
  type TtsEngine,
} from '@echolingo/shared';
import { loadConfig, type Config } from './config.js';
import { BlobLessonRepository } from './storage/blob-lesson-repository.js';
import { BlobAudioStorage } from './storage/blob-audio-storage.js';
import { QueueClient } from './queue/queue-client.js';
import { OpenAiLlmEngine } from './llm/openai-llm-engine.js';
import { OpenAiTtsEngine } from './tts/openai-tts-engine.js';
import { ElevenLabsTtsEngine } from './tts/elevenlabs-tts-engine.js';

export interface ApiContext {
  config: Config;
  lessons: LessonRepository;
  audio: AudioStorage;
  queue: QueueClient;
  llm: LlmEngine;
  tts: TtsEngine;
}

let cached: ApiContext | undefined;

function buildLlm(config: Config): LlmEngine {
  if (config.llmEngine === 'openai') {
    if (!config.openai) throw new Error('openai config missing');
    return new OpenAiLlmEngine({ apiKey: config.openai.apiKey, model: config.openai.llmModel });
  }
  return new MockLlmEngine();
}

function buildTts(config: Config): TtsEngine {
  if (config.ttsEngine === 'openai') {
    if (!config.openai) throw new Error('openai config missing');
    return new OpenAiTtsEngine({ apiKey: config.openai.apiKey, model: config.openai.ttsModel });
  }
  if (config.ttsEngine === 'elevenlabs') {
    if (!config.elevenlabs) throw new Error('elevenlabs config missing');
    return new ElevenLabsTtsEngine({
      apiKey: config.elevenlabs.apiKey,
      defaultVoices: config.elevenlabs.voices,
    });
  }
  return new MockTtsEngine();
}

export function getContext(): ApiContext {
  if (cached) return cached;
  const config = loadConfig();
  cached = {
    config,
    lessons: new BlobLessonRepository(config.storageConnectionString, config.lessonsContainer),
    audio: new BlobAudioStorage(config.storageConnectionString, config.audioContainer),
    queue: new QueueClient(
      config.storageConnectionString,
      config.scriptGenQueue,
      config.ttsSentenceQueue,
    ),
    llm: buildLlm(config),
    tts: buildTts(config),
  };
  return cached;
}

export function setContextForTests(override: ApiContext | undefined): void {
  cached = override;
}
```

- [ ] **Step 5: Run — green**

```bash
npm run test --workspace @echolingo/api
```

- [ ] **Step 6: Commit**

```bash
git add src/api/src/config.ts src/api/src/context.ts src/api/test/config.engines.test.ts
git commit -m "feat(api): pick real engines from config; default to mocks when keys unset"
```

---

## Task 7: Per-IP rate-limit blob store

**Files:**
- Create: `src/api/src/storage/blob-rate-limit-store.ts`
- Create: `src/api/test/blob-rate-limit-store.int.test.ts`

Storage shape: `rate-limits/{ip}/{YYYY-MM-DD}.json` containing `{ count: number }`. Atomic increment via etag-conditional update.

- [ ] **Step 1: Failing test**

Create `src/api/test/blob-rate-limit-store.int.test.ts`:

```ts
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { BlobRateLimitStore } from '../src/storage/blob-rate-limit-store.js';
import { AZURITE_CONNECTION_STRING, isAzuriteReachable } from './helpers/azurite.js';
import { resetContainer } from './helpers/containers.js';

const CONTAINER = 'rate-limits-test-7';

describe('BlobRateLimitStore (integration)', () => {
  let connStr: string | null = null;

  beforeAll(async () => {
    if (await isAzuriteReachable()) connStr = AZURITE_CONNECTION_STRING;
  });

  beforeEach(async () => {
    if (!connStr) return;
    await resetContainer(connStr, CONTAINER);
  });

  it('increments returns 1 on first call for an IP+date', async (ctx) => {
    if (!connStr) ctx.skip();
    const store = new BlobRateLimitStore(connStr!, CONTAINER);
    expect(await store.increment('1.2.3.4', '2026-05-17')).toBe(1);
  });

  it('increments monotonically for the same key', async (ctx) => {
    if (!connStr) ctx.skip();
    const store = new BlobRateLimitStore(connStr!, CONTAINER);
    expect(await store.increment('1.2.3.4', '2026-05-17')).toBe(1);
    expect(await store.increment('1.2.3.4', '2026-05-17')).toBe(2);
    expect(await store.increment('1.2.3.4', '2026-05-17')).toBe(3);
  });

  it('separates counters per IP', async (ctx) => {
    if (!connStr) ctx.skip();
    const store = new BlobRateLimitStore(connStr!, CONTAINER);
    expect(await store.increment('1.1.1.1', '2026-05-17')).toBe(1);
    expect(await store.increment('2.2.2.2', '2026-05-17')).toBe(1);
  });

  it('separates counters per date', async (ctx) => {
    if (!connStr) ctx.skip();
    const store = new BlobRateLimitStore(connStr!, CONTAINER);
    expect(await store.increment('1.1.1.1', '2026-05-17')).toBe(1);
    expect(await store.increment('1.1.1.1', '2026-05-18')).toBe(1);
  });

  it('get returns 0 for unused keys', async (ctx) => {
    if (!connStr) ctx.skip();
    const store = new BlobRateLimitStore(connStr!, CONTAINER);
    expect(await store.get('1.2.3.4', '2026-05-17')).toBe(0);
  });

  it('get returns current count after increments', async (ctx) => {
    if (!connStr) ctx.skip();
    const store = new BlobRateLimitStore(connStr!, CONTAINER);
    await store.increment('1.1.1.1', '2026-05-17');
    await store.increment('1.1.1.1', '2026-05-17');
    expect(await store.get('1.1.1.1', '2026-05-17')).toBe(2);
  });
});
```

- [ ] **Step 2: Run — red**

```bash
npm run test --workspace @echolingo/api
```

- [ ] **Step 3: Implement**

Create `src/api/src/storage/blob-rate-limit-store.ts`:

```ts
import { BlobServiceClient, RestError, type ContainerClient } from '@azure/storage-blob';

interface RateLimitDocument {
  count: number;
}

export class BlobRateLimitStore {
  private readonly container: ContainerClient;

  constructor(connectionString: string, containerName: string) {
    const service = BlobServiceClient.fromConnectionString(connectionString);
    this.container = service.getContainerClient(containerName);
  }

  async ensureContainer(): Promise<void> {
    await this.container.createIfNotExists();
  }

  async get(ip: string, date: string): Promise<number> {
    const blob = this.container.getBlockBlobClient(this.blobName(ip, date));
    try {
      const downloaded = await blob.downloadToBuffer();
      const parsed = JSON.parse(downloaded.toString('utf-8')) as RateLimitDocument;
      return parsed.count;
    } catch (err) {
      if (err instanceof RestError && err.statusCode === 404) return 0;
      throw err;
    }
  }

  async increment(ip: string, date: string): Promise<number> {
    await this.ensureContainer();
    const blob = this.container.getBlockBlobClient(this.blobName(ip, date));
    for (let attempt = 0; attempt < 5; attempt += 1) {
      // Try create-if-absent first
      try {
        const body = JSON.stringify({ count: 1 } satisfies RateLimitDocument);
        await blob.upload(body, body.length, {
          conditions: { ifNoneMatch: '*' },
          blobHTTPHeaders: { blobContentType: 'application/json' },
        });
        return 1;
      } catch (err) {
        if (!(err instanceof RestError) || (err.statusCode !== 409 && err.statusCode !== 412)) {
          throw err;
        }
      }

      // Exists — read, increment, write with etag guard
      let downloaded;
      try {
        downloaded = await blob.download();
      } catch (err) {
        if (err instanceof RestError && err.statusCode === 404) continue;
        throw err;
      }
      if (!downloaded.etag) continue;
      const chunks: Buffer[] = [];
      for await (const chunk of downloaded.readableStreamBody ?? []) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const current = JSON.parse(Buffer.concat(chunks).toString('utf-8')) as RateLimitDocument;
      const next: RateLimitDocument = { count: current.count + 1 };
      const body = JSON.stringify(next);
      try {
        await blob.upload(body, body.length, {
          conditions: { ifMatch: downloaded.etag },
          blobHTTPHeaders: { blobContentType: 'application/json' },
        });
        return next.count;
      } catch (err) {
        if (err instanceof RestError && err.statusCode === 412) continue;
        throw err;
      }
    }
    throw new Error('rate limit increment exhausted retries');
  }

  private blobName(ip: string, date: string): string {
    return `${ip}/${date}.json`;
  }
}
```

- [ ] **Step 4: Run — green (Azurite up)**

```bash
npm run test --workspace @echolingo/api
```

- [ ] **Step 5: Commit**

```bash
git add src/api/src/storage/blob-rate-limit-store.ts src/api/test/blob-rate-limit-store.int.test.ts
git commit -m "feat(api): add BlobRateLimitStore with atomic per-IP daily counter"
```

---

## Task 8: Rate-limit enforcement in `POST /api/lesson`

**Files:**
- Modify: `src/api/src/context.ts` (add rate-limit store)
- Modify: `src/api/src/functions/lesson-create.ts` (enforce limit)
- Create: `src/api/test/lesson-create.rate-limit.test.ts`

- [ ] **Step 1: Extend ApiContext with `rateLimits` field**

Edit `src/api/src/context.ts` — replace `ApiContext` and `getContext()`:

```ts
import {
  MockLlmEngine,
  MockTtsEngine,
  type AudioStorage,
  type LessonRepository,
  type LlmEngine,
  type TtsEngine,
} from '@echolingo/shared';
import { loadConfig, type Config } from './config.js';
import { BlobLessonRepository } from './storage/blob-lesson-repository.js';
import { BlobAudioStorage } from './storage/blob-audio-storage.js';
import { BlobRateLimitStore } from './storage/blob-rate-limit-store.js';
import { QueueClient } from './queue/queue-client.js';
import { OpenAiLlmEngine } from './llm/openai-llm-engine.js';
import { OpenAiTtsEngine } from './tts/openai-tts-engine.js';
import { ElevenLabsTtsEngine } from './tts/elevenlabs-tts-engine.js';

export interface RateLimitStore {
  get(ip: string, date: string): Promise<number>;
  increment(ip: string, date: string): Promise<number>;
}

export interface ApiContext {
  config: Config;
  lessons: LessonRepository;
  audio: AudioStorage;
  queue: QueueClient;
  llm: LlmEngine;
  tts: TtsEngine;
  rateLimits: RateLimitStore;
}

let cached: ApiContext | undefined;

function buildLlm(config: Config): LlmEngine {
  if (config.llmEngine === 'openai') {
    if (!config.openai) throw new Error('openai config missing');
    return new OpenAiLlmEngine({ apiKey: config.openai.apiKey, model: config.openai.llmModel });
  }
  return new MockLlmEngine();
}

function buildTts(config: Config): TtsEngine {
  if (config.ttsEngine === 'openai') {
    if (!config.openai) throw new Error('openai config missing');
    return new OpenAiTtsEngine({ apiKey: config.openai.apiKey, model: config.openai.ttsModel });
  }
  if (config.ttsEngine === 'elevenlabs') {
    if (!config.elevenlabs) throw new Error('elevenlabs config missing');
    return new ElevenLabsTtsEngine({
      apiKey: config.elevenlabs.apiKey,
      defaultVoices: config.elevenlabs.voices,
    });
  }
  return new MockTtsEngine();
}

export function getContext(): ApiContext {
  if (cached) return cached;
  const config = loadConfig();
  cached = {
    config,
    lessons: new BlobLessonRepository(config.storageConnectionString, config.lessonsContainer),
    audio: new BlobAudioStorage(config.storageConnectionString, config.audioContainer),
    queue: new QueueClient(
      config.storageConnectionString,
      config.scriptGenQueue,
      config.ttsSentenceQueue,
    ),
    llm: buildLlm(config),
    tts: buildTts(config),
    rateLimits: new BlobRateLimitStore(config.storageConnectionString, config.rateLimitContainer),
  };
  return cached;
}

export function setContextForTests(override: ApiContext | undefined): void {
  cached = override;
}
```

- [ ] **Step 2: Update existing lesson-create.test.ts to satisfy the new ApiContext interface**

Edit `src/api/test/lesson-create.test.ts` — find the `buildContext` function and add a `rateLimits` field to the `ctx`:

```ts
function buildContext(): { ctx: ApiContext; queue: FakeQueueClient } {
  const queue = new FakeQueueClient();
  const ctx = {
    config: {
      storageConnectionString: 'UseDevelopmentStorage=true',
      lessonsContainer: 'lessons',
      audioContainer: 'audio',
      rateLimitContainer: 'rate-limits',
      scriptGenQueue: 'script-gen',
      ttsSentenceQueue: 'tts-sentence',
      llmEngine: 'mock' as const,
      ttsEngine: 'mock' as const,
      rateLimitPerDay: 1000, // effectively unlimited for existing tests
    },
    lessons: new InMemoryLessonRepository(),
    audio: new InMemoryAudioStorage(),
    queue: queue as unknown as ApiContext['queue'],
    llm: new MockLlmEngine(),
    tts: new MockTtsEngine(),
    rateLimits: {
      get: async () => 0,
      increment: async () => 1,
    },
  };
  return { ctx, queue };
}
```

Do the same edit (add `rateLimitContainer`, `llmEngine`, `ttsEngine`, `rateLimitPerDay`, and `rateLimits`) in the `buildContext` of `src/api/test/lesson-get.test.ts`, `src/api/test/worker-script-gen.test.ts`, `src/api/test/worker-tts-sentence.test.ts`, and `src/api/test/pipeline.int.test.ts`. For `pipeline.int.test.ts`, the `rateLimits` field should be `new BlobRateLimitStore(connStr, 'rate-limits-it-15')`.

(Use the Edit tool's pattern matching to find each `buildContext` and patch it. Each test file has only one definition.)

- [ ] **Step 3: Failing rate-limit test**

Create `src/api/test/lesson-create.rate-limit.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { lessonCreateHandler } from '../src/functions/lesson-create.js';
import { setContextForTests, type ApiContext } from '../src/context.js';
import {
  InMemoryAudioStorage,
  InMemoryLessonRepository,
  MockLlmEngine,
  MockTtsEngine,
} from '@echolingo/shared';
import type { HttpRequest } from '@azure/functions';
import { lessonParams } from './helpers/fixtures.js';

class CountingRateLimits {
  state = new Map<string, number>();
  async get(ip: string, date: string): Promise<number> {
    return this.state.get(`${ip}|${date}`) ?? 0;
  }
  async increment(ip: string, date: string): Promise<number> {
    const key = `${ip}|${date}`;
    const next = (this.state.get(key) ?? 0) + 1;
    this.state.set(key, next);
    return next;
  }
}

class FakeQueueClient {
  scriptGen: Array<unknown> = [];
  async enqueueScriptGen(job: unknown): Promise<void> {
    this.scriptGen.push(job);
  }
  async enqueueTtsSentence(): Promise<void> {}
  async ensureQueues(): Promise<void> {}
}

function buildContext(limit: number): { ctx: ApiContext; rates: CountingRateLimits } {
  const rates = new CountingRateLimits();
  const queue = new FakeQueueClient();
  const ctx: ApiContext = {
    config: {
      storageConnectionString: 'UseDevelopmentStorage=true',
      lessonsContainer: 'lessons',
      audioContainer: 'audio',
      rateLimitContainer: 'rate-limits',
      scriptGenQueue: 'script-gen',
      ttsSentenceQueue: 'tts-sentence',
      llmEngine: 'mock',
      ttsEngine: 'mock',
      rateLimitPerDay: limit,
    },
    lessons: new InMemoryLessonRepository(),
    audio: new InMemoryAudioStorage(),
    queue: queue as unknown as ApiContext['queue'],
    llm: new MockLlmEngine(),
    tts: new MockTtsEngine(),
    rateLimits: rates,
  };
  return { ctx, rates };
}

function jsonRequest(body: unknown, ip = '1.2.3.4'): HttpRequest {
  return {
    method: 'POST',
    url: 'http://localhost/api/lesson',
    headers: new Headers({
      'content-type': 'application/json',
      'x-forwarded-for': ip,
    }),
    query: new URLSearchParams(),
    params: {},
    user: null,
    body: null,
    bodyUsed: false,
    arrayBuffer: async () => new ArrayBuffer(0),
    blob: async () => new Blob(),
    formData: async () => new FormData(),
    text: async () => JSON.stringify(body),
    json: async () => body,
    clone() {
      return this;
    },
  } as unknown as HttpRequest;
}

describe('POST /api/lesson rate limiting', () => {
  let ctx: ApiContext;

  beforeEach(() => {
    ({ ctx } = buildContext(2));
    setContextForTests(ctx);
  });

  it('counts a new lesson against the IP daily quota', async () => {
    await lessonCreateHandler(jsonRequest(lessonParams({ topic: 'one' })));
    await lessonCreateHandler(jsonRequest(lessonParams({ topic: 'two' })));
    const res = await lessonCreateHandler(jsonRequest(lessonParams({ topic: 'three' })));
    expect(res.status).toBe(429);
    const body = JSON.parse(res.body as string);
    expect(body.limit).toBe(2);
    expect(body.used).toBe(2);
    expect(body.resetAt).toMatch(/T00:00:00Z$/);
  });

  it('cache hits do not consume rate-limit quota', async () => {
    const params = lessonParams({ topic: 'shared' });
    const a = await lessonCreateHandler(jsonRequest(params));
    expect(a.status).toBe(201);
    const b = await lessonCreateHandler(jsonRequest(params)); // cache hit
    expect(b.status).toBe(200);
    // Should still be able to create one more
    const c = await lessonCreateHandler(jsonRequest(lessonParams({ topic: 'fresh' })));
    expect(c.status).toBe(201);
    // Third fresh lesson should be blocked
    const d = await lessonCreateHandler(jsonRequest(lessonParams({ topic: 'fourth' })));
    expect(d.status).toBe(429);
  });

  it('separates counters per IP', async () => {
    await lessonCreateHandler(jsonRequest(lessonParams({ topic: 'a' }), '1.1.1.1'));
    await lessonCreateHandler(jsonRequest(lessonParams({ topic: 'b' }), '1.1.1.1'));
    const blocked = await lessonCreateHandler(
      jsonRequest(lessonParams({ topic: 'c' }), '1.1.1.1'),
    );
    expect(blocked.status).toBe(429);
    const otherIp = await lessonCreateHandler(
      jsonRequest(lessonParams({ topic: 'd' }), '2.2.2.2'),
    );
    expect(otherIp.status).toBe(201);
  });
});
```

- [ ] **Step 4: Run — red**

```bash
npm run test --workspace @echolingo/api
```

- [ ] **Step 5: Implement rate limit enforcement**

Replace `src/api/src/functions/lesson-create.ts` with:

```ts
import { app, type HttpRequest, type HttpResponseInit } from '@azure/functions';
import { isLessonParams, lessonId, type Lesson } from '@echolingo/shared';
import { getContext } from '../context.js';

function clientIp(req: HttpRequest): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]!.trim();
  return 'unknown';
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function tomorrowUtc(): string {
  const t = new Date();
  t.setUTCDate(t.getUTCDate() + 1);
  t.setUTCHours(0, 0, 0, 0);
  return t.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export async function lessonCreateHandler(req: HttpRequest): Promise<HttpResponseInit> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'invalid JSON body' });
  }
  if (!isLessonParams(body)) {
    return json(400, { error: 'invalid LessonParams' });
  }

  const ctx = getContext();
  const id = lessonId(body);

  // Cache-hit fast path (does not consume rate limit)
  const existing = await ctx.lessons.get(id);
  if (existing) {
    return json(200, { id, status: existing.status });
  }

  // Fresh creation — consume rate limit
  const ip = clientIp(req);
  const date = today();
  const limit = ctx.config.rateLimitPerDay;
  const used = await ctx.rateLimits.get(ip, date);
  if (used >= limit) {
    return json(429, { limit, used, resetAt: tomorrowUtc() });
  }
  await ctx.rateLimits.increment(ip, date);

  const now = new Date().toISOString();
  const fresh: Lesson = {
    id,
    params: body,
    status: 'generating_script',
    createdAt: now,
    updatedAt: now,
    totalSentences: 0,
    readySentences: 0,
    sentences: [],
  };

  const persisted = await ctx.lessons.createIfAbsent(fresh);
  const wasFresh = persisted.createdAt === fresh.createdAt;
  if (wasFresh) {
    await ctx.queue.enqueueScriptGen({ type: 'scriptGen', lessonId: id });
    return json(201, { id, status: persisted.status });
  }
  // Lost the race — someone else created the same lesson between our get and createIfAbsent.
  // Treat as a cache hit; we already consumed a slot. Acceptable tradeoff for v1.
  return json(200, { id, status: persisted.status });
}

function json(status: number, body: unknown): HttpResponseInit {
  return {
    status,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}

app.http('lessonCreate', {
  route: 'lesson',
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: lessonCreateHandler,
});
```

- [ ] **Step 6: Run — green**

```bash
npm run test --workspace @echolingo/api
```

If existing tests fail because they didn't update the context shape, fix them per Step 2.

- [ ] **Step 7: Commit**

```bash
git add src/api/src/functions/lesson-create.ts src/api/test/lesson-create.rate-limit.test.ts src/api/test/*.test.ts
git commit -m "feat(api): per-IP daily rate limit on POST /api/lesson"
```

---

## Task 9: Application Insights telemetry

**Files:**
- Create: `src/api/src/lib/telemetry.ts`
- Create: `src/api/test/telemetry.test.ts`
- Modify: `src/api/package.json` (add `applicationinsights` dep)
- Modify: `src/api/src/functions/lesson-create.ts` (emit `lesson.created` / `lesson.cache_hit` / `lesson.rate_limited`)
- Modify: `src/api/src/functions/worker-script-gen.ts` (emit `lesson.script_ready` / `lesson.failed`)
- Modify: `src/api/src/functions/worker-tts-sentence.ts` (emit `lesson.audio_ready` when last sentence completes)

Telemetry is a side effect: we want to emit named events with custom dimensions. App Insights init is environment-driven — if `APPLICATIONINSIGHTS_CONNECTION_STRING` is unset, emit is a no-op (logs only in dev). Tests inject a recording `EventEmitter` fake to assert call shapes.

- [ ] **Step 1: Add dependency**

Edit `src/api/package.json` `dependencies`:

```json
{
  "dependencies": {
    "@azure/functions": "^4.5.1",
    "@azure/storage-blob": "^12.25.0",
    "@azure/storage-queue": "^12.24.0",
    "@echolingo/shared": "*",
    "applicationinsights": "^3.4.0",
    "openai": "^4.68.0"
  }
}
```

```bash
npm install
```

- [ ] **Step 2: Failing test**

Create `src/api/test/telemetry.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { createTelemetry, type TelemetryEvent } from '../src/lib/telemetry.js';

describe('createTelemetry', () => {
  it('returns a no-op emitter when no connection string is provided', () => {
    const t = createTelemetry({ connectionString: undefined });
    expect(() =>
      t.emit({ name: 'lesson.created', properties: { lessonId: 'abc' } }),
    ).not.toThrow();
    expect(t.events).toBeUndefined();
  });

  it('records events when given a recording sink', () => {
    const recorded: TelemetryEvent[] = [];
    const t = createTelemetry({
      connectionString: 'InstrumentationKey=test',
      sink: (e) => recorded.push(e),
    });
    t.emit({ name: 'lesson.created', properties: { lessonId: 'abc', engine: 'openai' } });
    t.emit({ name: 'lesson.failed', properties: { lessonId: 'abc', error: 'boom' } });
    expect(recorded).toHaveLength(2);
    expect(recorded[0]).toEqual({
      name: 'lesson.created',
      properties: { lessonId: 'abc', engine: 'openai' },
    });
  });
});
```

- [ ] **Step 3: Run — red**

```bash
npm run test --workspace @echolingo/api
```

- [ ] **Step 4: Implement**

Create `src/api/src/lib/telemetry.ts`:

```ts
import appInsights from 'applicationinsights';

export interface TelemetryEvent {
  name:
    | 'lesson.created'
    | 'lesson.cache_hit'
    | 'lesson.rate_limited'
    | 'lesson.script_ready'
    | 'lesson.audio_ready'
    | 'lesson.failed'
    | 'lesson.downloaded';
  properties?: Record<string, string | number | undefined>;
}

export interface TelemetryOptions {
  connectionString: string | undefined;
  sink?: (event: TelemetryEvent) => void;
}

export interface Telemetry {
  emit(event: TelemetryEvent): void;
}

let initialized = false;

export function createTelemetry(opts: TelemetryOptions): Telemetry {
  if (opts.sink) {
    return { emit: (e) => opts.sink!(e) };
  }
  if (!opts.connectionString) {
    return { emit: () => {} };
  }
  if (!initialized) {
    appInsights
      .setup(opts.connectionString)
      .setSendLiveMetrics(false)
      .start();
    initialized = true;
  }
  return {
    emit: (event) => {
      appInsights.defaultClient.trackEvent({
        name: event.name,
        properties: event.properties as Record<string, string>,
      });
    },
  };
}
```

- [ ] **Step 5: Wire into context**

Edit `src/api/src/context.ts` — add `telemetry: Telemetry` to `ApiContext`, build it in `getContext()`:

```ts
import { createTelemetry, type Telemetry } from './lib/telemetry.js';

// ... existing imports ...

export interface ApiContext {
  config: Config;
  lessons: LessonRepository;
  audio: AudioStorage;
  queue: QueueClient;
  llm: LlmEngine;
  tts: TtsEngine;
  rateLimits: RateLimitStore;
  telemetry: Telemetry;
}

// In getContext():
cached = {
  // ... existing fields ...
  rateLimits: new BlobRateLimitStore(config.storageConnectionString, config.rateLimitContainer),
  telemetry: createTelemetry({ connectionString: config.appInsightsConnectionString }),
};
```

- [ ] **Step 6: Emit from handlers**

Edit `src/api/src/functions/lesson-create.ts` — after each terminal branch:

```ts
// Before returning the cache-hit 200:
ctx.telemetry.emit({ name: 'lesson.cache_hit', properties: { lessonId: id } });

// Before returning the 429:
ctx.telemetry.emit({ name: 'lesson.rate_limited', properties: { ip, used, limit } });

// After the enqueue, before returning 201:
ctx.telemetry.emit({
  name: 'lesson.created',
  properties: { lessonId: id, llmEngine: ctx.config.llmEngine, ttsEngine: ctx.config.ttsEngine },
});
```

Edit `src/api/src/functions/worker-script-gen.ts` — emit on success and failure:

```ts
// After the successful update + fan-out:
ctx.telemetry.emit({
  name: 'lesson.script_ready',
  properties: { lessonId: job.lessonId, totalSentences: sentences.length },
});

// Inside the catch, after marking failed and before rethrow:
ctx.telemetry.emit({
  name: 'lesson.failed',
  properties: { lessonId: job.lessonId, stage: 'script_gen', error: message },
});
```

Edit `src/api/src/functions/worker-tts-sentence.ts` — emit when the final sentence transitions the lesson to `ready`:

```ts
// After the update, if status flipped to ready:
const lessonAfter = await ctx.lessons.get(job.lessonId);
if (lessonAfter?.status === 'ready') {
  ctx.telemetry.emit({
    name: 'lesson.audio_ready',
    properties: { lessonId: job.lessonId, totalSentences: lessonAfter.totalSentences },
  });
}
```

- [ ] **Step 7: Update test contexts to include a no-op telemetry**

In each test file with a `buildContext()` (`lesson-create.test.ts`, `lesson-get.test.ts`, `worker-script-gen.test.ts`, `worker-tts-sentence.test.ts`, `lesson-create.rate-limit.test.ts`, `pipeline.int.test.ts`), add to the returned context:

```ts
telemetry: { emit: () => {} },
```

- [ ] **Step 8: Run — green**

```bash
npm run test --workspace @echolingo/api
```

- [ ] **Step 9: Commit**

```bash
git add src/api/src/lib/telemetry.ts src/api/src/context.ts src/api/src/functions src/api/test/telemetry.test.ts src/api/test/*.test.ts src/api/package.json package-lock.json
git commit -m "feat(api): wire Application Insights telemetry events"
```

---

## Task 10: Offline download endpoint

**Files:**
- Create: `src/api/src/lib/concat-mp3.ts`
- Create: `src/api/src/functions/lesson-download.ts`
- Create: `src/api/test/lesson-download.int.test.ts`
- Modify: `src/api/src/index.ts`

Downloads concatenate ready sentence audio chunks (respecting mode + bilingualOrder) into a single MP3 stored at `lessons/{id}/full.mp3`. Once written, subsequent requests return its signed URL directly (cached via `lesson.fullMp3Url`).

For OpenAI's constant-bitrate `tts-1` output, raw `Buffer.concat` produces a playable MP3 in modern browsers and iOS Safari. ElevenLabs output is also CBR MP3 at 44.1 kHz mono. Frame-aware concatenation (skipping ID3 headers, aligning frame boundaries) is a later hardening if we observe playback glitches.

- [ ] **Step 1: Failing test for the concat helper**

Create `src/api/test/concat-mp3.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { concatMp3 } from '../src/lib/concat-mp3.js';

describe('concatMp3', () => {
  it('concatenates buffers in order', () => {
    const result = concatMp3([Buffer.from('aaa'), Buffer.from('bbb'), Buffer.from('cc')]);
    expect(result.toString('utf-8')).toBe('aaabbbcc');
    expect(result.length).toBe(8);
  });

  it('returns an empty buffer for an empty input array', () => {
    expect(concatMp3([]).length).toBe(0);
  });

  it('skips null entries', () => {
    const result = concatMp3([Buffer.from('a'), null, Buffer.from('b')]);
    expect(result.toString('utf-8')).toBe('ab');
  });
});
```

- [ ] **Step 2: Run — red**

```bash
npm run test --workspace @echolingo/api
```

- [ ] **Step 3: Implement the helper**

Create `src/api/src/lib/concat-mp3.ts`:

```ts
export function concatMp3(parts: Array<Buffer | null>): Buffer {
  const filtered = parts.filter((p): p is Buffer => p != null);
  return filtered.length === 0 ? Buffer.alloc(0) : Buffer.concat(filtered);
}
```

- [ ] **Step 4: Failing integration test for the endpoint**

Create `src/api/test/lesson-download.int.test.ts`:

```ts
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import {
  MockLlmEngine,
  MockTtsEngine,
  lessonId,
} from '@echolingo/shared';
import { BlobLessonRepository } from '../src/storage/blob-lesson-repository.js';
import { BlobAudioStorage } from '../src/storage/blob-audio-storage.js';
import { QueueClient } from '../src/queue/queue-client.js';
import { setContextForTests, type ApiContext } from '../src/context.js';
import { lessonCreateHandler } from '../src/functions/lesson-create.js';
import { lessonGetHandler } from '../src/functions/lesson-get.js';
import { lessonDownloadHandler } from '../src/functions/lesson-download.js';
import { scriptGenWorker } from '../src/functions/worker-script-gen.js';
import { ttsSentenceWorker } from '../src/functions/worker-tts-sentence.js';
import { AZURITE_CONNECTION_STRING, isAzuriteReachable } from './helpers/azurite.js';
import { resetContainer, resetQueue } from './helpers/containers.js';
import { lessonParams } from './helpers/fixtures.js';
import type { HttpRequest } from '@azure/functions';
import { BlobRateLimitStore } from '../src/storage/blob-rate-limit-store.js';

const LESSONS = 'lessons-download-it';
const AUDIO = 'audio-download-it';
const SCRIPT_Q = 'script-gen-download-it';
const TTS_Q = 'tts-sentence-download-it';
const RATES = 'rate-limits-download-it';

function postRequest(body: unknown): HttpRequest {
  return {
    method: 'POST',
    url: 'http://localhost/api/lesson',
    headers: new Headers({ 'content-type': 'application/json', 'x-forwarded-for': '1.1.1.1' }),
    query: new URLSearchParams(),
    params: {},
    user: null,
    body: null,
    bodyUsed: false,
    arrayBuffer: async () => new ArrayBuffer(0),
    blob: async () => new Blob(),
    formData: async () => new FormData(),
    text: async () => JSON.stringify(body),
    json: async () => body,
    clone() { return this; },
  } as unknown as HttpRequest;
}

function downloadRequest(id: string): HttpRequest {
  return {
    method: 'POST',
    url: `http://localhost/api/lesson/${id}/download`,
    headers: new Headers(),
    query: new URLSearchParams(),
    params: { id },
    user: null,
    body: null,
    bodyUsed: false,
    arrayBuffer: async () => new ArrayBuffer(0),
    blob: async () => new Blob(),
    formData: async () => new FormData(),
    text: async () => '',
    json: async () => null,
    clone() { return this; },
  } as unknown as HttpRequest;
}

describe('POST /api/lesson/{id}/download (integration)', () => {
  let connStr: string | null = null;

  beforeAll(async () => {
    if (await isAzuriteReachable()) connStr = AZURITE_CONNECTION_STRING;
  });

  beforeEach(async () => {
    if (!connStr) return;
    await Promise.all([
      resetContainer(connStr, LESSONS),
      resetContainer(connStr, AUDIO),
      resetContainer(connStr, RATES),
      resetQueue(connStr, SCRIPT_Q),
      resetQueue(connStr, TTS_Q),
    ]);
    const ctx: ApiContext = {
      config: {
        storageConnectionString: connStr,
        lessonsContainer: LESSONS,
        audioContainer: AUDIO,
        rateLimitContainer: RATES,
        scriptGenQueue: SCRIPT_Q,
        ttsSentenceQueue: TTS_Q,
        llmEngine: 'mock',
        ttsEngine: 'mock',
        rateLimitPerDay: 100,
      },
      lessons: new BlobLessonRepository(connStr, LESSONS),
      audio: new BlobAudioStorage(connStr, AUDIO),
      queue: new QueueClient(connStr, SCRIPT_Q, TTS_Q),
      llm: new MockLlmEngine({
        script: 'Καλημέρα.||Good morning.\nΓεια σου.||Hello.',
      }),
      tts: new MockTtsEngine(),
      rateLimits: new BlobRateLimitStore(connStr, RATES),
      telemetry: { emit: () => {} },
    };
    setContextForTests(ctx);
  });

  async function makeReadyLesson(): Promise<string> {
    const createRes = await lessonCreateHandler(postRequest(lessonParams()));
    const { id } = JSON.parse(createRes.body as string);
    await scriptGenWorker({ type: 'scriptGen', lessonId: id });
    const lesson = await lessonGetHandler(downloadRequest(id)).then(async (r) =>
      JSON.parse((r.body as string)),
    );
    for (const s of lesson.sentences) {
      await ttsSentenceWorker({ type: 'ttsSentence', lessonId: id, sentenceIndex: s.i });
    }
    return id;
  }

  it('returns 404 for unknown lesson', async (ctx) => {
    if (!connStr) ctx.skip();
    const res = await lessonDownloadHandler(downloadRequest('does-not-exist'));
    expect(res.status).toBe(404);
  });

  it('returns 409 when lesson is not ready', async (ctx) => {
    if (!connStr) ctx.skip();
    const createRes = await lessonCreateHandler(postRequest(lessonParams()));
    const { id } = JSON.parse(createRes.body as string);
    const res = await lessonDownloadHandler(downloadRequest(id));
    expect(res.status).toBe(409);
  });

  it('returns 200 with a full mp3 URL once the lesson is ready', async (ctx) => {
    if (!connStr) ctx.skip();
    const id = await makeReadyLesson();
    const res = await lessonDownloadHandler(downloadRequest(id));
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body as string);
    expect(body.url).toMatch(/\/audio-download-it\/.+\/full\.mp3$/);
  });

  it('is idempotent — second download call returns the cached fullMp3Url', async (ctx) => {
    if (!connStr) ctx.skip();
    const id = await makeReadyLesson();
    const first = JSON.parse((await lessonDownloadHandler(downloadRequest(id))).body as string);
    const second = JSON.parse((await lessonDownloadHandler(downloadRequest(id))).body as string);
    expect(second.url).toBe(first.url);
  });
});
```

- [ ] **Step 5: Run — red**

```bash
npm run test --workspace @echolingo/api
```

- [ ] **Step 6: Implement the handler**

Create `src/api/src/functions/lesson-download.ts`:

```ts
import { app, type HttpRequest, type HttpResponseInit } from '@azure/functions';
import { getContext } from '../context.js';
import { concatMp3 } from '../lib/concat-mp3.js';
import { BlobServiceClient } from '@azure/storage-blob';

const FULL_BLOB_NAME = 'full.mp3';

export async function lessonDownloadHandler(req: HttpRequest): Promise<HttpResponseInit> {
  const id = req.params.id;
  if (!id) return json(400, { error: 'missing id' });
  const ctx = getContext();
  const lesson = await ctx.lessons.get(id);
  if (!lesson) return json(404, { error: 'lesson not found' });
  if (lesson.status !== 'ready') {
    return json(409, { error: `lesson is ${lesson.status}, not ready` });
  }

  if (lesson.fullMp3Url) {
    return json(200, { url: lesson.fullMp3Url });
  }

  // Build the playback order based on params
  const order = lesson.params.bilingualOrder; // gr_first | native_first
  const mode = lesson.params.mode;
  const parts: Array<Buffer | null> = [];
  for (const sentence of lesson.sentences) {
    const gr = await ctx.audio.fetch(id, sentence.i, 'gr');
    const native =
      mode === 'bilingual' ? await ctx.audio.fetch(id, sentence.i, 'native') : null;
    if (mode === 'greek_only') {
      parts.push(gr);
    } else if (order === 'gr_first') {
      parts.push(gr, native);
    } else {
      parts.push(native, gr);
    }
  }

  const fullMp3 = concatMp3(parts);
  const fullUrl = await uploadFullBlob(ctx.config.storageConnectionString, ctx.config.audioContainer, id, fullMp3);
  await ctx.lessons.update(id, (l) => ({ ...l, fullMp3Url: fullUrl, updatedAt: new Date().toISOString() }));
  ctx.telemetry.emit({
    name: 'lesson.downloaded',
    properties: { lessonId: id, bytes: fullMp3.length },
  });
  return json(200, { url: fullUrl });
}

async function uploadFullBlob(
  connStr: string,
  container: string,
  lessonId: string,
  data: Buffer,
): Promise<string> {
  const service = BlobServiceClient.fromConnectionString(connStr);
  const containerClient = service.getContainerClient(container);
  await containerClient.createIfNotExists();
  const blob = containerClient.getBlockBlobClient(`${lessonId}/${FULL_BLOB_NAME}`);
  await blob.upload(data, data.length, {
    blobHTTPHeaders: { blobContentType: 'audio/mpeg' },
  });
  return `${service.url}/${container}/${lessonId}/${FULL_BLOB_NAME}`;
}

function json(status: number, body: unknown): HttpResponseInit {
  return {
    status,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}

app.http('lessonDownload', {
  route: 'lesson/{id}/download',
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: lessonDownloadHandler,
});
```

- [ ] **Step 7: Register**

Edit `src/api/src/index.ts`:

```ts
import './functions/health.js';
import './functions/lesson-create.js';
import './functions/lesson-get.js';
import './functions/lesson-download.js';
import './functions/worker-script-gen.js';
import './functions/worker-tts-sentence.js';
```

- [ ] **Step 8: Run — green**

```bash
npm run test --workspace @echolingo/api
```

- [ ] **Step 9: Commit**

```bash
git add src/api/src/lib/concat-mp3.ts src/api/src/functions/lesson-download.ts src/api/test/concat-mp3.test.ts src/api/test/lesson-download.int.test.ts src/api/src/index.ts
git commit -m "feat(api): POST /api/lesson/{id}/download with cached full mp3 concat"
```

---

## Task 11: README + `local.settings.json.example`

**Files:**
- Modify: `src/api/local.settings.json.example`
- Modify: `README.md`

- [ ] **Step 1: Update `local.settings.json.example`**

Replace `src/api/local.settings.json.example` with:

```json
{
  "IsEncrypted": false,
  "Values": {
    "AzureWebJobsStorage": "UseDevelopmentStorage=true",
    "FUNCTIONS_WORKER_RUNTIME": "node",
    "FUNCTIONS_EXTENSION_VERSION": "~4",
    "AzureWebJobsFeatureFlags": "EnableWorkerIndexing",

    "LLM_ENGINE": "openai",
    "OPENAI_API_KEY": "sk-...",
    "OPENAI_LLM_MODEL": "gpt-4o-mini",

    "TTS_ENGINE": "openai",
    "OPENAI_TTS_MODEL": "tts-1",

    "ELEVENLABS_API_KEY": "",
    "ELEVENLABS_VOICE_EL": "",
    "ELEVENLABS_VOICE_EN": "",
    "ELEVENLABS_VOICE_RU": "",

    "RATE_LIMIT_PER_DAY": "20",

    "APPLICATIONINSIGHTS_CONNECTION_STRING": ""
  }
}
```

- [ ] **Step 2: Append a section to `README.md`**

Add this section before `## Status`:

```markdown
## Real provider configuration (Plan 4)

The API supports three engines per role; selection is via env. Defaults: mocks when no keys are set, OpenAI when `OPENAI_API_KEY` is present.

| Env var | Purpose | Example |
|---|---|---|
| `LLM_ENGINE` | `mock` \| `openai` | `openai` |
| `OPENAI_API_KEY` | OpenAI key (LLM + TTS) | `sk-...` |
| `OPENAI_LLM_MODEL` | Chat model | `gpt-4o-mini` |
| `OPENAI_TTS_MODEL` | TTS model | `tts-1` |
| `TTS_ENGINE` | `mock` \| `openai` \| `elevenlabs` | `openai` |
| `ELEVENLABS_API_KEY` | ElevenLabs key (required if `TTS_ENGINE=elevenlabs`) | |
| `ELEVENLABS_VOICE_EL`, `ELEVENLABS_VOICE_EN`, `ELEVENLABS_VOICE_RU` | ElevenLabs voice IDs per language | |
| `RATE_LIMIT_PER_DAY` | Max fresh lessons per IP per day | `20` |
| `APPLICATIONINSIGHTS_CONNECTION_STRING` | Optional — emits named events when set | |

Copy `src/api/local.settings.json.example` to `src/api/local.settings.json`, fill in your keys, and `npm run dev:api`.

### Rate limiting

Per-IP daily quota enforced on `POST /api/lesson`. Cache hits (deterministic id → existing lesson) do **not** consume quota. On exceed: `429 { limit, used, resetAt }`. Resets at UTC midnight.

### Offline download

`POST /api/lesson/{id}/download` returns `{ url }` pointing at a concatenated MP3 of the full lesson (respecting `mode` + `bilingualOrder`). Cached after first build via `lesson.fullMp3Url`.
```

- [ ] **Step 3: Commit**

```bash
git add src/api/local.settings.json.example README.md
git commit -m "docs: real-provider env vars, rate limit, and download endpoint"
```

---

## Final verification

- [ ] **Step 1: All tests green**

Start Azurite in one terminal:

```bash
npm run azurite
```

In another terminal:

```bash
npm run lint
npm run test
npm run build --workspace @echolingo/web
```

Expected: every step exits 0; 0 skipped tests.

- [ ] **Step 2: Manual end-to-end with real OpenAI (optional)**

If you have an `OPENAI_API_KEY`:

```bash
cp src/api/local.settings.json.example src/api/local.settings.json
# Edit local.settings.json — paste your key into OPENAI_API_KEY
npm run dev:api    # in terminal 3
```

Then:

```bash
curl -X POST http://localhost:7071/api/lesson \
  -H 'content-type: application/json' \
  -d '{"topic":"at the bakery","lengthMin":5,"level":3,"style":"dialogue","mode":"bilingual","bilingualOrder":"gr_first","nativeLang":"en","ttsEngine":"openai"}'
```

Note the returned `id`. Poll:

```bash
curl http://localhost:7071/api/lesson/<id>
```

Once `status:"ready"`:

```bash
curl -X POST http://localhost:7071/api/lesson/<id>/download
# returns { url: ".../full.mp3" } — open in a browser or `curl -o lesson.mp3 <url>`
```

You should hear a 5–10 min bilingual Greek lesson on the topic.

- [ ] **Step 3: Push**

```bash
git push origin dev
```

CI will run with mocks (no keys configured in CI). The mock pipeline + integration tests verify correctness without burning provider credits.

---

## What Plan 4 does NOT include (handed off)

- Google TTS adapter — deferred; OpenAI + ElevenLabs cover MVP.
- Frame-aware MP3 concatenation (skip ID3, align frames) — start with raw `Buffer.concat`; harden if iOS Safari or Android playback glitches appear.
- Real Bicep modules + `azd up` for Azure provisioning + deploy — **Plan 5**.
- Web PubSub realtime — client still polls `GET /api/lesson/{id}` until Plan 5.
- Frontend PWA — **Plan 3** (deferred until backend is real).
- Application Insights dashboards and alerting — events are emitted; visualization is a deploy-time setup.
