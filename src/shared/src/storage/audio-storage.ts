export type AudioLang = 'gr' | 'native';

export interface AudioStorage {
  put(lessonId: string, sentenceIndex: number, lang: AudioLang, mp3: Buffer): Promise<string>;
  fetch(lessonId: string, sentenceIndex: number, lang: AudioLang): Promise<Buffer | null>;
  getUrl(lessonId: string, sentenceIndex: number, lang: AudioLang): string;
}
