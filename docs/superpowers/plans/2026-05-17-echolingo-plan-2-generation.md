# Echolingo — Plan 2: Generation Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire up the full lesson-generation pipeline against Azurite using mock LLM + TTS engines. A `POST /api/lesson` returns a deterministic id immediately, a script-gen worker writes a transcript, a fan-out of tts-sentence workers writes audio chunks, and `GET /api/lesson/:id` reports state and URLs. End-to-end integration test proves the loop.

**Architecture:** Layered: shared package owns interfaces (`LlmEngine`, `LessonRepository`, `AudioStorage`, job types) plus pure in-memory implementations used in unit tests. The api package owns Azure-backed implementations (`BlobLessonRepository`, `BlobAudioStorage`, `QueueClient`) plus HTTP endpoints and queue-triggered workers. Azure Functions v4 programmatic model registers handlers. Azurite provides Blob + Queue locally; same code targets real Azure Storage in production with only the connection string changing.

**Tech Stack:** Plan 1 stack + `@azure/storage-blob`, `@azure/storage-queue` (in api workspace). Tests: vitest with a tiny Azurite helper that pings the emulator and skips integration tests if unavailable. No new build tooling.

---

## File structure produced by this plan

```
src/
├── shared/
│   ├── src/
│   │   ├── llm/
│   │   │   ├── interface.ts            # LlmEngine
│   │   │   └── mock-engine.ts          # MockLlmEngine
│   │   ├── storage/
│   │   │   ├── lesson-repository.ts    # LessonRepository interface
│   │   │   ├── in-memory-lesson-repository.ts
│   │   │   ├── audio-storage.ts        # AudioStorage interface
│   │   │   └── in-memory-audio-storage.ts
│   │   ├── jobs.ts                     # ScriptGenJob, TtsSentenceJob discriminated unions
│   │   └── index.ts                    # barrel (updated)
│   └── test/
│       ├── mock-llm-engine.test.ts
│       ├── in-memory-lesson-repository.test.ts
│       └── in-memory-audio-storage.test.ts
└── api/
    ├── src/
    │   ├── config.ts                   # env-driven config + names of containers/queues
    │   ├── context.ts                  # composition root: builds the engines/repos used by handlers
    │   ├── storage/
    │   │   ├── blob-lesson-repository.ts
    │   │   └── blob-audio-storage.ts
    │   ├── queue/
    │   │   └── queue-client.ts         # wraps @azure/storage-queue
    │   ├── functions/
    │   │   ├── health.ts               # (existing)
    │   │   ├── lesson-create.ts        # POST /api/lesson
    │   │   ├── lesson-get.ts           # GET  /api/lesson/{id}
    │   │   ├── worker-script-gen.ts    # queue trigger: script-gen
    │   │   └── worker-tts-sentence.ts  # queue trigger: tts-sentence
    │   └── index.ts                    # registers all functions
    └── test/
        ├── helpers/
        │   ├── azurite.ts              # pings Azurite; provides connStr or skips test
        │   ├── containers.ts           # ensure-empty container + queue helpers
        │   └── fixtures.ts             # build a LessonParams fixture
        ├── health.test.ts              # (existing)
        ├── blob-lesson-repository.int.test.ts
        ├── blob-audio-storage.int.test.ts
        ├── queue-client.int.test.ts
        ├── lesson-create.test.ts
        ├── lesson-get.test.ts
        ├── worker-script-gen.test.ts
        ├── worker-tts-sentence.test.ts
        └── pipeline.int.test.ts        # end-to-end against Azurite
```

`*.int.test.ts` files are integration tests that require Azurite running. The Azurite helper skips them gracefully if the emulator is not reachable; CI starts Azurite before the test step. `*.test.ts` files are pure unit tests with no external deps.

---

## Conventions used in this plan

- All imports between files in the api package use the `.js` extension (Node16 module resolution).
- All imports from `@echolingo/shared` use the package name (`import { Lesson } from '@echolingo/shared';`), not relative paths.
- TDD discipline: write the test, run to see it fail, write the minimum code, run to see it pass, commit.
- Each task is one commit. Use the exact commit message in step "Commit".
- "Run tests" always means `npm run test --workspace @echolingo/api` or `--workspace @echolingo/shared` as appropriate.

---

## Task 1: `LlmEngine` interface + `MockLlmEngine`

**Files:**
- Create: `src/shared/src/llm/interface.ts`
- Create: `src/shared/src/llm/mock-engine.ts`
- Create: `src/shared/test/mock-llm-engine.test.ts`
- Modify: `src/shared/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `src/shared/test/mock-llm-engine.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { MockLlmEngine } from '../src/llm/mock-engine.js';
import { buildPrompt } from '../src/prompts.js';
import type { LessonParams } from '../src/types.js';

const params: LessonParams = {
  topic: 'at the bakery',
  lengthMin: 5,
  level: 3,
  style: 'dialogue',
  mode: 'bilingual',
  bilingualOrder: 'gr_first',
  nativeLang: 'en',
  ttsEngine: 'openai',
};

describe('MockLlmEngine', () => {
  it('reports its name as "mock"', () => {
    expect(new MockLlmEngine().name).toBe('mock');
  });

  it('returns a non-empty raw script in GR||NATIVE format', async () => {
    const engine = new MockLlmEngine();
    const raw = await engine.generateScript(buildPrompt(params));
    expect(raw.length).toBeGreaterThan(0);
    for (const line of raw.split('\n').filter((l) => l.trim().length > 0)) {
      expect(line).toContain('||');
    }
  });

  it('is deterministic for the same prompt', async () => {
    const engine = new MockLlmEngine();
    const p = buildPrompt(params);
    const a = await engine.generateScript(p);
    const b = await engine.generateScript(p);
    expect(a).toBe(b);
  });

  it('honors a script override passed in the constructor', async () => {
    const override = 'Καλημέρα.||Good morning.';
    const engine = new MockLlmEngine({ script: override });
    expect(await engine.generateScript(buildPrompt(params))).toBe(override);
  });
});
```

- [ ] **Step 2: Run test — verify red**

```bash
npm run test --workspace @echolingo/shared
```

Expected: FAIL, "Cannot find module '../src/llm/mock-engine.js'".

- [ ] **Step 3: Implement the interface**

Create `src/shared/src/llm/interface.ts`:

```ts
import type { BuiltPrompt } from '../prompts.js';

export interface LlmEngine {
  readonly name: 'mock' | 'openai';
  generateScript(prompt: BuiltPrompt): Promise<string>;
}
```

- [ ] **Step 4: Implement the mock**

Create `src/shared/src/llm/mock-engine.ts`:

```ts
import type { BuiltPrompt } from '../prompts.js';
import type { LlmEngine } from './interface.js';

const DEFAULT_SCRIPT = [
  'Καλημέρα.||Good morning.',
  'Σήμερα μιλάμε για ένα νέο θέμα.||Today we talk about a new topic.',
  'Πώς είσαι;||How are you?',
  'Είμαι πολύ καλά, ευχαριστώ.||I am very well, thank you.',
  'Τι κάνεις σήμερα;||What are you doing today?',
].join('\n');

export interface MockLlmEngineOptions {
  script?: string;
}

export class MockLlmEngine implements LlmEngine {
  readonly name = 'mock' as const;

  constructor(private readonly options: MockLlmEngineOptions = {}) {}

  async generateScript(_prompt: BuiltPrompt): Promise<string> {
    return this.options.script ?? DEFAULT_SCRIPT;
  }
}
```

- [ ] **Step 5: Update barrel**

Replace `src/shared/src/index.ts` with:

```ts
export { canonicalize } from './canonicalize.js';
export { lessonId } from './lesson-id.js';
export { buildPrompt } from './prompts.js';
export type { BuiltPrompt } from './prompts.js';
export { parseScript } from './parse-script.js';
export type {
  TtsEngine,
  TtsLang,
  TtsSynthesizeRequest,
  TtsSynthesizeResult,
} from './tts/interface.js';
export { MockTtsEngine } from './tts/mock-engine.js';
export type { LlmEngine } from './llm/interface.js';
export { MockLlmEngine } from './llm/mock-engine.js';
export type { MockLlmEngineOptions } from './llm/mock-engine.js';
export * from './types.js';
```

- [ ] **Step 6: Run tests — verify green**

```bash
npm run test --workspace @echolingo/shared
```

Expected: PASS, 4 new tests.

- [ ] **Step 7: Commit**

```bash
git add src/shared/src/llm src/shared/test/mock-llm-engine.test.ts src/shared/src/index.ts
git commit -m "feat(shared): add LlmEngine interface and MockLlmEngine"
```

---

## Task 2: Domain job types

**Files:**
- Create: `src/shared/src/jobs.ts`
- Modify: `src/shared/src/index.ts`

No tests — types only.

- [ ] **Step 1: Create the types**

Create `src/shared/src/jobs.ts`:

```ts
export interface ScriptGenJob {
  type: 'scriptGen';
  lessonId: string;
}

export interface TtsSentenceJob {
  type: 'ttsSentence';
  lessonId: string;
  sentenceIndex: number;
}

export type Job = ScriptGenJob | TtsSentenceJob;
```

- [ ] **Step 2: Update barrel**

Append to `src/shared/src/index.ts` (before `export * from './types.js';`):

```ts
export type { ScriptGenJob, TtsSentenceJob, Job } from './jobs.js';
```

- [ ] **Step 3: Verify typecheck**

```bash
npm run typecheck --workspace @echolingo/shared
```

Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/shared/src/jobs.ts src/shared/src/index.ts
git commit -m "feat(shared): add job discriminated unions for queue messages"
```

---

## Task 3: `LessonRepository` interface + `InMemoryLessonRepository`

**Files:**
- Create: `src/shared/src/storage/lesson-repository.ts`
- Create: `src/shared/src/storage/in-memory-lesson-repository.ts`
- Create: `src/shared/test/in-memory-lesson-repository.test.ts`
- Modify: `src/shared/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `src/shared/test/in-memory-lesson-repository.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { InMemoryLessonRepository } from '../src/storage/in-memory-lesson-repository.js';
import type { Lesson } from '../src/types.js';

