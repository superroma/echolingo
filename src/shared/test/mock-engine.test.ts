import { describe, it, expect } from 'vitest';
import { MockTtsEngine } from '../src/tts/mock-engine.js';

describe('MockTtsEngine', () => {
  it('reports its name', () => {
    expect(new MockTtsEngine().name).toBe('mock');
  });

  it('returns a non-empty mp3 buffer and a positive duration', async () => {
    const engine = new MockTtsEngine();
    const result = await engine.synthesize({ text: 'Καλημέρα', lang: 'el' });
    expect(result.mp3.length).toBeGreaterThan(0);
    expect(result.durationSec).toBeGreaterThan(0);
  });

  it('produces deterministic output for the same input', async () => {
    const engine = new MockTtsEngine();
    const a = await engine.synthesize({ text: 'Καλημέρα', lang: 'el' });
    const b = await engine.synthesize({ text: 'Καλημέρα', lang: 'el' });
    expect(a.mp3.equals(b.mp3)).toBe(true);
    expect(a.durationSec).toBe(b.durationSec);
  });

  it('duration scales roughly with text length', async () => {
    const engine = new MockTtsEngine();
    const short = await engine.synthesize({ text: 'Γεια.', lang: 'el' });
    const long = await engine.synthesize({
      text: 'Καλημέρα σε όλους, πώς είστε σήμερα το πρωί;',
      lang: 'el',
    });
    expect(long.durationSec).toBeGreaterThan(short.durationSec);
  });
});
