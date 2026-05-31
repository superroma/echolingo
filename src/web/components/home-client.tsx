'use client';

import { useEffect, useRef } from 'react';
import { AppBar } from './app-bar';
import { CreateEchoForm } from './create-echo-form';
import { EchoesList } from './echoes-list';
import { InstallPanel } from './install-panel';
import { useEchoes } from '../hooks/use-echoes';
import { getEcho } from '../lib/api';

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
        const result = await getEcho(e.id);
        if (cancelled) return;
        if (result.kind === 'found') {
          if (result.echo.status !== e.lastStatus) {
            updateEcho(e.id, { lastStatus: result.echo.status, error: result.echo.error });
          }
        } else if (result.kind === 'not_found') {
          updateEcho(e.id, { lastStatus: 'failed', error: 'echo not found' });
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
      <main
        className={
          'mx-auto w-full px-6 pb-10 pt-[18px] md:flex md:min-h-[calc(100dvh-56px)] md:flex-col md:justify-center md:pt-0 ' +
          (firstRun ? 'max-w-xl' : 'max-w-xl lg:max-w-5xl')
        }
      >
        {firstRun && (
          <div className="px-2 pb-[18px] pt-1.5 text-center">
            <h1 className="mb-2.5 font-serif text-[clamp(30px,5.5vw,42px)] font-semibold leading-[1.04] tracking-[-0.025em] text-ink">
              listening echoes,
              <br />
              on demand
            </h1>
            <p className="font-serif text-[17px] italic leading-[1.4] text-ink-soft">
              name a topic — get a narrated echo
              <br />
              in seconds. no account, ever.
            </p>
          </div>
        )}
        <div className={firstRun ? undefined : 'lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-14'}>
          <CreateEchoForm showSuggestions={firstRun} />
          <EchoesList echoes={echoes} hydrated={hydrated} onRemove={removeEcho} />
        </div>
      </main>
    </>
  );
}
