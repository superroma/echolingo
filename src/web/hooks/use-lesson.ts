'use client';

import { useEffect, useState } from 'react';
import type { Lesson } from '@echolingo/shared/types';
import { getLesson } from '../lib/api';

export type LessonState =
  | { kind: 'loading' }
  | { kind: 'not_found' }
  | { kind: 'error'; message: string }
  | { kind: 'ok'; lesson: Lesson };

const POLL_INTERVAL_MS = 2000;

export function useLesson(id: string): LessonState {
  const [state, setState] = useState<LessonState>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function tick() {
      const result = await getLesson(id);
      if (cancelled) return;
      if (result.kind === 'not_found') {
        setState({ kind: 'not_found' });
        return;
      }
      if (result.kind === 'error') {
        setState({ kind: 'error', message: result.message });
        return;
      }
      setState({ kind: 'ok', lesson: result.lesson });
      const s = result.lesson.status;
      if (s === 'generating_script' || s === 'generating_audio') {
        timer = setTimeout(tick, POLL_INTERVAL_MS);
      }
    }

    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [id]);

  return state;
}
