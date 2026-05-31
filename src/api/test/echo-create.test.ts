import { describe, it, expect, beforeEach } from 'vitest';
import { echoCreateHandler } from '../src/functions/echo-create.js';
import { setContextForTests, type ApiContext } from '../src/context.js';
import {
  InMemoryAudioStorage,
  InMemoryEchoRepository,
  MockLlmEngine,
  MockTtsEngine,
  echoId,
} from '../src/_shared/index.js';
import type { HttpRequest } from '@azure/functions';
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

function buildContext(): { ctx: ApiContext; queue: FakeQueueClient } {
  const queue = new FakeQueueClient();
  const ctx = {
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
    llm: new MockLlmEngine(),
    tts: new MockTtsEngine(),
    rateLimits: { get: async () => 0, increment: async () => 1 },
    telemetry: { emit: () => {} },
  };
  return { ctx, queue };
}

function jsonRequest(body: unknown): HttpRequest {
  return {
    method: 'POST',
    url: 'http://localhost/api/echo',
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

describe('echoCreateHandler', () => {
  let ctx: ApiContext;
  let queue: FakeQueueClient;

  beforeEach(() => {
    ({ ctx, queue } = buildContext());
    setContextForTests(ctx);
  });

  it('returns 400 when body is not a valid EchoParams', async () => {
    const res = await echoCreateHandler(jsonRequest({ topic: '' }));
    expect(res.status).toBe(400);
  });

  it('returns 201 with id+status for a fresh request', async () => {
    const params = echoParams();
    const res = await echoCreateHandler(jsonRequest(params));
    expect(res.status).toBe(201);
    const body = JSON.parse(res.body as string);
    expect(body.id).toBe(echoId(params));
    expect(body.status).toBe('generating_script');
  });

  it('enqueues exactly one scriptGen job on fresh request', async () => {
    const params = echoParams();
    await echoCreateHandler(jsonRequest(params));
    expect(queue.scriptGen).toHaveLength(1);
    expect(queue.scriptGen[0]).toEqual({ type: 'scriptGen', echoId: echoId(params) });
  });

  it('returns 200 (not 201) and skips enqueue when echo already exists', async () => {
    const params = echoParams();
    await echoCreateHandler(jsonRequest(params));
    queue.scriptGen.length = 0;
    const res = await echoCreateHandler(jsonRequest(params));
    expect(res.status).toBe(200);
    expect(queue.scriptGen).toHaveLength(0);
  });

  it('returns 200 when echo is already ready', async () => {
    const params = echoParams();
    const id = echoId(params);
    await ctx.echoes.createIfAbsent({
      id,
      params,
      status: 'ready',
      createdAt: 'x',
      updatedAt: 'x',
      totalSentences: 1,
      readySentences: 1,
      sentences: [],
    });
    const res = await echoCreateHandler(jsonRequest(params));
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body as string);
    expect(body.status).toBe('ready');
  });
});
