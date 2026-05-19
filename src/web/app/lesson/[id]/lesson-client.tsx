'use client';

import { useEffect, useMemo, useState, type RefObject } from 'react';
import { useLesson } from '../../../hooks/use-lesson';
import { usePlayer } from '../../../hooks/use-player';
import { LessonProgress } from '../../../components/lesson-progress';
import { PlayerControlsView } from '../../../components/player-controls';
import { TranscriptView } from '../../../components/transcript-view';
import { buildPlaylist } from '@echolingo/shared/playlist';

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
    return <main className="mx-auto max-w-md px-4 py-8 text-neutral-600">Loading…</main>;
  }
  return <LessonScreen id={id} />;
}

function LessonScreen({ id }: { id: string }) {
  const state = useLesson(id);
  const playlist = useMemo(
    () => (state.kind === 'ok' && state.lesson.status === 'ready' ? buildPlaylist(state.lesson) : []),
    [state],
  );
  const player = usePlayer(playlist);

  if (state.kind === 'loading') {
    return <main className="mx-auto max-w-md px-4 py-8 text-neutral-600">Loading…</main>;
  }
  if (state.kind === 'not_found') {
    return <main className="mx-auto max-w-md px-4 py-8 text-red-900">Lesson not found.</main>;
  }
  if (state.kind === 'error') {
    return (
      <main className="mx-auto max-w-md px-4 py-8 text-red-900">
        Error: {state.message}
      </main>
    );
  }

  const { lesson } = state;
  const ready = lesson.status === 'ready';

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 space-y-6">
      <h1 className="text-2xl font-semibold">{lesson.params.topic}</h1>
      {!ready && <LessonProgress lesson={lesson} />}
      {ready && (
        <>
          <audio ref={player.audioRef as RefObject<HTMLAudioElement>} preload="auto" />
          <PlayerControlsView state={player.state} controls={player.controls} />
          <TranscriptView lesson={lesson} currentSentence={player.state.currentSentence} />
        </>
      )}
    </main>
  );
}
