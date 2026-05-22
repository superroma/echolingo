import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import {
  MockLlmEngine,
  MockTtsEngine,
} from '../src/_shared/index.js';
import { BlobLessonRepository } from '../src/storage/blob-lesson-repository.js';
import { BlobAudioStorage } from '../src/storage/blob-audio-storage.js';
import { QueueClient } from '../src/queue/queue-client.js';
import { setContextForTests, type ApiContext } from '../src/context.js';
import { lessonCreateHandler } from '../src/functions/lesson-create.js';
import { lessonGetHandler } from '../src/functions/lesson-get.js';
import { lessonDownloadHandler } from '../src/functions/lesson-download.js';
import { scriptGenWorker } from '../src/functions/worker-script-gen.js';
import { ttsSentenceWorker } from '../src/functions/worker-tts-sentence.js';
import { AZURITE_CONNECTION_STRING, isAzuriteReachable } from './helpers/azurite.js';
import { resetContainer, resetQueue } from './helpers/containers.js';
import { lessonParams } from './helpers/fixtures.js';
import type { HttpRequest } from '@azure/functions';
import { BlobRateLimitStore } from '../src/storage/blob-rate-limit-store.js';

const LESSONS = 'lessons-download-it';
const AUDIO = 'audio-download-it';
const SCRIPT_Q = 'script-gen-download-it';
const TTS_Q = 'tts-sentence-download-it';
const RATES = 'rate-limits-download-it';

function postRequest(body: unknown): HttpRequest {
  return {
    method: 'POST',
    url: 'http://localhost/api/lesson',
    headers: new Headers({ 'content-type': 'application/json', 'x-forwarded-for': '1.1.1.1' }),
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
    clone() { return this; },
  } as unknown as HttpRequest;
}

function downloadRequest(id: string): HttpRequest {
  return {
    method: 'POST',
    url: `http://localhost/api/lesson/${id}/download`,
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
    clone() { return this; },
  } as unknown as HttpRequest;
}

describe('POST /api/lesson/{id}/download (integration)', () => {
  let connStr: string | null = null;

  beforeAll(async () => {
    if (await isAzuriteReachable()) connStr = AZURITE_CONNECTION_STRING;
  });

  beforeEach(async () => {
    if (!connStr) return;
    await Promise.all([
      resetContainer(connStr, LESSONS),
      resetContainer(connStr, AUDIO),
      resetContainer(connStr, RATES),
      resetQueue(connStr, SCRIPT_Q),
      resetQueue(connStr, TTS_Q),
    ]);
    const ctx: ApiContext = {
      config: {
        storageConnectionString: connStr,
        lessonsContainer: LESSONS,
        audioContainer: AUDIO,
        rateLimitContainer: RATES,
        scriptGenQueue: SCRIPT_Q,
        ttsSentenceQueue: TTS_Q,
        llmEngine: 'mock',
        ttsEngine: 'mock',
        rateLimitPerDay: 100,
      },
      lessons: new BlobLessonRepository(connStr, LESSONS),
      audio: new BlobAudioStorage(connStr, AUDIO),
      queue: new QueueClient(connStr, SCRIPT_Q, TTS_Q),
      llm: new MockLlmEngine({
        script: 'Καλημέρα.||Good morning.\nΓεια σου.||Hello.',
      }),
      tts: new MockTtsEngine(),
      rateLimits: new BlobRateLimitStore(connStr, RATES),
      telemetry: { emit: () => {} },
    };
    setContextForTests(ctx);
  });

  async function makeReadyLesson(): Promise<string> {
    const createRes = await lessonCreateHandler(postRequest(lessonParams()));
    const { id } = JSON.parse(createRes.body as string);
    await scriptGenWorker({ type: 'scriptGen', lessonId: id });
    const lessonRes = await lessonGetHandler(downloadRequest(id));
    const lesson = JSON.parse(lessonRes.body as string);
    for (const s of lesson.sentences) {
      await ttsSentenceWorker({ type: 'ttsSentence', lessonId: id, sentenceIndex: s.i });
    }
    return id;
  }

  it('returns 404 for unknown lesson', async (ctx) => {
    if (!connStr) ctx.skip();
    const res = await lessonDownloadHandler(downloadRequest('does-not-exist'));
    expect(res.status).toBe(404);
  });

  it('returns 409 when lesson is not ready', async (ctx) => {
    if (!connStr) ctx.skip();
    const createRes = await lessonCreateHandler(postRequest(lessonParams()));
    const { id } = JSON.parse(createRes.body as string);
    const res = await lessonDownloadHandler(downloadRequest(id));
    expect(res.status).toBe(409);
  });

  it('returns 200 with a full mp3 URL once the lesson is ready', async (ctx) => {
    if (!connStr) ctx.skip();
    const id = await makeReadyLesson();
    const res = await lessonDownloadHandler(downloadRequest(id));
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body as string);
    expect(body.url).toMatch(/\/audio-download-it\/.+\/full\.mp3$/);
  });

  it('is idempotent — second download call returns the cached fullMp3Url', async (ctx) => {
    if (!connStr) ctx.skip();
    const id = await makeReadyLesson();
    const first = JSON.parse((await lessonDownloadHandler(downloadRequest(id))).body as string);
    const second = JSON.parse((await lessonDownloadHandler(downloadRequest(id))).body as string);
    expect(second.url).toBe(first.url);
  });
});
