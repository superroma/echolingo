import { describe, it, expect } from 'vitest';
import {
  localeFor,
  LANG_LOCALE,
  LANG_RATE,
  buildRateSsml,
  AzureSpeechTtsEngine,
} from '../src/tts/azure-speech-tts-engine.js';
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

  it('slows Greek with its own default voice, leaving the locale untouched', () => {
    const adjust = LANG_RATE.el;
    expect(adjust).toBeDefined();
    // Pinned voice must be the el-GR default so only the pace changes.
    expect(adjust?.voice).toBe('el-GR-AthinaNeural');
    expect(adjust?.rate).toMatch(/^-\d+(\.\d+)?%$/);
  });

  it('builds well-formed SSML and XML-escapes the text', () => {
    const ssml = buildRateSsml({
      locale: 'el-GR',
      voice: 'el-GR-AthinaNeural',
      rate: '-12%',
      text: 'Café <Test> & "quotes"',
    });
    expect(ssml).toContain('xml:lang="el-GR"');
    expect(ssml).toContain('<voice name="el-GR-AthinaNeural">');
    expect(ssml).toContain('<prosody rate="-12%">');
    expect(ssml).toContain('&lt;Test&gt; &amp; &quot;quotes&quot;');
    // Raw, unescaped angle brackets from the text must not leak into the markup.
    expect(ssml).not.toContain('<Test>');
  });
});
