import { describe, it, expect } from 'vitest';
import { MockLlmEngine } from '../src/llm/mock-engine.js';
import { buildPrompt } from '../src/prompts.js';
import type { LessonParams } from '../src/types.js';

const params: LessonParams = {
  topic: 'at the bakery',
  lengthMin: 5,
  level: 3,
  style: 'dialogue',
  mode: 'bilingual',
  bilingualOrder: 'gr_first',
  nativeLang: 'en',
  ttsEngine: 'openai',
};

describe('MockLlmEngine', () => {
  it('reports its name as "mock"', () => {
    expect(new MockLlmEngine().name).toBe('mock');
  });

  it('returns a non-empty raw script in GR||NATIVE format', async () => {
    const engine = new MockLlmEngine();
    const raw = await engine.generateScript(buildPrompt(params));
    expect(raw.length).toBeGreaterThan(0);
    for (const line of raw.split('\n').filter((l) => l.trim().length > 0)) {
      expect(line).toContain('||');
    }
  });

  it('is deterministic for the same prompt', async () => {
    const engine = new MockLlmEngine();
    const p = buildPrompt(params);
    const a = await engine.generateScript(p);
    const b = await engine.generateScript(p);
    expect(a).toBe(b);
  });

  it('honors a script override passed in the constructor', async () => {
    const override = 'Καλημέρα.||Good morning.';
    const engine = new MockLlmEngine({ script: override });
    expect(await engine.generateScript(buildPrompt(params))).toBe(override);
  });
});
