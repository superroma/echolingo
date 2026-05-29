import { describe, it, expect, beforeEach } from 'vitest';
import { loadSpeed, saveSpeed, posKey, savePosition, loadPosition } from './use-player.js';

beforeEach(() => {
  const store = new Map<string, string>();
  (globalThis as { localStorage?: Storage }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  } as Storage;
});

describe('player persistence helpers', () => {
  it('round-trips speed', () => {
    saveSpeed(1.25);
    expect(loadSpeed()).toBe(1.25);
  });

  it('defaults speed to 1 when unset or invalid', () => {
    expect(loadSpeed()).toBe(1);
    saveSpeed(2 as unknown as number);
    expect(loadSpeed()).toBe(1);
  });

  it('keys position by echo id and round-trips', () => {
    expect(posKey('abc')).toBe('echo:pos:abc');
    savePosition('abc', 42);
    expect(loadPosition('abc')).toBe(42);
  });

  it('returns 0 position for an unknown id', () => {
    expect(loadPosition('missing')).toBe(0);
  });
});
