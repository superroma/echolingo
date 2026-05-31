export type AudioLang = 'gr' | 'native';

export interface AudioStorage {
  put(echoId: string, sentenceIndex: number, lang: AudioLang, mp3: Buffer): Promise<string>;
  fetch(echoId: string, sentenceIndex: number, lang: AudioLang): Promise<Buffer | null>;
  getUrl(echoId: string, sentenceIndex: number, lang: AudioLang): string;
}