function lesson(id: string): Lesson {
  return {
    id,
    params: {
      topic: 'at the bakery',
      lengthMin: 5,
      level: 3,
      style: 'dialogue',
      mode: 'bilingual',
      bilingualOrder: 'gr_first',
      nativeLang: 'en',
      ttsEngine: 'openai',
    },
    status: 'generating_script',
    createdAt: '2026-05-17T00:00:00Z',
    updatedAt: '2026-05-17T00:00:00Z',
    totalSentences: 0,
    readySentences: 0,
    sentences: [],
  };
}

describe('InMemoryLessonRepository', () => {
  it('returns null for an unknown id', async () => {
    const repo = new InMemoryLessonRepository();
    expect(await repo.get('missing')).toBeNull();
  });

  it('createIfAbsent stores a new lesson and returns it', async () => {
    const repo = new InMemoryLessonRepository();
    const l = lesson('abc');
    const stored = await repo.createIfAbsent(l);
    expect(stored).toEqual(l);
    expect(await repo.get('abc')).toEqual(l);
  });

  it('createIfAbsent returns the existing lesson without overwriting', async () => {
    const repo = new InMemoryLessonRepository();
    const first = lesson('abc');
    await repo.createIfAbsent(first);
    const second = { ...first, status: 'ready' as const };
    const result = await repo.createIfAbsent(second);
    expect(result).toEqual(first);
    expect((await repo.get('abc'))?.status).toBe('generating_script');
  });

  it('update applies a mutator and persists the result', async () => {
    const repo = new InMemoryLessonRepository();
    await repo.createIfAbsent(lesson('abc'));
    const updated = await repo.update('abc', (l) => ({ ...l, status: 'ready' }));
    expect(updated.status).toBe('ready');
    expect((await repo.get('abc'))?.status).toBe('ready');
  });

  it('update throws when the lesson does not exist', async () => {
    const repo = new InMemoryLessonRepository();
    await expect(repo.update('missing', (l) => l)).rejects.toThrow(/not found/i);
  });

  it('update is isolated — mutator must not mutate the input', async () => {
    const repo = new InMemoryLessonRepository();
    await repo.createIfAbsent(lesson('abc'));
    await repo.update('abc', (l) => {
      // simulate a buggy mutator that mutates the input
      (l as { status: string }).status = 'failed';
      return l;
    });
    // get must still reflect the (mutated) value, but a fresh get after update
    // should not see any mutation that wasn't returned by the mutator.
    const got = await repo.get('abc');
    expect(got?.status).toBe('failed');
  });
});
```

- [ ] **Step 2: Run test — red**

```bash
npm run test --workspace @echolingo/shared
```

Expected: FAIL, "Cannot find module".

- [ ] **Step 3: Implement the interface**

Create `src/shared/src/storage/lesson-repository.ts`:

```ts
import type { Lesson } from '../types.js';

export interface LessonRepository {
  get(id: string): Promise<Lesson | null>;
  createIfAbsent(lesson: Lesson): Promise<Lesson>;
  update(id: string, mutator: (lesson: Lesson) => Lesson): Promise<Lesson>;
}
```

- [ ] **Step 4: Implement the in-memory store**

Create `src/shared/src/storage/in-memory-lesson-repository.ts`:

```ts
import type { Lesson } from '../types.js';
import type { LessonRepository } from './lesson-repository.js';

export class InMemoryLessonRepository implements LessonRepository {
  private readonly map = new Map<string, Lesson>();

  async get(id: string): Promise<Lesson | null> {
    const found = this.map.get(id);
    return found ? structuredClone(found) : null;
  }

  async createIfAbsent(lesson: Lesson): Promise<Lesson> {
    const existing = this.map.get(lesson.id);
    if (existing) return structuredClone(existing);
    const stored = structuredClone(lesson);
    this.map.set(lesson.id, stored);
    return structuredClone(stored);
  }

  async update(id: string, mutator: (lesson: Lesson) => Lesson): Promise<Lesson> {
    const existing = this.map.get(id);
    if (!existing) throw new Error(`Lesson ${id} not found`);
    const next = mutator(structuredClone(existing));
    this.map.set(id, structuredClone(next));
    return structuredClone(next);
  }
}
```

- [ ] **Step 5: Update barrel**

Append to `src/shared/src/index.ts` (after the LlmEngine block):

```ts
export type { LessonRepository } from './storage/lesson-repository.js';
export { InMemoryLessonRepository } from './storage/in-memory-lesson-repository.js';
```

- [ ] **Step 6: Run tests — green**

```bash
npm run test --workspace @echolingo/shared
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/shared/src/storage/lesson-repository.ts src/shared/src/storage/in-memory-lesson-repository.ts src/shared/test/in-memory-lesson-repository.test.ts src/shared/src/index.ts
git commit -m "feat(shared): add LessonRepository interface and in-memory impl"
```

---

## Task 4: `AudioStorage` interface + `InMemoryAudioStorage`

**Files:**
- Create: `src/shared/src/storage/audio-storage.ts`
- Create: `src/shared/src/storage/in-memory-audio-storage.ts`
- Create: `src/shared/test/in-memory-audio-storage.test.ts`
- Modify: `src/shared/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `src/shared/test/in-memory-audio-storage.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { InMemoryAudioStorage } from '../src/storage/in-memory-audio-storage.js';

describe('InMemoryAudioStorage', () => {
  it('returns the upload URL after put', async () => {
    const storage = new InMemoryAudioStorage();
    const url = await storage.put('lessonA', 0, 'gr', Buffer.from('abc'));
    expect(url).toBe(storage.getUrl('lessonA', 0, 'gr'));
  });

  it('roundtrips a buffer through put → fetch', async () => {
    const storage = new InMemoryAudioStorage();
    const data = Buffer.from('hello mp3');
    await storage.put('lessonA', 7, 'native', data);
    const fetched = await storage.fetch('lessonA', 7, 'native');
    expect(fetched?.equals(data)).toBe(true);
  });

  it('fetch returns null for missing chunks', async () => {
    const storage = new InMemoryAudioStorage();
    expect(await storage.fetch('lessonA', 0, 'gr')).toBeNull();
  });

  it('partitions by lesson, sentence index, and lang', async () => {
    const storage = new InMemoryAudioStorage();
    await storage.put('A', 0, 'gr', Buffer.from('a-gr-0'));
    await storage.put('A', 0, 'native', Buffer.from('a-native-0'));
    await storage.put('A', 1, 'gr', Buffer.from('a-gr-1'));
    await storage.put('B', 0, 'gr', Buffer.from('b-gr-0'));
    expect((await storage.fetch('A', 0, 'gr'))?.toString()).toBe('a-gr-0');
    expect((await storage.fetch('A', 0, 'native'))?.toString()).toBe('a-native-0');
    expect((await storage.fetch('A', 1, 'gr'))?.toString()).toBe('a-gr-1');
    expect((await storage.fetch('B', 0, 'gr'))?.toString()).toBe('b-gr-0');
  });
});
```

- [ ] **Step 2: Run — red**

```bash
npm run test --workspace @echolingo/shared
```

- [ ] **Step 3: Implement the interface**

Create `src/shared/src/storage/audio-storage.ts`:

```ts
export type AudioLang = 'gr' | 'native';

export interface AudioStorage {
  put(lessonId: string, sentenceIndex: number, lang: AudioLang, mp3: Buffer): Promise<string>;
  fetch(lessonId: string, sentenceIndex: number, lang: AudioLang): Promise<Buffer | null>;
  getUrl(lessonId: string, sentenceIndex: number, lang: AudioLang): string;
}
```

- [ ] **Step 4: Implement the in-memory store**

Create `src/shared/src/storage/in-memory-audio-storage.ts`:

```ts
import type { AudioLang, AudioStorage } from './audio-storage.js';

function key(lessonId: string, sentenceIndex: number, lang: AudioLang): string {
  return `${lessonId}/${lang}/${sentenceIndex}.mp3`;
}

export class InMemoryAudioStorage implements AudioStorage {
  private readonly map = new Map<string, Buffer>();
  private readonly baseUrl: string;

  constructor(baseUrl = 'memory://audio') {
    this.baseUrl = baseUrl;
  }

  async put(
    lessonId: string,
    sentenceIndex: number,
    lang: AudioLang,
    mp3: Buffer,
  ): Promise<string> {
    this.map.set(key(lessonId, sentenceIndex, lang), Buffer.from(mp3));
    return this.getUrl(lessonId, sentenceIndex, lang);
  }

  async fetch(
    lessonId: string,
    sentenceIndex: number,
    lang: AudioLang,
  ): Promise<Buffer | null> {
    const found = this.map.get(key(lessonId, sentenceIndex, lang));
    return found ? Buffer.from(found) : null;
  }

  getUrl(lessonId: string, sentenceIndex: number, lang: AudioLang): string {
    return `${this.baseUrl}/${key(lessonId, sentenceIndex, lang)}`;
  }
}
```

- [ ] **Step 5: Update barrel**

Append to `src/shared/src/index.ts`:

```ts
export type { AudioLang, AudioStorage } from './storage/audio-storage.js';
export { InMemoryAudioStorage } from './storage/in-memory-audio-storage.js';
```

- [ ] **Step 6: Run — green**

```bash
npm run test --workspace @echolingo/shared
```

- [ ] **Step 7: Commit**

```bash
git add src/shared/src/storage/audio-storage.ts src/shared/src/storage/in-memory-audio-storage.ts src/shared/test/in-memory-audio-storage.test.ts src/shared/src/index.ts
git commit -m "feat(shared): add AudioStorage interface and in-memory impl"
```

---

## Task 5: API config

