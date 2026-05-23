'use client';

import { useEffect, useMemo, useState, type RefObject } from 'react';
import { useRouter } from 'next/navigation';
import { useLesson } from '../../../hooks/use-lesson';
import { usePlayer } from '../../../hooks/use-player';
import { LessonProgress } from '../../../components/lesson-progress';
import { PlayerControlsView } from '../../../components/player-controls';
import { TranscriptView } from '../../../components/transcript-view';
import { buildPlaylist } from '@echolingo/shared/playlist';
import {
  cumulativeDurations,
  totalDuration,
  chunkAtElapsed,
} from '../../../hooks/playlist-math';

function readIdFromPath(): string {
  if (typeof window === 'undefined') return '';
  const parts = window.location.pathname.split('/').filter(Boolean);
  return parts[1] ?? '';
}

export function LessonClient() {
  const [id, setId] = useState('');
  useEffect(() => {
    setId(readIdFromPath());
  }, []);
  if (!id) {
    return <CenteredMessage>Loading…</CenteredMessage>;
  }
  return <LessonScreen id={id} />;
}

function LessonScreen({ id }: { id: string }) {
  const router = useRouter();
  const state = useLesson(id);
  const playlist = useMemo(
    () => (state.kind === 'ok' && state.lesson.status === 'ready' ? buildPlaylist(state.lesson) : []),
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

  if (state.kind === 'loading') {
    return <CenteredMessage>Loading…</CenteredMessage>;
  }
  if (state.kind === 'not_found') {
    return <CenteredMessage tone="error">Lesson not found.</CenteredMessage>;
  }
  if (state.kind === 'error') {
    return <CenteredMessage tone="error">Error: {state.message}</CenteredMessage>;
  }

  const { lesson } = state;
  const ready = lesson.status === 'ready';

  return (
    <div className="min-h-screen pb-40">
      <TopBar title={lesson.params.topic} onBack={() => router.push('/')} />

      <main className="mx-auto max-w-2xl px-4 py-6">
        {!ready && <LessonProgress lesson={lesson} />}

        {ready && (
          <>
            <audio ref={player.audioRef as RefObject<HTMLAudioElement>} preload="auto" />
            <TranscriptView
              lesson={lesson}
              currentSentence={player.state.currentSentence}
              onJump={player.controls.jumpToSentence}
            />
          </>
        )}
      </main>

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
    </div>
  );
}

function TopBar({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <header className="sticky top-0 z-10 flex h-12 items-center border-b border-hairline bg-paper/95 px-3 backdrop-blur">
      <button
        type="button"
        onClick={onBack}
        className="rounded p-1 text-ink-muted hover:text-ink"
        aria-label="Back"
      >
        ←
      </button>
      <h1 className="mx-auto max-w-[60%] truncate text-sm font-medium text-ink">{title}</h1>
      <span className="w-7" aria-hidden />
    </header>
  );
}

function CenteredMessage({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone?: 'error';
}) {
  return (
    <main className={`mx-auto max-w-md px-4 py-8 ${tone === 'error' ? 'text-terracotta' : 'text-ink-muted'}`}>
      {children}
    </main>
  );
}
