import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { BlobRateLimitStore } from '../src/storage/blob-rate-limit-store.js';
import { AZURITE_CONNECTION_STRING, isAzuriteReachable } from './helpers/azurite.js';
import { resetContainer } from './helpers/containers.js';

const CONTAINER = 'rate-limits-test-7';

describe('BlobRateLimitStore (integration)', () => {
  let connStr: string | null = null;

  beforeAll(async () => {
    if (await isAzuriteReachable()) connStr = AZURITE_CONNECTION_STRING;
  });

  beforeEach(async () => {
    if (!connStr) return;
    await resetContainer(connStr, CONTAINER);
  });

  it('increments returns 1 on first call for an IP+date', async (ctx) => {
    if (!connStr) ctx.skip();
    const store = new BlobRateLimitStore(connStr!, CONTAINER);
    expect(await store.increment('1.2.3.4', '2026-05-17')).toBe(1);
  });

  it('increments monotonically for the same key', async (ctx) => {
    if (!connStr) ctx.skip();
    const store = new BlobRateLimitStore(connStr!, CONTAINER);
    expect(await store.increment('1.2.3.4', '2026-05-17')).toBe(1);
    expect(await store.increment('1.2.3.4', '2026-05-17')).toBe(2);
    expect(await store.increment('1.2.3.4', '2026-05-17')).toBe(3);
  });

  it('separates counters per IP', async (ctx) => {
    if (!connStr) ctx.skip();
    const store = new BlobRateLimitStore(connStr!, CONTAINER);
    expect(await store.increment('1.1.1.1', '2026-05-17')).toBe(1);
    expect(await store.increment('2.2.2.2', '2026-05-17')).toBe(1);
  });

  it('separates counters per date', async (ctx) => {
    if (!connStr) ctx.skip();
    const store = new BlobRateLimitStore(connStr!, CONTAINER);
    expect(await store.increment('1.1.1.1', '2026-05-17')).toBe(1);
    expect(await store.increment('1.1.1.1', '2026-05-18')).toBe(1);
  });

  it('get returns 0 for unused keys', async (ctx) => {
    if (!connStr) ctx.skip();
    const store = new BlobRateLimitStore(connStr!, CONTAINER);
    expect(await store.get('1.2.3.4', '2026-05-17')).toBe(0);
  });

  it('get returns current count after increments', async (ctx) => {
    if (!connStr) ctx.skip();
    const store = new BlobRateLimitStore(connStr!, CONTAINER);
    await store.increment('1.1.1.1', '2026-05-17');
    await store.increment('1.1.1.1', '2026-05-17');
    expect(await store.get('1.1.1.1', '2026-05-17')).toBe(2);
  });
});
