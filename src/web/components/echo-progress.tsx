'use client';

import { cefr, LANG_NAME, type Lesson } from '@echolingo/shared/types';

export function EchoProgress({ echo }: { echo: Lesson }) {
  const meta = `${LANG_NAME[echo.params.targetLang].toLowerCase()} · ${echo.params.lengthMin} min · ${cefr(
    echo.params.level,
  )}`;
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-[22px] p-10 text-center">
      <div className="h-[54px] w-[54px] animate-spin rounded-full border-[3px] border-line border-t-accent" />
      <div>
        <div className="font-serif text-[18px] italic text-ink-soft">composing your echo…</div>
        <div className="mx-auto mt-2.5 max-w-[26ch] font-serif text-[22px] font-semibold tracking-[-0.01em] text-ink">
          {echo.params.topic}
        </div>
        <div className="mt-2.5 font-serif text-[14px] italic text-ink-soft">{meta}</div>
      </div>
    </div>
  );
}
