'use client';

import { useCallback } from 'react';

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function Scrubber({
  elapsedSec,
  totalSec,
  onSeek,
}: {
  elapsedSec: number;
  totalSec: number;
  onSeek: (sec: number) => void;
}) {
  const safeTotal = Math.max(totalSec, 0.01);
  const pct = Math.min(100, Math.max(0, (elapsedSec / safeTotal) * 100));

  const seekFromEvent = useCallback(
    (clientX: number, el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      const p = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
      onSeek(p * safeTotal);
    },
    [onSeek, safeTotal],
  );

  const onKey = useCallback(
    (e: React.KeyboardEvent) => {
      let next: number | null = null;
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = elapsedSec + 5;
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = elapsedSec - 5;
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = safeTotal;
      if (next === null) return;
      e.preventDefault();
      onSeek(Math.min(safeTotal, Math.max(0, next)));
    },
    [elapsedSec, safeTotal, onSeek],
  );

  return (
    <div className="mb-[11px] flex items-center gap-3">
      <div
        role="slider"
        aria-label="Lesson progress"
        aria-valuemin={0}
        aria-valuemax={Math.round(safeTotal)}
        aria-valuenow={Math.round(elapsedSec)}
        aria-valuetext={`${formatTime(elapsedSec)} of ${formatTime(totalSec)}`}
        tabIndex={0}
        onClick={(e) => seekFromEvent(e.clientX, e.currentTarget)}
        onKeyDown={onKey}
        className="relative flex h-7 flex-1 cursor-pointer items-center"
      >
        <div className="absolute left-0 right-0 h-[5px] overflow-hidden rounded-full bg-line">
          <div className="absolute inset-y-0 left-0 rounded-full bg-accent" style={{ width: `${pct}%` }} />
        </div>
        <div
          className="absolute h-[15px] w-[15px] -translate-x-1/2 rounded-full border border-line bg-paper-3 shadow-[var(--shadow-1)]"
          style={{ left: `${pct}%` }}
        />
      </div>
      <span className="whitespace-nowrap text-[13px] font-medium tabular-nums text-ink-soft">
        {formatTime(elapsedSec)} / {formatTime(totalSec)}
      </span>
    </div>
  );
}
