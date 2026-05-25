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
import { EchoClient } from '../../../components/echo-client';

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
      <main className="mx-auto max-w-md px-5 py-10 text-center text-sm text-ink-muted">
        Missing or invalid parameters.
      </main>
    );
  }
  return <EchoClient kind="new" params={params} />;
}
