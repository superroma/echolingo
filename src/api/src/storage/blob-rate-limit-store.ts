import { BlobServiceClient, RestError, type ContainerClient } from '@azure/storage-blob';

interface RateLimitDocument {
  count: number;
}

export class BlobRateLimitStore {
  private readonly container: ContainerClient;

  constructor(connectionString: string, containerName: string) {
    const service = BlobServiceClient.fromConnectionString(connectionString);
    this.container = service.getContainerClient(containerName);
  }

  async ensureContainer(): Promise<void> {
    await this.container.createIfNotExists();
  }

  async get(ip: string, date: string): Promise<number> {
    const blob = this.container.getBlockBlobClient(this.blobName(ip, date));
    try {
      const downloaded = await blob.downloadToBuffer();
      const parsed = JSON.parse(downloaded.toString('utf-8')) as RateLimitDocument;
      return parsed.count;
    } catch (err) {
      if (err instanceof RestError && err.statusCode === 404) return 0;
      throw err;
    }
  }

  async increment(ip: string, date: string): Promise<number> {
    await this.ensureContainer();
    const blob = this.container.getBlockBlobClient(this.blobName(ip, date));
    for (let attempt = 0; attempt < 5; attempt += 1) {
      // Try create-if-absent first
      try {
        const body = JSON.stringify({ count: 1 } satisfies RateLimitDocument);
        await blob.upload(body, body.length, {
          conditions: { ifNoneMatch: '*' },
          blobHTTPHeaders: { blobContentType: 'application/json' },
        });
        return 1;
      } catch (err) {
        if (!(err instanceof RestError) || (err.statusCode !== 409 && err.statusCode !== 412)) {
          throw err;
        }
      }

      // Exists — read, increment, write with etag guard
      let downloaded;
      try {
        downloaded = await blob.download();
      } catch (err) {
        if (err instanceof RestError && err.statusCode === 404) continue;
        throw err;
      }
      if (!downloaded.etag) continue;
      const chunks: Buffer[] = [];
      for await (const chunk of downloaded.readableStreamBody ?? []) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const current = JSON.parse(Buffer.concat(chunks).toString('utf-8')) as RateLimitDocument;
      const next: RateLimitDocument = { count: current.count + 1 };
      const body = JSON.stringify(next);
      try {
        await blob.upload(body, body.length, {
          conditions: { ifMatch: downloaded.etag },
          blobHTTPHeaders: { blobContentType: 'application/json' },
        });
        return next.count;
      } catch (err) {
        if (err instanceof RestError && err.statusCode === 412) continue;
        throw err;
      }
    }
    throw new Error('rate limit increment exhausted retries');
  }

  private blobName(ip: string, date: string): string {
    return `${ip}/${date}.json`;
  }
}