**Files:**
- Create: `src/api/src/config.ts`
- Create: `src/api/test/config.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/api/test/config.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig, DEFAULT_LESSON_CONTAINER, DEFAULT_AUDIO_CONTAINER, DEFAULT_SCRIPT_GEN_QUEUE, DEFAULT_TTS_SENTENCE_QUEUE } from '../src/config.js';

describe('loadConfig', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.AzureWebJobsStorage;
    delete process.env.LESSONS_CONTAINER;
    delete process.env.AUDIO_CONTAINER;
    delete process.env.SCRIPT_GEN_QUEUE;
    delete process.env.TTS_SENTENCE_QUEUE;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('throws when AzureWebJobsStorage is unset', () => {
    expect(() => loadConfig()).toThrow(/AzureWebJobsStorage/);
  });

  it('returns the connection string from env', () => {
    process.env.AzureWebJobsStorage = 'UseDevelopmentStorage=true';
    expect(loadConfig().storageConnectionString).toBe('UseDevelopmentStorage=true');
  });

  it('uses default container and queue names when env is unset', () => {
    process.env.AzureWebJobsStorage = 'UseDevelopmentStorage=true';
    const cfg = loadConfig();
    expect(cfg.lessonsContainer).toBe(DEFAULT_LESSON_CONTAINER);
    expect(cfg.audioContainer).toBe(DEFAULT_AUDIO_CONTAINER);
    expect(cfg.scriptGenQueue).toBe(DEFAULT_SCRIPT_GEN_QUEUE);
    expect(cfg.ttsSentenceQueue).toBe(DEFAULT_TTS_SENTENCE_QUEUE);
  });

  it('honors env overrides for container and queue names', () => {
    process.env.AzureWebJobsStorage = 'UseDevelopmentStorage=true';
    process.env.LESSONS_CONTAINER = 'custom-lessons';
    process.env.AUDIO_CONTAINER = 'custom-audio';
    process.env.SCRIPT_GEN_QUEUE = 'custom-script-gen';
    process.env.TTS_SENTENCE_QUEUE = 'custom-tts';
    const cfg = loadConfig();
    expect(cfg.lessonsContainer).toBe('custom-lessons');
    expect(cfg.audioContainer).toBe('custom-audio');
    expect(cfg.scriptGenQueue).toBe('custom-script-gen');
    expect(cfg.ttsSentenceQueue).toBe('custom-tts');
  });
});
```

- [ ] **Step 2: Run — red**

```bash
npm run test --workspace @echolingo/api
```

- [ ] **Step 3: Implement**

Create `src/api/src/config.ts`:

```ts
export const DEFAULT_LESSON_CONTAINER = 'lessons';
export const DEFAULT_AUDIO_CONTAINER = 'audio';
export const DEFAULT_SCRIPT_GEN_QUEUE = 'script-gen';
export const DEFAULT_TTS_SENTENCE_QUEUE = 'tts-sentence';

export interface Config {
  storageConnectionString: string;
  lessonsContainer: string;
  audioContainer: string;
  scriptGenQueue: string;
  ttsSentenceQueue: string;
}

export function loadConfig(): Config {
  const storageConnectionString = process.env.AzureWebJobsStorage;
  if (!storageConnectionString) {
    throw new Error('AzureWebJobsStorage environment variable is required');
  }
  return {
    storageConnectionString,
    lessonsContainer: process.env.LESSONS_CONTAINER ?? DEFAULT_LESSON_CONTAINER,
    audioContainer: process.env.AUDIO_CONTAINER ?? DEFAULT_AUDIO_CONTAINER,
    scriptGenQueue: process.env.SCRIPT_GEN_QUEUE ?? DEFAULT_SCRIPT_GEN_QUEUE,
    ttsSentenceQueue: process.env.TTS_SENTENCE_QUEUE ?? DEFAULT_TTS_SENTENCE_QUEUE,
  };
}
```

- [ ] **Step 4: Run — green**

```bash
npm run test --workspace @echolingo/api
```

- [ ] **Step 5: Commit**

```bash
git add src/api/src/config.ts src/api/test/config.test.ts
git commit -m "feat(api): add env-driven config with container and queue defaults"
```

---

## Task 6: Azurite test helper

**Files:**
- Create: `src/api/test/helpers/azurite.ts`
- Create: `src/api/test/helpers/containers.ts`
- Create: `src/api/test/helpers/fixtures.ts`

No tests yet — these are helpers used by later integration tests. They are exercised when later tests run.

- [ ] **Step 1: Add Azure Storage SDK dependencies to `src/api/package.json`**

Edit `src/api/package.json` — add to `dependencies`:

```json
{
  "dependencies": {
    "@azure/functions": "^4.5.1",
    "@azure/storage-blob": "^12.25.0",
    "@azure/storage-queue": "^12.24.0",
    "@echolingo/shared": "*"
  }
}
```

Run `npm install` from the repo root.

- [ ] **Step 2: Implement the Azurite ping helper**

Create `src/api/test/helpers/azurite.ts`:

```ts
import { BlobServiceClient } from '@azure/storage-blob';

export const AZURITE_CONNECTION_STRING =
  'DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;' +
  'AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;' +
  'BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1;' +
  'QueueEndpoint=http://127.0.0.1:10001/devstoreaccount1;' +
  'TableEndpoint=http://127.0.0.1:10002/devstoreaccount1;';

export async function isAzuriteReachable(timeoutMs = 1000): Promise<boolean> {
  const client = BlobServiceClient.fromConnectionString(AZURITE_CONNECTION_STRING);
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      await client.getProperties({ abortSignal: ctrl.signal });
      return true;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return false;
  }
}
```

**Skip pattern used by integration tests:** each test takes a context argument and calls `ctx.skip()` early when Azurite isn't reachable. We can't use `it.runIf(condition)` because vitest evaluates `runIf` at test-collection time (before `beforeAll` runs), so an `await`-derived flag would always be empty there.

The pattern looks like:

```ts
let connStr: string | null = null;
beforeAll(async () => {
  if (await isAzuriteReachable()) connStr = AZURITE_CONNECTION_STRING;
});
it('returns null for an unknown id', async (ctx) => {
  if (!connStr) ctx.skip();
  // ... rest of test, safe to assert connStr !== null because skip() throws
});
```

- [ ] **Step 3: Implement the container helper**

Create `src/api/test/helpers/containers.ts`:

```ts
import { BlobServiceClient } from '@azure/storage-blob';
import { QueueServiceClient } from '@azure/storage-queue';

export async function resetContainer(connStr: string, name: string): Promise<void> {
  const blobService = BlobServiceClient.fromConnectionString(connStr);
  const container = blobService.getContainerClient(name);
  await container.deleteIfExists();
  await container.createIfNotExists();
}

export async function resetQueue(connStr: string, name: string): Promise<void> {
  const queueService = QueueServiceClient.fromConnectionString(connStr);
  const queue = queueService.getQueueClient(name);
  await queue.deleteIfExists();
  // Azurite returns a 404 on subsequent create immediately after delete sometimes;
  // a retry loop keeps tests stable.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await queue.createIfNotExists();
      return;
    } catch (err) {
      if (attempt === 4) throw err;
      await new Promise((r) => setTimeout(r, 100));
    }
  }
}
```

- [ ] **Step 4: Implement the fixtures helper**

Create `src/api/test/helpers/fixtures.ts`:

```ts
import type { LessonParams } from '@echolingo/shared';

export function lessonParams(overrides: Partial<LessonParams> = {}): LessonParams {
  return {
    topic: 'at the bakery',
    lengthMin: 5,
    level: 3,
    style: 'dialogue',
    mode: 'bilingual',
    bilingualOrder: 'gr_first',
    nativeLang: 'en',
    ttsEngine: 'openai',
    ...overrides,
  };
}
```

- [ ] **Step 5: Verify typecheck and existing tests still pass**

```bash
npm run typecheck --workspace @echolingo/api
npm run test --workspace @echolingo/api
```

Expected: typecheck exit 0; tests still pass (config + health).

- [ ] **Step 6: Commit**

```bash
git add src/api/package.json src/api/test/helpers package-lock.json
git commit -m "feat(api): add Azure Storage SDKs and test helpers"
```

---

## Task 7: `BlobLessonRepository`

**Files:**
- Create: `src/api/src/storage/blob-lesson-repository.ts`
- Create: `src/api/test/blob-lesson-repository.int.test.ts`
- Modify: `src/api/vitest.config.ts` (include `**/*.int.test.ts`)

- [ ] **Step 1: Widen the vitest include pattern**

Edit `src/api/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts', 'test/**/*.int.test.ts'],
    environment: 'node',
    testTimeout: 15000,
  },
});
```

- [ ] **Step 2: Write the failing integration test**

Create `src/api/test/blob-lesson-repository.int.test.ts`:

```ts
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { BlobLessonRepository } from '../src/storage/blob-lesson-repository.js';
import { lessonId, type Lesson } from '@echolingo/shared';
import { AZURITE_CONNECTION_STRING, isAzuriteReachable } from './helpers/azurite.js';
import { resetContainer } from './helpers/containers.js';
import { lessonParams } from './helpers/fixtures.js';

const CONTAINER = 'lessons-test-7';

function makeLesson(): Lesson {
  const params = lessonParams();
  return {
    id: lessonId(params),
    params,
    status: 'generating_script',
    createdAt: '2026-05-17T00:00:00Z',
    updatedAt: '2026-05-17T00:00:00Z',
    totalSentences: 0,
    readySentences: 0,
    sentences: [],
  };
}

describe('BlobLessonRepository (integration)', () => {
  let connStr: string | null = null;

  beforeAll(async () => {
    if (await isAzuriteReachable()) connStr = AZURITE_CONNECTION_STRING;
  });

  beforeEach(async () => {
    if (!connStr) return;
    await resetContainer(connStr, CONTAINER);
  });

  it('returns null for an unknown id', async (ctx) => {
    if (!connStr) ctx.skip();
    const repo = new BlobLessonRepository(connStr!, CONTAINER);
    expect(await repo.get('does-not-exist')).toBeNull();
  });

  it('createIfAbsent persists a new lesson', async (ctx) => {
    if (!connStr) ctx.skip();
    const repo = new BlobLessonRepository(connStr!, CONTAINER);
    const l = makeLesson();
    const created = await repo.createIfAbsent(l);
    expect(created.id).toBe(l.id);
    expect(await repo.get(l.id)).toEqual(l);
  });

  it('createIfAbsent is idempotent', async (ctx) => {
    if (!connStr) ctx.skip();
    const repo = new BlobLessonRepository(connStr!, CONTAINER);
    const l = makeLesson();
    await repo.createIfAbsent(l);
    const second = await repo.createIfAbsent({ ...l, status: 'ready' });
    expect(second.status).toBe('generating_script');
  });

  it('update applies the mutator', async (ctx) => {
    if (!connStr) ctx.skip();
    const repo = new BlobLessonRepository(connStr!, CONTAINER);
    const l = makeLesson();
    await repo.createIfAbsent(l);
    const updated = await repo.update(l.id, (lesson) => ({ ...lesson, status: 'ready' }));
    expect(updated.status).toBe('ready');
    expect((await repo.get(l.id))?.status).toBe('ready');
  });

  it('update throws on missing id', async (ctx) => {
    if (!connStr) ctx.skip();
    const repo = new BlobLessonRepository(connStr!, CONTAINER);
    await expect(repo.update('missing', (l) => l)).rejects.toThrow(/not found/i);
  });
});
```

