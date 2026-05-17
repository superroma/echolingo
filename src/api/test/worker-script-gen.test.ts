import { describe, it, expect } from 'vitest';
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

const CANNED = ['Καλημέρα.||Good morning.', 'Γεια σου.||Hello.'].join('\n');

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
