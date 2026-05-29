'use client';

import { useEffect, useRef } from 'react';
import { AppBar } from './app-bar';
import { CreateEchoForm } from './create-echo-form';
import { EchoesList } from './echoes-list';
import { InstallPanel } from './install-panel';
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
            updateEcho(e.id, { lastStatus: result.lesson.status, error: result.lesson.error });
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

  const firstRun = hydrated && echoes.length === 0;

  return (
    <>
      <AppBar />
      <InstallPanel />
      <main className="mx-auto max-w-md px-6 pb-7 pt-[18px]">
        {firstRun && (
          <div className="px-2 pb-[18px] pt-1.5 text-center">
            <h1 className="mb-2.5 font-serif text-[34px] font-semibold leading-[1.04] tracking-[-0.025em] text-ink">
              listening lessons,
              <br />
              on demand
            </h1>
            <p className="font-serif text-[17px] italic leading-[1.4] text-ink-soft">
              name a topic — get a narrated lesson
              <br />
              in seconds. no account, ever.
            </p>
          </div>
        )}
        <CreateEchoForm showSuggestions={firstRun} />
        <EchoesList echoes={echoes} hydrated={hydrated} onRemove={removeEcho} />
      </main>
    </>
  );
}
