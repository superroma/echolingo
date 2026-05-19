'use client';

import { useEffect, useState } from 'react';
import { useLesson } from '../../../hooks/use-lesson';
import { LessonProgress } from '../../../components/lesson-progress';

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

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 space-y-6">
      <h1 className="text-2xl font-semibold">{state.lesson.params.topic}</h1>
      <LessonProgress lesson={state.lesson} />
      {state.lesson.status === 'ready' && (
        <p className="text-sm text-neutral-500">
          Lesson is ready. Player UI lands in Task 8.
        </p>
      )}
    </main>
  );
}
