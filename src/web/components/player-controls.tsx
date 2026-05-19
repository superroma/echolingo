'use client';

import type { PlayerControls as Controls, PlayerState } from '../hooks/use-player';

const SPEEDS = [0.75, 1, 1.25] as const;

export function PlayerControlsView({
  state,
  controls,
}: {
  state: PlayerState;
  controls: Controls;
}) {
  return (
    <div className="flex items-center justify-center gap-3">
      <button
        type="button"
        onClick={controls.prev}
        className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
        aria-label="Previous sentence"
      >
        ‹ Prev
      </button>
      <button
        type="button"
        onClick={controls.repeatSentence}
        className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
        aria-label="Repeat current sentence"
      >
        ↺ Repeat
      </button>
      <button
        type="button"
        onClick={controls.toggle}
        className="rounded-md bg-neutral-900 px-5 py-2 font-medium text-white"
        aria-label={state.isPlaying ? 'Pause' : 'Play'}
      >
        {state.isPlaying ? '❚❚ Pause' : '▶ Play'}
      </button>
      <button
        type="button"
        onClick={controls.next}
        className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
        aria-label="Next sentence"
      >
        Next ›
      </button>
      <div className="ml-2 flex items-center gap-1">
        {SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => controls.setSpeed(s)}
            className={
              'rounded-md px-2 py-1 text-xs ' +
              (Math.abs(state.speed - s) < 0.01
                ? 'bg-neutral-900 text-white'
                : 'bg-neutral-100 text-neutral-700')
            }
          >
            {s}×
          </button>
        ))}
      </div>
    </div>
  );
}
