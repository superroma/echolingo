'use client';

import { useEffect, useState } from 'react';
import type { Lesson } from '@echolingo/shared/types';
import { getLesson } from '../lib/api';

export type EchoState =
  | { kind: 'loading' }
  | { kind: 'not_found' }
  | { kind: 'error'; message: string }
  | { kind: 'ok'; echo: Lesson };

const POLL_INTERVAL_MS = 2000;

export function useEcho(id: string): EchoState {
  const [state, setState] = useState<EchoState>({ kind: 'loading' });

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
      setState({ kind: 'ok', echo: result.lesson });
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
