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
  const handle = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onSeek(Number(e.target.value));
    },
    [onSeek],
  );

  const safeTotal = Math.max(totalSec, 0.01);
  return (
    <div className="flex items-center gap-3 text-xs text-ink-muted">
      <input
        type="range"
        min={0}
        max={safeTotal}
        step={0.1}
        value={Math.min(elapsedSec, safeTotal)}
        onChange={handle}
        className="block flex-1 accent-aegean"
        aria-label="Lesson progress"
      />
      <span className="tabular-nums">
        {formatTime(elapsedSec)} / {formatTime(totalSec)}
      </span>
    </div>
  );
}
