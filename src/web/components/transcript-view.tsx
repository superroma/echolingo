'use client';

import type { Lesson, Sentence } from '@echolingo/shared/types';

export function TranscriptView({
  lesson,
  currentSentence,
}: {
  lesson: Lesson;
  currentSentence: number;
}) {
  return (
    <ol className="space-y-3">
      {lesson.sentences.map((s) => (
        <SentenceRow
          key={s.i}
          sentence={s}
          isCurrent={s.i === currentSentence}
          showNative={lesson.params.mode === 'bilingual'}
        />
      ))}
    </ol>
  );
}

function SentenceRow({
  sentence,
  isCurrent,
  showNative,
}: {
  sentence: Sentence;
  isCurrent: boolean;
  showNative: boolean;
}) {
  const cls = isCurrent
    ? 'rounded-md bg-yellow-50 px-3 py-2 ring-2 ring-yellow-400'
    : 'rounded-md px-3 py-2';
  return (
    <li className={cls}>
      <p className="text-base text-neutral-900">{sentence.gr}</p>
      {showNative && (
        <p className="mt-0.5 text-sm text-neutral-500">{sentence.native}</p>
      )}
    </li>
  );
}
