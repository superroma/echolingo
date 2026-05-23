import type { PlaylistEntry } from '@echolingo/shared/types';

export function cumulativeDurations(pl: PlaylistEntry[]): number[] {
  const out: number[] = [];
  let acc = 0;
  for (const e of pl) {
    out.push(acc);
    acc += e.durationSec;
  }
  return out;
}

export function totalDuration(pl: PlaylistEntry[]): number {
  return pl.reduce((sum, e) => sum + e.durationSec, 0);
}

export function elapsedAtChunk(pl: PlaylistEntry[], chunk: number): number {
  if (chunk <= 0) return 0;
  let acc = 0;
  for (let i = 0; i < chunk && i < pl.length; i++) {
    acc += pl[i]!.durationSec;
  }
  return acc;
}

export function chunkAtElapsed(pl: PlaylistEntry[], elapsedSec: number): number {
  if (pl.length === 0) return 0;
  let acc = 0;
  for (let i = 0; i < pl.length; i++) {
    acc += pl[i]!.durationSec;
    if (elapsedSec < acc) return i;
  }
  return pl.length - 1;
}

export function firstChunkOfSentence(pl: PlaylistEntry[], sentenceIdx: number): number {
  for (let i = 0; i < pl.length; i++) {
    if (pl[i]!.sentenceIndex === sentenceIdx) return i;
  }
  return -1;
}
