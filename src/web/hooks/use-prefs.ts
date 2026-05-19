'use client';

import { useEffect, useState } from 'react';
import {
  LESSON_LENGTHS,
  LESSON_STYLES,
  LESSON_MODES,
  BILINGUAL_ORDERS,
  NATIVE_LANGS,
  type BilingualOrder,
  type LessonLength,
  type LessonLevel,
  type LessonMode,
  type LessonStyle,
  type NativeLang,
} from '@echolingo/shared';

export interface FormPrefs {
  topic: string;
  lengthMin: LessonLength;
  level: LessonLevel;
  style: LessonStyle;
  mode: LessonMode;
  bilingualOrder: BilingualOrder;
  nativeLang: NativeLang;
}

export const DEFAULT_PREFS: FormPrefs = {
  topic: '',
  lengthMin: 5,
  level: 3,
  style: 'dialogue',
  mode: 'bilingual',
  bilingualOrder: 'gr_first',
  nativeLang: 'en',
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
  return {
    topic: DEFAULT_PREFS.topic,
    lengthMin: LESSON_LENGTHS.includes(parsed.lengthMin as LessonLength)
      ? (parsed.lengthMin as LessonLength)
      : DEFAULT_PREFS.lengthMin,
    level:
      typeof parsed.level === 'number' && parsed.level >= 1 && parsed.level <= 5
        ? (parsed.level as LessonLevel)
        : DEFAULT_PREFS.level,
    style: LESSON_STYLES.includes(parsed.style as LessonStyle)
      ? (parsed.style as LessonStyle)
      : DEFAULT_PREFS.style,
    mode: LESSON_MODES.includes(parsed.mode as LessonMode)
      ? (parsed.mode as LessonMode)
      : DEFAULT_PREFS.mode,
    bilingualOrder: BILINGUAL_ORDERS.includes(parsed.bilingualOrder as BilingualOrder)
      ? (parsed.bilingualOrder as BilingualOrder)
      : DEFAULT_PREFS.bilingualOrder,
    nativeLang: NATIVE_LANGS.includes(parsed.nativeLang as NativeLang)
      ? (parsed.nativeLang as NativeLang)
      : DEFAULT_PREFS.nativeLang,
  };
}

export function savePrefs(storage: PrefsStorage, prefs: FormPrefs): void {
  const { topic: _topic, ...persisted } = prefs;
  storage.setItem(STORAGE_KEY, JSON.stringify(persisted));
}

export function usePrefs(): [FormPrefs, (next: FormPrefs) => void] {
  const [prefs, setPrefs] = useState<FormPrefs>(DEFAULT_PREFS);

  useEffect(() => {
    if (typeof window === 'undefined') return;
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
