'use client';

import { useEffect, useRef, useState } from 'react';
import {
  LESSON_LENGTHS,
  LANG_CODES,
  type LangCode,
  type LessonLength,
  type LessonLevel,
} from '@echolingo/shared/types';

export interface FormPrefs {
  topic: string;
  targetLang: LangCode;
  nativeLang: LangCode;
  lengthMin: LessonLength;
  level: LessonLevel;
}

export const DEFAULT_PREFS: FormPrefs = {
  topic: '',
  targetLang: 'el',
  nativeLang: 'en',
  lengthMin: 5,
  level: 3,
};

const STORAGE_KEY = 'echolingo:prefs';

export interface PrefsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function loadPrefs(storage: PrefsStorage): FormPrefs {
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return { ...DEFAULT_PREFS };
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return { ...DEFAULT_PREFS };
  }
  const pickLang = (v: unknown, fallback: LangCode): LangCode =>
    LANG_CODES.includes(v as LangCode) ? (v as LangCode) : fallback;

  const targetLang = pickLang(parsed.targetLang, DEFAULT_PREFS.targetLang);
  let nativeLang = pickLang(parsed.nativeLang, DEFAULT_PREFS.nativeLang);
  if (nativeLang === targetLang) {
    nativeLang = targetLang === 'en' ? 'ru' : 'en';
  }

  return {
    topic: DEFAULT_PREFS.topic,
    targetLang,
    nativeLang,
    lengthMin: LESSON_LENGTHS.includes(parsed.lengthMin as LessonLength)
      ? (parsed.lengthMin as LessonLength)
      : DEFAULT_PREFS.lengthMin,
    level:
      typeof parsed.level === 'number' && parsed.level >= 1 && parsed.level <= 5
        ? (parsed.level as LessonLevel)
        : DEFAULT_PREFS.level,
  };
}

export function savePrefs(storage: PrefsStorage, prefs: FormPrefs): void {
  const { topic: _topic, ...persisted } = prefs;
  storage.setItem(STORAGE_KEY, JSON.stringify(persisted));
}

export function usePrefs(): [FormPrefs, (next: FormPrefs) => void] {
  const [prefs, setPrefs] = useState<FormPrefs>(DEFAULT_PREFS);
  const hydratedRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined' || hydratedRef.current) return;
    hydratedRef.current = true;
    setPrefs(loadPrefs(window.localStorage));
  }, []);

  const update = (next: FormPrefs) => {
    setPrefs(next);
    if (typeof window !== 'undefined') {
      savePrefs(window.localStorage, next);
    }
  };

  return [prefs, update];
}
