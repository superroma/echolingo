'use client';

import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useRouter } from 'next/navigation';
import type { Lesson, LessonParams } from '@echolingo/shared/types';
import { useEcho } from '../hooks/use-echo';
import { usePlayer } from '../hooks/use-player';
import { useEchoes } from '../hooks/use-echoes';
import { AppBar } from './app-bar';
import { EchoProgress } from './echo-progress';
import { PlayerControlsView } from './player-controls';
import { TranscriptView } from './transcript-view';
import { buildPlaylist } from '@echolingo/shared/playlist';
import {
  cumulativeDurations,
  totalDuration,
  chunkAtElapsed,
} from '../hooks/playlist-math';
import { createLesson, type CreateLessonResult } from '../lib/api';

type NewProps = { kind: 'new'; params: LessonParams };
type ExistingProps = { kind: 'existing'; id: string };

export function EchoClient(props: NewProps | ExistingProps) {
  if (props.kind === 'new') return <NewEcho params={props.params} />;
  return <ExistingEcho id={props.id} />;
}

type CreateState =
  | { kind: 'creating' }
  | { kind: 'rate_limited'; limit: number; used: number; resetAt: string }
  | { kind: 'network_error'; message: string };

function NewEcho({ params }: { params: LessonParams }) {
  const router = useRouter();
  const { addEcho } = useEchoes();
  const [state, setState] = useState<CreateState>({ kind: 'creating' });
  const [attempt, setAttempt] = useState(0);
  const postedAttemptRef = useRef(-1);

  useEffect(() => {
    if (postedAttemptRef.current === attempt) return;
    postedAttemptRef.current = attempt;
    const myAttempt = attempt;
    setState({ kind: 'creating' });

    void (async () => {
      let result: CreateLessonResult;
      try {
        result = await createLesson(params);
      } catch (e) {
        if (postedAttemptRef.current !== myAttempt) return;
        setState({ kind: 'network_error', message: (e as Error).message });
        return;
      }
      if (postedAttemptRef.current !== myAttempt) return;
      if (result.kind === 'created' || result.kind === 'existing') {
        addEcho({
          id: result.id,
          topic: params.topic,
          targetLang: params.targetLang,
          nativeLang: params.nativeLang,
          lengthMin: params.lengthMin,
          level: params.level,
          createdAt: new Date().toISOString(),
          lastStatus: 'generating_script',
        });
        router.replace(`/echo/${result.id}/`);
        return;
      }
      if (result.kind === 'rate_limited') {
        setState({
          kind: 'rate_limited',
          limit: result.limit,
          used: result.used,
          resetAt: result.resetAt,
        });
        return;
      }
      setState({ kind: 'network_error', message: result.message });
    })();
  }, [params, addEcho, router, attempt]);

  const retry = () => setAttempt((a) => a + 1);

  return (
    <PageFrame title={params.topic}>
      {state.kind === 'creating' && (
        <CenteredCard>
          <p className="text-sm text-ink-muted">starting your echo…</p>
          <Spinner />
        </CenteredCard>
      )}
      {state.kind === 'rate_limited' && (
        <ErrorCard
          title="Daily limit reached"
          message={`Used ${state.used} of ${state.limit}. Resets at ${state.resetAt}.`}
        />
      )}
      {state.kind === 'network_error' && (
        <ErrorCard
          title="Couldn't reach the server"
          message={state.message}
          action={{ label: 'Retry', onClick: retry }}
        />
      )}
    </PageFrame>
  );
}

