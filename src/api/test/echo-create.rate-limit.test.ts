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

function putRequest(id: string, body: unknown, ip = '1.2.3.4'): HttpRequest {
  return {
    method: 'PUT',
    url: `http://localhost/api/echo/${id}`,
    headers: new Headers({
      'content-type': 'application/json',
      'x-forwarded-for': ip,
    }),
    query: new URLSearchParams(),
    params: { id },
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

describe('PUT /api/echo/{id} rate limiting', () => {
  let ctx: ApiContext;

  beforeEach(() => {
    ({ ctx } = buildContext(2));
    setContextForTests(ctx);
  });

  it('counts a new echo against the IP daily quota', async () => {
    await echoCreateHandler(putRequest('aaaaaaa1', echoParams()));
    await echoCreateHandler(putRequest('aaaaaaa2', echoParams()));
    const res = await echoCreateHandler(putRequest('aaaaaaa3', echoParams()));
    expect(res.status).toBe(429);
    const body = JSON.parse(res.body as string);
    expect(body.limit).toBe(2);
    expect(body.used).toBe(2);
    expect(body.resetAt).toMatch(/T00:00:00Z$/);
  });

  it('cache hits do not consume rate-limit quota', async () => {
    const params = echoParams();
    const a = await echoCreateHandler(putRequest('shared01', params));
    expect(a.status).toBe(201);
    const b = await echoCreateHandler(putRequest('shared01', params));
    expect(b.status).toBe(200);
    const c = await echoCreateHandler(putRequest('fresh001', echoParams()));
    expect(c.status).toBe(201);
    const d = await echoCreateHandler(putRequest('fourth01', echoParams()));
    expect(d.status).toBe(429);
  });

  it('separates counters per IP', async () => {
    await echoCreateHandler(putRequest('ipaaaaa1', echoParams(), '1.1.1.1'));
    await echoCreateHandler(putRequest('ipaaaaa2', echoParams(), '1.1.1.1'));
    const blocked = await echoCreateHandler(
      putRequest('ipaaaaa3', echoParams(), '1.1.1.1'),
    );
    expect(blocked.status).toBe(429);
    const otherIp = await echoCreateHandler(
      putRequest('ipbbbbb1', echoParams(), '2.2.2.2'),
    );
    expect(otherIp.status).toBe(201);
  });
});
