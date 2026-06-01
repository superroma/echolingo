'use client';

import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useRouter } from 'next/navigation';
import { LANG_NAME, cefr } from '@echolingo/shared/types';
import type { Echo } from '../hooks/use-echoes';
import { PlayIcon, TrashIcon } from './icons';

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
      <ul className="mt-1 flex flex-col pb-7">
        {echoes.map((echo, i) => (
          <EchoRow key={echo.id} echo={echo} first={i === 0} onRemove={onRemove} />
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

// Swipe geometry: REVEAL is the resting width of the exposed Delete action (it
// matches the action's own width so the open row sits flush against it).
// Dragging past COMMIT and releasing deletes outright (iOS-style full swipe).
const REVEAL = 96;
const COMMIT = 150;

function EchoRow({ echo, first, onRemove }: { echo: Echo; first: boolean; onRemove: (id: string) => void }) {
  const router = useRouter();
  const p = progressOf(echo);
  const done = p >= 1;
  const partial = p > 0 && p < 1;
  const isNew = p === 0;

  const [dx, setDx] = useState(0); // current foreground translateX (<= 0)
  const [open, setOpen] = useState(false); // resting at the revealed Delete action
  const [dragging, setDragging] = useState(false); // finger down → suppress transition
  const [exiting, setExiting] = useState(false); // slide-out before removal

  const startRef = useRef<{ x: number; y: number } | null>(null);
  const swipedRef = useRef(false); // a horizontal drag happened → swallow the click
  const axisRef = useRef<'none' | 'h' | 'v'>('none');

  function remove() {
    setExiting(true);
    window.setTimeout(() => onRemove(echo.id), 200);
  }

  function navigate() {
    if (swipedRef.current) return; // the click that trails a swipe — ignore it
    if (open) {
      setOpen(false);
      setDx(0);
      return;
    }
    router.push(`/${echo.id}/`);
  }

  function onPointerDown(e: ReactPointerEvent) {
    if (e.pointerType !== 'touch') return; // desktop keeps the hover trash button
    startRef.current = { x: e.clientX, y: e.clientY };
    swipedRef.current = false;
    axisRef.current = 'none';
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: ReactPointerEvent) {
    const start = startRef.current;
    if (!start) return;
    const mx = e.clientX - start.x;
    const my = e.clientY - start.y;
    if (axisRef.current === 'none') {
      if (Math.abs(mx) < 8 && Math.abs(my) < 8) return;
      axisRef.current = Math.abs(mx) > Math.abs(my) ? 'h' : 'v';
      if (axisRef.current === 'v') {
        // vertical scroll — bow out and let the page handle it
        startRef.current = null;
        setDragging(false);
        return;
      }
    }
    swipedRef.current = true;
    const base = open ? -REVEAL : 0;
    const next = Math.max(-(COMMIT + 50), Math.min(0, base + mx));
    setDx(next);
  }

  function endSwipe() {
    if (axisRef.current !== 'h') {
      startRef.current = null;
      setDragging(false);
      return;
    }
    startRef.current = null;
    setDragging(false);
    if (-dx >= COMMIT) {
      remove();
      return;
    }
    if (-dx >= REVEAL / 2) {
      setOpen(true);
      setDx(-REVEAL);
    } else {
      setOpen(false);
      setDx(0);
    }
    // swipedRef stays true until the next pointerdown so the trailing click is
    // swallowed; a fresh tap resets it in onPointerDown.
  }

  // Inline transform only when displaced — left undefined at rest so the CSS
  // hover/focus lift (translateY) can take over without an inline override.
  const transform = exiting
    ? 'translateX(-100%)'
    : open
      ? `translateX(-${REVEAL}px)`
      : dx !== 0
        ? `translateX(${dx}px)`
        : undefined;

  return (
    <li className="group relative rounded-[var(--radius-lg)]">
      {/* terracotta-tinted plane revealed as the foreground slides left */}
      <div
        className={'echo-reveal absolute inset-0 z-[1] flex items-center justify-end overflow-hidden' + (open ? ' is-open' : '')}
      >
        <button
          type="button"
          onClick={remove}
          tabIndex={open ? 0 : -1}
          aria-hidden={!open}
          aria-label="Delete echo"
          style={{ width: REVEAL }}
          className="flex h-full flex-col items-center justify-center gap-1.5 text-[color:var(--danger-ink)]"
        >
          <span className="echo-del-chip flex h-[34px] w-[34px] items-center justify-center rounded-full">
            <TrashIcon size={18} />
          </span>
          <span className="text-[11.5px] font-semibold tracking-[0.02em]">Delete</span>
        </button>
      </div>

      {/* foreground row — opaque, translates on swipe */}
      <div
        className={
          'echo-row relative z-[2] flex items-center gap-3.5 bg-paper px-3 py-[13px]' +
          (first ? ' is-first' : '') +
          (open || dragging || exiting ? ' is-active' : '') +
          (open ? ' is-open' : '') +
          (exiting ? ' is-exiting' : '')
        }
        data-dragging={dragging ? 'true' : undefined}
        style={{
          transform,
          opacity: exiting ? 0 : undefined,
          transition: dragging ? 'none' : exiting ? 'transform 0.22s ease, opacity 0.2s ease' : undefined,
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endSwipe}
        onPointerCancel={endSwipe}
      >
        {/* stretched, keyboard-accessible navigation target over the whole row */}
        <button
          type="button"
          onClick={navigate}
          aria-label={`Open echo: ${echo.topic}`}
          className="absolute inset-0 z-10 rounded-[var(--radius-lg)]"
        />
        <span className="pointer-events-none relative flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full border border-line bg-paper-3 text-ink shadow-[var(--shadow-1)]">
          {partial && <ProgressRing p={p} />}
          <PlayIcon size={18} />
        </span>
        <span className="pointer-events-none relative min-w-0 flex-1">
          <span className="block truncate font-serif text-[18px] font-semibold tracking-[-0.01em] text-ink">
            {echo.topic}
          </span>
          <span className="mt-[3px] block text-[13px] text-ink-mute">
            <span className="font-semibold capitalize text-accent">{LANG_NAME[echo.targetLang]}</span> ·{' '}
            {echo.lengthMin} min · {cefr(echo.level)}
            {done ? ' · finished' : ''} · <RelativeTime iso={echo.createdAt} />
          </span>
        </span>
        {isNew && (
          <span className="pointer-events-none relative flex-shrink-0 rounded-pill bg-accent px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-accent-ink">
            new
          </span>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (confirm('Remove this echo from your list?')) remove();
          }}
          aria-label="Remove echo"
          className="echo-desk-del relative z-20 flex h-[34px] w-[34px] flex-shrink-0 scale-90 items-center justify-center rounded-full text-[color:var(--danger-ink)] opacity-0 transition-[opacity,transform] duration-150 group-hover:scale-100 group-hover:opacity-100 focus-visible:scale-100 focus-visible:opacity-100"
        >
          <TrashIcon size={16} />
        </button>
      </div>
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
