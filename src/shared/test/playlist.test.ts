import { describe, it, expect } from 'vitest';
import { buildPlaylist, playablePlaylist } from '../src/playlist.js';
import type { Echo } from '../src/types.js';

function echo(overrides: Partial<Echo> = {}): Echo {
  return {
    id: 'l1',
    params: {
      topic: 'at the bakery',
      targetLang: 'el',
      nativeLang: 'en',
      lengthMin: 5,
      level: 3,
      mode: 'bilingual',
      bilingualOrder: 'target_first',
      ttsEngine: 'openai',
    },
    status: 'ready',
    createdAt: 'x',
    updatedAt: 'x',
    totalSentences: 2,
    readySentences: 2,
    sentences: [
      {
        i: 0,
        gr: 'Καλημέρα.',
        native: 'Good morning.',
        status: 'ready',
        grUrl: 'https://e/gr/0.mp3',
        nativeUrl: 'https://e/native/0.mp3',
        grDurSec: 1.2,
        nativeDurSec: 1.1,
      },
      {
        i: 1,
        gr: 'Γεια σου.',
        native: 'Hello.',
        status: 'ready',
        grUrl: 'https://e/gr/1.mp3',
        nativeUrl: 'https://e/native/1.mp3',
        grDurSec: 1.0,
        nativeDurSec: 0.9,
      },
    ],
    ...overrides,
  };
}

describe('buildPlaylist', () => {
  it('produces target-then-native pairs in bilingual target_first mode', () => {
    const entries = buildPlaylist(echo());
    expect(entries).toEqual([
      { sentenceIndex: 0, lang: 'gr', url: 'https://e/gr/0.mp3', durationSec: 1.2 },
      { sentenceIndex: 0, lang: 'native', url: 'https://e/native/0.mp3', durationSec: 1.1 },
      { sentenceIndex: 1, lang: 'gr', url: 'https://e/gr/1.mp3', durationSec: 1.0 },
      { sentenceIndex: 1, lang: 'native', url: 'https://e/native/1.mp3', durationSec: 0.9 },
    ]);
  });

  it('produces native-then-target pairs in bilingual native_first mode', () => {
    const entries = buildPlaylist(
      echo({ params: { ...echo().params, bilingualOrder: 'native_first' } }),
    );
    expect(entries.map((e) => `${e.sentenceIndex}-${e.lang}`)).toEqual([
      '0-native',
      '0-gr',
      '1-native',
      '1-gr',
    ]);
  });

  it('produces only target entries in target_only mode', () => {
    const entries = buildPlaylist(
      echo({ params: { ...echo().params, mode: 'target_only' } }),
    );
    expect(entries).toEqual([
      { sentenceIndex: 0, lang: 'gr', url: 'https://e/gr/0.mp3', durationSec: 1.2 },
      { sentenceIndex: 1, lang: 'gr', url: 'https://e/gr/1.mp3', durationSec: 1.0 },
    ]);
  });

  it('skips sentences that are not ready', () => {
    const l = echo();
    l.sentences[1]!.status = 'pending';
    l.sentences[1]!.grUrl = undefined;
    l.sentences[1]!.nativeUrl = undefined;
    const entries = buildPlaylist(l);
    expect(entries).toHaveLength(2);
    expect(entries.every((e) => e.sentenceIndex === 0)).toBe(true);
  });

  it('skips a side of a bilingual pair if its URL is missing', () => {
    const l = echo();
    l.sentences[0]!.nativeUrl = undefined;
    const entries = buildPlaylist(l);
    expect(entries.map((e) => `${e.sentenceIndex}-${e.lang}`)).toEqual([
      '0-gr',
      '1-gr',
      '1-native',
    ]);
  });
});

describe('playablePlaylist', () => {
  it('includes both languages when translation is on', () => {
    const entries = playablePlaylist(echo(), true);
    expect(entries.map((e) => e.lang)).toEqual(['gr', 'native', 'gr', 'native']);
  });

  it('drops native audio when translation is off (not just hidden)', () => {
    const entries = playablePlaylist(echo(), false);
    expect(entries.map((e) => e.lang)).toEqual(['gr', 'gr']);
    expect(entries.some((e) => e.lang === 'native')).toBe(false);
  });

  it('is unaffected for target_only echoes', () => {
    const l = echo({ params: { ...echo().params, mode: 'target_only' } });
    expect(playablePlaylist(l, false)).toEqual(buildPlaylist(l));
    expect(playablePlaylist(l, true)).toEqual(buildPlaylist(l));
  });
});
