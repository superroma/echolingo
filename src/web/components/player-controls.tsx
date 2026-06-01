'use client';

import type { PlayerControls as Controls, PlayerState } from '../hooks/use-player';
import { Scrubber } from './scrubber';
import { PlayIcon, PauseIcon, PrevIcon, NextIcon } from './icons';

const SPEEDS = [0.75, 1, 1.25] as const;

export function PlayerControlsView({
  state,
  controls,
  elapsedSec,
  totalSec,
  onSeek,
  bilingual,
  showTranslation,
  onToggleTranslation,
  status,
  buffering,
  offlineSaved,
  canPlay,
  ready,
  onReload,
}: {
  state: PlayerState;
  controls: Controls;
  elapsedSec: number;
  totalSec: number;
  onSeek: (sec: number) => void;
  bilingual: boolean;
  showTranslation: boolean;
  onToggleTranslation: () => void;
  status: string;
  buffering: boolean;
  offlineSaved: boolean;
  canPlay: boolean;
  ready: boolean;
  onReload: () => void;
}) {
  return (
    <div>
      <Scrubber elapsedSec={elapsedSec} totalSec={totalSec} onSeek={onSeek} />

      <div className="flex items-center justify-center gap-4">
        <button
          type="button"
          onClick={controls.prev}
          aria-label="Previous sentence"
          disabled={!canPlay}
          className="flex h-12 w-12 items-center justify-center rounded-full border border-line bg-paper-3 text-ink shadow-[var(--shadow-1)] transition active:scale-90 disabled:opacity-40 disabled:active:scale-100"
        >
          <PrevIcon size={20} />
        </button>
        <button
          type="button"
          onClick={controls.toggle}
          aria-label={state.isPlaying ? 'Pause' : 'Play'}
          disabled={!canPlay}
          className="flex h-[62px] w-[62px] items-center justify-center rounded-full bg-ink text-paper-2 shadow-[var(--shadow-2)] transition active:scale-90 disabled:opacity-40 disabled:active:scale-100"
        >
          {state.isPlaying ? <PauseIcon size={26} /> : <PlayIcon size={26} />}
        </button>
        <button
          type="button"
          onClick={controls.next}
          aria-label="Next sentence"
          disabled={!canPlay}
          className="flex h-12 w-12 items-center justify-center rounded-full border border-line bg-paper-3 text-ink shadow-[var(--shadow-1)] transition active:scale-90 disabled:opacity-40 disabled:active:scale-100"
        >
          <NextIcon size={20} />
        </button>
      </div>

      <div className="mt-3 flex items-center justify-center gap-2">
        {SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => controls.setSpeed(s)}
            className={
              'inline-flex min-h-[40px] items-center justify-center rounded-pill px-4 py-2 text-[13px] font-semibold transition ' +
              (Math.abs(state.speed - s) < 0.01
                ? 'border border-ink bg-ink text-paper-2'
                : 'border border-line bg-paper-3 text-ink-soft')
            }
          >
            {s}×
          </button>
        ))}
        {bilingual && (
          <>
            <span className="mx-[3px] h-[18px] w-px bg-line" />
            <button
              type="button"
              onClick={onToggleTranslation}
              aria-pressed={showTranslation}
              title={showTranslation ? 'hide translation' : 'show translation'}
              className={
                'inline-flex min-h-[40px] items-center justify-center rounded-pill px-4 py-2 text-[13px] font-semibold transition ' +
                (showTranslation
                  ? 'border border-accent bg-accent text-accent-ink'
                  : 'border border-line bg-paper-3 text-ink-soft')
              }
            >
              translation
            </button>
          </>
        )}
      </div>

      <div className="mt-2.5 flex min-h-[18px] items-center justify-center gap-2 text-[12px] text-ink-mute">
        {buffering && (
          <span
            className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-line border-t-accent"
            aria-hidden
          />
        )}
        {status && <span>{status}</span>}
        {ready && offlineSaved && <span aria-live="polite">saved for offline ✓</span>}
        {ready && (
          <button
            type="button"
            onClick={onReload}
            className="underline decoration-dotted underline-offset-2 hover:text-ink-soft"
          >
            re-download
          </button>
        )}
      </div>
    </div>
  );
}
