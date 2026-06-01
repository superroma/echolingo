import { describe, it, expect } from 'vitest';
import {
  LANG_CODES,
  LANG_NAME,
  ECHO_LEVELS,
  ECHO_LENGTHS,
  ECHO_MODES,
  BILINGUAL_ORDERS,
  TTS_ENGINES,
  CEFR_LABEL,
  cefr,
  isEchoParams,
  isEchoId,
  type EchoParams,
} from '../src/types.js';

describe('domain enums', () => {
  it('exposes the four length presets', () => {
    expect(ECHO_LENGTHS).toEqual([5, 10, 20, 30]);
  });

  it('exposes the two modes', () => {
    expect(ECHO_MODES).toEqual(['target_only', 'bilingual']);
  });

  it('exposes the two bilingual orders', () => {
    expect(BILINGUAL_ORDERS).toEqual(['target_first', 'native_first']);
  });

  it('exposes the gpt-4o-mini-tts supported language set', () => {
    // The full OpenAI speech-language set (57), not a tiny curated list.
    expect(LANG_CODES.length).toBe(57);
    for (const c of ['el', 'en', 'zh', 'es', 'fr', 'ar', 'hi', 'cy'] as const) {
      expect(LANG_CODES).toContain(c);
    }
    // Every code has a display name…
    for (const c of LANG_CODES) expect(LANG_NAME[c]).toBeTruthy();
    // …and the list is ordered alphabetically by display name.
    const names = LANG_CODES.map((c) => LANG_NAME[c]);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it('exposes the three TTS engines', () => {
    expect(TTS_ENGINES).toEqual(['openai', 'elevenlabs', 'google']);
  });
});

describe('isEchoParams', () => {
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
    expect(isEchoParams(valid)).toBe(true);
  });

  it('rejects missing topic', () => {
    expect(isEchoParams({ ...valid, topic: '' })).toBe(false);
  });

  it('rejects unknown length', () => {
    expect(isEchoParams({ ...valid, lengthMin: 7 })).toBe(false);
  });

  it('rejects level outside 1..6', () => {
    expect(isEchoParams({ ...valid, level: 0 })).toBe(false);
    expect(isEchoParams({ ...valid, level: 7 })).toBe(false);
  });

  it('rejects unknown mode/order/engine', () => {
    expect(isEchoParams({ ...valid, mode: 'greek_only' })).toBe(false);
    expect(isEchoParams({ ...valid, bilingualOrder: 'gr_first' })).toBe(false);
    expect(isEchoParams({ ...valid, ttsEngine: 'aws' })).toBe(false);
  });

  it('rejects missing targetLang', () => {
    const { targetLang: _t, ...rest } = valid;
    expect(isEchoParams(rest)).toBe(false);
  });

  it('rejects unknown targetLang code', () => {
    expect(isEchoParams({ ...valid, targetLang: 'xx' })).toBe(false);
  });

  it('rejects targetLang === nativeLang', () => {
    expect(isEchoParams({ ...valid, targetLang: 'en' })).toBe(false);
  });

  it('accepts widened native languages beyond en/ru', () => {
    expect(isEchoParams({ ...valid, nativeLang: 'es' })).toBe(true);
    expect(isEchoParams({ ...valid, nativeLang: 'ja' })).toBe(true);
  });
});

describe('CEFR levels', () => {
  it('has six levels 1..6', () => {
    expect(ECHO_LEVELS).toEqual([1, 2, 3, 4, 5, 6]);
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

  it('accepts level 6 in isEchoParams', () => {
    const params: EchoParams = {
      topic: 'at the bakery',
      targetLang: 'el',
      nativeLang: 'en',
      lengthMin: 5,
      level: 6,
      mode: 'bilingual',
      bilingualOrder: 'target_first',
      ttsEngine: 'openai',
    };
    expect(isEchoParams(params)).toBe(true);
  });
});

describe('isEchoId', () => {
  it('accepts 1–16 base62 chars', () => {
    expect(isEchoId('k7Xp2qB9')).toBe(true);
    expect(isEchoId('a')).toBe(true);
    expect(isEchoId('0123456789abcdef')).toBe(true); // 16
  });
  it('rejects empty, too long, and non-base62', () => {
    expect(isEchoId('')).toBe(false);
    expect(isEchoId('0123456789abcdefg')).toBe(false); // 17
    expect(isEchoId('has-hyphen')).toBe(false);
    expect(isEchoId('has.dot')).toBe(false);
    expect(isEchoId('../etc')).toBe(false);
    expect(isEchoId('späce')).toBe(false);
    expect(isEchoId(42)).toBe(false);
  });
});
