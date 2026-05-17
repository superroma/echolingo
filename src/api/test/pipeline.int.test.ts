import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import {
  MockLlmEngine,
  MockTtsEngine,
  lessonId,
} from '@echolingo/shared';
import { BlobLessonRepository } from '../src/storage/blob-lesson-repository.js';
import { BlobAudioStorage } from '../src/storage/blob-audio-storage.js';
import { BlobRateLimitStore } from '../src/storage/blob-rate-limit-store.js';
import { QueueClient } from '../src/queue/queue-client.js';
import { setContextForTests, type ApiContext } from '../src/context.js';
import { lessonCreateHandler } from '../src/functions/lesson-create.js';
import { lessonGetHandler } from '../src/functions/lesson-get.js';
import { scriptGenWorker } from '../src/functions/worker-script-gen.js';
import { ttsSentenceWorker } from '../src/functions/worker-tts-sentence.js';
import { AZURITE_CONNECTION_STRING, isAzuriteReachable } from './helpers/azurite.js';
import { resetContainer, resetQueue } from './helpers/containers.js';
import { lessonParams } from './helpers/fixtures.js';
import type { HttpRequest } from '@azure/functions';
import { QueueServiceClient } from '@azure/storage-queue';

const LESSONS = 'lessons-it-15';
const AUDIO = 'audio-it-15';
const SCRIPT_Q = 'script-gen-it-15';
const TTS_Q = 'tts-sentence-it-15';

const CANNED = ['Καλημέρα.||Good morning.', 'Γεια σου.||Hello.'].join('\n');

function postRequest(body: unknown): HttpRequest {
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

async function drain(connStr: string, queueName: string): Promise<unknown[]> {
  const queue = QueueServiceClient.fromConnectionString(connStr).getQueueClient(queueName);
  const jobs: unknown[] = [];
  while (true) {
    const res = await queue.receiveMessages({ numberOfMessages: 32 });
    if (res.receivedMessageItems.length === 0) break;
    for (const msg of res.receivedMessageItems) {
      jobs.push(JSON.parse(Buffer.from(msg.messageText, 'base64').toString('utf-8')));
      await queue.deleteMessage(msg.messageId, msg.popReceipt);
    }
  }
  return jobs;
}

describe('pipeline end-to-end (integration)', () => {
  let connStr: string | null = null;
  let ctx: ApiContext;

  beforeAll(async () => {
    if (await isAzuriteReachable()) connStr = AZURITE_CONNECTION_STRING;
  });

  beforeEach(async () => {
    if (!connStr) return;
    await Promise.all([
      resetContainer(connStr, LESSONS),
      resetContainer(connStr, AUDIO),
      resetContainer(connStr, 'rate-limits-it-15'),
      resetQueue(connStr, SCRIPT_Q),
      resetQueue(connStr, TTS_Q),
    ]);
    ctx = {
      config: {
        storageConnectionString: connStr,
        lessonsContainer: LESSONS,
        audioContainer: AUDIO,
        rateLimitContainer: 'rate-limits',
        scriptGenQueue: SCRIPT_Q,
        ttsSentenceQueue: TTS_Q,
        llmEngine: 'mock' as const,
        ttsEngine: 'mock' as const,
        rateLimitPerDay: 1000,
      },
      lessons: new BlobLessonRepository(connStr, LESSONS),
      audio: new BlobAudioStorage(connStr, AUDIO),
      queue: new QueueClient(connStr, SCRIPT_Q, TTS_Q),
      llm: new MockLlmEngine({ script: CANNED }),
      tts: new MockTtsEngine(),
      rateLimits: new BlobRateLimitStore(connStr, 'rate-limits-it-15'),
    };
    setContextForTests(ctx);
  });

  it('POST → workers → GET produces a ready lesson with audio URLs', async (testCtx) => {
    if (!connStr) testCtx.skip();
    const params = lessonParams();
    const createRes = await lessonCreateHandler(postRequest(params));
    expect(createRes.status).toBe(201);
    const { id } = JSON.parse(createRes.body as string);
    expect(id).toBe(lessonId(params));

    const scriptJobs = await drain(connStr!, SCRIPT_Q);
    expect(scriptJobs).toEqual([{ type: 'scriptGen', lessonId: id }]);
    await scriptGenWorker({ type: 'scriptGen', lessonId: id });

    const ttsJobs = await drain(connStr!, TTS_Q);
    expect(ttsJobs).toHaveLength(2);
    for (const job of ttsJobs as Array<{ type: string; lessonId: string; sentenceIndex: number }>) {
      await ttsSentenceWorker({ type: 'ttsSentence', lessonId: job.lessonId, sentenceIndex: job.sentenceIndex });
    }

    const getRes = await lessonGetHandler(getRequest(id));
    expect(getRes.status).toBe(200);
    const body = JSON.parse(getRes.body as string);
    expect(body.status).toBe('ready');
    expect(body.totalSentences).toBe(2);
    expect(body.readySentences).toBe(2);
    expect(body.sentences[0].grUrl).toBeDefined();
    expect(body.sentences[0].nativeUrl).toBeDefined();

    const audio = await ctx.audio.fetch(id, 0, 'gr');
    expect(audio?.length).toBeGreaterThan(0);
  });
});
