'use client';

import type { Lesson } from '@echolingo/shared/types';

export function LessonProgress({ lesson }: { lesson: Lesson }) {
  const { status, readySentences, totalSentences } = lesson;
  const label =
    status === 'generating_script'
      ? 'Generating script…'
      : status === 'generating_audio'
        ? `Generating audio (${readySentences}/${totalSentences})`
        : status === 'failed'
          ? 'Generation failed'
          : 'Ready';

  const pct =
    status === 'generating_audio' && totalSentences > 0
      ? Math.round((readySentences / totalSentences) * 100)
      : 0;

  return (
    <div className="rounded-md border border-neutral-200 bg-white p-4">
      <p className="text-sm font-medium text-neutral-700">{label}</p>
      {status === 'generating_audio' && (
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-neutral-200">
          <div
            className="h-full bg-neutral-900 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
      {status === 'failed' && lesson.error && (
        <p className="mt-2 text-sm text-red-900">{lesson.error}</p>
      )}
    </div>
  );
}
