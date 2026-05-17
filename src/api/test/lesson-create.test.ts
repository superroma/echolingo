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
