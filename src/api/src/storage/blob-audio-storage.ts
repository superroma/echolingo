import { BlobServiceClient, RestError, type ContainerClient } from '@azure/storage-blob';
import type { AudioLang, AudioStorage } from '@echolingo/shared';

function blobName(lessonId: string, sentenceIndex: number, lang: AudioLang): string {
  return `${lessonId}/${lang}/${sentenceIndex}.mp3`;
}

export class BlobAudioStorage implements AudioStorage {
  private readonly container: ContainerClient;
  private readonly containerName: string;
  private readonly accountUrl: string;

  constructor(connectionString: string, containerName: string) {
    const service = BlobServiceClient.fromConnectionString(connectionString);
    this.container = service.getContainerClient(containerName);
    this.containerName = containerName;
    this.accountUrl = service.url;
  }

  async ensureContainer(): Promise<void> {
    await this.container.createIfNotExists();
  }

  async put(
    lessonId: string,
    sentenceIndex: number,
    lang: AudioLang,
    mp3: Buffer,
  ): Promise<string> {
    await this.ensureContainer();
    const blob = this.container.getBlockBlobClient(blobName(lessonId, sentenceIndex, lang));
    await blob.upload(mp3, mp3.length, {
      blobHTTPHeaders: { blobContentType: 'audio/mpeg' },
    });
    return this.getUrl(lessonId, sentenceIndex, lang);
  }

  async fetch(
    lessonId: string,
    sentenceIndex: number,
    lang: AudioLang,
  ): Promise<Buffer | null> {
    const blob = this.container.getBlockBlobClient(blobName(lessonId, sentenceIndex, lang));
    try {
      return await blob.downloadToBuffer();
    } catch (err) {
      if (err instanceof RestError && err.statusCode === 404) return null;
      throw err;
    }
  }

  getUrl(lessonId: string, sentenceIndex: number, lang: AudioLang): string {
    return `${this.accountUrl}/${this.containerName}/${blobName(lessonId, sentenceIndex, lang)}`;
  }
}
