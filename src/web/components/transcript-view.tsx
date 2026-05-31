'use client';

import { useEffect, useRef } from 'react';
import type { Echo, Sentence } from '@echolingo/shared/types';

export function TranscriptView({
  echo,
  currentSentence,
  showNative,
  onJump,
}: {
  echo: Echo;
  currentSentence: number;
  showNative: boolean;
  onJump: (sentenceIdx: number) => void;
}) {
  const containerRef = useRef<HTMLOListElement | null>(null);
  const currentRef = useRef<HTMLLIElement | null>(null);
  const manualScrollUntil = useRef<number>(0);

  // The scroll region is the nearest scrollable ancestor of the transcript (so a
  // shared-link strip/card scroll together with the lines). The transcript's
  // direct parent is a non-scrolling max-w-2xl layout wrapper, so walking up to
  // the element that actually overflows is required — scrolling the wrapper is a
  // no-op and leaves the current line drifting below the fold. Fall back to the
  // list itself if no scrollable ancestor is found.
  function scrollBox(): HTMLElement | null {
    let el = containerRef.current?.parentElement ?? null;
    while (el) {
      const oy = getComputedStyle(el).overflowY;
      if (oy === 'auto' || oy === 'scroll') return el;
      el = el.parentElement;
    }
    return containerRef.current;
  }

  useEffect(() => {
    const box = scrollBox();
    if (!box) return;
    const onManual = () => {
      manualScrollUntil.current = Date.now() + 2600;
    };
    box.addEventListener('wheel', onManual, { passive: true });
    box.addEventListener('touchmove', onManual, { passive: true });
    return () => {
      box.removeEventListener('wheel', onManual);
      box.removeEventListener('touchmove', onManual);
    };
  }, []);

  useEffect(() => {
    if (Date.now() < manualScrollUntil.current) return;
    const el = currentRef.current;
    const box = scrollBox();
    if (!el || !box) return;
    const elRect = el.getBoundingClientRect();
    const boxRect = box.getBoundingClientRect();
    // Center the active line vertically within the scroll viewport.
    const delta = elRect.top - boxRect.top - (box.clientHeight - elRect.height) / 2;
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    box.scrollBy({ top: delta, behavior: smooth ? 'smooth' : 'auto' });
  }, [currentSentence]);

  return (
    <ol ref={containerRef} className="px-[22px] pb-7 pt-3.5">
      {echo.sentences.map((s) => {
        const isCurrent = s.i === currentSentence;
        const isPast = s.i < currentSentence;
        return (
          <SentenceRow
            key={s.i}
            sentence={s}
            isCurrent={isCurrent}
            isPast={isPast}
            showNative={showNative}
            onJump={() => onJump(s.i)}
            attachRef={isCurrent ? (el) => (currentRef.current = el) : undefined}
          />
        );
      })}
    </ol>
  );
}

function SentenceRow({
  sentence,
  isCurrent,
  isPast,
  showNative,
  onJump,
  attachRef,
}: {
  sentence: Sentence;
  isCurrent: boolean;
  isPast: boolean;
  showNative: boolean;
  onJump: () => void;
  attachRef?: (el: HTMLLIElement | null) => void;
}) {
  const targetTone = isCurrent ? 'text-ink' : isPast ? 'text-ink-soft' : 'text-ink-mute';
  return (
    <li
      ref={attachRef}
      onClick={onJump}
      className={
        'my-0.5 cursor-pointer rounded-[16px] px-4 py-4 transition ' +
        (isCurrent
          ? 'bg-[color-mix(in_srgb,var(--accent)_12%,var(--paper-2))] shadow-[inset_3px_0_0_var(--accent)]'
          : '')
      }
    >
      <p className={`font-serif text-[calc(25px*var(--fs-scale))] leading-[1.32] tracking-[-0.01em] ${targetTone}`}>
        {sentence.gr}
      </p>
      {showNative && (
        <p
          className={
            'mt-2 font-sans text-[calc(16px*var(--fs-scale))] leading-[1.4] ' +
            (isCurrent ? 'text-ink-soft' : 'text-ink-mute')
          }
        >
          {sentence.native}
        </p>
      )}
      {sentence.status === 'failed' && <p className="mt-1 text-xs text-accent">[skipped]</p>}
    </li>
  );
}
