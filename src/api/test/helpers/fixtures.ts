import type { LessonParams } from '../../src/_shared/index.js';

export function lessonParams(overrides: Partial<LessonParams> = {}): LessonParams {
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