**Note on the test pattern:** `connStr` is `null` until `beforeAll` pings Azurite. Each test inspects `connStr` and calls `ctx.skip()` to mark the test as skipped when Azurite isn't reachable. The `connStr!` non-null assertion after `ctx.skip()` is safe because `skip()` throws.

- [ ] **Step 3: Run — see Azurite-skipped (or red if Azurite is up)**

Start Azurite in a separate terminal:

```bash
npm run azurite
```

Then:

```bash
npm run test --workspace @echolingo/api
```

Expected: blob-lesson-repository tests FAIL with "Cannot find module '../src/storage/blob-lesson-repository.js'" (if Azurite up) or are skipped (if not).

- [ ] **Step 4: Implement**

Create `src/api/src/storage/blob-lesson-repository.ts`:

```ts
import { BlobServiceClient, RestError, type ContainerClient } from '@azure/storage-blob';
import type { Lesson, LessonRepository } from '@echolingo/shared';

const BLOB_NAME_SUFFIX = '.json';

export class BlobLessonRepository implements LessonRepository {
  private readonly container: ContainerClient;

  constructor(connectionString: string, containerName: string) {
    const service = BlobServiceClient.fromConnectionString(connectionString);
    this.container = service.getContainerClient(containerName);
  }

  async ensureContainer(): Promise<void> {
    await this.container.createIfNotExists();
  }

  async get(id: string): Promise<Lesson | null> {
    const blob = this.container.getBlockBlobClient(this.blobName(id));
    try {
      const downloaded = await blob.downloadToBuffer();
      return JSON.parse(downloaded.toString('utf-8')) as Lesson;
    } catch (err) {
      if (err instanceof RestError && err.statusCode === 404) return null;
      throw err;
    }
  }

  async createIfAbsent(lesson: Lesson): Promise<Lesson> {
    await this.ensureContainer();
    const blob = this.container.getBlockBlobClient(this.blobName(lesson.id));
    const body = JSON.stringify(lesson);
    try {
      await blob.upload(body, body.length, {
        conditions: { ifNoneMatch: '*' },
        blobHTTPHeaders: { blobContentType: 'application/json' },
      });
      return lesson;
    } catch (err) {
      if (err instanceof RestError && (err.statusCode === 409 || err.statusCode === 412)) {
        const existing = await this.get(lesson.id);
        if (!existing) throw err;
        return existing;
      }
      throw err;
    }
  }

  async update(id: string, mutator: (lesson: Lesson) => Lesson): Promise<Lesson> {
    const blob = this.container.getBlockBlobClient(this.blobName(id));
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const downloaded = await blob.download();
      if (!downloaded.etag) throw new Error(`Lesson ${id} not found`);
      const chunks: Buffer[] = [];
      for await (const chunk of downloaded.readableStreamBody ?? []) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const current = JSON.parse(Buffer.concat(chunks).toString('utf-8')) as Lesson;
      const next = mutator(current);
      const body = JSON.stringify(next);
      try {
        await blob.upload(body, body.length, {
          conditions: { ifMatch: downloaded.etag },
          blobHTTPHeaders: { blobContentType: 'application/json' },
        });
        return next;
      } catch (err) {
        if (err instanceof RestError && err.statusCode === 412) {
          continue; // ETag changed — retry with fresh read
        }
        throw err;
      }
    }
    throw new Error(`Lesson ${id} could not be updated after retries`);
  }

  private blobName(id: string): string {
    return `${id}${BLOB_NAME_SUFFIX}`;
  }
}
```

The `update` for-loop above first calls `blob.download()` which returns 404 → `RestError` is thrown before `etag` is checked. Wrap it:

Replace the inner body of the for-loop:

```ts
      let downloaded;
      try {
        downloaded = await blob.download();
      } catch (err) {
        if (err instanceof RestError && err.statusCode === 404) {
          throw new Error(`Lesson ${id} not found`);
        }
        throw err;
      }
      if (!downloaded.etag) throw new Error(`Lesson ${id} not found`);
```

Final implementation `update`:

```ts
  async update(id: string, mutator: (lesson: Lesson) => Lesson): Promise<Lesson> {
    const blob = this.container.getBlockBlobClient(this.blobName(id));
    for (let attempt = 0; attempt < 5; attempt += 1) {
      let downloaded;
      try {
        downloaded = await blob.download();
      } catch (err) {
        if (err instanceof RestError && err.statusCode === 404) {
          throw new Error(`Lesson ${id} not found`);
        }
        throw err;
      }
      if (!downloaded.etag) throw new Error(`Lesson ${id} not found`);
      const chunks: Buffer[] = [];
      for await (const chunk of downloaded.readableStreamBody ?? []) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const current = JSON.parse(Buffer.concat(chunks).toString('utf-8')) as Lesson;
      const next = mutator(current);
      const body = JSON.stringify(next);
      try {
        await blob.upload(body, body.length, {
          conditions: { ifMatch: downloaded.etag },
          blobHTTPHeaders: { blobContentType: 'application/json' },
        });
        return next;
      } catch (err) {
        if (err instanceof RestError && err.statusCode === 412) {
          continue;
        }
        throw err;
      }
    }
    throw new Error(`Lesson ${id} could not be updated after retries`);
  }
```

- [ ] **Step 5: Run — green (with Azurite up)**

```bash
npm run test --workspace @echolingo/api
```

Expected: blob-lesson-repository tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/api/src/storage/blob-lesson-repository.ts src/api/test/blob-lesson-repository.int.test.ts src/api/vitest.config.ts
git commit -m "feat(api): add BlobLessonRepository with optimistic-concurrency update"
```

---

## Task 8: `BlobAudioStorage`

**Files:**
- Create: `src/api/src/storage/blob-audio-storage.ts`
- Create: `src/api/test/blob-audio-storage.int.test.ts`

- [ ] **Step 1: Write the failing integration test**

Create `src/api/test/blob-audio-storage.int.test.ts`:

```ts
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { BlobAudioStorage } from '../src/storage/blob-audio-storage.js';
import { AZURITE_CONNECTION_STRING, isAzuriteReachable } from './helpers/azurite.js';
import { resetContainer } from './helpers/containers.js';

const CONTAINER = 'audio-test-8';

describe('BlobAudioStorage (integration)', () => {
  let connStr: string | null = null;

  beforeAll(async () => {
    if (await isAzuriteReachable()) connStr = AZURITE_CONNECTION_STRING;
  });

  beforeEach(async () => {
    if (!connStr) return;
    await resetContainer(connStr, CONTAINER);
  });

  it('returns URL pointing at the uploaded chunk', async (ctx) => {
    if (!connStr) ctx.skip();
    const storage = new BlobAudioStorage(connStr!, CONTAINER);
    const url = await storage.put('L1', 0, 'gr', Buffer.from('mock-mp3'));
    expect(url).toBe(storage.getUrl('L1', 0, 'gr'));
    expect(url).toContain('/audio-test-8/L1/gr/0.mp3');
  });

  it('roundtrips bytes through put → fetch', async (ctx) => {
    if (!connStr) ctx.skip();
    const storage = new BlobAudioStorage(connStr!, CONTAINER);
    const data = Buffer.from('hello mp3 audio bytes');
    await storage.put('L1', 3, 'native', data);
    const fetched = await storage.fetch('L1', 3, 'native');
    expect(fetched?.equals(data)).toBe(true);
  });

  it('fetch returns null for missing chunks', async (ctx) => {
    if (!connStr) ctx.skip();
    const storage = new BlobAudioStorage(connStr!, CONTAINER);
    expect(await storage.fetch('L1', 99, 'gr')).toBeNull();
  });
});
```

- [ ] **Step 2: Run — red (Azurite up) or skipped**

```bash
npm run test --workspace @echolingo/api
```

- [ ] **Step 3: Implement**

Create `src/api/src/storage/blob-audio-storage.ts`:

```ts
import { BlobServiceClient, RestError, type ContainerClient } from '@azure/storage-blob';
import type { AudioLang, AudioStorage } from '@echolingo/shared';

function blobName(lessonId: string, sentenceIndex: number, lang: AudioLang): string {
  return `${lessonId}/${lang}/${sentenceIndex}.mp3`;
}

export class BlobAudioStorage implements AudioStorage {
  private readonly container: ContainerClient;
  private readonly containerName: string;
  private readonly accountUrl: string;

  constructor(connectionString: string, containerName: string) {
    const service = BlobServiceClient.fromConnectionString(connectionString);
    this.container = service.getContainerClient(containerName);
    this.containerName = containerName;
    this.accountUrl = service.url;
  }

  async ensureContainer(): Promise<void> {
    await this.container.createIfNotExists();
  }

  async put(
    lessonId: string,
    sentenceIndex: number,
    lang: AudioLang,
    mp3: Buffer,
  ): Promise<string> {
    await this.ensureContainer();
    const blob = this.container.getBlockBlobClient(blobName(lessonId, sentenceIndex, lang));
    await blob.upload(mp3, mp3.length, {
      blobHTTPHeaders: { blobContentType: 'audio/mpeg' },
    });
    return this.getUrl(lessonId, sentenceIndex, lang);
  }

  async fetch(
    lessonId: string,
    sentenceIndex: number,
    lang: AudioLang,
  ): Promise<Buffer | null> {
    const blob = this.container.getBlockBlobClient(blobName(lessonId, sentenceIndex, lang));
    try {
      return await blob.downloadToBuffer();
    } catch (err) {
      if (err instanceof RestError && err.statusCode === 404) return null;
      throw err;
    }
  }

