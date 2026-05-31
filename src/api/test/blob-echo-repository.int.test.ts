import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { BlobEchoRepository } from '../src/storage/blob-echo-repository.js';
import { echoId, type Echo } from '../src/_shared/index.js';
import { AZURITE_CONNECTION_STRING, isAzuriteReachable } from './helpers/azurite.js';
import { resetContainer } from './helpers/containers.js';
import { echoParams } from './helpers/fixtures.js';

const CONTAINER = 'echoes-test-7';

function makeEcho(): Echo {
  const params = echoParams();
  return {
    id: echoId(params),
    params,
    status: 'generating_script',
    createdAt: '2026-05-17T00:00:00Z',
    updatedAt: '2026-05-17T00:00:00Z',
    totalSentences: 0,
    readySentences: 0,
    sentences: [],
  };
}

describe('BlobEchoRepository (integration)', () => {
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
    const repo = new BlobEchoRepository(connStr!, CONTAINER);
    expect(await repo.get('does-not-exist')).toBeNull();
  });

  it('createIfAbsent persists a new echo', async (ctx) => {
    if (!connStr) ctx.skip();
    const repo = new BlobEchoRepository(connStr!, CONTAINER);
    const e = makeEcho();
    const created = await repo.createIfAbsent(e);
    expect(created.id).toBe(e.id);
    expect(await repo.get(e.id)).toEqual(e);
  });

  it('createIfAbsent is idempotent', async (ctx) => {
    if (!connStr) ctx.skip();
    const repo = new BlobEchoRepository(connStr!, CONTAINER);
    const e = makeEcho();
    await repo.createIfAbsent(e);
    const second = await repo.createIfAbsent({ ...e, status: 'ready' });
    expect(second.status).toBe('generating_script');
  });

  it('update applies the mutator', async (ctx) => {
    if (!connStr) ctx.skip();
    const repo = new BlobEchoRepository(connStr!, CONTAINER);
    const e = makeEcho();
    await repo.createIfAbsent(e);
    const updated = await repo.update(e.id, (echo) => ({ ...echo, status: 'ready' }));
    expect(updated.status).toBe('ready');
    expect((await repo.get(e.id))?.status).toBe('ready');
  });

  it('update throws on missing id', async (ctx) => {
    if (!connStr) ctx.skip();
    const repo = new BlobEchoRepository(connStr!, CONTAINER);
    await expect(repo.update('missing', (e) => e)).rejects.toThrow(/not found/i);
  });
});
