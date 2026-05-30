'use client';

import { useEffect, useState } from 'react';
import {
  LANG_CODES,
  LESSON_LENGTHS,
  LESSON_LEVELS,
  type LangCode,
  type LessonLength,
  type LessonLevel,
  type LessonParams,
} from '@echolingo/shared/types';
import Link from 'next/link';
import { EchoClient } from '../../../components/echo-client';
import { AppBar } from '../../../components/app-bar';
import { ArrowRightIcon } from '../../../components/icons';

function readParamsFromUrl(): LessonParams | null {
  if (typeof window === 'undefined') return null;
  const q = new URLSearchParams(window.location.search);
  const topic = (q.get('topic') ?? '').trim();
  const targetLang = q.get('targetLang') as LangCode | null;
  const nativeLang = q.get('nativeLang') as LangCode | null;
  const lengthMin = Number(q.get('lengthMin')) as LessonLength;
  const level = Number(q.get('level')) as LessonLevel;

  if (!topic) return null;
  if (!targetLang || !LANG_CODES.includes(targetLang)) return null;
  if (!nativeLang || !LANG_CODES.includes(nativeLang)) return null;
  if (targetLang === nativeLang) return null;
  if (!LESSON_LENGTHS.includes(lengthMin)) return null;
  if (!LESSON_LEVELS.includes(level)) return null;

  return {
    topic,
    targetLang,
    nativeLang,
    lengthMin,
    level,
    mode: 'bilingual',
    bilingualOrder: 'target_first',
    ttsEngine: 'openai',
  };
}

export function NewEchoClient() {
  const [params, setParams] = useState<LessonParams | null | 'unset'>('unset');
  useEffect(() => {
    setParams(readParamsFromUrl());
  }, []);

  if (params === 'unset') return null;
  if (params === null) {
    return (
      <div className="flex min-h-[100dvh] flex-col">
        <AppBar />
        <main
          role="alert"
          className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-3 px-6 pb-16 text-center"
        >
          <h1 className="font-serif text-[26px] font-semibold tracking-[-0.01em] text-ink">
            this echo link is incomplete
          </h1>
          <p className="text-[15px] leading-[1.5] text-ink-soft">
            the link is missing details or has expired — start a fresh one in seconds.
          </p>
          <Link
            href="/"
            className="mt-1 inline-flex h-12 items-center justify-center gap-2 rounded-pill bg-accent px-6 text-[15px] font-semibold text-accent-ink shadow-[var(--shadow-1)]"
          >
            start a new echo <ArrowRightIcon size={16} />
          </Link>
        </main>
      </div>
    );
  }
  return <EchoClient kind="new" params={params} />;
}
