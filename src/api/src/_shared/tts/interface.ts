import type { TtsEngineName } from '../types.js';

export type TtsLang = 'el' | 'en' | 'ru';

export interface TtsSynthesizeRequest {
  text: string;
  lang: TtsLang;
  voice?: string;
}

export interface TtsSynthesizeResult {
  mp3: Buffer;
  durationSec: number;
}

export interface TtsEngine {
  readonly name: TtsEngineName | 'mock';
  synthesize(req: TtsSynthesizeRequest): Promise<TtsSynthesizeResult>;
}
