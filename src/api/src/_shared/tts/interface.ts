import type { LangCode, TtsEngineName } from '../types.js';

export type TtsLang = LangCode;

export interface TtsSynthesizeRequest {
  text: string;
  lang: TtsLang;
  voice?: string;
}

export interface TtsSynthesizeResult {
  mp3: Buffer;
  durationSec: number;
}

// 'azurespeech' is a runtime engine identifier; it is intentionally NOT part of
// the client-facing TTS_ENGINES enum (which describes requested EchoParams).
export interface TtsEngine {
  readonly name: TtsEngineName | 'mock' | 'azurespeech';
  synthesize(req: TtsSynthesizeRequest): Promise<TtsSynthesizeResult>;
}
