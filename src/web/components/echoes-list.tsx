'use client';

import { useRouter } from 'next/navigation';
import { LANG_NAME, type LessonStatus } from '@echolingo/shared/types';
import type { Echo } from '../hooks/use-echoes';

export function EchoesList({
  echoes,
  hydrated,
  onRemove,
}: {
  echoes: Echo[];
  hydrated: boolean;
  onRemove: (id: string) => void;
}) {
  if (!hydrated) return null;
  return (
    <section className="mt-10 space-y-3">
      <h2 className="font-serif text-2xl lowercase tracking-tight text-ink">echoes</h2>
      {echoes.length === 0 ? (
        <p className="text-sm text-ink-muted">your echoes will appear here</p>
      ) : (
        <ul className="divide-y divide-hairline">
          {echoes.map((echo) => (
            <EchoRow key={echo.id} echo={echo} onRemove={onRemove} />
          ))}
        </ul>
      )}
    </section>
  );
}

function EchoRow({ echo, onRemove }: { echo: Echo; onRemove: (id: string) => void }) {
  const router = useRouter();
  return (
    <li className="group flex items-start gap-3 py-3">
      <button
        type="button"
        onClick={() => router.push(`/echo/${echo.id}/`)}
        className="flex-1 text-left"
      >
        <p className="truncate font-serif text-base text-ink">{echo.topic}</p>
        <p className="mt-0.5 text-xs text-ink-muted">
          {LANG_NAME[echo.targetLang].toLowerCase()} · {echo.lengthMin} min · L{echo.level}
          <span className="px-1.5 text-ink-faint">·</span>
          <RelativeTime iso={echo.createdAt} />
        </p>
      </button>
      <StatusDot status={echo.lastStatus} />
      <button
        type="button"
        onClick={() => {
          if (confirm('Remove this echo from your list?')) onRemove(echo.id);
        }}
        className="rounded p-1 text-ink-faint opacity-0 transition-opacity hover:text-ink group-hover:opacity-100"
        aria-label="Remove echo"
      >
        ×
      </button>
    </li>
  );
}

function StatusDot({ status }: { status: LessonStatus }) {
  const cls =
    status === 'ready'
      ? 'bg-ink'
      : status === 'failed'
      ? 'border border-terracotta'
      : 'animate-pulse bg-aegean';
  return (
    <span
      className={`mt-1.5 inline-block h-2 w-2 rounded-full ${cls}`}
      aria-label={`status: ${status}`}
    />
  );
}

function RelativeTime({ iso }: { iso: string }) {
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return null;
  const text = formatRelative(ms);
  return <span>{text}</span>;
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
