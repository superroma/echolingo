import { describe, it, expect } from 'vitest';
import {
  LANG_CODES,
  LESSON_LENGTHS,
  LESSON_MODES,
  BILINGUAL_ORDERS,
  TTS_ENGINES,
  isLessonParams,
} from '../src/types.js';

describe('domain enums', () => {
  it('exposes the four length presets', () => {
    expect(LESSON_LENGTHS).toEqual([5, 10, 20, 30]);
  });

  it('exposes the two modes', () => {
    expect(LESSON_MODES).toEqual(['target_only', 'bilingual']);
  });

  it('exposes the two bilingual orders', () => {
    expect(BILINGUAL_ORDERS).toEqual(['target_first', 'native_first']);
  });

  it('exposes the curated v1 language codes', () => {
    expect(LANG_CODES).toEqual([
      'el', 'es', 'it', 'fr', 'de', 'pt', 'ja', 'zh', 'en', 'ru',
    ]);
  });

  it('exposes the three TTS engines', () => {
    expect(TTS_ENGINES).toEqual(['openai', 'elevenlabs', 'google']);
  });
});

describe('isLessonParams', () => {
  const valid = {
    topic: 'at the bakery',
    targetLang: 'el',
    nativeLang: 'en',
    lengthMin: 10,
    level: 3,
    mode: 'bilingual',
    bilingualOrder: 'target_first',
    ttsEngine: 'openai',
  };

  it('accepts a fully-valid object', () => {
    expect(isLessonParams(valid)).toBe(true);
  });

  it('rejects missing topic', () => {
    expect(isLessonParams({ ...valid, topic: '' })).toBe(false);
  });

  it('rejects unknown length', () => {
    expect(isLessonParams({ ...valid, lengthMin: 7 })).toBe(false);
  });

  it('rejects level outside 1..5', () => {
    expect(isLessonParams({ ...valid, level: 0 })).toBe(false);
    expect(isLessonParams({ ...valid, level: 6 })).toBe(false);
  });

  it('rejects unknown mode/order/engine', () => {
    expect(isLessonParams({ ...valid, mode: 'greek_only' })).toBe(false);
    expect(isLessonParams({ ...valid, bilingualOrder: 'gr_first' })).toBe(false);
    expect(isLessonParams({ ...valid, ttsEngine: 'aws' })).toBe(false);
  });

  it('rejects missing targetLang', () => {
    const { targetLang: _t, ...rest } = valid;
    expect(isLessonParams(rest)).toBe(false);
  });

  it('rejects unknown targetLang code', () => {
    expect(isLessonParams({ ...valid, targetLang: 'xx' })).toBe(false);
  });

  it('rejects targetLang === nativeLang', () => {
    expect(isLessonParams({ ...valid, targetLang: 'en' })).toBe(false);
  });

  it('accepts widened native languages beyond en/ru', () => {
    expect(isLessonParams({ ...valid, nativeLang: 'es' })).toBe(true);
    expect(isLessonParams({ ...valid, nativeLang: 'ja' })).toBe(true);
  });
});
