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
    const b = await lessonCreateHandler(jsonRequest(params));
    expect(b.status).toBe(200);
    const c = await lessonCreateHandler(jsonRequest(lessonParams({ topic: 'fresh' })));
    expect(c.status).toBe(201);
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