  getUrl(lessonId: string, sentenceIndex: number, lang: AudioLang): string {
    return `${this.accountUrl}/${this.containerName}/${blobName(lessonId, sentenceIndex, lang)}`;
  }
}
```

- [ ] **Step 4: Run — green**

```bash
npm run test --workspace @echolingo/api
```

- [ ] **Step 5: Commit**

```bash
git add src/api/src/storage/blob-audio-storage.ts src/api/test/blob-audio-storage.int.test.ts
git commit -m "feat(api): add BlobAudioStorage for mp3 chunk uploads"
```

---

## Task 9: `QueueClient`

**Files:**
- Create: `src/api/src/queue/queue-client.ts`
- Create: `src/api/test/queue-client.int.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/api/test/queue-client.int.test.ts`:

```ts
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { QueueClient } from '../src/queue/queue-client.js';
import { QueueServiceClient } from '@azure/storage-queue';
import { AZURITE_CONNECTION_STRING, isAzuriteReachable } from './helpers/azurite.js';
import { resetQueue } from './helpers/containers.js';

const SCRIPT_GEN_Q = 'script-gen-test-9';
const TTS_SENTENCE_Q = 'tts-sentence-test-9';

async function readOne(connStr: string, queueName: string): Promise<unknown> {
  const queue = QueueServiceClient.fromConnectionString(connStr).getQueueClient(queueName);
  const res = await queue.receiveMessages({ numberOfMessages: 1 });
  const msg = res.receivedMessageItems[0];
  if (!msg) throw new Error(`No message in ${queueName}`);
  await queue.deleteMessage(msg.messageId, msg.popReceipt);
  return JSON.parse(Buffer.from(msg.messageText, 'base64').toString('utf-8'));
}

describe('QueueClient (integration)', () => {
  let connStr: string | null = null;

  beforeAll(async () => {
    if (await isAzuriteReachable()) connStr = AZURITE_CONNECTION_STRING;
  });

  beforeEach(async () => {
    if (!connStr) return;
    await resetQueue(connStr, SCRIPT_GEN_Q);
    await resetQueue(connStr, TTS_SENTENCE_Q);
  });

  it('enqueues a script-gen job in base64-JSON', async (ctx) => {
    if (!connStr) ctx.skip();
    const client = new QueueClient(connStr!, SCRIPT_GEN_Q, TTS_SENTENCE_Q);
    await client.enqueueScriptGen({ type: 'scriptGen', lessonId: 'abc' });
    expect(await readOne(connStr!, SCRIPT_GEN_Q)).toEqual({ type: 'scriptGen', lessonId: 'abc' });
  });

  it('enqueues a tts-sentence job', async (ctx) => {
    if (!connStr) ctx.skip();
    const client = new QueueClient(connStr!, SCRIPT_GEN_Q, TTS_SENTENCE_Q);
    await client.enqueueTtsSentence({ type: 'ttsSentence', lessonId: 'abc', sentenceIndex: 7 });
    expect(await readOne(connStr!, TTS_SENTENCE_Q)).toEqual({
      type: 'ttsSentence',
      lessonId: 'abc',
      sentenceIndex: 7,
    });
  });
});
```

- [ ] **Step 2: Run — red**

```bash
npm run test --workspace @echolingo/api
```

- [ ] **Step 3: Implement**

Create `src/api/src/queue/queue-client.ts`:

```ts
import {
  QueueServiceClient,
  type QueueClient as AzureQueueClient,
} from '@azure/storage-queue';
import type { ScriptGenJob, TtsSentenceJob } from '@echolingo/shared';

export class QueueClient {
  private readonly scriptGen: AzureQueueClient;
  private readonly ttsSentence: AzureQueueClient;

  constructor(connectionString: string, scriptGenQueue: string, ttsSentenceQueue: string) {
    const service = QueueServiceClient.fromConnectionString(connectionString);
    this.scriptGen = service.getQueueClient(scriptGenQueue);
    this.ttsSentence = service.getQueueClient(ttsSentenceQueue);
  }

  async ensureQueues(): Promise<void> {
    await Promise.all([this.scriptGen.createIfNotExists(), this.ttsSentence.createIfNotExists()]);
  }

  async enqueueScriptGen(job: ScriptGenJob): Promise<void> {
    await this.ensureQueues();
    await this.scriptGen.sendMessage(encode(job));
  }

  async enqueueTtsSentence(job: TtsSentenceJob): Promise<void> {
    await this.ensureQueues();
    await this.ttsSentence.sendMessage(encode(job));
  }
}

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf-8').toString('base64');
}
```

- [ ] **Step 4: Run — green**

```bash
npm run test --workspace @echolingo/api
```

- [ ] **Step 5: Commit**

```bash
git add src/api/src/queue/queue-client.ts src/api/test/queue-client.int.test.ts
git commit -m "feat(api): add QueueClient wrapper for script-gen and tts-sentence queues"
```

---

## Task 10: Composition root (`context.ts`)

**Files:**
- Create: `src/api/src/context.ts`

No new tests — context is exercised by handler tests.

- [ ] **Step 1: Implement**

Create `src/api/src/context.ts`:

```ts
import { MockLlmEngine, MockTtsEngine, type AudioStorage, type LessonRepository, type LlmEngine, type TtsEngine } from '@echolingo/shared';
import { loadConfig, type Config } from './config.js';
import { BlobLessonRepository } from './storage/blob-lesson-repository.js';
import { BlobAudioStorage } from './storage/blob-audio-storage.js';
import { QueueClient } from './queue/queue-client.js';

export interface ApiContext {
  config: Config;
  lessons: LessonRepository;
  audio: AudioStorage;
  queue: QueueClient;
  llm: LlmEngine;
  tts: TtsEngine;
}

let cached: ApiContext | undefined;

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
    llm: new MockLlmEngine(),
    tts: new MockTtsEngine(),
  };
  return cached;
}

/** Test-only: replace the cached context. */
export function setContextForTests(override: ApiContext | undefined): void {
  cached = override;
}
```

- [ ] **Step 2: Verify typecheck**

```bash
npm run typecheck --workspace @echolingo/api
```

- [ ] **Step 3: Commit**

```bash
git add src/api/src/context.ts
git commit -m "feat(api): add composition root with cached context and test override"
```

---

## Task 11: `POST /api/lesson` handler

**Files:**
- Create: `src/api/src/functions/lesson-create.ts`
- Create: `src/api/test/lesson-create.test.ts`
- Modify: `src/api/src/index.ts`

The handler validates input with `isLessonParams`, computes `lessonId`, creates the lesson row idempotently with `status:"generating_script"`, and enqueues a `scriptGen` job. Returns `{ id, status }` as JSON.

- [ ] **Step 1: Write the failing unit test (no Azurite — uses in-memory fakes via setContextForTests)**

Create `src/api/test/lesson-create.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { lessonCreateHandler } from '../src/functions/lesson-create.js';
import { setContextForTests, type ApiContext } from '../src/context.js';
import {
  InMemoryAudioStorage,
  InMemoryLessonRepository,
  MockLlmEngine,
  MockTtsEngine,
  lessonId,
} from '@echolingo/shared';
import type { HttpRequest } from '@azure/functions';
import { lessonParams } from './helpers/fixtures.js';

class FakeQueueClient {
  scriptGen: Array<unknown> = [];
  ttsSentence: Array<unknown> = [];
  async enqueueScriptGen(job: unknown): Promise<void> {
    this.scriptGen.push(job);
  }
  async enqueueTtsSentence(job: unknown): Promise<void> {
    this.ttsSentence.push(job);
  }
  async ensureQueues(): Promise<void> {}
}

function buildContext(): { ctx: ApiContext; queue: FakeQueueClient } {
  const queue = new FakeQueueClient();
  const ctx = {
    config: {
      storageConnectionString: 'UseDevelopmentStorage=true',
      lessonsContainer: 'lessons',
      audioContainer: 'audio',
      scriptGenQueue: 'script-gen',
      ttsSentenceQueue: 'tts-sentence',
    },
    lessons: new InMemoryLessonRepository(),
    audio: new InMemoryAudioStorage(),
    queue: queue as unknown as ApiContext['queue'],
    llm: new MockLlmEngine(),
    tts: new MockTtsEngine(),
  };
  return { ctx, queue };
}

