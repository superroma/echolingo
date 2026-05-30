'use client';

import Link from 'next/link';
import { useTheme } from '../hooks/use-theme';
import { SunIcon, MoonIcon } from './icons';

interface AppBarProps {
  title?: string;
  showNew?: boolean;
}

export function AppBar({ title, showNew = false }: AppBarProps) {
  const { effective, toggle } = useTheme();
  return (
    <header className="sticky top-0 z-30 grid grid-cols-[auto_1fr_auto] items-center gap-2.5 border-b border-line-soft bg-paper/[0.86] px-[18px] pb-[13px] pt-[max(13px,env(safe-area-inset-top))] backdrop-blur-[14px]">
      <Link
        href="/"
        className="font-serif text-[21px] font-semibold leading-none tracking-[-0.01em] text-ink"
      >
        echolingo<span className="text-accent">.</span>
      </Link>

      <div className="min-w-0">
        {title && (
          <h1 className="truncate text-center font-serif text-[17px] font-semibold text-ink">{title}</h1>
        )}
      </div>

      <div className="flex items-center gap-1.5 justify-self-end">
        <button
          type="button"
          onClick={toggle}
          aria-label={effective === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          className="flex h-10 w-10 items-center justify-center rounded-full text-ink-soft hover:bg-paper-3"
        >
          {effective === 'dark' ? <SunIcon size={20} /> : <MoonIcon size={20} />}
        </button>
        {showNew && (
          <Link
            href="/"
            className="inline-flex h-10 items-center gap-1.5 rounded-pill bg-accent px-[18px] text-[15px] font-semibold text-accent-ink shadow-[var(--shadow-1)]"
          >
            <span className="text-[18px] leading-none">+</span> new
          </Link>
        )}
      </div>
    </header>
  );
}
