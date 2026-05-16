import { describe, it, expect } from 'vitest';
import {
  LESSON_LENGTHS,
  LESSON_STYLES,
  LESSON_MODES,
  BILINGUAL_ORDERS,
  NATIVE_LANGS,
  TTS_ENGINES,
  isLessonParams,
} from '../src/types.js';

describe('domain enums', () => {
  it('exposes the four length presets', () => {
    expect(LESSON_LENGTHS).toEqual([5, 10, 20, 30]);
  });

  it('exposes the three styles', () => {
    expect(LESSON_STYLES).toEqual(['mono', 'dialogue', 'story']);
  });

  it('exposes the two modes', () => {
    expect(LESSON_MODES).toEqual(['greek_only', 'bilingual']);
  });

  it('exposes the two bilingual orders', () => {
    expect(BILINGUAL_ORDERS).toEqual(['gr_first', 'native_first']);
  });

  it('exposes the two native languages', () => {
    expect(NATIVE_LANGS).toEqual(['en', 'ru']);
  });

  it('exposes the three TTS engines', () => {
    expect(TTS_ENGINES).toEqual(['openai', 'elevenlabs', 'google']);
  });
});

describe('isLessonParams', () => {
  const valid = {
    topic: 'at the bakery',
    lengthMin: 10,
    level: 3,
    style: 'dialogue',
    mode: 'bilingual',
    bilingualOrder: 'gr_first',
    nativeLang: 'en',
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

  it('rejects unknown style/mode/order/lang/engine', () => {
    expect(isLessonParams({ ...valid, style: 'rap' })).toBe(false);
    expect(isLessonParams({ ...valid, mode: 'turkish_only' })).toBe(false);
    expect(isLessonParams({ ...valid, bilingualOrder: 'random' })).toBe(false);
    expect(isLessonParams({ ...valid, nativeLang: 'fr' })).toBe(false);
    expect(isLessonParams({ ...valid, ttsEngine: 'aws' })).toBe(false);
  });
});
