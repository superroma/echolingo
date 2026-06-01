import { describe, it, expect } from 'vitest';
import { buildPlaylist, playablePlaylist, playableThrough } from '../src/playlist.js';
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

describe('playableThrough (playable frontier)', () => {
  it('is the full length when no sentence is pending', () => {
    expect(playableThrough(echo())).toBe(2);
  });

  it('stops at the first pending sentence', () => {
    const e = echo();
    e.sentences[1]!.status = 'pending';
    e.sentences[1]!.grUrl = undefined;
    e.sentences[1]!.nativeUrl = undefined;
    expect(playableThrough(e)).toBe(1);
  });

  it('is 0 when the first sentence is still pending', () => {
    const e = echo();
    e.sentences[0]!.status = 'pending';
    expect(playableThrough(e)).toBe(0);
  });

  it('does not block on a failed sentence', () => {
    const e = echo();
    e.sentences[0]!.status = 'failed';
    e.sentences[0]!.grUrl = undefined;
    e.sentences[0]!.nativeUrl = undefined;
    expect(playableThrough(e)).toBe(2);
  });
});

describe('playablePlaylist with a partial echo', () => {
  it('includes only the contiguous ready prefix (stops at a pending sentence)', () => {
    const e = echo();
    e.totalSentences = 3;
    e.sentences.push({ i: 2, gr: 'x', native: 'y', status: 'pending' });
    const entries = playablePlaylist(e, true);
    expect(entries.every((x) => x.sentenceIndex < 2)).toBe(true);
    expect(entries).toHaveLength(4); // sentences 0 + 1, target+native each
  });

  it('stops at a gap even if a later sentence is ready', () => {
    const e = echo();
    e.totalSentences = 3;
    e.sentences[1]!.status = 'pending';
    e.sentences[1]!.grUrl = undefined;
    e.sentences[1]!.nativeUrl = undefined;
    e.sentences.push({
      i: 2, gr: 'g2', native: 'n2', status: 'ready',
      grUrl: 'https://e/gr/2.mp3', nativeUrl: 'https://e/native/2.mp3',
      grDurSec: 1, nativeDurSec: 1,
    });
    const entries = playablePlaylist(e, true);
    expect(entries.every((x) => x.sentenceIndex === 0)).toBe(true);
  });

  it('skips a failed sentence without blocking the prefix', () => {
    const e = echo();
    e.sentences[0]!.status = 'failed';
    e.sentences[0]!.grUrl = undefined;
    e.sentences[0]!.nativeUrl = undefined;
    const entries = playablePlaylist(e, true);
    expect(entries.every((x) => x.sentenceIndex === 1)).toBe(true);
    expect(entries).toHaveLength(2);
  });
});
