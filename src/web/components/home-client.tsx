'use client';

import { useEffect, useRef } from 'react';
import { AppBar } from './app-bar';
import { CreateEchoForm } from './create-echo-form';
import { EchoesList } from './echoes-list';
import { useEchoes } from '../hooks/use-echoes';
import { getLesson } from '../lib/api';

export function HomeClient() {
  const { echoes, hydrated, updateEcho, removeEcho } = useEchoes();
  const refreshedRef = useRef(false);

  useEffect(() => {
    if (!hydrated || refreshedRef.current) return;
    refreshedRef.current = true;
    const pending = echoes.filter(
      (e) => e.lastStatus === 'generating_script' || e.lastStatus === 'generating_audio',
    );
    let cancelled = false;
    void Promise.all(
      pending.map(async (e) => {
        const result = await getLesson(e.id);
        if (cancelled) return;
        if (result.kind === 'found') {
          if (result.lesson.status !== e.lastStatus) {
            updateEcho(e.id, {
              lastStatus: result.lesson.status,
              error: result.lesson.error,
            });
          }
        } else if (result.kind === 'not_found') {
          updateEcho(e.id, { lastStatus: 'failed', error: 'lesson not found' });
        }
      }),
    );
    return () => {
      cancelled = true;
    };
  }, [hydrated, echoes, updateEcho]);

  return (
    <>
      <AppBar />
      <main className="mx-auto max-w-md px-5 py-8">
        <p className="mb-6 text-center text-sm text-ink-muted">
          listening lessons, on demand
        </p>
        <CreateEchoForm />
        <EchoesList echoes={echoes} hydrated={hydrated} onRemove={removeEcho} />
      </main>
    </>
  );
}
