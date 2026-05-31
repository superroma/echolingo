import type { AudioLang, AudioStorage } from './audio-storage.js';

function key(echoId: string, sentenceIndex: number, lang: AudioLang): string {
  return `${echoId}/${lang}/${sentenceIndex}.mp3`;
}

export class InMemoryAudioStorage implements AudioStorage {
  private readonly map = new Map<string, Buffer>();
  private readonly baseUrl: string;

  constructor(baseUrl = 'memory://audio') {
    this.baseUrl = baseUrl;
  }

  async put(
    echoId: string,
    sentenceIndex: number,
    lang: AudioLang,
    mp3: Buffer,
  ): Promise<string> {
    this.map.set(key(echoId, sentenceIndex, lang), Buffer.from(mp3));
    return this.getUrl(echoId, sentenceIndex, lang);
  }

  async fetch(
    echoId: string,
    sentenceIndex: number,
    lang: AudioLang,
  ): Promise<Buffer | null> {
    const found = this.map.get(key(echoId, sentenceIndex, lang));
    return found ? Buffer.from(found) : null;
  }

  getUrl(echoId: string, sentenceIndex: number, lang: AudioLang): string {
    return `${this.baseUrl}/${key(echoId, sentenceIndex, lang)}`;
  }
}
