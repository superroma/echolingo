import { BlobServiceClient, RestError, type ContainerClient } from '@azure/storage-blob';
import { DefaultAzureCredential } from '@azure/identity';
import type { AudioLang, AudioStorage } from '../_shared/index.js';

function blobName(lessonId: string, sentenceIndex: number, lang: AudioLang): string {
  return `${lessonId}/${lang}/${sentenceIndex}.mp3`;
}

export interface BlobAudioStorageOptions {
  containerName: string;
  connectionString?: string;
  endpoint?: string;
}

export class BlobAudioStorage implements AudioStorage {
  private readonly container: ContainerClient;
  private readonly containerName: string;
  private readonly accountUrl: string;

  constructor(connStringOrOpts: string | BlobAudioStorageOptions, containerName?: string) {
    let opts: BlobAudioStorageOptions;
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
      throw new Error('BlobAudioStorage requires connectionString or endpoint');
    }
    this.container = service.getContainerClient(opts.containerName);
    this.containerName = opts.containerName;
    this.accountUrl = service.url.replace(/\/$/, '');
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
