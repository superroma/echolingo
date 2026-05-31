import { describe, it, expect } from 'vitest';
import { echoId } from '../src/echo-id.js';
import { isEchoId } from '../src/types.js';
import type { EchoParams } from '../src/types.js';

const base: EchoParams = {
  topic: 'at the bakery', targetLang: 'el', nativeLang: 'en',
  lengthMin: 5, level: 3, mode: 'bilingual', bilingualOrder: 'target_first', ttsEngine: 'openai',
};

describe('echoId', () => {
  it('is exactly 8 base62 chars and a valid echo id', async () => {
    const id = await echoId(base);
    expect(id).toHaveLength(8);
    expect(isEchoId(id)).toBe(true);
  });
  it('is deterministic and normalizes the topic', async () => {
    expect(await echoId(base)).toBe(await echoId({ ...base, topic: '  At  The   Bakery ' }));
  });
  it('differs when a meaningful param differs', async () => {
    expect(await echoId(base)).not.toBe(await echoId({ ...base, level: 4 }));
  });
});
