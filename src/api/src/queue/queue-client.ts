import {
  QueueServiceClient,
  type QueueClient as AzureQueueClient,
} from '@azure/storage-queue';
import type { ScriptGenJob, TtsSentenceJob } from '@echolingo/shared';

export class QueueClient {
  private readonly scriptGen: AzureQueueClient;
  private readonly ttsSentence: AzureQueueClient;

  constructor(connectionString: string, scriptGenQueue: string, ttsSentenceQueue: string) {
    const service = QueueServiceClient.fromConnectionString(connectionString);
    this.scriptGen = service.getQueueClient(scriptGenQueue);
    this.ttsSentence = service.getQueueClient(ttsSentenceQueue);
  }

  async ensureQueues(): Promise<void> {
    await Promise.all([this.scriptGen.createIfNotExists(), this.ttsSentence.createIfNotExists()]);
  }

  async enqueueScriptGen(job: ScriptGenJob): Promise<void> {
    await this.ensureQueues();
    await this.scriptGen.sendMessage(encode(job));
  }

  async enqueueTtsSentence(job: TtsSentenceJob): Promise<void> {
    await this.ensureQueues();
    await this.ttsSentence.sendMessage(encode(job));
  }
}

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf-8').toString('base64');
}
