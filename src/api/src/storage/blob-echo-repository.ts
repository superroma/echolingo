import { BlobServiceClient, RestError, type ContainerClient } from '@azure/storage-blob';
import { DefaultAzureCredential } from '@azure/identity';
import type { Echo, EchoRepository } from '../_shared/index.js';

const BLOB_NAME_SUFFIX = '.json';

export interface BlobEchoRepositoryOptions {
  containerName: string;
  connectionString?: string;
  endpoint?: string;
}

export class BlobEchoRepository implements EchoRepository {
  private readonly container: ContainerClient;

  constructor(connStringOrOpts: string | BlobEchoRepositoryOptions, containerName?: string) {
    let opts: BlobEchoRepositoryOptions;
    if (typeof connStringOrOpts === 'string') {
      opts = { connectionString: connStringOrOpts, containerName: containerName! };
    } else {
      opts = connStringOrOpts;
    }
    let service: BlobServiceClient;
    if (opts.connectionString) {
      service = BlobServiceClient.fromConnectionString(opts.connectionString);
    } else if (opts.endpoint) {
      service = new BlobServiceClient(opts.endpoint, new DefaultAzureCredential());
    } else {
      throw new Error('BlobEchoRepository requires connectionString or endpoint');
    }
    this.container = service.getContainerClient(opts.containerName);
  }

  async ensureContainer(): Promise<void> {
    await this.container.createIfNotExists();
  }

  async get(id: string): Promise<Echo | null> {
    const blob = this.container.getBlockBlobClient(this.blobName(id));
    try {
      const downloaded = await blob.downloadToBuffer();
      return JSON.parse(downloaded.toString('utf-8')) as Echo;
    } catch (err) {
      if (err instanceof RestError && err.statusCode === 404) return null;
      throw err;
    }
  }

  async createIfAbsent(echo: Echo): Promise<Echo> {
    await this.ensureContainer();
    const blob = this.container.getBlockBlobClient(this.blobName(echo.id));
    const body = JSON.stringify(echo);
    try {
      await blob.upload(body, body.length, {
        conditions: { ifNoneMatch: '*' },
        blobHTTPHeaders: { blobContentType: 'application/json' },
      });
      return echo;
    } catch (err) {
      if (err instanceof RestError && (err.statusCode === 409 || err.statusCode === 412)) {
        const existing = await this.get(echo.id);
        if (!existing) throw err;
        return existing;
      }
      throw err;
    }
  }

  async update(id: string, mutator: (echo: Echo) => Echo): Promise<Echo> {
    const blob = this.container.getBlockBlobClient(this.blobName(id));
    for (let attempt = 0; attempt < 5; attempt += 1) {
      let downloaded;
      try {
        downloaded = await blob.download();
      } catch (err) {
        if (err instanceof RestError && err.statusCode === 404) {
          throw new Error(`Echo ${id} not found`);
        }
        throw err;
      }
      if (!downloaded.etag) throw new Error(`Echo ${id} not found`);
      const chunks: Buffer[] = [];
      for await (const chunk of downloaded.readableStreamBody ?? []) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const current = JSON.parse(Buffer.concat(chunks).toString('utf-8')) as Echo;
      const next = mutator(current);
      const body = JSON.stringify(next);
      try {
        await blob.upload(body, body.length, {
          conditions: { ifMatch: downloaded.etag },
          blobHTTPHeaders: { blobContentType: 'application/json' },
        });
        return next;
      } catch (err) {
        if (err instanceof RestError && err.statusCode === 412) {
          continue;
        }
        throw err;
      }
    }
    throw new Error(`Echo ${id} could not be updated after retries`);
  }

  private blobName(id: string): string {
    return `${id}${BLOB_NAME_SUFFIX}`;
  }
}
