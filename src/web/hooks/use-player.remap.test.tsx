// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { RefObject } from 'react';
import { usePlayer } from './use-player.js';
import type { PlaylistEntry } from '@echolingo/shared/playlist';

// target_first bilingual, translation ON: target+native per sentence.
const ON: PlaylistEntry[] = [
  { url: 'blob:s0t', sentenceIndex: 0, lang: 'target', kind: 'sentence' },
  { url: 'blob:s0n', sentenceIndex: 0, lang: 'native', kind: 'sentence' },
  { url: 'blob:s1t', sentenceIndex: 1, lang: 'target', kind: 'sentence' },
  { url: 'blob:s1n', sentenceIndex: 1, lang: 'native', kind: 'sentence' },
];
// Same echo, translation OFF: native chunks dropped, indices shift.
const OFF: PlaylistEntry[] = [
  { url: 'blob:s0t', sentenceIndex: 0, lang: 'target', kind: 'sentence' },
  { url: 'blob:s1t', sentenceIndex: 1, lang: 'target', kind: 'sentence' },
];

function Harness({ playlist }: { playlist: PlaylistEntry[] }) {
  const player = usePlayer(playlist, 'x');
  return (
    <>
      <audio data-testid="audio" ref={player.audioRef as RefObject<HTMLAudioElement>} />
      <span data-testid="chunk">{player.state.currentChunk}</span>
      <span data-testid="sentence">{player.state.currentSentence}</span>
    </>
  );
}

const ended = () => fireEvent(screen.getByTestId('audio'), new Event('ended'));
const chunk = () => screen.getByTestId('chunk').textContent;
const sentence = () => screen.getByTestId('sentence').textContent;

describe('usePlayer playlist-rebuild remap (translation toggle)', () => {
  it('keeps the playing chunk across a rebuild instead of restarting the sentence', () => {
    const { rerender } = render(<Harness playlist={ON} />);
    ended(); // -> index 1 (s0 native)
    ended(); // -> index 2 (s1 target)
    expect(chunk()).toBe('2');
    expect(sentence()).toBe('1');

    // Toggle translation OFF: playlist rebuilt, indices shift.
    rerender(<Harness playlist={OFF} />);

    // Remapped to the SAME chunk (s1 target) at its new index 1 — not restarted at 0.
    expect(sentence()).toBe('1');
    expect(chunk()).toBe('1');
  });

  it('advances to the next sentence when the playing chunk is removed by the rebuild', () => {
    const { rerender } = render(<Harness playlist={ON} />);
    ended(); // -> index 1: s0 native (a translation chunk)
    expect(sentence()).toBe('0');

    // Turn translation OFF while a native chunk is playing: it no longer exists.
    rerender(<Harness playlist={OFF} />);

    // Falls forward to the next sentence rather than replaying sentence 0.
    expect(sentence()).toBe('1');
  });
});
