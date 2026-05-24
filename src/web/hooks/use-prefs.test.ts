import { describe, it, expect } from 'vitest';
import { DEFAULT_PREFS, loadPrefs, savePrefs, type FormPrefs, type PrefsStorage } from './use-prefs.js';

function fakeStorage(): PrefsStorage & { removeItem(k: string): void } {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
  };
}

describe('FormPrefs persistence', () => {
  it('loadPrefs returns defaults for an empty storage', () => {
    expect(loadPrefs(fakeStorage())).toEqual(DEFAULT_PREFS);
  });

  it('savePrefs then loadPrefs round-trips', () => {
    const storage = fakeStorage();
    const prefs: FormPrefs = {
      ...DEFAULT_PREFS,
      lengthMin: 20,
      level: 5,
      nativeLang: 'ru',
    };
    savePrefs(storage, prefs);
    expect(loadPrefs(storage)).toEqual(prefs);
  });

  it('loadPrefs falls back to defaults on corrupt JSON', () => {
    const storage = fakeStorage();
    storage.setItem('echolingo:prefs', 'not json');
    expect(loadPrefs(storage)).toEqual(DEFAULT_PREFS);
  });

  it('loadPrefs falls back to defaults when stored fields are invalid', () => {
    const storage = fakeStorage();
    storage.setItem('echolingo:prefs', JSON.stringify({ lengthMin: 7, level: 9 }));
    const result = loadPrefs(storage);
    expect(result.lengthMin).toBe(DEFAULT_PREFS.lengthMin);
    expect(result.level).toBe(DEFAULT_PREFS.level);
  });

  it('savePrefs strips the topic — topic is never remembered', () => {
    const storage = fakeStorage();
    savePrefs(storage, { ...DEFAULT_PREFS, topic: 'leaked' as unknown as never });
    const raw = storage.getItem('echolingo:prefs')!;
    expect(JSON.parse(raw).topic).toBeUndefined();
  });

  it('ignores legacy keys (style, mode, bilingualOrder) when loading', () => {
    const storage = fakeStorage();
    storage.setItem(
      'echolingo:prefs',
      JSON.stringify({
        targetLang: 'es',
        nativeLang: 'en',
        lengthMin: 10,
        level: 4,
        style: 'story',
        mode: 'target_only',
        bilingualOrder: 'native_first',
      }),
    );
    const loaded = loadPrefs(storage);
    expect(loaded).toEqual({
      topic: '',
      targetLang: 'es',
      nativeLang: 'en',
      lengthMin: 10,
      level: 4,
    });
    expect((loaded as unknown as Record<string, unknown>).style).toBeUndefined();
    expect((loaded as unknown as Record<string, unknown>).mode).toBeUndefined();
    expect((loaded as unknown as Record<string, unknown>).bilingualOrder).toBeUndefined();
  });
});

describe('FormPrefs multi-language', () => {
  it('defaults targetLang to el and nativeLang to en', () => {
    const loaded = loadPrefs(fakeStorage());
    expect(loaded.targetLang).toBe('el');
    expect(loaded.nativeLang).toBe('en');
  });

  it('falls back to defaults when stored language codes are unknown', () => {
    const s = fakeStorage();
    s.setItem(
      'echolingo:prefs',
      JSON.stringify({ targetLang: 'xx', nativeLang: 'yy' }),
    );
    const loaded = loadPrefs(s);
    expect(loaded.targetLang).toBe('el');
    expect(loaded.nativeLang).toBe('en');
  });

  it('round-trips a valid Spanish-target preference', () => {
    const s = fakeStorage();
    savePrefs(s, { ...DEFAULT_PREFS, targetLang: 'es', nativeLang: 'en' });
    expect(loadPrefs(s).targetLang).toBe('es');
  });

  it('flips native to a different code when target collides on load', () => {
    const s = fakeStorage();
    s.setItem('echolingo:prefs', JSON.stringify({ targetLang: 'en', nativeLang: 'en' }));
    const loaded = loadPrefs(s);
    expect(loaded.targetLang).toBe('en');
    expect(loaded.nativeLang).not.toBe('en');
  });
});
