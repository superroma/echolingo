import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { BlobLessonRepository } from '../src/storage/blob-lesson-repository.js';
import { lessonId, type Lesson } from '@echolingo/shared';
import { AZURITE_CONNECTION_STRING, isAzuriteReachable } from './helpers/azurite.js';
import { resetContainer } from './helpers/containers.js';
import { lessonParams } from './helpers/fixtures.js';

const CONTAINER = 'lessons-test-7';

function makeLesson(): Lesson {
  const params = lessonParams();
  return {
    id: lessonId(params),
    params,
    status: 'generating_script',
    createdAt: '2026-05-17T00:00:00Z',
    updatedAt: '2026-05-17T00:00:00Z',
    totalSentences: 0,
    readySentences: 0,
    sentences: [],
  };
}

describe('BlobLessonRepository (integration)', () => {
  let connStr: string | null = null;

  beforeAll(async () => {
    if (await isAzuriteReachable()) connStr = AZURITE_CONNECTION_STRING;
  });

  beforeEach(async () => {
    if (!connStr) return;
    await resetContainer(connStr, CONTAINER);
  });

  it('returns null for an unknown id', async (ctx) => {
    if (!connStr) ctx.skip();
    const repo = new BlobLessonRepository(connStr!, CONTAINER);
    expect(await repo.get('does-not-exist')).toBeNull();
  });

  it('createIfAbsent persists a new lesson', async (ctx) => {
    if (!connStr) ctx.skip();
    const repo = new BlobLessonRepository(connStr!, CONTAINER);
    const l = makeLesson();
    const created = await repo.createIfAbsent(l);
    expect(created.id).toBe(l.id);
    expect(await repo.get(l.id)).toEqual(l);
  });

  it('createIfAbsent is idempotent', async (ctx) => {
    if (!connStr) ctx.skip();
    const repo = new BlobLessonRepository(connStr!, CONTAINER);
    const l = makeLesson();
    await repo.createIfAbsent(l);
    const second = await repo.createIfAbsent({ ...l, status: 'ready' });
    expect(second.status).toBe('generating_script');
  });

  it('update applies the mutator', async (ctx) => {
    if (!connStr) ctx.skip();
    const repo = new BlobLessonRepository(connStr!, CONTAINER);
    const l = makeLesson();
    await repo.createIfAbsent(l);
    const updated = await repo.update(l.id, (lesson) => ({ ...lesson, status: 'ready' }));
    expect(updated.status).toBe('ready');
    expect((await repo.get(l.id))?.status).toBe('ready');
  });

  it('update throws on missing id', async (ctx) => {
    if (!connStr) ctx.skip();
    const repo = new BlobLessonRepository(connStr!, CONTAINER);
    await expect(repo.update('missing', (l) => l)).rejects.toThrow(/not found/i);
  });
});
