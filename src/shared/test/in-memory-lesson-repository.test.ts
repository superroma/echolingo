import { describe, it, expect } from 'vitest';
import { InMemoryLessonRepository } from '../src/storage/in-memory-lesson-repository.js';
import type { Lesson } from '../src/types.js';

function lesson(id: string): Lesson {
  return {
    id,
    params: {
      topic: 'at the bakery',
      lengthMin: 5,
      level: 3,
      style: 'dialogue',
      mode: 'bilingual',
      bilingualOrder: 'gr_first',
      nativeLang: 'en',
      ttsEngine: 'openai',
    },
    status: 'generating_script',
    createdAt: '2026-05-17T00:00:00Z',
    updatedAt: '2026-05-17T00:00:00Z',
    totalSentences: 0,
    readySentences: 0,
    sentences: [],
  };
}

describe('InMemoryLessonRepository', () => {
  it('returns null for an unknown id', async () => {
    const repo = new InMemoryLessonRepository();
    expect(await repo.get('missing')).toBeNull();
  });

  it('createIfAbsent stores a new lesson and returns it', async () => {
    const repo = new InMemoryLessonRepository();
    const l = lesson('abc');
    const stored = await repo.createIfAbsent(l);
    expect(stored).toEqual(l);
    expect(await repo.get('abc')).toEqual(l);
  });

  it('createIfAbsent returns the existing lesson without overwriting', async () => {
    const repo = new InMemoryLessonRepository();
    const first = lesson('abc');
    await repo.createIfAbsent(first);
    const second = { ...first, status: 'ready' as const };
    const result = await repo.createIfAbsent(second);
    expect(result).toEqual(first);
    expect((await repo.get('abc'))?.status).toBe('generating_script');
  });

  it('update applies a mutator and persists the result', async () => {
    const repo = new InMemoryLessonRepository();
    await repo.createIfAbsent(lesson('abc'));
    const updated = await repo.update('abc', (l) => ({ ...l, status: 'ready' }));
    expect(updated.status).toBe('ready');
    expect((await repo.get('abc'))?.status).toBe('ready');
  });

  it('update throws when the lesson does not exist', async () => {
    const repo = new InMemoryLessonRepository();
    await expect(repo.update('missing', (l) => l)).rejects.toThrow(/not found/i);
  });

  it('update is isolated — mutator must not mutate the input', async () => {
    const repo = new InMemoryLessonRepository();
    await repo.createIfAbsent(lesson('abc'));
    await repo.update('abc', (l) => {
      (l as { status: string }).status = 'failed';
      return l;
    });
    const got = await repo.get('abc');
    expect(got?.status).toBe('failed');
  });
});
