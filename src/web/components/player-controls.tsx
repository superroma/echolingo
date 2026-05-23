'use client';

import type { PlayerControls as Controls, PlayerState } from '../hooks/use-player';
import { Scrubber } from './scrubber';

const SPEEDS = [0.75, 1, 1.25] as const;

export function PlayerControlsView({
  state,
  controls,
  elapsedSec,
  totalSec,
  onSeek,
}: {
  state: PlayerState;
  controls: Controls;
  elapsedSec: number;
  totalSec: number;
  onSeek: (sec: number) => void;
}) {
  return (
    <div className="space-y-4">
      <Scrubber elapsedSec={elapsedSec} totalSec={totalSec} onSeek={onSeek} />

      <div className="flex items-center justify-center gap-4">
        <RoundButton onClick={controls.repeatSentence} size="lg" tone="terracotta" label="Repeat sentence">
          ↺
        </RoundButton>
        <RoundButton onClick={controls.prev} size="md" tone="surface" label="Previous sentence">
          ◀◀
        </RoundButton>
        <RoundButton
          onClick={controls.toggle}
          size="lg"
          tone="ink"
          label={state.isPlaying ? 'Pause' : 'Play'}
        >
          {state.isPlaying ? '❚❚' : '▶'}
        </RoundButton>
        <RoundButton onClick={controls.next} size="md" tone="surface" label="Next sentence">
          ▶▶
        </RoundButton>
      </div>

      <div className="flex items-center justify-center gap-1">
        {SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => controls.setSpeed(s)}
            className={
              'rounded-full px-3 py-1 text-xs transition-colors ' +
              (Math.abs(state.speed - s) < 0.01
                ? 'bg-ink text-paper'
                : 'bg-surface text-ink-muted hover:text-ink')
            }
          >
            {s}×
          </button>
        ))}
      </div>
    </div>
  );
}

function RoundButton({
  onClick,
  size,
  tone,
  label,
  children,
}: {
  onClick: () => void;
  size: 'md' | 'lg';
  tone: 'ink' | 'surface' | 'terracotta';
  label: string;
  children: React.ReactNode;
}) {
  const sizeCls = size === 'lg' ? 'h-14 w-14 text-lg' : 'h-12 w-12 text-base';
  const toneCls =
    tone === 'ink'
      ? 'bg-ink text-paper hover:opacity-90'
      : tone === 'terracotta'
        ? 'bg-terracotta text-white hover:opacity-90'
        : 'bg-surface text-ink border border-hairline hover:border-ink';
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`${sizeCls} ${toneCls} flex items-center justify-center rounded-full transition-opacity`}
    >
      {children}
    </button>
  );
}
