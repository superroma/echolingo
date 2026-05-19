import {
  QueueServiceClient,
  type QueueClient as AzureQueueClient,
} from '@azure/storage-queue';
import { DefaultAzureCredential } from '@azure/identity';
import type { ScriptGenJob, TtsSentenceJob } from '@echolingo/shared';

export interface QueueClientOptions {
  scriptGenQueue: string;
  ttsSentenceQueue: string;
  connectionString?: string;
  endpoint?: string;
}

export class QueueClient {
  private readonly scriptGen: AzureQueueClient;
  private readonly ttsSentence: AzureQueueClient;

  constructor(
    connStringOrOpts: string | QueueClientOptions,
    scriptGenQueue?: string,
    ttsSentenceQueue?: string,
  ) {
    let opts: QueueClientOptions;
    if (typeof connStringOrOpts === 'string') {
      opts = {
        connectionString: connStringOrOpts,
        scriptGenQueue: scriptGenQueue!,
        ttsSentenceQueue: ttsSentenceQueue!,
      };
    } else {
      opts = connStringOrOpts;
    }
    let service: QueueServiceClient;
    if (opts.connectionString) {
      service = QueueServiceClient.fromConnectionString(opts.connectionString);
    } else if (opts.endpoint) {
      service = new QueueServiceClient(opts.endpoint, new DefaultAzureCredential());
    } else {
      throw new Error('QueueClient requires connectionString or endpoint');
    }
    this.scriptGen = service.getQueueClient(opts.scriptGenQueue);
    this.ttsSentence = service.getQueueClient(opts.ttsSentenceQueue);
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
