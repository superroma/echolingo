import { describe, it, expect } from 'vitest';
import { buildPlaylist } from '../src/playlist.js';
import type { Lesson } from '../src/types.js';

function lesson(overrides: Partial<Lesson> = {}): Lesson {
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
    const entries = buildPlaylist(lesson());
    expect(entries).toEqual([
      { sentenceIndex: 0, lang: 'gr', url: 'https://e/gr/0.mp3', durationSec: 1.2 },
      { sentenceIndex: 0, lang: 'native', url: 'https://e/native/0.mp3', durationSec: 1.1 },
      { sentenceIndex: 1, lang: 'gr', url: 'https://e/gr/1.mp3', durationSec: 1.0 },
      { sentenceIndex: 1, lang: 'native', url: 'https://e/native/1.mp3', durationSec: 0.9 },
    ]);
  });

  it('produces native-then-target pairs in bilingual native_first mode', () => {
    const entries = buildPlaylist(
      lesson({ params: { ...lesson().params, bilingualOrder: 'native_first' } }),
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
      lesson({ params: { ...lesson().params, mode: 'target_only' } }),
    );
    expect(entries).toEqual([
      { sentenceIndex: 0, lang: 'gr', url: 'https://e/gr/0.mp3', durationSec: 1.2 },
      { sentenceIndex: 1, lang: 'gr', url: 'https://e/gr/1.mp3', durationSec: 1.0 },
    ]);
  });

  it('skips sentences that are not ready', () => {
    const l = lesson();
    l.sentences[1]!.status = 'pending';
    l.sentences[1]!.grUrl = undefined;
    l.sentences[1]!.nativeUrl = undefined;
    const entries = buildPlaylist(l);
    expect(entries).toHaveLength(2);
    expect(entries.every((e) => e.sentenceIndex === 0)).toBe(true);
  });

  it('skips a side of a bilingual pair if its URL is missing', () => {
    const l = lesson();
    l.sentences[0]!.nativeUrl = undefined;
    const entries = buildPlaylist(l);
    expect(entries.map((e) => `${e.sentenceIndex}-${e.lang}`)).toEqual([
      '0-gr',
      '1-gr',
      '1-native',
    ]);
  });
});
