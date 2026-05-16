import type { LessonParams } from '@echolingo/shared';

export function lessonParams(overrides: Partial<LessonParams> = {}): LessonParams {
  return {
    topic: 'at the bakery',
    lengthMin: 5,
    level: 3,
    style: 'dialogue',
    mode: 'bilingual',
    bilingualOrder: 'gr_first',
    nativeLang: 'en',
    ttsEngine: 'openai',
    ...overrides,
  };
}
