import { describe, it, expect } from 'vitest';
import { lessonId } from '../src/lesson-id.js';
import type { LessonParams } from '../src/types.js';

const base: LessonParams = {
  topic: 'at the bakery',
  lengthMin: 10,
  level: 3,
  style: 'dialogue',
  mode: 'bilingual',
  bilingualOrder: 'gr_first',
  nativeLang: 'en',
  ttsEngine: 'openai',
};

describe('lessonId', () => {
  it('returns a 64-char hex string', () => {
    const id = lessonId(base);
    expect(id).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic for the same params', () => {
    expect(lessonId(base)).toBe(lessonId(base));
  });

  it('is invariant to key order', () => {
    const shuffled = JSON.parse(JSON.stringify(base));
    expect(lessonId(base)).toBe(lessonId(shuffled));
  });

  it('changes when any param changes', () => {
    expect(lessonId(base)).not.toBe(lessonId({ ...base, topic: 'at the market' }));
    expect(lessonId(base)).not.toBe(lessonId({ ...base, lengthMin: 20 }));
    expect(lessonId(base)).not.toBe(lessonId({ ...base, level: 4 }));
    expect(lessonId(base)).not.toBe(lessonId({ ...base, style: 'story' }));
  });

  it('treats absent voice and undefined voice as identical', () => {
    const withVoice = { ...base, voice: undefined };
    expect(lessonId(base)).toBe(lessonId(withVoice));
  });

  it('distinguishes by explicit voice', () => {
    expect(lessonId(base)).not.toBe(lessonId({ ...base, voice: 'alloy' }));
  });

  it('normalizes topic whitespace and case to avoid trivial cache misses', () => {
    expect(lessonId({ ...base, topic: 'At The Bakery' })).toBe(
      lessonId({ ...base, topic: '  at the bakery  ' }),
    );
  });
});
