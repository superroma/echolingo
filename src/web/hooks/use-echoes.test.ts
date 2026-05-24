import { describe, it, expect } from 'vitest';
import {
  loadEchoes,
  saveEchoes,
  addEchoTo,
  updateEchoIn,
  removeEchoFrom,
  MAX_ECHOES,
  type Echo,
  type EchoesStorage,
} from './use-echoes.js';

function fakeStorage(): EchoesStorage & { _store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    _store: store,
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => {
      store.set(k, v);
    },
  };
}

function mkEcho(id: string, overrides: Partial<Echo> = {}): Echo {
  return {
    id,
    topic: `topic ${id}`,
    targetLang: 'el',
    nativeLang: 'en',
    lengthMin: 5,
    level: 3,
    createdAt: '2026-05-24T10:00:00.000Z',
    lastStatus: 'ready',
    ...overrides,
  };
}

describe('echoes persistence', () => {
  it('loadEchoes returns [] for empty storage', () => {
    expect(loadEchoes(fakeStorage())).toEqual([]);
  });

  it('loadEchoes returns [] on corrupt JSON', () => {
    const s = fakeStorage();
    s.setItem('echolingo:echoes', 'not json');
    expect(loadEchoes(s)).toEqual([]);
  });

  it('loadEchoes returns [] when stored value is not an array', () => {
    const s = fakeStorage();
    s.setItem('echolingo:echoes', JSON.stringify({ foo: 'bar' }));
    expect(loadEchoes(s)).toEqual([]);
  });

  it('loadEchoes filters out invalid entries', () => {
    const s = fakeStorage();
    s.setItem(
      'echolingo:echoes',
      JSON.stringify([
        mkEcho('a'),
        { id: 'broken' },
        mkEcho('b', { lastStatus: 'bogus' as never }),
        mkEcho('c'),
      ]),
    );
    const loaded = loadEchoes(s);
    expect(loaded.map((e) => e.id)).toEqual(['a', 'c']);
  });

  it('saveEchoes/loadEchoes round-trips', () => {
    const s = fakeStorage();
    const echoes = [mkEcho('a'), mkEcho('b', { targetLang: 'es', lastStatus: 'generating_audio' })];
    saveEchoes(s, echoes);
    expect(loadEchoes(s)).toEqual(echoes);
  });
});

describe('echoes mutations', () => {
  it('addEchoTo prepends the new echo', () => {
    const list = [mkEcho('a'), mkEcho('b')];
    const next = addEchoTo(list, mkEcho('c'));
    expect(next.map((e) => e.id)).toEqual(['c', 'a', 'b']);
  });

  it('addEchoTo de-duplicates by id (moves to top with new data)', () => {
    const list = [mkEcho('a'), mkEcho('b')];
    const next = addEchoTo(list, mkEcho('a', { topic: 'updated' }));
    expect(next.map((e) => e.id)).toEqual(['a', 'b']);
    expect(next[0].topic).toBe('updated');
  });

  it('addEchoTo caps the list at MAX_ECHOES', () => {
    const list = Array.from({ length: MAX_ECHOES }, (_, i) => mkEcho(`e${i}`));
    const next = addEchoTo(list, mkEcho('new'));
    expect(next.length).toBe(MAX_ECHOES);
    expect(next[0].id).toBe('new');
    expect(next[next.length - 1].id).toBe(`e${MAX_ECHOES - 2}`);
  });

  it('updateEchoIn patches the matching id only', () => {
    const list = [mkEcho('a'), mkEcho('b')];
    const next = updateEchoIn(list, 'b', { lastStatus: 'failed', error: 'boom' });
    expect(next[0]).toEqual(list[0]);
    expect(next[1].lastStatus).toBe('failed');
    expect(next[1].error).toBe('boom');
  });

  it('updateEchoIn is a no-op when id is missing', () => {
    const list = [mkEcho('a')];
    expect(updateEchoIn(list, 'missing', { lastStatus: 'failed' })).toEqual(list);
  });

  it('removeEchoFrom drops the matching id', () => {
    const list = [mkEcho('a'), mkEcho('b'), mkEcho('c')];
    expect(removeEchoFrom(list, 'b').map((e) => e.id)).toEqual(['a', 'c']);
  });
});