function jsonRequest(body: unknown): HttpRequest {
  return {
    method: 'POST',
    url: 'http://localhost/api/lesson',
    headers: new Headers({ 'content-type': 'application/json' }),
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

describe('lessonCreateHandler', () => {
  let ctx: ApiContext;
  let queue: FakeQueueClient;

  beforeEach(() => {
    ({ ctx, queue } = buildContext());
    setContextForTests(ctx);
  });

  it('returns 400 when body is not a valid LessonParams', async () => {
    const res = await lessonCreateHandler(jsonRequest({ topic: '' }));
    expect(res.status).toBe(400);
  });

  it('returns 201 with id+status for a fresh request', async () => {
    const params = lessonParams();
    const res = await lessonCreateHandler(jsonRequest(params));
    expect(res.status).toBe(201);
    const body = JSON.parse(res.body as string);
    expect(body.id).toBe(lessonId(params));
    expect(body.status).toBe('generating_script');
  });

  it('enqueues exactly one scriptGen job on fresh request', async () => {
    const params = lessonParams();
    await lessonCreateHandler(jsonRequest(params));
    expect(queue.scriptGen).toHaveLength(1);
    expect(queue.scriptGen[0]).toEqual({ type: 'scriptGen', lessonId: lessonId(params) });
  });

  it('returns 200 (not 201) and skips enqueue when lesson already exists', async () => {
    const params = lessonParams();
    await lessonCreateHandler(jsonRequest(params));
    queue.scriptGen.length = 0;
    const res = await lessonCreateHandler(jsonRequest(params));
    expect(res.status).toBe(200);
    expect(queue.scriptGen).toHaveLength(0);
  });

  it('returns 200 when lesson is already ready', async () => {
    const params = lessonParams();
    const id = lessonId(params);
    await ctx.lessons.createIfAbsent({
      id,
      params,
      status: 'ready',
      createdAt: 'x',
      updatedAt: 'x',
      totalSentences: 1,
      readySentences: 1,
      sentences: [],
    });
    const res = await lessonCreateHandler(jsonRequest(params));
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body as string);
    expect(body.status).toBe('ready');
  });
});
```

- [ ] **Step 2: Run — red**

```bash
npm run test --workspace @echolingo/api
```

Expected: FAIL, "Cannot find module '../src/functions/lesson-create.js'".

- [ ] **Step 3: Implement**

Create `src/api/src/functions/lesson-create.ts`:

```ts
import { app, type HttpRequest, type HttpResponseInit } from '@azure/functions';
import { isLessonParams, lessonId, type Lesson } from '@echolingo/shared';
import { getContext } from '../context.js';

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
  const wasNew = persisted.createdAt === fresh.createdAt;

  if (wasNew) {
    await ctx.queue.enqueueScriptGen({ type: 'scriptGen', lessonId: id });
    return json(201, { id, status: persisted.status });
  }
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

- [ ] **Step 4: Register the function**

Replace `src/api/src/index.ts` with:

```ts
import './functions/health.js';
import './functions/lesson-create.js';
```

- [ ] **Step 5: Run — green**

```bash
npm run test --workspace @echolingo/api
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/api/src/functions/lesson-create.ts src/api/test/lesson-create.test.ts src/api/src/index.ts
git commit -m "feat(api): add POST /api/lesson with idempotent create and queue fan-out"
```

---

## Task 12: `GET /api/lesson/{id}` handler

**Files:**
- Create: `src/api/src/functions/lesson-get.ts`
- Create: `src/api/test/lesson-get.test.ts`
- Modify: `src/api/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `src/api/test/lesson-get.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { lessonGetHandler } from '../src/functions/lesson-get.js';
import { setContextForTests, type ApiContext } from '../src/context.js';
import {
  InMemoryAudioStorage,
  InMemoryLessonRepository,
  MockLlmEngine,
  MockTtsEngine,
} from '@echolingo/shared';
import type { HttpRequest } from '@azure/functions';
import { lessonParams } from './helpers/fixtures.js';

function buildContext(): ApiContext {
  return {
    config: {
      storageConnectionString: 'UseDevelopmentStorage=true',
      lessonsContainer: 'lessons',
      audioContainer: 'audio',
      scriptGenQueue: 'script-gen',
      ttsSentenceQueue: 'tts-sentence',
    },
    lessons: new InMemoryLessonRepository(),
    audio: new InMemoryAudioStorage(),
    queue: {
      enqueueScriptGen: async () => {},
      enqueueTtsSentence: async () => {},
      ensureQueues: async () => {},
    } as unknown as ApiContext['queue'],
    llm: new MockLlmEngine(),
    tts: new MockTtsEngine(),
  };
}

function getRequest(id: string): HttpRequest {
  return {
    method: 'GET',
    url: `http://localhost/api/lesson/${id}`,
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
    clone() {
      return this;
    },
  } as unknown as HttpRequest;
}

describe('lessonGetHandler', () => {
  let ctx: ApiContext;

  beforeEach(() => {
    ctx = buildContext();
    setContextForTests(ctx);
  });

  it('returns 404 for unknown lesson id', async () => {
    const res = await lessonGetHandler(getRequest('does-not-exist'));
    expect(res.status).toBe(404);
  });

  it('returns 200 with the lesson body when it exists', async () => {
    const params = lessonParams();
    const id = 'id1';
    await ctx.lessons.createIfAbsent({
      id,
      params,
      status: 'generating_audio',
      createdAt: '2026-05-17',
      updatedAt: '2026-05-17',
      totalSentences: 2,
      readySentences: 1,
      sentences: [
        { i: 0, gr: 'Καλημέρα.', native: 'Good morning.', status: 'ready' },
        { i: 1, gr: 'Γεια.', native: 'Hi.', status: 'pending' },
      ],
    });
    const res = await lessonGetHandler(getRequest(id));
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body as string);
    expect(body.id).toBe(id);
    expect(body.status).toBe('generating_audio');
    expect(body.totalSentences).toBe(2);
    expect(body.readySentences).toBe(1);
    expect(body.sentences).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run — red**

```bash
npm run test --workspace @echolingo/api
```

- [ ] **Step 3: Implement**

Create `src/api/src/functions/lesson-get.ts`:

```ts
import { app, type HttpRequest, type HttpResponseInit } from '@azure/functions';
import { getContext } from '../context.js';

export async function lessonGetHandler(req: HttpRequest): Promise<HttpResponseInit> {
  const id = req.params.id;
  if (!id) return json(400, { error: 'missing id' });
  const ctx = getContext();
  const lesson = await ctx.lessons.get(id);
  if (!lesson) return json(404, { error: 'lesson not found' });
  return json(200, lesson);
}

function json(status: number, body: unknown): HttpResponseInit {
  return {
    status,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}

app.http('lessonGet', {
  route: 'lesson/{id}',
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: lessonGetHandler,
});
```

- [ ] **Step 4: Register**

Replace `src/api/src/index.ts` with:

```ts
import './functions/health.js';
import './functions/lesson-create.js';
import './functions/lesson-get.js';
```

- [ ] **Step 5: Run — green**

```bash
npm run test --workspace @echolingo/api
```

- [ ] **Step 6: Commit**

```bash
git add src/api/src/functions/lesson-get.ts src/api/test/lesson-get.test.ts src/api/src/index.ts
git commit -m "feat(api): add GET /api/lesson/{id} handler"
```

---

## Task 13: `script-gen` queue worker

**Files:**
- Create: `src/api/src/functions/worker-script-gen.ts`
- Create: `src/api/test/worker-script-gen.test.ts`
- Modify: `src/api/src/index.ts`

The worker:
1. Loads the lesson by id (`ctx.lessons.get`).
2. Builds the prompt from `lesson.params`.
3. Calls `ctx.llm.generateScript(prompt)`.
4. Parses the raw script via `parseScript`.
5. Updates the lesson row with `sentences`, `totalSentences`, `status:"generating_audio"`.
6. Fans out one `ttsSentence` job per sentence.
7. On any failure, sets `status:"failed"` and stores the error message.

- [ ] **Step 1: Write the failing test**

Create `src/api/test/worker-script-gen.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { scriptGenWorker } from '../src/functions/worker-script-gen.js';
import { setContextForTests, type ApiContext } from '../src/context.js';
import {
  InMemoryAudioStorage,
  InMemoryLessonRepository,
  MockLlmEngine,
  MockTtsEngine,
  lessonId,
  type Lesson,
} from '@echolingo/shared';
import { lessonParams } from './helpers/fixtures.js';

class FakeQueueClient {
  scriptGen: Array<unknown> = [];
  ttsSentence: Array<unknown> = [];
  async enqueueScriptGen(job: unknown): Promise<void> {
    this.scriptGen.push(job);
  }
  async enqueueTtsSentence(job: unknown): Promise<void> {
    this.ttsSentence.push(job);
  }
  async ensureQueues(): Promise<void> {}
}

const CANNED = [
  'Καλημέρα.||Good morning.',
  'Γεια σου.||Hello.',
].join('\n');

function buildContext(opts: { llmScript?: string; llmThrows?: boolean } = {}): {
  ctx: ApiContext;
  queue: FakeQueueClient;
} {
  const queue = new FakeQueueClient();
  const llm = opts.llmThrows
    ? ({
        name: 'mock' as const,
        async generateScript() {
          throw new Error('boom');
        },
      })
    : new MockLlmEngine({ script: opts.llmScript ?? CANNED });
  const ctx: ApiContext = {
    config: {
      storageConnectionString: 'UseDevelopmentStorage=true',
      lessonsContainer: 'lessons',
      audioContainer: 'audio',
      scriptGenQueue: 'script-gen',
      ttsSentenceQueue: 'tts-sentence',
    },
    lessons: new InMemoryLessonRepository(),
    audio: new InMemoryAudioStorage(),
    queue: queue as unknown as ApiContext['queue'],
    llm,
    tts: new MockTtsEngine(),
  };
  return { ctx, queue };
}

async function seedLesson(ctx: ApiContext): Promise<Lesson> {
  const params = lessonParams();
  const id = lessonId(params);
  return ctx.lessons.createIfAbsent({
    id,
    params,
    status: 'generating_script',
    createdAt: 'x',
    updatedAt: 'x',
    totalSentences: 0,
    readySentences: 0,
    sentences: [],
  });
}

describe('scriptGenWorker', () => {
  it('parses script, persists transcript, fans out TTS jobs', async () => {
    const { ctx, queue } = buildContext();
    setContextForTests(ctx);
    const lesson = await seedLesson(ctx);

    await scriptGenWorker({ type: 'scriptGen', lessonId: lesson.id });

    const updated = await ctx.lessons.get(lesson.id);
    expect(updated?.status).toBe('generating_audio');
    expect(updated?.totalSentences).toBe(2);
    expect(updated?.sentences.map((s) => s.gr)).toEqual(['Καλημέρα.', 'Γεια σου.']);
    expect(queue.ttsSentence).toEqual([
      { type: 'ttsSentence', lessonId: lesson.id, sentenceIndex: 0 },
      { type: 'ttsSentence', lessonId: lesson.id, sentenceIndex: 1 },
    ]);
  });

  it('marks lesson failed when LLM throws', async () => {
    const { ctx } = buildContext({ llmThrows: true });
    setContextForTests(ctx);
    const lesson = await seedLesson(ctx);

    await expect(scriptGenWorker({ type: 'scriptGen', lessonId: lesson.id })).rejects.toThrow(/boom/);

    const updated = await ctx.lessons.get(lesson.id);
    expect(updated?.status).toBe('failed');
    expect(updated?.error).toMatch(/boom/);
  });

  it('marks lesson failed when script parses to zero sentences', async () => {
    const { ctx } = buildContext({ llmScript: 'bad output with no separator' });
    setContextForTests(ctx);
    const lesson = await seedLesson(ctx);

    await expect(scriptGenWorker({ type: 'scriptGen', lessonId: lesson.id })).rejects.toThrow(/empty/i);

    const updated = await ctx.lessons.get(lesson.id);
    expect(updated?.status).toBe('failed');
  });

  it('is idempotent: re-running on a lesson already in generating_audio is a no-op', async () => {
    const { ctx, queue } = buildContext();
    setContextForTests(ctx);
    const lesson = await seedLesson(ctx);
    await scriptGenWorker({ type: 'scriptGen', lessonId: lesson.id });
    queue.ttsSentence.length = 0;

    await scriptGenWorker({ type: 'scriptGen', lessonId: lesson.id });

    expect(queue.ttsSentence).toHaveLength(0);
  });

  it('throws when the lesson does not exist', async () => {
    const { ctx } = buildContext();
    setContextForTests(ctx);
    await expect(
      scriptGenWorker({ type: 'scriptGen', lessonId: 'missing' }),
    ).rejects.toThrow(/not found/i);
  });
});
```

- [ ] **Step 2: Run — red**

```bash
npm run test --workspace @echolingo/api
```

- [ ] **Step 3: Implement**

Create `src/api/src/functions/worker-script-gen.ts`:

```ts
import { app } from '@azure/functions';
import { buildPrompt, parseScript, type ScriptGenJob } from '@echolingo/shared';
import { getContext } from '../context.js';

export async function scriptGenWorker(job: ScriptGenJob): Promise<void> {
  const ctx = getContext();
  const lesson = await ctx.lessons.get(job.lessonId);
  if (!lesson) throw new Error(`Lesson ${job.lessonId} not found`);
  if (lesson.status !== 'generating_script') return; // idempotent

  try {
    const prompt = buildPrompt(lesson.params);
    const raw = await ctx.llm.generateScript(prompt);
    const sentences = parseScript(raw);
    if (sentences.length === 0) {
      throw new Error('empty script: parseScript returned no sentences');
    }

    await ctx.lessons.update(job.lessonId, (l) => ({
      ...l,
      status: 'generating_audio',
      sentences,
      totalSentences: sentences.length,
      readySentences: 0,
      updatedAt: new Date().toISOString(),
    }));

    await Promise.all(
      sentences.map((s) =>
        ctx.queue.enqueueTtsSentence({
          type: 'ttsSentence',
          lessonId: job.lessonId,
          sentenceIndex: s.i,
        }),
      ),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await ctx.lessons.update(job.lessonId, (l) => ({
      ...l,
      status: 'failed',
      error: message,
      updatedAt: new Date().toISOString(),
    }));
    throw err;
  }
}

app.storageQueue('scriptGenWorker', {
  queueName: 'script-gen',
  connection: 'AzureWebJobsStorage',
  handler: async (rawMessage) => {
    const job = decodeJob(rawMessage);
    await scriptGenWorker(job);
  },
});

function decodeJob(raw: unknown): ScriptGenJob {
  // The Functions runtime base64-decodes the message body when it's JSON;
  // for safety, accept both an object and a string.
  if (typeof raw === 'object' && raw !== null) return raw as ScriptGenJob;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as ScriptGenJob;
    } catch {
      const decoded = Buffer.from(raw, 'base64').toString('utf-8');
      return JSON.parse(decoded) as ScriptGenJob;
    }
  }
  throw new Error('unrecognized queue message shape');
}
```

- [ ] **Step 4: Register**

Replace `src/api/src/index.ts` with:

```ts
import './functions/health.js';
import './functions/lesson-create.js';
import './functions/lesson-get.js';
import './functions/worker-script-gen.js';
```

- [ ] **Step 5: Run — green**

```bash
npm run test --workspace @echolingo/api
```

- [ ] **Step 6: Commit**

```bash
git add src/api/src/functions/worker-script-gen.ts src/api/test/worker-script-gen.test.ts src/api/src/index.ts
git commit -m "feat(api): add script-gen queue worker"
```

---

## Task 14: `tts-sentence` queue worker

**Files:**
- Create: `src/api/src/functions/worker-tts-sentence.ts`
- Create: `src/api/test/worker-tts-sentence.test.ts`
- Modify: `src/api/src/index.ts`

The worker:
1. Loads the lesson and the sentence at `sentenceIndex`.
2. Calls TTS for Greek (always) and native (only if mode is bilingual).
3. Uploads audio chunks to `ctx.audio`.
4. Patches the sentence with `status:"ready"`, URLs, durations; increments `readySentences`.
5. When `readySentences === totalSentences`, marks the lesson `status:"ready"`.

- [ ] **Step 1: Write the failing test**

Create `src/api/test/worker-tts-sentence.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { ttsSentenceWorker } from '../src/functions/worker-tts-sentence.js';
import { setContextForTests, type ApiContext } from '../src/context.js';
import {
  InMemoryAudioStorage,
  InMemoryLessonRepository,
  MockLlmEngine,
  MockTtsEngine,
  lessonId,
  type Lesson,
} from '@echolingo/shared';
import { lessonParams } from './helpers/fixtures.js';

function buildContext(): ApiContext {
  return {
    config: {
      storageConnectionString: 'UseDevelopmentStorage=true',
      lessonsContainer: 'lessons',
      audioContainer: 'audio',
      scriptGenQueue: 'script-gen',
      ttsSentenceQueue: 'tts-sentence',
    },
    lessons: new InMemoryLessonRepository(),
    audio: new InMemoryAudioStorage(),
    queue: {
      enqueueScriptGen: async () => {},
      enqueueTtsSentence: async () => {},
      ensureQueues: async () => {},
    } as unknown as ApiContext['queue'],
    llm: new MockLlmEngine(),
    tts: new MockTtsEngine(),
  };
}

async function seed(
  ctx: ApiContext,
  overrides: { mode?: 'bilingual' | 'greek_only' } = {},
): Promise<Lesson> {
  const params = lessonParams({ mode: overrides.mode ?? 'bilingual' });
  const id = lessonId(params);
  return ctx.lessons.createIfAbsent({
    id,
    params,
    status: 'generating_audio',
    createdAt: 'x',
    updatedAt: 'x',
    totalSentences: 2,
    readySentences: 0,
    sentences: [
      { i: 0, gr: 'Καλημέρα.', native: 'Good morning.', status: 'pending' },
      { i: 1, gr: 'Γεια σου.', native: 'Hello.', status: 'pending' },
    ],
  });
}

describe('ttsSentenceWorker', () => {
  let ctx: ApiContext;

  beforeEach(() => {
    ctx = buildContext();
    setContextForTests(ctx);
  });

  it('synthesizes both languages in bilingual mode and patches sentence ready', async () => {
    const lesson = await seed(ctx);
    await ttsSentenceWorker({ type: 'ttsSentence', lessonId: lesson.id, sentenceIndex: 0 });

    const updated = await ctx.lessons.get(lesson.id);
    const s0 = updated?.sentences[0];
    expect(s0?.status).toBe('ready');
    expect(s0?.grUrl).toMatch(/\/0\.mp3$/);
    expect(s0?.nativeUrl).toMatch(/\/0\.mp3$/);
    expect(s0?.grDurSec).toBeGreaterThan(0);
    expect(s0?.nativeDurSec).toBeGreaterThan(0);
    expect(updated?.readySentences).toBe(1);
    expect(updated?.status).toBe('generating_audio');
  });

  it('skips native synthesis in greek_only mode', async () => {
    const lesson = await seed(ctx, { mode: 'greek_only' });
    await ttsSentenceWorker({ type: 'ttsSentence', lessonId: lesson.id, sentenceIndex: 0 });

    const updated = await ctx.lessons.get(lesson.id);
    const s0 = updated?.sentences[0];
    expect(s0?.grUrl).toBeDefined();
    expect(s0?.nativeUrl).toBeUndefined();
    expect(s0?.nativeDurSec).toBeUndefined();
  });

  it('marks lesson ready when the last sentence completes', async () => {
    const lesson = await seed(ctx);
    await ttsSentenceWorker({ type: 'ttsSentence', lessonId: lesson.id, sentenceIndex: 0 });
    await ttsSentenceWorker({ type: 'ttsSentence', lessonId: lesson.id, sentenceIndex: 1 });

    const updated = await ctx.lessons.get(lesson.id);
    expect(updated?.status).toBe('ready');
    expect(updated?.readySentences).toBe(2);
    expect(updated?.sentences.every((s) => s.status === 'ready')).toBe(true);
  });

  it('throws when the lesson does not exist', async () => {
    await expect(
      ttsSentenceWorker({ type: 'ttsSentence', lessonId: 'missing', sentenceIndex: 0 }),
    ).rejects.toThrow(/not found/i);
  });

  it('throws when the sentence index is out of range', async () => {
    const lesson = await seed(ctx);
    await expect(
      ttsSentenceWorker({ type: 'ttsSentence', lessonId: lesson.id, sentenceIndex: 99 }),
    ).rejects.toThrow(/sentence/i);
  });

  it('is idempotent: re-running on a ready sentence does not double-increment', async () => {
    const lesson = await seed(ctx);
    await ttsSentenceWorker({ type: 'ttsSentence', lessonId: lesson.id, sentenceIndex: 0 });
    await ttsSentenceWorker({ type: 'ttsSentence', lessonId: lesson.id, sentenceIndex: 0 });

    const updated = await ctx.lessons.get(lesson.id);
    expect(updated?.readySentences).toBe(1);
  });
});
```

- [ ] **Step 2: Run — red**

```bash
npm run test --workspace @echolingo/api
```

- [ ] **Step 3: Implement**

Create `src/api/src/functions/worker-tts-sentence.ts`:

```ts
import { app } from '@azure/functions';
import type { TtsSentenceJob } from '@echolingo/shared';
import { getContext } from '../context.js';

const LANG_BY_NATIVE = { en: 'en', ru: 'ru' } as const;

export async function ttsSentenceWorker(job: TtsSentenceJob): Promise<void> {
  const ctx = getContext();
  const lesson = await ctx.lessons.get(job.lessonId);
  if (!lesson) throw new Error(`Lesson ${job.lessonId} not found`);
  const sentence = lesson.sentences[job.sentenceIndex];
  if (!sentence) {
    throw new Error(`Sentence ${job.sentenceIndex} not found in lesson ${job.lessonId}`);
  }
  if (sentence.status === 'ready') return; // idempotent

  const grResult = await ctx.tts.synthesize({ text: sentence.gr, lang: 'el' });
  const grUrl = await ctx.audio.put(job.lessonId, job.sentenceIndex, 'gr', grResult.mp3);

  let nativeUrl: string | undefined;
  let nativeDurSec: number | undefined;
  if (lesson.params.mode === 'bilingual') {
    const nativeLang = LANG_BY_NATIVE[lesson.params.nativeLang];
    const nativeResult = await ctx.tts.synthesize({ text: sentence.native, lang: nativeLang });
    nativeUrl = await ctx.audio.put(job.lessonId, job.sentenceIndex, 'native', nativeResult.mp3);
    nativeDurSec = nativeResult.durationSec;
  }

  await ctx.lessons.update(job.lessonId, (l) => {
    const sentences = l.sentences.slice();
    const current = sentences[job.sentenceIndex];
    if (!current) return l;
    if (current.status === 'ready') return l; // double-check inside the critical section
    sentences[job.sentenceIndex] = {
      ...current,
      status: 'ready',
      grUrl,
      grDurSec: grResult.durationSec,
      nativeUrl,
      nativeDurSec,
    };
    const readySentences = sentences.filter((s) => s.status === 'ready').length;
    return {
      ...l,
      sentences,
      readySentences,
      status: readySentences === l.totalSentences ? 'ready' : 'generating_audio',
      updatedAt: new Date().toISOString(),
    };
  });
}

app.storageQueue('ttsSentenceWorker', {
  queueName: 'tts-sentence',
  connection: 'AzureWebJobsStorage',
  handler: async (rawMessage) => {
    const job = decodeJob(rawMessage);
    await ttsSentenceWorker(job);
  },
});

function decodeJob(raw: unknown): TtsSentenceJob {
  if (typeof raw === 'object' && raw !== null) return raw as TtsSentenceJob;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as TtsSentenceJob;
    } catch {
      const decoded = Buffer.from(raw, 'base64').toString('utf-8');
      return JSON.parse(decoded) as TtsSentenceJob;
    }
  }
  throw new Error('unrecognized queue message shape');
}
```

- [ ] **Step 4: Register**

Replace `src/api/src/index.ts` with:

```ts
import './functions/health.js';
import './functions/lesson-create.js';
import './functions/lesson-get.js';
import './functions/worker-script-gen.js';
import './functions/worker-tts-sentence.js';
```

- [ ] **Step 5: Run — green**

```bash
npm run test --workspace @echolingo/api
```

- [ ] **Step 6: Commit**

```bash
git add src/api/src/functions/worker-tts-sentence.ts src/api/test/worker-tts-sentence.test.ts src/api/src/index.ts
git commit -m "feat(api): add tts-sentence queue worker with idempotent fan-in"
```

---

## Task 15: End-to-end pipeline integration test

**Files:**
- Create: `src/api/test/pipeline.int.test.ts`

This test boots a real composition (Blob repo, Blob audio, real QueueClient) against Azurite. Instead of relying on the Functions queue runtime, it invokes the two worker handlers directly in sequence, exactly as the runtime would. This proves the loop end-to-end without needing `func start`.

- [ ] **Step 1: Write the test**

Create `src/api/test/pipeline.int.test.ts`:

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
import { scriptGenWorker } from '../src/functions/worker-script-gen.js';
import { ttsSentenceWorker } from '../src/functions/worker-tts-sentence.js';
import { AZURITE_CONNECTION_STRING, isAzuriteReachable } from './helpers/azurite.js';
import { resetContainer, resetQueue } from './helpers/containers.js';
import { lessonParams } from './helpers/fixtures.js';
import type { HttpRequest } from '@azure/functions';
import { QueueServiceClient } from '@azure/storage-queue';

const LESSONS = 'lessons-it-15';
const AUDIO = 'audio-it-15';
const SCRIPT_Q = 'script-gen-it-15';
const TTS_Q = 'tts-sentence-it-15';

const CANNED = ['Καλημέρα.||Good morning.', 'Γεια σου.||Hello.'].join('\n');

function postRequest(body: unknown): HttpRequest {
  return {
    method: 'POST',
    url: 'http://localhost/api/lesson',
    headers: new Headers({ 'content-type': 'application/json' }),
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

function getRequest(id: string): HttpRequest {
  return {
    method: 'GET',
    url: `http://localhost/api/lesson/${id}`,
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
    clone() {
      return this;
    },
  } as unknown as HttpRequest;
}

async function drain(connStr: string, queueName: string): Promise<unknown[]> {
  const queue = QueueServiceClient.fromConnectionString(connStr).getQueueClient(queueName);
  const jobs: unknown[] = [];
  while (true) {
    const res = await queue.receiveMessages({ numberOfMessages: 32 });
    if (res.receivedMessageItems.length === 0) break;
    for (const msg of res.receivedMessageItems) {
      jobs.push(JSON.parse(Buffer.from(msg.messageText, 'base64').toString('utf-8')));
      await queue.deleteMessage(msg.messageId, msg.popReceipt);
    }
  }
  return jobs;
}

describe('pipeline end-to-end (integration)', () => {
  let connStr: string | null = null;
  let ctx: ApiContext;

  beforeAll(async () => {
    if (await isAzuriteReachable()) connStr = AZURITE_CONNECTION_STRING;
  });

  beforeEach(async () => {
    if (!connStr) return;
    await Promise.all([
      resetContainer(connStr, LESSONS),
      resetContainer(connStr, AUDIO),
      resetQueue(connStr, SCRIPT_Q),
      resetQueue(connStr, TTS_Q),
    ]);
    ctx = {
      config: {
        storageConnectionString: connStr,
        lessonsContainer: LESSONS,
        audioContainer: AUDIO,
        scriptGenQueue: SCRIPT_Q,
        ttsSentenceQueue: TTS_Q,
      },
      lessons: new BlobLessonRepository(connStr, LESSONS),
      audio: new BlobAudioStorage(connStr, AUDIO),
      queue: new QueueClient(connStr, SCRIPT_Q, TTS_Q),
      llm: new MockLlmEngine({ script: CANNED }),
      tts: new MockTtsEngine(),
    };
    setContextForTests(ctx);
  });

  it('POST → workers → GET produces a ready lesson with audio URLs', async (testCtx) => {
    if (!connStr) testCtx.skip();
    const params = lessonParams();
    const createRes = await lessonCreateHandler(postRequest(params));
    expect(createRes.status).toBe(201);
    const { id } = JSON.parse(createRes.body as string);
    expect(id).toBe(lessonId(params));

    const scriptJobs = await drain(connStr!, SCRIPT_Q);
    expect(scriptJobs).toEqual([{ type: 'scriptGen', lessonId: id }]);
    await scriptGenWorker({ type: 'scriptGen', lessonId: id });

    const ttsJobs = await drain(connStr!, TTS_Q);
    expect(ttsJobs).toHaveLength(2);
    for (const job of ttsJobs as Array<{ type: string; lessonId: string; sentenceIndex: number }>) {
      await ttsSentenceWorker({ type: 'ttsSentence', lessonId: job.lessonId, sentenceIndex: job.sentenceIndex });
    }

    const getRes = await lessonGetHandler(getRequest(id));
    expect(getRes.status).toBe(200);
    const body = JSON.parse(getRes.body as string);
    expect(body.status).toBe('ready');
    expect(body.totalSentences).toBe(2);
    expect(body.readySentences).toBe(2);
    expect(body.sentences[0].grUrl).toBeDefined();
    expect(body.sentences[0].nativeUrl).toBeDefined();

    // Verify actual blob exists and is non-empty
    const audio = await ctx.audio.fetch(id, 0, 'gr');
    expect(audio?.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run — green (with Azurite up)**

```bash
npm run azurite &  # if not already running
npm run test --workspace @echolingo/api
```

Expected: all api tests pass; pipeline test in particular asserts a fully-ready lesson.

- [ ] **Step 3: Commit**

```bash
git add src/api/test/pipeline.int.test.ts
git commit -m "test(api): end-to-end pipeline integration test against Azurite"
```

---

## Final verification

- [ ] **Step 1: Restart Azurite cleanly**

In one terminal:

```bash
npm run azurite
```

- [ ] **Step 2: Full test suite + lint + build**

```bash
npm run lint
npm run test
npm run build --workspace @echolingo/web
npm run typecheck --workspace @echolingo/shared
npm run typecheck --workspace @echolingo/api
```

Expected: every step exits 0.

- [ ] **Step 3: Manual smoke (optional, requires `func` CLI)**

```bash
# Terminal 1: Azurite (already running)
# Terminal 2: copy local.settings.example
cp src/api/local.settings.json.example src/api/local.settings.json
# Terminal 3: dev:api
npm run dev:api
# Terminal 4: curl
curl -X POST http://localhost:7071/api/lesson \
  -H 'content-type: application/json' \
  -d '{"topic":"at the bakery","lengthMin":5,"level":3,"style":"dialogue","mode":"bilingual","bilingualOrder":"gr_first","nativeLang":"en","ttsEngine":"openai"}'
# Note the returned id
curl http://localhost:7071/api/lesson/<id>
```

The lesson should transition `generating_script` → `generating_audio` → `ready` within a few seconds.

- [ ] **Step 4: Push**

```bash
git push origin dev
```

Expected: CI run starts at https://github.com/superroma/echolingo/actions. CI runs Azurite via `npm run azurite` in the background before `npm run test`. **Update CI now to do this:**

Edit `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [dev, main]
  pull_request:
    branches: [dev, main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - name: Start Azurite
        run: |
          mkdir -p azurite-data
          npx azurite --location ./azurite-data --silent &
          # Wait for Azurite to be reachable
          for i in 1 2 3 4 5; do
            code=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:10000/devstoreaccount1 || true)
            if [ "$code" = "400" ]; then break; fi
            sleep 1
          done
      - run: npm run lint
      - run: npm run test
      - run: npm run build --workspace @echolingo/web
```

Commit:

```bash
git add .github/workflows/ci.yml
git commit -m "ci: start Azurite before tests for integration suite"
git push origin dev
```

---

## What Plan 2 does NOT include (handed off)

- Real OpenAI / ElevenLabs / Google TTS adapters — **Plan 4**
- Per-IP rate limiting — **Plan 4**
- Application Insights wiring — **Plan 4**
- Offline-download endpoint and full-mp3 concatenation — **Plan 4**
- Frontend form and player UI — **Plan 3**
- Web PubSub realtime channel — **Plan 4** (UI polls `GET /api/lesson/{id}` for now)
- Real Bicep modules + `azd` deploy — **Plan 5**
