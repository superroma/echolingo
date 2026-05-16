import type { AudioLang, AudioStorage } from './audio-storage.js';

function key(lessonId: string, sentenceIndex: number, lang: AudioLang): string {
  return `${lessonId}/${lang}/${sentenceIndex}.mp3`;
}

export class InMemoryAudioStorage implements AudioStorage {
  private readonly map = new Map<string, Buffer>();
  private readonly baseUrl: string;

  constructor(baseUrl = 'memory://audio') {
    this.baseUrl = baseUrl;
  }

  async put(
    lessonId: string,
    sentenceIndex: number,
    lang: AudioLang,
    mp3: Buffer,
  ): Promise<string> {
    this.map.set(key(lessonId, sentenceIndex, lang), Buffer.from(mp3));
    return this.getUrl(lessonId, sentenceIndex, lang);
  }

  async fetch(
    lessonId: string,
    sentenceIndex: number,
    lang: AudioLang,
  ): Promise<Buffer | null> {
    const found = this.map.get(key(lessonId, sentenceIndex, lang));
    return found ? Buffer.from(found) : null;
  }

  getUrl(lessonId: string, sentenceIndex: number, lang: AudioLang): string {
    return `${this.baseUrl}/${key(lessonId, sentenceIndex, lang)}`;
  }
}
