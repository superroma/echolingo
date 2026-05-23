import { describe, it, expect } from 'vitest';
import type { PlaylistEntry } from '@echolingo/shared/types';
import {
  cumulativeDurations,
  elapsedAtChunk,
  totalDuration,
  chunkAtElapsed,
  firstChunkOfSentence,
} from './playlist-math.js';

function entry(i: number, lang: 'gr' | 'native', dur: number): PlaylistEntry {
  return { sentenceIndex: i, lang, url: `u${i}-${lang}`, durationSec: dur };
}

const PL: PlaylistEntry[] = [
  entry(0, 'gr', 4),
  entry(0, 'native', 3),
  entry(1, 'gr', 5),
  entry(1, 'native', 4),
  entry(2, 'gr', 2),
];

describe('playlist-math', () => {
  it('cumulativeDurations returns running totals starting at 0', () => {
    expect(cumulativeDurations(PL)).toEqual([0, 4, 7, 12, 16]);
  });

  it('totalDuration sums all chunk durations', () => {
    expect(totalDuration(PL)).toBe(18);
  });

  it('elapsedAtChunk returns the start time of a given chunk', () => {
    expect(elapsedAtChunk(PL, 0)).toBe(0);
    expect(elapsedAtChunk(PL, 2)).toBe(7);
    expect(elapsedAtChunk(PL, 4)).toBe(16);
  });

  it('chunkAtElapsed returns the chunk index containing the given time', () => {
    expect(chunkAtElapsed(PL, 0)).toBe(0);
    expect(chunkAtElapsed(PL, 3.9)).toBe(0);
    expect(chunkAtElapsed(PL, 4)).toBe(1);
    expect(chunkAtElapsed(PL, 12.5)).toBe(3);
    expect(chunkAtElapsed(PL, 100)).toBe(4);
  });

  it('firstChunkOfSentence returns the first chunk whose sentenceIndex matches', () => {
    expect(firstChunkOfSentence(PL, 0)).toBe(0);
    expect(firstChunkOfSentence(PL, 1)).toBe(2);
    expect(firstChunkOfSentence(PL, 2)).toBe(4);
    expect(firstChunkOfSentence(PL, 99)).toBe(-1);
  });
});
