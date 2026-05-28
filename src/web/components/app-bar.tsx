'use client';

import Link from 'next/link';

interface AppBarProps {
  title?: string;
}

export function AppBar({ title }: AppBarProps) {
  return (
    <header className="sticky top-0 z-20 flex h-12 items-center gap-3 border-b border-hairline bg-paper/95 px-3 backdrop-blur">
      <Link
        href="/"
        className="font-serif text-base lowercase tracking-tight text-ink"
      >
        echolingo
      </Link>
      {title ? (
        <h1 className="min-w-0 flex-1 truncate text-center text-sm font-medium text-ink">
          {title}
        </h1>
      ) : (
        <span className="flex-1" aria-hidden />
      )}
      <Link
        href="/echo/new"
        className="rounded-full bg-terracotta px-3.5 py-1 text-sm font-medium text-white"
      >
        + new
      </Link>
    </header>
  );
}
