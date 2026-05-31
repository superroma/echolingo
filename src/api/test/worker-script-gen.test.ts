import { describe, it, expect } from 'vitest';
import { scriptGenWorker } from '../src/functions/worker-script-gen.js';
import { setContextForTests, type ApiContext } from '../src/context.js';
import {
  InMemoryAudioStorage,
  InMemoryEchoRepository,
  MockLlmEngine,
  MockTtsEngine,
  echoId,
  type Echo,
} from '../src/_shared/index.js';
import { echoParams } from './helpers/fixtures.js';

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
      echoesContainer: 'echoes',
      audioContainer: 'audio',
      rateLimitContainer: 'rate-limits',
      scriptGenQueue: 'script-gen',
      ttsSentenceQueue: 'tts-sentence',
      llmEngine: 'mock' as const,
      ttsEngine: 'mock' as const,
      rateLimitPerDay: 1000,
    },
    echoes: new InMemoryEchoRepository(),
    audio: new InMemoryAudioStorage(),
    queue: queue as unknown as ApiContext['queue'],
    llm,
    tts: new MockTtsEngine(),
    rateLimits: { get: async () => 0, increment: async () => 1 },
    telemetry: { emit: () => {} },
  };
  return { ctx, queue };
}

async function seedEcho(ctx: ApiContext): Promise<Echo> {
  const params = echoParams();
  const id = echoId(params);
  return ctx.echoes.createIfAbsent({
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
    const echo = await seedEcho(ctx);

    await scriptGenWorker({ type: 'scriptGen', echoId: echo.id });

    const updated = await ctx.echoes.get(echo.id);
    expect(updated?.status).toBe('generating_audio');
    expect(updated?.totalSentences).toBe(2);
    expect(updated?.sentences.map((s) => s.gr)).toEqual(['Καλημέρα.', 'Γεια σου.']);
    expect(queue.ttsSentence).toEqual([
      { type: 'ttsSentence', echoId: echo.id, sentenceIndex: 0 },
      { type: 'ttsSentence', echoId: echo.id, sentenceIndex: 1 },
    ]);
  });

  it('marks echo failed when LLM throws', async () => {
    const { ctx } = buildContext({ llmThrows: true });
    setContextForTests(ctx);
    const echo = await seedEcho(ctx);

    await expect(scriptGenWorker({ type: 'scriptGen', echoId: echo.id })).rejects.toThrow(/boom/);

    const updated = await ctx.echoes.get(echo.id);
    expect(updated?.status).toBe('failed');
    expect(updated?.error).toMatch(/boom/);
  });

  it('marks echo failed when script parses to zero sentences', async () => {
    const { ctx } = buildContext({ llmScript: 'bad output with no separator' });
    setContextForTests(ctx);
    const echo = await seedEcho(ctx);

    await expect(scriptGenWorker({ type: 'scriptGen', echoId: echo.id })).rejects.toThrow(/empty/i);

    const updated = await ctx.echoes.get(echo.id);
    expect(updated?.status).toBe('failed');
  });

  it('is idempotent: re-running on an echo already in generating_audio is a no-op', async () => {
    const { ctx, queue } = buildContext();
    setContextForTests(ctx);
    const echo = await seedEcho(ctx);
    await scriptGenWorker({ type: 'scriptGen', echoId: echo.id });
    queue.ttsSentence.length = 0;

    await scriptGenWorker({ type: 'scriptGen', echoId: echo.id });

    expect(queue.ttsSentence).toHaveLength(0);
  });

  it('throws when the echo does not exist', async () => {
    const { ctx } = buildContext();
    setContextForTests(ctx);
    await expect(
      scriptGenWorker({ type: 'scriptGen', echoId: 'missing' }),
    ).rejects.toThrow(/not found/i);
  });
});
