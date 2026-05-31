// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { RefObject } from 'react';
import { usePlayer, loadPosition } from './use-player.js';
import type { PlaylistEntry } from '@echolingo/shared/playlist';

const PLAYLIST: PlaylistEntry[] = [
  { url: 'blob:chunk-0', sentenceIndex: 0, lang: 'target', kind: 'sentence' },
];

// Mirrors echo-client.tsx: the <audio> element is rendered only once the lesson
// is `ready`. Before that, usePlayer runs with an empty playlist and no audio.
function Harness({ id, ready }: { id: string; ready: boolean }) {
  const player = usePlayer(ready ? PLAYLIST : [], id);
  return ready ? (
    <audio data-testid="audio" ref={player.audioRef as RefObject<HTMLAudioElement>} />
  ) : (
    <div>loading…</div>
  );
}

function emitTimeUpdate(seconds: number) {
  const audio = screen.getByTestId('audio') as HTMLAudioElement;
  Object.defineProperty(audio, 'currentTime', { configurable: true, value: seconds });
  fireEvent(audio, new Event('timeupdate'));
}

describe('usePlayer listening-position persistence', () => {
  it('persists position when the <audio> exists from the first render (control)', () => {
    render(<Harness id="early" ready />);
    emitTimeUpdate(42);
    expect(loadPosition('early')).toBe(42);
  });

  // REPRO of "echo list always marks every echo as new even after playing":
  // when the <audio> mounts on the loading -> ready transition, the persistence
  // effect (deps [echoId]) has already run with a null ref and never re-runs, so
  // 'timeupdate' is never bound and no position is ever written. Expected to FAIL
  // until use-player.ts re-attaches the listener once the audio element mounts.
  it('persists position after the <audio> mounts on becoming ready', () => {
    const { rerender } = render(<Harness id="late" ready={false} />);
    rerender(<Harness id="late" ready />);
    emitTimeUpdate(42);
    expect(loadPosition('late')).toBe(42);
  });
});
