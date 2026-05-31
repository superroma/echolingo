import type { EchoParams } from '../../src/_shared/index.js';

export function echoParams(overrides: Partial<EchoParams> = {}): EchoParams {
  return {
    topic: 'at the bakery',
    targetLang: 'el',
    nativeLang: 'en',
    lengthMin: 5,
    level: 3,
    mode: 'bilingual',
    bilingualOrder: 'target_first',
    ttsEngine: 'openai',
    ...overrides,
  };
}
