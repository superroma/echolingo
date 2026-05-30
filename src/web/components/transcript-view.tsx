'use client';

import { useEffect, useRef } from 'react';
import type { Lesson, Sentence } from '@echolingo/shared/types';

export function TranscriptView({
  lesson,
  currentSentence,
  showNative,
  onJump,
}: {
  lesson: Lesson;
  currentSentence: number;
  showNative: boolean;
  onJump: (sentenceIdx: number) => void;
}) {
  const containerRef = useRef<HTMLOListElement | null>(null);
  const currentRef = useRef<HTMLLIElement | null>(null);
  const manualScrollUntil = useRef<number>(0);

  // The scroll region is the transcript's parent (so a shared-link strip/card
  // scroll together with the lines); fall back to the list itself.
  function scrollBox(): HTMLElement | null {
    return containerRef.current?.parentElement ?? containerRef.current;
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
    const delta = elRect.top - boxRect.top - box.clientHeight * 0.3;
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    box.scrollBy({ top: delta, behavior: smooth ? 'smooth' : 'auto' });
  }, [currentSentence]);

  return (
    <ol ref={containerRef} className="px-[22px] pb-7 pt-3.5">
      {lesson.sentences.map((s) => {
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
