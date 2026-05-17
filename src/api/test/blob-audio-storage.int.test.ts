import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { BlobAudioStorage } from '../src/storage/blob-audio-storage.js';
import { AZURITE_CONNECTION_STRING, isAzuriteReachable } from './helpers/azurite.js';
import { resetContainer } from './helpers/containers.js';

const CONTAINER = 'audio-test-8';

describe('BlobAudioStorage (integration)', () => {
  let connStr: string | null = null;

  beforeAll(async () => {
    if (await isAzuriteReachable()) connStr = AZURITE_CONNECTION_STRING;
  });

  beforeEach(async () => {
    if (!connStr) return;
    await resetContainer(connStr, CONTAINER);
  });

  it('returns URL pointing at the uploaded chunk', async (ctx) => {
    if (!connStr) ctx.skip();
    const storage = new BlobAudioStorage(connStr!, CONTAINER);
    const url = await storage.put('L1', 0, 'gr', Buffer.from('mock-mp3'));
    expect(url).toBe(storage.getUrl('L1', 0, 'gr'));
    expect(url).toContain('/audio-test-8/L1/gr/0.mp3');
  });

  it('roundtrips bytes through put → fetch', async (ctx) => {
    if (!connStr) ctx.skip();
    const storage = new BlobAudioStorage(connStr!, CONTAINER);
    const data = Buffer.from('hello mp3 audio bytes');
    await storage.put('L1', 3, 'native', data);
    const fetched = await storage.fetch('L1', 3, 'native');
    expect(fetched?.equals(data)).toBe(true);
  });

  it('fetch returns null for missing chunks', async (ctx) => {
    if (!connStr) ctx.skip();
    const storage = new BlobAudioStorage(connStr!, CONTAINER);
    expect(await storage.fetch('L1', 99, 'gr')).toBeNull();
  });
});