function ExistingEcho({ id }: { id: string }) {
  const router = useRouter();
  const { addEcho, updateEcho, removeEcho } = useEchoes();
  const state = useEcho(id);
  const [retrying, setRetrying] = useState<CreateState | null>(null);

  const adoptedRef = useRef(false);
  useEffect(() => {
    if (state.kind !== 'ok' || adoptedRef.current) return;
    adoptedRef.current = true;
    addEcho({
      id,
      topic: state.echo.params.topic,
      targetLang: state.echo.params.targetLang,
      nativeLang: state.echo.params.nativeLang,
      lengthMin: state.echo.params.lengthMin,
      level: state.echo.params.level,
      createdAt: state.echo.createdAt,
      lastStatus: state.echo.status,
    });
  }, [state, id, addEcho]);

  useEffect(() => {
    if (state.kind === 'ok') {
      updateEcho(id, {
        lastStatus: state.echo.status,
        error: state.echo.error,
      });
    }
  }, [state, id, updateEcho]);

  const playlist = useMemo(
    () =>
      state.kind === 'ok' && state.echo.status === 'ready'
        ? buildPlaylist(state.echo)
        : [],
    [state],
  );
  const player = usePlayer(playlist);

  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  useEffect(() => {
    const audio = player.audioRef.current;
    if (!audio) return;
    const onTime = () => setAudioCurrentTime(audio.currentTime);
    audio.addEventListener('timeupdate', onTime);
    return () => {
      audio.removeEventListener('timeupdate', onTime);
    };
  }, [player.audioRef]);

  const cum = useMemo(() => cumulativeDurations(playlist), [playlist]);
  const total = useMemo(() => totalDuration(playlist), [playlist]);
  const elapsedSec = (cum[player.state.currentChunk] ?? 0) + audioCurrentTime;

  function onSeek(sec: number) {
    const target = chunkAtElapsed(playlist, sec);
    const chunkStart = cum[target] ?? 0;
    const offsetInChunk = Math.max(0, sec - chunkStart);
    const sentenceIdx = playlist[target]?.sentenceIndex;
    if (sentenceIdx == null) return;
    player.controls.jumpToSentence(sentenceIdx);
    requestAnimationFrame(() => {
      const audio = player.audioRef.current;
      if (audio) audio.currentTime = offsetInChunk;
    });
  }

  async function retryFailed(echo: Lesson) {
    setRetrying({ kind: 'creating' });
    let result: CreateLessonResult;
    try {
      result = await createLesson(echo.params);
    } catch (e) {
      setRetrying({ kind: 'network_error', message: (e as Error).message });
      return;
    }
    if (result.kind === 'created' || result.kind === 'existing') {
      removeEcho(id);
      addEcho({
        id: result.id,
        topic: echo.params.topic,
        targetLang: echo.params.targetLang,
        nativeLang: echo.params.nativeLang,
        lengthMin: echo.params.lengthMin,
        level: echo.params.level,
        createdAt: new Date().toISOString(),
        lastStatus: 'generating_script',
      });
      router.replace(`/echo/${result.id}/`);
      return;
    }
    if (result.kind === 'rate_limited') {
      setRetrying({
        kind: 'rate_limited',
        limit: result.limit,
        used: result.used,
        resetAt: result.resetAt,
      });
      return;
    }
    setRetrying({ kind: 'network_error', message: result.message });
  }

  const headerTitle = state.kind === 'ok' ? state.echo.params.topic : 'echo';

  if (state.kind === 'loading') {
    return (
      <PageFrame title={headerTitle}>
        <CenteredCard>
          <p className="text-sm text-ink-muted">Loading…</p>
        </CenteredCard>
      </PageFrame>
    );
  }
  if (state.kind === 'not_found') {
    return (
      <PageFrame title="not found">
        <ErrorCard
          title="Echo not found"
          message="It may have expired or been removed."
        />
      </PageFrame>
    );
  }
  if (state.kind === 'error') {
    return (
      <PageFrame title={headerTitle}>
        <ErrorCard
          title="Couldn't reach the server"
          message={state.message}
        />
      </PageFrame>
    );
  }

  const { echo } = state;

  if (echo.status === 'failed') {
    if (retrying) {
      return (
        <PageFrame title={headerTitle}>
          {retrying.kind === 'creating' && (
            <CenteredCard>
              <p className="text-sm text-ink-muted">retrying…</p>
              <Spinner />
            </CenteredCard>
          )}
          {retrying.kind === 'rate_limited' && (
            <ErrorCard
              title="Daily limit reached"
              message={`Used ${retrying.used} of ${retrying.limit}. Resets at ${retrying.resetAt}.`}
            />
          )}
          {retrying.kind === 'network_error' && (
            <ErrorCard
              title="Couldn't reach the server"
              message={retrying.message}
              action={{ label: 'Retry', onClick: () => void retryFailed(echo) }}
            />
          )}
        </PageFrame>
      );
    }
    return (
      <PageFrame title={headerTitle}>
        <ErrorCard
          title="Generation failed"
          message={echo.error || 'Something went wrong on the server.'}
          action={{ label: 'Retry', onClick: () => void retryFailed(echo) }}
        />
      </PageFrame>
    );
  }

  const ready = echo.status === 'ready';

  return (
    <PageFrame title={echo.params.topic} pad>
      {!ready && <EchoProgress echo={echo} />}
      {ready && (
        <>
          <audio ref={player.audioRef as RefObject<HTMLAudioElement>} preload="auto" />
          <TranscriptView
            lesson={echo}
            currentSentence={player.state.currentSentence}
            onJump={player.controls.jumpToSentence}
          />
        </>
      )}
      {ready && (
        <div className="fixed inset-x-0 bottom-0 z-10 border-t border-hairline bg-paper/95 px-4 py-4 backdrop-blur">
          <div className="mx-auto max-w-2xl">
            <PlayerControlsView
              state={player.state}
              controls={player.controls}
              elapsedSec={elapsedSec}
              totalSec={total}
              onSeek={onSeek}
            />
          </div>
        </div>
      )}
    </PageFrame>
  );
}

function PageFrame({
  title,
  pad,
  children,
}: {
  title: string;
  pad?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`min-h-screen ${pad ? 'pb-40' : ''}`}>
      <AppBar title={title} />
      <main className="mx-auto max-w-2xl px-4 py-6">{children}</main>
    </div>
  );
}

function CenteredCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">{children}</div>
  );
}

function ErrorCard({
  title,
  message,
  action,
}: {
  title: string;
  message: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="space-y-3 border-l-2 border-terracotta bg-paper px-4 py-3 text-sm text-ink-muted">
      <p className="font-medium text-ink">{title}</p>
      <p>{message}</p>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="rounded-full bg-terracotta px-5 py-1.5 text-sm font-medium text-white"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

function Spinner() {
  return (
    <span
      className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-hairline border-t-aegean"
      aria-hidden
    />
  );
}
