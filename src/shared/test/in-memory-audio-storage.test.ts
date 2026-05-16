import { describe, it, expect } from 'vitest';
import { InMemoryAudioStorage } from '../src/storage/in-memory-audio-storage.js';

describe('InMemoryAudioStorage', () => {
  it('returns the upload URL after put', async () => {
    const storage = new InMemoryAudioStorage();
    const url = await storage.put('lessonA', 0, 'gr', Buffer.from('abc'));
    expect(url).toBe(storage.getUrl('lessonA', 0, 'gr'));
  });

  it('roundtrips a buffer through put → fetch', async () => {
    const storage = new InMemoryAudioStorage();
    const data = Buffer.from('hello mp3');
    await storage.put('lessonA', 7, 'native', data);
    const fetched = await storage.fetch('lessonA', 7, 'native');
    expect(fetched?.equals(data)).toBe(true);
  });

  it('fetch returns null for missing chunks', async () => {
    const storage = new InMemoryAudioStorage();
    expect(await storage.fetch('lessonA', 0, 'gr')).toBeNull();
  });

  it('partitions by lesson, sentence index, and lang', async () => {
    const storage = new InMemoryAudioStorage();
    await storage.put('A', 0, 'gr', Buffer.from('a-gr-0'));
    await storage.put('A', 0, 'native', Buffer.from('a-native-0'));
    await storage.put('A', 1, 'gr', Buffer.from('a-gr-1'));
    await storage.put('B', 0, 'gr', Buffer.from('b-gr-0'));
    expect((await storage.fetch('A', 0, 'gr'))?.toString()).toBe('a-gr-0');
    expect((await storage.fetch('A', 0, 'native'))?.toString()).toBe('a-native-0');
    expect((await storage.fetch('A', 1, 'gr'))?.toString()).toBe('a-gr-1');
    expect((await storage.fetch('B', 0, 'gr'))?.toString()).toBe('b-gr-0');
  });
});
