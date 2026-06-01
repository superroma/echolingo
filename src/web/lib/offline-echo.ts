import type { Echo } from '@echolingo/shared/types';

const PREFIX = 'echo:offline:';

/** Minimal storage surface so tests can inject a fake (mirrors use-echoes). */
export interface KVStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function defaultStorage(): KVStorage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

/** Persist the full Echo JSON so the transcript + audio URLs survive offline. */
export function saveEcho(echo: Echo, storage: KVStorage | null = defaultStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(PREFIX + echo.id, JSON.stringify(echo));
  } catch {
    // quota / serialization failure — best effort
  }
}

export function loadEcho(id: string, storage: KVStorage | null = defaultStorage()): Echo | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(PREFIX + id);
    return raw ? (JSON.parse(raw) as Echo) : null;
  } catch {
    return null;
  }
}

export function clearEcho(id: string, storage: KVStorage | null = defaultStorage()): void {
  if (!storage) return;
  try {
    storage.removeItem(PREFIX + id);
  } catch {
    // ignore
  }
}
