import { BlobServiceClient, RestError, type ContainerClient } from '@azure/storage-blob';
import type { Lesson, LessonRepository } from '@echolingo/shared';

const BLOB_NAME_SUFFIX = '.json';

export class BlobLessonRepository implements LessonRepository {
  private readonly container: ContainerClient;

  constructor(connectionString: string, containerName: string) {
    const service = BlobServiceClient.fromConnectionString(connectionString);
    this.container = service.getContainerClient(containerName);
  }

  async ensureContainer(): Promise<void> {
    await this.container.createIfNotExists();
  }

  async get(id: string): Promise<Lesson | null> {
    const blob = this.container.getBlockBlobClient(this.blobName(id));
    try {
      const downloaded = await blob.downloadToBuffer();
      return JSON.parse(downloaded.toString('utf-8')) as Lesson;
    } catch (err) {
      if (err instanceof RestError && err.statusCode === 404) return null;
      throw err;
    }
  }

  async createIfAbsent(lesson: Lesson): Promise<Lesson> {
    await this.ensureContainer();
    const blob = this.container.getBlockBlobClient(this.blobName(lesson.id));
    const body = JSON.stringify(lesson);
    try {
      await blob.upload(body, body.length, {
        conditions: { ifNoneMatch: '*' },
        blobHTTPHeaders: { blobContentType: 'application/json' },
      });
      return lesson;
    } catch (err) {
      if (err instanceof RestError && (err.statusCode === 409 || err.statusCode === 412)) {
        const existing = await this.get(lesson.id);
        if (!existing) throw err;
        return existing;
      }
      throw err;
    }
  }

  async update(id: string, mutator: (lesson: Lesson) => Lesson): Promise<Lesson> {
    const blob = this.container.getBlockBlobClient(this.blobName(id));
    for (let attempt = 0; attempt < 5; attempt += 1) {
      let downloaded;
      try {
        downloaded = await blob.download();
      } catch (err) {
        if (err instanceof RestError && err.statusCode === 404) {
          throw new Error(`Lesson ${id} not found`);
        }
        throw err;
      }
      if (!downloaded.etag) throw new Error(`Lesson ${id} not found`);
      const chunks: Buffer[] = [];
      for await (const chunk of downloaded.readableStreamBody ?? []) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const current = JSON.parse(Buffer.concat(chunks).toString('utf-8')) as Lesson;
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
    throw new Error(`Lesson ${id} could not be updated after retries`);
  }

  private blobName(id: string): string {
    return `${id}${BLOB_NAME_SUFFIX}`;
  }
}
