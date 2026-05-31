import { describe, it, expect, beforeEach } from 'vitest';
import { echoCreateHandler } from '../src/functions/echo-create.js';
import { setContextForTests, type ApiContext } from '../src/context.js';
import {
  InMemoryAudioStorage,
  InMemoryEchoRepository,
  MockLlmEngine,
  MockTtsEngine,
} from '../src/_shared/index.js';
import type { HttpRequest } from '@azure/functions';
import { echoParams } from './helpers/fixtures.js';

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
      echoesContainer: 'echoes',
      audioContainer: 'audio',
      rateLimitContainer: 'rate-limits',
      scriptGenQueue: 'script-gen',
      ttsSentenceQueue: 'tts-sentence',
      llmEngine: 'mock',
      ttsEngine: 'mock',
      rateLimitPerDay: limit,
    },
    echoes: new InMemoryEchoRepository(),
    audio: new InMemoryAudioStorage(),
    queue: queue as unknown as ApiContext['queue'],
    llm: new MockLlmEngine(),
    tts: new MockTtsEngine(),
    rateLimits: rates,
    telemetry: { emit: () => {} },
  };
  return { ctx, rates };
}

function jsonRequest(body: unknown, ip = '1.2.3.4'): HttpRequest {
  return {
    method: 'POST',
    url: 'http://localhost/api/echo',
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

describe('POST /api/echo rate limiting', () => {
  let ctx: ApiContext;

  beforeEach(() => {
    ({ ctx } = buildContext(2));
    setContextForTests(ctx);
  });

  it('counts a new echo against the IP daily quota', async () => {
    await echoCreateHandler(jsonRequest(echoParams({ topic: 'one' })));
    await echoCreateHandler(jsonRequest(echoParams({ topic: 'two' })));
    const res = await echoCreateHandler(jsonRequest(echoParams({ topic: 'three' })));
    expect(res.status).toBe(429);
    const body = JSON.parse(res.body as string);
    expect(body.limit).toBe(2);
    expect(body.used).toBe(2);
    expect(body.resetAt).toMatch(/T00:00:00Z$/);
  });

  it('cache hits do not consume rate-limit quota', async () => {
    const params = echoParams({ topic: 'shared' });
    const a = await echoCreateHandler(jsonRequest(params));
    expect(a.status).toBe(201);
    const b = await echoCreateHandler(jsonRequest(params));
    expect(b.status).toBe(200);
    const c = await echoCreateHandler(jsonRequest(echoParams({ topic: 'fresh' })));
    expect(c.status).toBe(201);
    const d = await echoCreateHandler(jsonRequest(echoParams({ topic: 'fourth' })));
    expect(d.status).toBe(429);
  });

  it('separates counters per IP', async () => {
    await echoCreateHandler(jsonRequest(echoParams({ topic: 'a' }), '1.1.1.1'));
    await echoCreateHandler(jsonRequest(echoParams({ topic: 'b' }), '1.1.1.1'));
    const blocked = await echoCreateHandler(
      jsonRequest(echoParams({ topic: 'c' }), '1.1.1.1'),
    );
    expect(blocked.status).toBe(429);
    const otherIp = await echoCreateHandler(
      jsonRequest(echoParams({ topic: 'd' }), '2.2.2.2'),
    );
    expect(otherIp.status).toBe(201);
  });
});
