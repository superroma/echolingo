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
  // Read the stored mode + OS preference SYNCHRONOUSLY on first render so the
  // initial `effective` is already correct. Defaulting to 'auto'/light and
  // correcting in a mount effect caused a theme-light -> real-theme flip on every
  // load — which, because `.echo-row` is the only element with a background-color
  // transition, showed up as the list items fading white->dark on a dark page.
  const [mode, setMode] = useState<ThemeMode>(() => {
    if (typeof window === 'undefined') return 'auto';
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'light' || stored === 'dark' || stored === 'auto') return stored;
    } catch {
      /* ignore */
    }
    return 'auto';
  });
  const [systemDark, setSystemDark] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches,
  );

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
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
