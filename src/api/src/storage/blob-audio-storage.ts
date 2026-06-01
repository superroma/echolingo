import { BlobServiceClient, RestError, type ContainerClient } from '@azure/storage-blob';
import { DefaultAzureCredential } from '@azure/identity';
import type { AudioLang, AudioStorage } from '../_shared/index.js';

function blobName(echoId: string, sentenceIndex: number, lang: AudioLang): string {
  return `${echoId}/${lang}/${sentenceIndex}.mp3`;
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
    // Audio is served to the browser by stable, public URLs (no SAS), so the
    // container must allow anonymous blob read. In prod the Bicep storage module
    // already sets publicAccess: 'Blob'; setting it here too makes local azurite
    // (which never sees that Bicep) match prod, so audio actually plays in dev.
    await this.container.createIfNotExists({ access: 'blob' });
  }

  async put(
    echoId: string,
    sentenceIndex: number,
    lang: AudioLang,
    mp3: Buffer,
  ): Promise<string> {
    await this.ensureContainer();
    const blob = this.container.getBlockBlobClient(blobName(echoId, sentenceIndex, lang));
    await blob.upload(mp3, mp3.length, {
      blobHTTPHeaders: { blobContentType: 'audio/mpeg' },
    });
    return this.getUrl(echoId, sentenceIndex, lang);
  }

  async fetch(
    echoId: string,
    sentenceIndex: number,
    lang: AudioLang,
  ): Promise<Buffer | null> {
    const blob = this.container.getBlockBlobClient(blobName(echoId, sentenceIndex, lang));
    try {
      return await blob.downloadToBuffer();
    } catch (err) {
      if (err instanceof RestError && err.statusCode === 404) return null;
      throw err;
    }
  }

  getUrl(echoId: string, sentenceIndex: number, lang: AudioLang): string {
    return `${this.accountUrl}/${this.containerName}/${blobName(echoId, sentenceIndex, lang)}`;
  }
}
