import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { QueueClient } from '../src/queue/queue-client.js';
import { QueueServiceClient } from '@azure/storage-queue';
import { AZURITE_CONNECTION_STRING, isAzuriteReachable } from './helpers/azurite.js';
import { resetQueue } from './helpers/containers.js';

const SCRIPT_GEN_Q = 'script-gen-test-9';
const TTS_SENTENCE_Q = 'tts-sentence-test-9';

async function readOne(connStr: string, queueName: string): Promise<unknown> {
  const queue = QueueServiceClient.fromConnectionString(connStr).getQueueClient(queueName);
  const res = await queue.receiveMessages({ numberOfMessages: 1 });
  const msg = res.receivedMessageItems[0];
  if (!msg) throw new Error(`No message in ${queueName}`);
  await queue.deleteMessage(msg.messageId, msg.popReceipt);
  return JSON.parse(Buffer.from(msg.messageText, 'base64').toString('utf-8'));
}

describe('QueueClient (integration)', () => {
  let connStr: string | null = null;

  beforeAll(async () => {
    if (await isAzuriteReachable()) connStr = AZURITE_CONNECTION_STRING;
  });

  beforeEach(async () => {
    if (!connStr) return;
    await resetQueue(connStr, SCRIPT_GEN_Q);
    await resetQueue(connStr, TTS_SENTENCE_Q);
  });

  it('enqueues a script-gen job in base64-JSON', async (ctx) => {
    if (!connStr) ctx.skip();
    const client = new QueueClient(connStr!, SCRIPT_GEN_Q, TTS_SENTENCE_Q);
    await client.enqueueScriptGen({ type: 'scriptGen', lessonId: 'abc' });
    expect(await readOne(connStr!, SCRIPT_GEN_Q)).toEqual({ type: 'scriptGen', lessonId: 'abc' });
  });

  it('enqueues a tts-sentence job', async (ctx) => {
    if (!connStr) ctx.skip();
    const client = new QueueClient(connStr!, SCRIPT_GEN_Q, TTS_SENTENCE_Q);
    await client.enqueueTtsSentence({ type: 'ttsSentence', lessonId: 'abc', sentenceIndex: 7 });
    expect(await readOne(connStr!, TTS_SENTENCE_Q)).toEqual({
      type: 'ttsSentence',
      lessonId: 'abc',
      sentenceIndex: 7,
    });
  });
});
