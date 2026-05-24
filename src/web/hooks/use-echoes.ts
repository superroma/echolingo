'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  LANG_CODES,
  LESSON_LENGTHS,
  type LangCode,
  type LessonLength,
  type LessonLevel,
  type LessonStatus,
} from '@echolingo/shared/types';

export interface Echo {
  id: string;
  topic: string;
  targetLang: LangCode;
  nativeLang: LangCode;
  lengthMin: LessonLength;
  level: LessonLevel;
  createdAt: string;
  lastStatus: LessonStatus;
  error?: string;
}

export const MAX_ECHOES = 50;
const STORAGE_KEY = 'echolingo:echoes';

const VALID_STATUSES: LessonStatus[] = [
  'generating_script',
  'generating_audio',
  'ready',
  'failed',
];

export interface EchoesStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function isEcho(v: unknown): v is Echo {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    typeof o.topic === 'string' &&
    LANG_CODES.includes(o.targetLang as LangCode) &&
    LANG_CODES.includes(o.nativeLang as LangCode) &&
    LESSON_LENGTHS.includes(o.lengthMin as LessonLength) &&
    typeof o.level === 'number' &&
    o.level >= 1 &&
    o.level <= 5 &&
    typeof o.createdAt === 'string' &&
    VALID_STATUSES.includes(o.lastStatus as LessonStatus)
  );
}

export function loadEchoes(storage: EchoesStorage): Echo[] {
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isEcho).slice(0, MAX_ECHOES);
  } catch {
    return [];
  }
}

export function saveEchoes(storage: EchoesStorage, echoes: Echo[]): void {
  storage.setItem(STORAGE_KEY, JSON.stringify(echoes.slice(0, MAX_ECHOES)));
}

export function addEchoTo(echoes: Echo[], echo: Echo): Echo[] {
  const withoutDup = echoes.filter((e) => e.id !== echo.id);
  return [echo, ...withoutDup].slice(0, MAX_ECHOES);
}

export function updateEchoIn(
  echoes: Echo[],
  id: string,
  patch: Partial<Echo>,
): Echo[] {
  return echoes.map((e) => (e.id === id ? { ...e, ...patch } : e));
}

export function removeEchoFrom(echoes: Echo[], id: string): Echo[] {
  return echoes.filter((e) => e.id !== id);
}

export interface UseEchoesResult {
  echoes: Echo[];
  hydrated: boolean;
  addEcho(echo: Echo): void;
  updateEcho(id: string, patch: Partial<Echo>): void;
  removeEcho(id: string): void;
}

export function useEchoes(): UseEchoesResult {
  const [echoes, setEchoes] = useState<Echo[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setEchoes(loadEchoes(window.localStorage));
    setHydrated(true);
  }, []);

  const addEcho = useCallback(
    (echo: Echo) => {
      setEchoes((prev) => {
        const next = addEchoTo(prev, echo);
        if (typeof window !== 'undefined') {
          saveEchoes(window.localStorage, next);
        }
        return next;
      });
    },
    [],
  );

  const updateEcho = useCallback((id: string, patch: Partial<Echo>) => {
    setEchoes((prev) => {
      const next = updateEchoIn(prev, id, patch);
      if (typeof window !== 'undefined') {
        saveEchoes(window.localStorage, next);
      }
      return next;
    });
  }, []);

  const removeEcho = useCallback((id: string) => {
    setEchoes((prev) => {
      const next = removeEchoFrom(prev, id);
      if (typeof window !== 'undefined') {
        saveEchoes(window.localStorage, next);
      }
      return next;
    });
  }, []);

  return { echoes, hydrated, addEcho, updateEcho, removeEcho };
}
