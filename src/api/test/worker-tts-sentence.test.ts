import { describe, it, expect, beforeEach } from 'vitest';
import { ttsSentenceWorker } from '../src/functions/worker-tts-sentence.js';
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

function buildContext(): ApiContext {
  return {
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
  overrides: { mode?: 'bilingual' | 'target_only' } = {},
): Promise<Echo> {
  const params = echoParams({ mode: overrides.mode ?? 'bilingual' });
  const id = echoId(params);
  return ctx.echoes.createIfAbsent({
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
    const echo = await seed(ctx);
    await ttsSentenceWorker({ type: 'ttsSentence', echoId: echo.id, sentenceIndex: 0 });

    const updated = await ctx.echoes.get(echo.id);
    const s0 = updated?.sentences[0];
    expect(s0?.status).toBe('ready');
    expect(s0?.grUrl).toMatch(/\/0\.mp3$/);
    expect(s0?.nativeUrl).toMatch(/\/0\.mp3$/);
    expect(s0?.grDurSec).toBeGreaterThan(0);
    expect(s0?.nativeDurSec).toBeGreaterThan(0);
    expect(updated?.readySentences).toBe(1);
    expect(updated?.status).toBe('generating_audio');
  });

  it('skips native synthesis in target_only mode', async () => {
    const echo = await seed(ctx, { mode: 'target_only' });
    await ttsSentenceWorker({ type: 'ttsSentence', echoId: echo.id, sentenceIndex: 0 });

    const updated = await ctx.echoes.get(echo.id);
    const s0 = updated?.sentences[0];
    expect(s0?.grUrl).toBeDefined();
    expect(s0?.nativeUrl).toBeUndefined();
    expect(s0?.nativeDurSec).toBeUndefined();
  });

  it('marks echo ready when the last sentence completes', async () => {
    const echo = await seed(ctx);
    await ttsSentenceWorker({ type: 'ttsSentence', echoId: echo.id, sentenceIndex: 0 });
    await ttsSentenceWorker({ type: 'ttsSentence', echoId: echo.id, sentenceIndex: 1 });

    const updated = await ctx.echoes.get(echo.id);
    expect(updated?.status).toBe('ready');
    expect(updated?.readySentences).toBe(2);
    expect(updated?.sentences.every((s) => s.status === 'ready')).toBe(true);
  });

  it('throws when the echo does not exist', async () => {
    await expect(
      ttsSentenceWorker({ type: 'ttsSentence', echoId: 'missing', sentenceIndex: 0 }),
    ).rejects.toThrow(/not found/i);
  });

  it('throws when the sentence index is out of range', async () => {
    const echo = await seed(ctx);
    await expect(
      ttsSentenceWorker({ type: 'ttsSentence', echoId: echo.id, sentenceIndex: 99 }),
    ).rejects.toThrow(/sentence/i);
  });

  it('is idempotent: re-running on a ready sentence does not double-increment', async () => {
    const echo = await seed(ctx);
    await ttsSentenceWorker({ type: 'ttsSentence', echoId: echo.id, sentenceIndex: 0 });
    await ttsSentenceWorker({ type: 'ttsSentence', echoId: echo.id, sentenceIndex: 0 });

    const updated = await ctx.echoes.get(echo.id);
    expect(updated?.readySentences).toBe(1);
  });
});
