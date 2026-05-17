import { describe, it, expect, beforeEach } from 'vitest';
import { lessonGetHandler } from '../src/functions/lesson-get.js';
import { setContextForTests, type ApiContext } from '../src/context.js';
import {
  InMemoryAudioStorage,
  InMemoryLessonRepository,
  MockLlmEngine,
  MockTtsEngine,
} from '@echolingo/shared';
import type { HttpRequest } from '@azure/functions';
import { lessonParams } from './helpers/fixtures.js';

function buildContext(): ApiContext {
  return {
    config: {
      storageConnectionString: 'UseDevelopmentStorage=true',
      lessonsContainer: 'lessons',
      audioContainer: 'audio',
      scriptGenQueue: 'script-gen',
      ttsSentenceQueue: 'tts-sentence',
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
  };
}

function getRequest(id: string): HttpRequest {
  return {
    method: 'GET',
    url: `http://localhost/api/lesson/${id}`,
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

describe('lessonGetHandler', () => {
  let ctx: ApiContext;

  beforeEach(() => {
    ctx = buildContext();
    setContextForTests(ctx);
  });

  it('returns 404 for unknown lesson id', async () => {
    const res = await lessonGetHandler(getRequest('does-not-exist'));
    expect(res.status).toBe(404);
  });

  it('returns 200 with the lesson body when it exists', async () => {
    const params = lessonParams();
    const id = 'id1';
    await ctx.lessons.createIfAbsent({
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
    const res = await lessonGetHandler(getRequest(id));
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body as string);
    expect(body.id).toBe(id);
    expect(body.status).toBe('generating_audio');
    expect(body.totalSentences).toBe(2);
    expect(body.readySentences).toBe(1);
    expect(body.sentences).toHaveLength(2);
  });
});
