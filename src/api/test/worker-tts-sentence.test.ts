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
} from '../src/_shared/index.js';
import { lessonParams } from './helpers/fixtures.js';

function buildContext(): ApiContext {
  return {
    config: {
      storageConnectionString: 'UseDevelopmentStorage=true',
      lessonsContainer: 'lessons',
      audioContainer: 'audio',
      rateLimitContainer: 'rate-limits',
      scriptGenQueue: 'script-gen',
      ttsSentenceQueue: 'tts-sentence',
      llmEngine: 'mock' as const,
      ttsEngine: 'mock' as const,
      rateLimitPerDay: 1000,
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
    rateLimits: { get: async () => 0, increment: async () => 1 },
    telemetry: { emit: () => {} },
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
