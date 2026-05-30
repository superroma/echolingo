'use client';

import { useRouter } from 'next/navigation';
import { LANG_NAME, cefr } from '@echolingo/shared/types';
import type { Echo } from '../hooks/use-echoes';
import { PlayIcon } from './icons';

export function EchoesList({
  echoes,
  hydrated,
  onRemove,
}: {
  echoes: Echo[];
  hydrated: boolean;
  onRemove: (id: string) => void;
}) {
  if (!hydrated || echoes.length === 0) return null;
  return (
    <section className="mt-[26px] lg:mt-0">
      <h2 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-ink-mute">your echoes</h2>
      <ul className="mt-1 pb-7">
        {echoes.map((echo) => (
          <EchoRow key={echo.id} echo={echo} onRemove={onRemove} />
        ))}
      </ul>
    </section>
  );
}

function progressOf(echo: Echo): number {
  try {
    const pos = Number(localStorage.getItem(`echo:pos:${echo.id}`));
    if (!pos || Number.isNaN(pos)) return 0;
    const total = echo.lengthMin * 60;
    return Math.min(1, Math.max(0, pos / total));
  } catch {
    return 0;
  }
}

function EchoRow({ echo, onRemove }: { echo: Echo; onRemove: (id: string) => void }) {
  const router = useRouter();
  const p = progressOf(echo);
  const done = p >= 1;
  const partial = p > 0 && p < 1;
  const isNew = p === 0;
  return (
    <li className="group flex items-center gap-3.5 border-b border-line-soft py-4 last:border-b-0">
      <button
        type="button"
        onClick={() => router.push(`/echo/${echo.id}/`)}
        className="flex flex-1 items-center gap-3.5 text-left"
      >
        <span className="relative flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full border border-line bg-paper-3 text-ink shadow-[var(--shadow-1)]">
          {partial && <ProgressRing p={p} />}
          <PlayIcon size={18} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-serif text-[18px] font-semibold tracking-[-0.01em] text-ink">
            {echo.topic}
          </span>
          <span className="mt-[3px] block text-[13px] text-ink-mute">
            <span className="font-semibold capitalize text-accent">{LANG_NAME[echo.targetLang]}</span> ·{' '}
            {echo.lengthMin} min · {cefr(echo.level)}
            {done ? ' · finished' : ''} · <RelativeTime iso={echo.createdAt} />
          </span>
        </span>
      </button>
      {isNew && (
        <span className="flex-shrink-0 rounded-pill bg-accent px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-accent-ink">
          new
        </span>
      )}
      <button
        type="button"
        onClick={() => {
          if (confirm('Remove this echo from your list?')) onRemove(echo.id);
        }}
        className="rounded p-1 text-ink-mute opacity-0 transition-opacity hover:text-ink group-hover:opacity-100"
        aria-label="Remove echo"
      >
        ×
      </button>
    </li>
  );
}

function ProgressRing({ p }: { p: number }) {
  const r = 21;
  const c = 2 * Math.PI * r;
  return (
    <svg className="absolute -inset-px -rotate-90" width="44" height="44" viewBox="0 0 44 44" aria-hidden>
      <circle
        cx="22"
        cy="22"
        r={r}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="2"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - p)}
        strokeLinecap="round"
      />
    </svg>
  );
}

function RelativeTime({ iso }: { iso: string }) {
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return null;
  return <span>{formatRelative(ms)}</span>;
}

export function formatRelative(ms: number): string {
  if (ms < 0) return 'just now';
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}
