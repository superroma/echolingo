import { describe, it, expect } from 'vitest';
import { buildPrompt } from '../src/prompts.js';
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

describe('buildPrompt', () => {
  it('mentions the topic verbatim', () => {
    expect(buildPrompt(base).user).toContain('at the bakery');
  });

  it('encodes the target length in approximate word count', () => {
    const p = buildPrompt({ ...base, lengthMin: 10 }).user;
    expect(p).toMatch(/about 1[34]\d\d words|approximately/i);
  });

  it('encodes level as a difficulty descriptor', () => {
    expect(buildPrompt({ ...base, level: 1 }).user).toMatch(/beginner|level 1/i);
    expect(buildPrompt({ ...base, level: 5 }).user).toMatch(/advanced|level 5/i);
  });

  it('selects the dialogue template for style=dialogue', () => {
    expect(buildPrompt({ ...base, style: 'dialogue' }).user).toMatch(/dialogue|conversation/i);
  });

  it('selects the story template for style=story', () => {
    expect(buildPrompt({ ...base, style: 'story' }).user).toMatch(/story|narrative/i);
  });

  it('selects the monologue template for style=mono', () => {
    expect(buildPrompt({ ...base, style: 'mono' }).user).toMatch(/monologue|narrator|essay/i);
  });

  it('specifies output format: GR||NATIVE pairs, one per line', () => {
    const p = buildPrompt(base).user;
    expect(p).toContain('GR||');
  });

  it('uses English for native language when nativeLang=en', () => {
    expect(buildPrompt({ ...base, nativeLang: 'en' }).user).toMatch(/English/i);
  });

  it('uses Russian for native language when nativeLang=ru', () => {
    expect(buildPrompt({ ...base, nativeLang: 'ru' }).user).toMatch(/Russian/i);
  });

  it('returns a system prompt that sets the assistant role', () => {
    expect(buildPrompt(base).system).toMatch(/Greek/i);
  });
});
