import { describe, it, expect, beforeEach } from 'vitest';
import { echoGetHandler } from '../src/functions/echo-get.js';
import { setContextForTests, type ApiContext } from '../src/context.js';
import {
  InMemoryAudioStorage,
  InMemoryEchoRepository,
  MockLlmEngine,
  MockTtsEngine,
} from '../src/_shared/index.js';
import type { HttpRequest } from '@azure/functions';
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

function getRequest(id: string): HttpRequest {
  return {
    method: 'GET',
    url: `http://localhost/api/echo/${id}`,
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

describe('echoGetHandler', () => {
  let ctx: ApiContext;

  beforeEach(() => {
    ctx = buildContext();
    setContextForTests(ctx);
  });

  it('returns 404 for unknown echo id', async () => {
    const res = await echoGetHandler(getRequest('does-not-exist'));
    expect(res.status).toBe(404);
  });

  it('returns 200 with the echo body when it exists', async () => {
    const params = echoParams();
    const id = 'id1';
    await ctx.echoes.createIfAbsent({
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
    const res = await echoGetHandler(getRequest(id));
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body as string);
    expect(body.id).toBe(id);
    expect(body.status).toBe('generating_audio');
    expect(body.totalSentences).toBe(2);
    expect(body.readySentences).toBe(1);
    expect(body.sentences).toHaveLength(2);
  });
});
