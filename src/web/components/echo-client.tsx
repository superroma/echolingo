'use client';

import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useRouter } from 'next/navigation';
import { cefr, LANG_NAME, type Lesson, type LessonParams } from '@echolingo/shared/types';
import { useEcho } from '../hooks/use-echo';
import { usePlayer, loadPosition } from '../hooks/use-player';
import { useEchoes, loadEchoes } from '../hooks/use-echoes';
import { AppBar } from './app-bar';
import { EchoProgress } from './echo-progress';
import { PlayerControlsView } from './player-controls';
import { TranscriptView } from './transcript-view';
import { isSharedVisit, ShareContextStrip, ConversionCard } from './share-affordances';
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

// Per-session, per-id memo of the shared-vs-owner decision. Lives in module
// scope so it persists across a StrictMode remount; cleared on real page reload.
const sharedById = new Map<string, boolean>();
function resolveShared(id: string): boolean {
  if (typeof window === 'undefined') return false;
  if (!sharedById.has(id)) {
    const owned = loadEchoes(window.localStorage).some((e) => e.id === id);
    sharedById.set(id, isSharedVisit({ libraryHadId: owned }));
  }
  return sharedById.get(id) === true;
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
      {state.kind === 'creating' && <Generating topic={params.topic} meta={metaLine(params)} />}
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
  const [showTranslation, setShowTranslation] = useState(true);

  // Owner-vs-visitor: decided once per id from the persisted library, the first
  // time this id is opened this session — before silent adoption appends it.
  // Recorded in module scope so it survives a StrictMode unmount/remount (whose
  // fresh refs would otherwise re-read the just-adopted id and misread "owner").
  const shared = resolveShared(id);

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
  const player = usePlayer(playlist, id);
  const bilingual = state.kind === 'ok' && state.echo.params.mode === 'bilingual';

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

  // Resume where the listener left off, once the playlist is ready.
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current || playlist.length === 0) return;
    restoredRef.current = true;
    const saved = loadPosition(id);
    if (saved > 0) onSeek(saved);
  }, [playlist.length, id]);

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
          <p className="text-sm text-ink-soft">Loading…</p>
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
              <p className="text-sm text-ink-soft">retrying…</p>
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

  if (!ready) {
    return (
      <PageFrame title={echo.params.topic}>
        <EchoProgress echo={echo} />
      </PageFrame>
    );
  }

  return (
    <div className="flex h-[100dvh] flex-col">
      <AppBar title={echo.params.topic} showNew />
      <audio ref={player.audioRef as RefObject<HTMLAudioElement>} preload="auto" />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl">
          {shared && <ShareContextStrip echo={echo} />}
          <TranscriptView
            lesson={echo}
            currentSentence={player.state.currentSentence}
            showNative={bilingual && showTranslation}
            onJump={player.controls.jumpToSentence}
          />
          {shared && <ConversionCard />}
        </div>
      </div>
      <div className="flex-none border-t border-line bg-paper/[0.92] px-[22px] pb-[max(30px,env(safe-area-inset-bottom))] pt-3 shadow-[var(--shadow-up)] backdrop-blur-[14px]">
        <div className="mx-auto max-w-2xl">
          <PlayerControlsView
            state={player.state}
            controls={player.controls}
            elapsedSec={elapsedSec}
            totalSec={total}
            onSeek={onSeek}
            bilingual={bilingual}
            showTranslation={showTranslation}
            onToggleTranslation={() => setShowTranslation((v) => !v)}
          />
        </div>
      </div>
    </div>
  );
}

function PageFrame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <AppBar title={title} showNew />
      <main className="mx-auto max-w-2xl px-4 py-6">{children}</main>
    </div>
  );
}

function metaLine(params: LessonParams): string {
  return `${LANG_NAME[params.targetLang].toLowerCase()} · ${params.lengthMin} min · ${cefr(params.level)}`;
}

function Generating({ topic, meta }: { topic: string; meta: string }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-[22px] p-10 text-center">
      <div className="h-[54px] w-[54px] animate-spin rounded-full border-[3px] border-line border-t-accent" />
      <div>
        <div className="font-serif text-[18px] italic text-ink-soft">composing your echo…</div>
        <div className="mx-auto mt-2.5 max-w-[26ch] font-serif text-[22px] font-semibold tracking-[-0.01em] text-ink">
          {topic}
        </div>
        <div className="mt-2.5 font-serif text-[14px] italic text-ink-soft">{meta}</div>
      </div>
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
    <div className="space-y-3 border-l-2 border-accent bg-paper px-4 py-3 text-sm text-ink-soft">
      <p className="font-medium text-ink">{title}</p>
      <p>{message}</p>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="rounded-full bg-accent px-5 py-1.5 text-sm font-medium text-accent-ink"
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
      className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-line border-t-accent"
      aria-hidden
    />
  );
}
