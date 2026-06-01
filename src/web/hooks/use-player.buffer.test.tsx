// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { RefObject } from 'react';
import { usePlayer } from './use-player.js';
import type { PlaylistEntry } from '@echolingo/shared/playlist';

const ONE: PlaylistEntry[] = [{ sentenceIndex: 0, lang: 'gr', url: 'blob:s0', durationSec: 1 }];
const TWO: PlaylistEntry[] = [
  { sentenceIndex: 0, lang: 'gr', url: 'blob:s0', durationSec: 1 },
  { sentenceIndex: 1, lang: 'gr', url: 'blob:s1', durationSec: 1 },
];

function Harness({ playlist, generating }: { playlist: PlaylistEntry[]; generating: boolean }) {
  const player = usePlayer(playlist, 'buf', generating);
  return (
    <>
      <audio data-testid="audio" ref={player.audioRef as RefObject<HTMLAudioElement>} />
      <span data-testid="chunk">{player.state.currentChunk}</span>
      <span data-testid="sentence">{player.state.currentSentence}</span>
      <span data-testid="buffering">{String(player.state.buffering)}</span>
      <span data-testid="playing">{String(player.state.isPlaying)}</span>
    </>
  );
}

const audio = () => screen.getByTestId('audio');
const val = (id: string) => screen.getByTestId(id).textContent;

describe('usePlayer buffers at the generation frontier', () => {
  it('holds intent-to-play and keeps the highlight when it runs past the last ready chunk', () => {
    render(<Harness playlist={ONE} generating />);
    fireEvent(audio(), new Event('play')); // isPlaying = true
    expect(val('playing')).toBe('true');
    fireEvent(audio(), new Event('ended')); // advance past the end (chunk -> 1)
    expect(val('buffering')).toBe('true');
    expect(val('playing')).toBe('true'); // intent held, not stopped
    expect(val('sentence')).toBe('0'); // highlight stays on the last sentence, not reset to 0
  });

  it('resumes automatically when the next sentence finishes generating', () => {
    const { rerender } = render(<Harness playlist={ONE} generating />);
    fireEvent(audio(), new Event('play'));
    fireEvent(audio(), new Event('ended'));
    expect(val('buffering')).toBe('true');
    rerender(<Harness playlist={TWO} generating />); // playlist grows
    expect(val('buffering')).toBe('false');
    expect(val('chunk')).toBe('1');
    expect(val('sentence')).toBe('1');
  });

  it('stops at the end when generation is complete', () => {
    render(<Harness playlist={ONE} generating={false} />);
    fireEvent(audio(), new Event('play'));
    fireEvent(audio(), new Event('ended'));
    expect(val('buffering')).toBe('false');
    expect(val('playing')).toBe('false');
  });
});
