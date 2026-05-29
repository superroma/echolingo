import { describe, it, expect } from 'vitest';
import {
  LANG_CODES,
  LESSON_LEVELS,
  LESSON_LENGTHS,
  LESSON_MODES,
  BILINGUAL_ORDERS,
  TTS_ENGINES,
  CEFR_LABEL,
  cefr,
  isLessonParams,
  type LessonParams,
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

  it('rejects level outside 1..6', () => {
    expect(isLessonParams({ ...valid, level: 0 })).toBe(false);
    expect(isLessonParams({ ...valid, level: 7 })).toBe(false);
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

describe('CEFR levels', () => {
  it('has six levels 1..6', () => {
    expect(LESSON_LEVELS).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('maps each level to a CEFR band', () => {
    expect(CEFR_LABEL).toEqual({ 1: 'A1', 2: 'A2', 3: 'B1', 4: 'B2', 5: 'C1', 6: 'C2' });
  });

  it('cefr() returns the label, clamping out-of-range input', () => {
    expect(cefr(3)).toBe('B1');
    expect(cefr(6)).toBe('C2');
    expect(cefr(0 as never)).toBe('A1');
    expect(cefr(99 as never)).toBe('C2');
  });

  it('accepts level 6 in isLessonParams', () => {
    const params: LessonParams = {
      topic: 'at the bakery',
      targetLang: 'el',
      nativeLang: 'en',
      lengthMin: 5,
      level: 6,
      mode: 'bilingual',
      bilingualOrder: 'target_first',
      ttsEngine: 'openai',
    };
    expect(isLessonParams(params)).toBe(true);
  });
});
