'use client';

import { useEffect, useRef } from 'react';
import type { Lesson, Sentence } from '@echolingo/shared/types';

export function TranscriptView({
  lesson,
  currentSentence,
  onJump,
}: {
  lesson: Lesson;
  currentSentence: number;
  onJump: (sentenceIdx: number) => void;
}) {
  const containerRef = useRef<HTMLOListElement | null>(null);
  const currentRef = useRef<HTMLLIElement | null>(null);
  const manualScrollUntil = useRef<number>(0);

  useEffect(() => {
    const c = containerRef.current;
    if (!c) return;
    const onWheel = () => {
      manualScrollUntil.current = Date.now() + 5000;
    };
    c.addEventListener('wheel', onWheel, { passive: true });
    c.addEventListener('touchmove', onWheel, { passive: true });
    return () => {
      c.removeEventListener('wheel', onWheel);
      c.removeEventListener('touchmove', onWheel);
    };
  }, []);

  useEffect(() => {
    if (Date.now() < manualScrollUntil.current) return;
    const el = currentRef.current;
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [currentSentence]);

  return (
    <ol ref={containerRef} className="space-y-1 pb-32">
      {lesson.sentences.map((s) => (
        <SentenceRow
          key={s.i}
          sentence={s}
          isCurrent={s.i === currentSentence}
          showNative={lesson.params.mode === 'bilingual'}
          onJump={() => onJump(s.i)}
          rowRef={s.i === currentSentence ? currentRef : null}
        />
      ))}
    </ol>
  );
}

function SentenceRow({
  sentence,
  isCurrent,
  showNative,
  onJump,
  rowRef,
}: {
  sentence: Sentence;
  isCurrent: boolean;
  showNative: boolean;
  onJump: () => void;
  rowRef: React.RefObject<HTMLLIElement | null> | null;
}) {
  if (isCurrent) {
    return (
      <li
        ref={rowRef}
        className="relative cursor-pointer rounded-r-md bg-aegean-50 px-4 py-3"
        onClick={onJump}
      >
        <span aria-hidden className="absolute left-0 top-0 h-full w-1 rounded-l bg-aegean" />
        <p className="font-serif text-2xl leading-snug text-ink">{sentence.gr}</p>
        {showNative && (
          <p className="mt-1 text-base text-ink-muted">{sentence.native}</p>
        )}
        {sentence.status === 'failed' && (
          <p className="mt-1 text-xs text-terracotta">[skipped]</p>
        )}
      </li>
    );
  }
  return (
    <li
      ref={rowRef}
      onClick={onJump}
      className="cursor-pointer rounded-md px-4 py-1.5 transition-colors hover:bg-paper"
    >
      <p className="font-serif text-base text-ink-muted">{sentence.gr}</p>
      {showNative && (
        <p className="text-xs text-ink-faint">{sentence.native}</p>
      )}
      {sentence.status === 'failed' && (
        <p className="text-xs text-terracotta">[skipped]</p>
      )}
    </li>
  );
}
