'use client';

import { useCallback, useEffect, useState } from 'react';

export type ThemeMode = 'auto' | 'light' | 'dark';
export type EffectiveTheme = 'light' | 'dark';

const STORAGE_KEY = 'echolingo:theme';

/** The theme actually shown, given the stored mode and the OS preference. */
export function resolveEffective(mode: ThemeMode, systemDark: boolean): EffectiveTheme {
  if (mode === 'light' || mode === 'dark') return mode;
  return systemDark ? 'dark' : 'light';
}

/** Tapping the toggle pins the opposite of what is currently shown. */
export function nextOverride(effective: EffectiveTheme): EffectiveTheme {
  return effective === 'dark' ? 'light' : 'dark';
}

function applyClass(effective: EffectiveTheme) {
  const el = document.documentElement;
  el.classList.remove('theme-light', 'theme-dark');
  el.classList.add(`theme-${effective}`);
}

export function useTheme(): { effective: EffectiveTheme; toggle: () => void } {
  const [mode, setMode] = useState<ThemeMode>('auto');
  const [systemDark, setSystemDark] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
      if (stored === 'light' || stored === 'dark' || stored === 'auto') setMode(stored);
    } catch {
      /* ignore */
    }
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    setSystemDark(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const effective = resolveEffective(mode, systemDark);

  useEffect(() => {
    applyClass(effective);
  }, [effective]);

  const toggle = useCallback(() => {
    const target = nextOverride(resolveEffective(mode, systemDark));
    setMode(target);
    try {
      localStorage.setItem(STORAGE_KEY, target);
    } catch {
      /* ignore */
    }
  }, [mode, systemDark]);

  return { effective, toggle };
}
