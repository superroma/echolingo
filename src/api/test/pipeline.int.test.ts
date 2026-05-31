import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import {
  MockLlmEngine,
  MockTtsEngine,
} from '../src/_shared/index.js';
import { BlobEchoRepository } from '../src/storage/blob-echo-repository.js';
import { BlobAudioStorage } from '../src/storage/blob-audio-storage.js';
import { BlobRateLimitStore } from '../src/storage/blob-rate-limit-store.js';
import { QueueClient } from '../src/queue/queue-client.js';
import { setContextForTests, type ApiContext } from '../src/context.js';
import { echoCreateHandler } from '../src/functions/echo-create.js';
import { echoGetHandler } from '../src/functions/echo-get.js';
import { scriptGenWorker } from '../src/functions/worker-script-gen.js';
import { ttsSentenceWorker } from '../src/functions/worker-tts-sentence.js';
import { AZURITE_CONNECTION_STRING, isAzuriteReachable } from './helpers/azurite.js';
import { resetContainer, resetQueue } from './helpers/containers.js';
import { echoParams } from './helpers/fixtures.js';
import type { HttpRequest } from '@azure/functions';
import { QueueServiceClient } from '@azure/storage-queue';

const ECHOES = 'echoes-it-15';
const AUDIO = 'audio-it-15';
const SCRIPT_Q = 'script-gen-it-15';
const TTS_Q = 'tts-sentence-it-15';

const CANNED = ['Καλημέρα.||Good morning.', 'Γεια σου.||Hello.'].join('\n');

function putRequest(id: string, body: unknown): HttpRequest {
  return {
    method: 'PUT',
    url: `http://localhost/api/echo/${id}`,
    headers: new Headers({ 'content-type': 'application/json' }),
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
      resetContainer(connStr, ECHOES),
      resetContainer(connStr, AUDIO),
      resetContainer(connStr, 'rate-limits-it-15'),
      resetQueue(connStr, SCRIPT_Q),
      resetQueue(connStr, TTS_Q),
    ]);
    ctx = {
      config: {
        storageConnectionString: connStr,
        echoesContainer: ECHOES,
        audioContainer: AUDIO,
        rateLimitContainer: 'rate-limits',
        scriptGenQueue: SCRIPT_Q,
        ttsSentenceQueue: TTS_Q,
        llmEngine: 'mock' as const,
        ttsEngine: 'mock' as const,
        rateLimitPerDay: 1000,
      },
      echoes: new BlobEchoRepository(connStr, ECHOES),
      audio: new BlobAudioStorage(connStr, AUDIO),
      queue: new QueueClient(connStr, SCRIPT_Q, TTS_Q),
      llm: new MockLlmEngine({ script: CANNED }),
      tts: new MockTtsEngine(),
      rateLimits: new BlobRateLimitStore(connStr, 'rate-limits-it-15'),
      telemetry: { emit: () => {} },
    };
    setContextForTests(ctx);
  });

  it('PUT → workers → GET produces a ready echo with audio URLs', async (testCtx) => {
    if (!connStr) testCtx.skip();
    const params = echoParams();
    const ECHO_ID = 'k7Xp2qB9';
    const createRes = await echoCreateHandler(putRequest(ECHO_ID, params));
    expect(createRes.status).toBe(201);
    const { id } = JSON.parse(createRes.body as string);
    expect(id).toBe(ECHO_ID);

    const scriptJobs = await drain(connStr!, SCRIPT_Q);
    expect(scriptJobs).toEqual([{ type: 'scriptGen', echoId: id }]);
    await scriptGenWorker({ type: 'scriptGen', echoId: id });

    const ttsJobs = await drain(connStr!, TTS_Q);
    expect(ttsJobs).toHaveLength(2);
    for (const job of ttsJobs as Array<{ type: string; echoId: string; sentenceIndex: number }>) {
      await ttsSentenceWorker({ type: 'ttsSentence', echoId: job.echoId, sentenceIndex: job.sentenceIndex });
    }

    const getRes = await echoGetHandler(getRequest(id));
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
