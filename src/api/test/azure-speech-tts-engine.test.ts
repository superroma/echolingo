import { describe, it, expect } from 'vitest';
import { localeFor, LANG_LOCALE, AzureSpeechTtsEngine } from '../src/tts/azure-speech-tts-engine.js';
import { LANG_CODES } from '../src/_shared/index.js';

describe('AzureSpeechTtsEngine', () => {
  it('reports its name as azurespeech', () => {
    const engine = new AzureSpeechTtsEngine({
      region: 'westeurope',
      resourceId: '/subscriptions/x/resourceGroups/rg/providers/Microsoft.CognitiveServices/accounts/spch',
      tokenProvider: async () => 'token',
    });
    expect(engine.name).toBe('azurespeech');
  });

  it('maps every supported language to a BCP-47 locale', () => {
    for (const code of LANG_CODES) {
      expect(LANG_LOCALE[code], `missing locale for ${code}`).toMatch(/^[a-z]{2,3}-[A-Za-z]{2,}$/);
    }
    // Azure's own spellings, not naive lang-COUNTRY.
    expect(localeFor('el')).toBe('el-GR');
    expect(localeFor('en')).toBe('en-US');
    expect(localeFor('no')).toBe('nb-NO');
    expect(localeFor('tl')).toBe('fil-PH');
  });
});
