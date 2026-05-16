import { BlobServiceClient } from '@azure/storage-blob';
import { QueueServiceClient } from '@azure/storage-queue';

export async function resetContainer(connStr: string, name: string): Promise<void> {
  const blobService = BlobServiceClient.fromConnectionString(connStr);
  const container = blobService.getContainerClient(name);
  await container.deleteIfExists();
  await container.createIfNotExists();
}

export async function resetQueue(connStr: string, name: string): Promise<void> {
  const queueService = QueueServiceClient.fromConnectionString(connStr);
  const queue = queueService.getQueueClient(name);
  await queue.deleteIfExists();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await queue.createIfNotExists();
      return;
    } catch (err) {
      if (attempt === 4) throw err;
      await new Promise((r) => setTimeout(r, 100));
    }
  }
}
