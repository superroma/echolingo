# Progressive create → listen flow — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the new-echo page fill in progressively — show the transcript the moment the script is written, let the listener play partway through generation (buffering at the generation frontier), prefetch all audio, and cache it forever for offline replay with a per-echo reload/repair control.

**Architecture:** Frontend only. The backend already streams a partial `Echo` (full sentence text at `generating_audio`, each sentence flipping to `ready` with stable public audio URLs). We change the web client to (1) play the contiguous ready prefix of a growing playlist, (2) render the player during `generating_audio`, (3) prefetch every ready URL into a service-worker audio cache, and (4) persist the `Echo` JSON for offline fallback.

**Tech Stack:** Next.js 15 (static export, app router), React 19, TypeScript, Tailwind, vitest (+ jsdom via per-file `// @vitest-environment jsdom` docblock), `@echolingo/shared` workspace, Cache Storage / Service Worker.

**Spec:** `docs/superpowers/specs/2026-06-01-progressive-echo-flow-design.md`

---

## File structure

Created:
- `src/web/lib/offline-echo.ts` — persist/restore the full `Echo` JSON (localStorage) for offline replay.
- `src/web/lib/audio-cache.ts` — `AUDIO_CACHE` name, `clearEchoAudio(id)`, `persistStorage()`.
- `src/web/lib/echo-status.ts` — pure `statusLine(echo)` dock copy.
- `src/web/hooks/use-prefetch.ts` — `expectedUrls(echo)` + `usePrefetch(echo)` (cache every ready URL, capped concurrency).
- Test files alongside each.

Modified:
- `src/shared/src/playlist.ts` — `playableThrough(echo)` + prefix-only `playablePlaylist`.
- `src/web/hooks/use-player.ts` — `generating` input, buffer-at-frontier + resume, `buffering` state, `currentSentence` clamp.
- `src/web/hooks/use-echo.ts` — save found echo, offline-cache fallback (injectable IO).
- `src/web/components/transcript-view.tsx` — per-sentence-status styling + tap gating.
- `src/web/components/player-controls.tsx` — disabled/buffering/status/offline-tick/reload.
- `src/web/components/echo-client.tsx` — build the player during generation; render the listen frame for `generating_audio`; wire prefetch/persist/reload/clamp.
- `src/web/public/sw.js` — cache-first branch for `*.mp3`; preserve the audio cache across SW updates.

> **Shared rebuild:** the web *runtime* imports `@echolingo/shared/playlist` from its built `dist/`. After Task 1, run `npm run build --workspace @echolingo/shared` before running the app (`npm run dev` does this automatically via `predev` + the `dev:shared` watcher). The web *vitest* config aliases the shared package to its TS source, so tests need no rebuild.

---

## Task 1: Shared — playable frontier (contiguous prefix)

**Files:**
- Modify: `src/shared/src/playlist.ts`
- Test: `src/shared/test/playlist.test.ts`

- [ ] **Step 1: Add the failing tests**

Append to `src/shared/test/playlist.test.ts`. First update the import on line 2:

```ts
import { buildPlaylist, playablePlaylist, playableThrough } from '../src/playlist.js';
```

Then append:

```ts
describe('playableThrough (playable frontier)', () => {
  it('is the full length when no sentence is pending', () => {
    expect(playableThrough(echo())).toBe(2);
  });

  it('stops at the first pending sentence', () => {
    const e = echo();
    e.sentences[1]!.status = 'pending';
    e.sentences[1]!.grUrl = undefined;
    e.sentences[1]!.nativeUrl = undefined;
    expect(playableThrough(e)).toBe(1);
  });

  it('is 0 when the first sentence is still pending', () => {
    const e = echo();
    e.sentences[0]!.status = 'pending';
    expect(playableThrough(e)).toBe(0);
  });

  it('does not block on a failed sentence', () => {
    const e = echo();
    e.sentences[0]!.status = 'failed';
    e.sentences[0]!.grUrl = undefined;
    e.sentences[0]!.nativeUrl = undefined;
    expect(playableThrough(e)).toBe(2);
  });
});

describe('playablePlaylist with a partial echo', () => {
  it('includes only the contiguous ready prefix (stops at a pending sentence)', () => {
    const e = echo();
    e.totalSentences = 3;
    e.sentences.push({ i: 2, gr: 'x', native: 'y', status: 'pending' });
    const entries = playablePlaylist(e, true);
    expect(entries.every((x) => x.sentenceIndex < 2)).toBe(true);
    expect(entries).toHaveLength(4); // sentences 0 + 1, target+native each
  });

  it('stops at a gap even if a later sentence is ready', () => {
    const e = echo();
    e.totalSentences = 3;
    e.sentences[1]!.status = 'pending';
    e.sentences[1]!.grUrl = undefined;
    e.sentences[1]!.nativeUrl = undefined;
    e.sentences.push({
      i: 2, gr: 'g2', native: 'n2', status: 'ready',
      grUrl: 'https://e/gr/2.mp3', nativeUrl: 'https://e/native/2.mp3',
      grDurSec: 1, nativeDurSec: 1,
    });
    const entries = playablePlaylist(e, true);
    expect(entries.every((x) => x.sentenceIndex === 0)).toBe(true);
  });

  it('skips a failed sentence without blocking the prefix', () => {
    const e = echo();
    e.sentences[0]!.status = 'failed';
    e.sentences[0]!.grUrl = undefined;
    e.sentences[0]!.nativeUrl = undefined;
    const entries = playablePlaylist(e, true);
    expect(entries.every((x) => x.sentenceIndex === 1)).toBe(true);
    expect(entries).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `npm test --workspace @echolingo/shared`
Expected: FAIL — `playableThrough is not a function` / partial-echo assertions fail (current `playablePlaylist` returns all ready sentences, including across gaps).

- [ ] **Step 3: Implement the prefix semantics**

In `src/shared/src/playlist.ts`, add `playableThrough` and rewrite `playablePlaylist` (replace the existing `playablePlaylist` at lines 49–60):

```ts
/**
 * The playable frontier: the index of the first sentence still awaiting audio
 * (`status: 'pending'`). Sentences before it are resolved — `ready` ones are
 * playable, `failed` ones are skipped but do NOT block. Equals `sentences.length`
 * when nothing is pending. Playing only this contiguous prefix keeps a story
 * gap-free: it never skips a sentence whose audio hasn't arrived yet.
 */
export function playableThrough(echo: Echo): number {
  const pending = echo.sentences.findIndex((s) => s.status === 'pending');
  return pending === -1 ? echo.sentences.length : pending;
}

/**
 * The playlist to actually play: the contiguous non-pending prefix (see
 * {@link playableThrough}). When a bilingual echo has its translation turned
 * off, the native-language audio is dropped (not just hidden) so it isn't read
 * aloud. Target-only echoes are unaffected.
 */
export function playablePlaylist(echo: Echo, includeTranslation: boolean): PlaylistEntry[] {
  const frontier = playableThrough(echo);
  const prefix: Echo = { ...echo, sentences: echo.sentences.slice(0, frontier) };
  const full = buildPlaylist(prefix);
  if (echo.params.mode === 'bilingual' && !includeTranslation) {
    return full.filter((e) => e.lang === 'gr');
  }
  return full;
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `npm test --workspace @echolingo/shared`
Expected: PASS (all `playlist.test.ts` cases, including the pre-existing ones).

- [ ] **Step 5: Commit**

```bash
git add src/shared/src/playlist.ts src/shared/test/playlist.test.ts
git commit -m "feat(shared): playablePlaylist returns the contiguous ready prefix"
```

---

## Task 2: Player — buffer at the generation frontier

**Files:**
- Modify: `src/web/hooks/use-player.ts`
- Test: `src/web/hooks/use-player.buffer.test.tsx` (create)

- [ ] **Step 1: Write the failing test**

Create `src/web/hooks/use-player.buffer.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { RefObject } from 'react';
import { usePlayer } from './use-player.js';
import type { PlaylistEntry } from '@echolingo/shared/playlist';

const ONE: PlaylistEntry[] = [{ sentenceIndex: 0, lang: 'gr', url: 'blob:s0', durationSec: 1 }];
const TWO: PlaylistEntry[] = [
  { sentenceIndex: 0, lang: 'gr', url: 'blob:s0', durationSec: 1 },
  { sentenceIndex: 1, lang: 'gr', url: 'blob:s1', durationSec: 1 },
];

function Harness({ playlist, generating }: { playlist: PlaylistEntry[]; generating: boolean }) {
  const player = usePlayer(playlist, 'buf', generating);
  return (
    <>
      <audio data-testid="audio" ref={player.audioRef as RefObject<HTMLAudioElement>} />
      <span data-testid="chunk">{player.state.currentChunk}</span>
      <span data-testid="sentence">{player.state.currentSentence}</span>
      <span data-testid="buffering">{String(player.state.buffering)}</span>
      <span data-testid="playing">{String(player.state.isPlaying)}</span>
    </>
  );
}

const audio = () => screen.getByTestId('audio');
const val = (id: string) => screen.getByTestId(id).textContent;

describe('usePlayer buffers at the generation frontier', () => {
  it('holds intent-to-play and keeps the highlight when it runs past the last ready chunk', () => {
    render(<Harness playlist={ONE} generating />);
    fireEvent(audio(), new Event('play')); // isPlaying = true
    expect(val('playing')).toBe('true');
    fireEvent(audio(), new Event('ended')); // advance past the end (chunk -> 1)
    expect(val('buffering')).toBe('true');
    expect(val('playing')).toBe('true'); // intent held, not stopped
    expect(val('sentence')).toBe('0'); // highlight stays on the last sentence, not reset to 0
  });

  it('resumes automatically when the next sentence finishes generating', () => {
    const { rerender } = render(<Harness playlist={ONE} generating />);
    fireEvent(audio(), new Event('play'));
    fireEvent(audio(), new Event('ended'));
    expect(val('buffering')).toBe('true');
    rerender(<Harness playlist={TWO} generating />); // playlist grows
    expect(val('buffering')).toBe('false');
    expect(val('chunk')).toBe('1');
    expect(val('sentence')).toBe('1');
  });

  it('stops at the end when generation is complete', () => {
    render(<Harness playlist={ONE} generating={false} />);
    fireEvent(audio(), new Event('play'));
    fireEvent(audio(), new Event('ended'));
    expect(val('buffering')).toBe('false');
    expect(val('playing')).toBe('false');
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `npm test --workspace @echolingo/web -- use-player.buffer`
Expected: FAIL — `usePlayer` ignores the 3rd arg; `state.buffering` is `undefined`; past-the-end resets `currentSentence` to `0` and stops playback.

- [ ] **Step 3: Implement buffer-at-frontier**

In `src/web/hooks/use-player.ts`:

(a) Add `buffering` to the state interface (after `speed: number;` in `PlayerState`, ~line 49):

```ts
export interface PlayerState {
  isPlaying: boolean;
  currentChunk: number;
  currentSentence: number;
  speed: number;
  buffering: boolean;
}
```

(b) Change the signature (line 63) to accept `generating`:

```ts
export function usePlayer(playlist: PlaylistEntry[], echoId?: string, generating = false): {
```

(c) Add a `buffering` state next to the others (after the `speed` useState, ~line 71):

```ts
  const [buffering, setBuffering] = useState(false);
```

(d) Replace the `currentSentence` memo (lines 73–76) so it clamps to the last chunk when the playhead is parked past the end (buffering):

```ts
  const currentSentence = useMemo(() => {
    if (playlist.length === 0) return 0;
    const entry = playlist[currentChunk] ?? playlist[playlist.length - 1]!;
    return entry.sentenceIndex;
  }, [playlist, currentChunk]);
```

(e) Replace the auto-play effect (lines 132–141) with the buffering-aware version:

```ts
  useEffect(() => {
    if (!isPlaying) return;
    const audio = audioRef.current;
    if (!audio) return;
    if (currentChunk >= playlist.length) {
      // Played everything available. If sentences are still being generated, hold
      // intent-to-play and surface "buffering" — this effect re-runs when the
      // playlist grows (frontier advances) and resumes from the new chunk.
      // Otherwise we've reached the true end: stop.
      if (generating) setBuffering(true);
      else setIsPlaying(false);
      return;
    }
    setBuffering(false);
    void audio.play().catch(() => setIsPlaying(false));
  }, [currentChunk, isPlaying, playlist.length, generating]);
```

(f) Clear buffering on pause (in the `pause` callback, lines 150–153):

```ts
  const pause = useCallback(() => {
    audioRef.current?.pause();
    setIsPlaying(false);
    setBuffering(false);
  }, []);
```

(g) Include `buffering` in the returned state (line 255):

```ts
    state: { isPlaying, currentChunk, currentSentence, speed, buffering },
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `npm test --workspace @echolingo/web -- use-player`
Expected: PASS — the buffer suite passes and the existing `use-player.remap` / `use-player.persistence` / `use-player.test` suites still pass (the new args default to backward-compatible values).

- [ ] **Step 5: Commit**

```bash
git add src/web/hooks/use-player.ts src/web/hooks/use-player.buffer.test.tsx
git commit -m "feat(web): player buffers at the generation frontier and auto-resumes"
```

---

## Task 3: Transcript — per-sentence readiness styling

**Files:**
- Modify: `src/web/components/transcript-view.tsx`
- Test: `src/web/components/transcript-view.test.tsx`

- [ ] **Step 1: Write the failing test**

In `src/web/components/transcript-view.test.tsx`, add `fireEvent` to the testing-library import (line 3):

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
```

Then append:

```tsx
function mixedEcho(): Echo {
  const e = readyEcho(3);
  e.status = 'generating_audio';
  e.sentences[0]!.status = 'ready';
  e.sentences[1]!.status = 'pending';
  e.sentences[2]!.status = 'failed';
  return e;
}

function renderMixed(onJump: (i: number) => void = () => {}) {
  return render(
    <div style={{ overflowY: 'auto' }}>
      <div>
        <TranscriptView echo={mixedEcho()} currentSentence={0} showNative onJump={onJump} />
      </div>
    </div>,
  );
}

describe('TranscriptView marks sentences by readiness', () => {
  it('jumps when a ready sentence is tapped', () => {
    const onJump = vi.fn();
    renderMixed(onJump);
    fireEvent.click(screen.getByText('target 0'));
    expect(onJump).toHaveBeenCalledWith(0);
  });

  it('does not jump when a pending sentence is tapped', () => {
    const onJump = vi.fn();
    renderMixed(onJump);
    fireEvent.click(screen.getByText('target 1'));
    expect(onJump).not.toHaveBeenCalled();
  });

  it('tags each line with its status', () => {
    renderMixed();
    expect(screen.getByText('target 0').closest('li')!.getAttribute('data-status')).toBe('ready');
    expect(screen.getByText('target 1').closest('li')!.getAttribute('data-status')).toBe('pending');
    expect(screen.getByText('target 2').closest('li')!.getAttribute('data-status')).toBe('failed');
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `npm test --workspace @echolingo/web -- transcript-view`
Expected: FAIL — no `data-status` attribute; pending row still fires `onJump`.

- [ ] **Step 3: Implement the per-status styling**

Replace `SentenceRow` (lines 85–128 of `src/web/components/transcript-view.tsx`):

```tsx
function SentenceRow({
  sentence,
  isCurrent,
  isPast,
  showNative,
  onJump,
  attachRef,
}: {
  sentence: Sentence;
  isCurrent: boolean;
  isPast: boolean;
  showNative: boolean;
  onJump: () => void;
  attachRef?: (el: HTMLLIElement | null) => void;
}) {
  const pending = sentence.status === 'pending';
  const playable = sentence.status === 'ready';
  const targetTone = isCurrent ? 'text-ink' : isPast ? 'text-ink-soft' : 'text-ink-mute';
  return (
    <li
      ref={attachRef}
      data-status={sentence.status}
      onClick={playable ? onJump : undefined}
      aria-disabled={!playable}
      className={
        'my-0.5 rounded-[16px] px-4 py-4 transition ' +
        (playable ? 'cursor-pointer ' : 'cursor-default ') +
        (pending ? 'motion-safe:animate-pulse ' : '') +
        (isCurrent
          ? 'bg-[color-mix(in_srgb,var(--accent)_12%,var(--paper-2))] shadow-[inset_3px_0_0_var(--accent)]'
          : '')
      }
    >
      <p
        className={`font-serif text-[calc(25px*var(--fs-scale))] leading-[1.32] tracking-[-0.01em] ${
          pending ? 'text-ink-mute' : targetTone
        }`}
      >
        {sentence.gr}
      </p>
      {showNative && (
        <p
          className={
            'mt-2 font-sans text-[calc(16px*var(--fs-scale))] leading-[1.4] ' +
            (isCurrent && !pending ? 'text-ink-soft' : 'text-ink-mute')
          }
        >
          {sentence.native}
        </p>
      )}
      {sentence.status === 'failed' && <p className="mt-1 text-xs text-accent">[skipped]</p>}
    </li>
  );
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `npm test --workspace @echolingo/web -- transcript-view`
Expected: PASS (new readiness suite + the pre-existing scroll suite).

- [ ] **Step 5: Commit**

```bash
git add src/web/components/transcript-view.tsx src/web/components/transcript-view.test.tsx
git commit -m "feat(web): transcript dims pending lines and gates tap-to-jump on readiness"
```

---

## Task 4: Offline echo JSON store

**Files:**
- Create: `src/web/lib/offline-echo.ts`
- Test: `src/web/lib/offline-echo.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/web/lib/offline-echo.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { saveEcho, loadEcho, clearEcho, type KVStorage } from './offline-echo.js';
import type { Echo } from '@echolingo/shared/types';

function fakeStorage(): KVStorage {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
  };
}

function echo(id: string): Echo {
  return {
    id,
    params: {
      topic: 'at the bakery', targetLang: 'el', nativeLang: 'en',
      lengthMin: 5, level: 3, mode: 'bilingual', bilingualOrder: 'target_first', ttsEngine: 'openai',
    },
    status: 'ready', createdAt: 'x', updatedAt: 'x', totalSentences: 1, readySentences: 1,
    sentences: [{ i: 0, gr: 'Καλημέρα.', native: 'Good morning.', status: 'ready', grUrl: 'u', nativeUrl: 'v', grDurSec: 1, nativeDurSec: 1 }],
  };
}

describe('offline echo store', () => {
  it('round-trips an echo by id', () => {
    const s = fakeStorage();
    saveEcho(echo('abc'), s);
    expect(loadEcho('abc', s)?.params.topic).toBe('at the bakery');
  });

  it('returns null for an unknown id', () => {
    expect(loadEcho('missing', fakeStorage())).toBeNull();
  });

  it('returns null for corrupt JSON instead of throwing', () => {
    const s = fakeStorage();
    s.setItem('echo:offline:bad', '{not json');
    expect(loadEcho('bad', s)).toBeNull();
  });

  it('clears a saved echo', () => {
    const s = fakeStorage();
    saveEcho(echo('abc'), s);
    clearEcho('abc', s);
    expect(loadEcho('abc', s)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `npm test --workspace @echolingo/web -- offline-echo`
Expected: FAIL — module `./offline-echo.js` does not exist.

- [ ] **Step 3: Implement the store**

Create `src/web/lib/offline-echo.ts`:

```ts
import type { Echo } from '@echolingo/shared/types';

const PREFIX = 'echo:offline:';

/** Minimal storage surface so tests can inject a fake (mirrors use-echoes). */
export interface KVStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function defaultStorage(): KVStorage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

/** Persist the full Echo JSON so the transcript + audio URLs survive offline. */
export function saveEcho(echo: Echo, storage: KVStorage | null = defaultStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(PREFIX + echo.id, JSON.stringify(echo));
  } catch {
    // quota / serialization failure — best effort
  }
}

export function loadEcho(id: string, storage: KVStorage | null = defaultStorage()): Echo | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(PREFIX + id);
    return raw ? (JSON.parse(raw) as Echo) : null;
  } catch {
    return null;
  }
}

export function clearEcho(id: string, storage: KVStorage | null = defaultStorage()): void {
  if (!storage) return;
  try {
    storage.removeItem(PREFIX + id);
  } catch {
    // ignore
  }
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `npm test --workspace @echolingo/web -- offline-echo`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/web/lib/offline-echo.ts src/web/lib/offline-echo.test.ts
git commit -m "feat(web): offline echo JSON store for offline replay"
```

---

## Task 5: use-echo — save found echoes, fall back to cache offline

**Files:**
- Modify: `src/web/hooks/use-echo.ts`
- Test: `src/web/hooks/use-echo.offline.test.tsx` (create)

- [ ] **Step 1: Write the failing test**

Create `src/web/hooks/use-echo.offline.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { useEcho, type UseEchoIO } from './use-echo.js';
import type { Echo } from '@echolingo/shared/types';

function echo(topic: string): Echo {
  return {
    id: 'abc',
    params: {
      topic, targetLang: 'el', nativeLang: 'en',
      lengthMin: 5, level: 3, mode: 'bilingual', bilingualOrder: 'target_first', ttsEngine: 'openai',
    },
    status: 'ready', createdAt: 'x', updatedAt: 'x', totalSentences: 1, readySentences: 1,
    sentences: [{ i: 0, gr: 'g', native: 'n', status: 'ready', grUrl: 'u', nativeUrl: 'v', grDurSec: 1, nativeDurSec: 1 }],
  };
}

function Probe({ io }: { io: UseEchoIO }) {
  const s = useEcho('abc', 0, io);
  return <div data-testid="state">{s.kind === 'ok' ? `ok:${s.echo.params.topic}` : s.kind}</div>;
}

describe('useEcho offline behavior', () => {
  it('shows the cached echo when the network is down', async () => {
    const cached = echo('cached');
    const io: UseEchoIO = {
      getEcho: async () => { throw new Error('offline'); },
      saveEcho: () => {},
      loadEcho: () => cached,
    };
    render(<Probe io={io} />);
    await waitFor(() => expect(screen.getByTestId('state').textContent).toBe('ok:cached'));
  });

  it('saves a found echo for offline replay', async () => {
    const live = echo('live');
    const saved: Echo[] = [];
    const io: UseEchoIO = {
      getEcho: async () => ({ kind: 'found', echo: live }),
      saveEcho: (e) => void saved.push(e),
      loadEcho: () => null,
    };
    render(<Probe io={io} />);
    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]!.params.topic).toBe('live');
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `npm test --workspace @echolingo/web -- use-echo.offline`
Expected: FAIL — `useEcho` has no 3rd `io` arg / `UseEchoIO` export; no save; no offline fallback.

- [ ] **Step 3: Implement injectable IO + fallback**

In `src/web/hooks/use-echo.ts`:

(a) Extend the import on line 5 and add the offline-store import:

```ts
import { getEcho, type GetEchoResult } from '../lib/api';
import { saveEcho as saveEchoToCache, loadEcho as loadEchoFromCache } from '../lib/offline-echo';
```

(b) Add the IO type + default just above `useEcho` (before line 49):

```ts
export interface UseEchoIO {
  getEcho: (id: string) => Promise<GetEchoResult>;
  saveEcho: (echo: Echo) => void;
  loadEcho: (id: string) => Echo | null;
}

const defaultIO: UseEchoIO = {
  getEcho,
  saveEcho: saveEchoToCache,
  loadEcho: loadEchoFromCache,
};
```

(c) Replace the `useEcho` function (lines 49–83) with the IO-aware version:

```ts
export function useEcho(id: string, reloadToken = 0, io: UseEchoIO = defaultIO): EchoState {
  const [state, setState] = useState<EchoState>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let consecutiveErrors = 0;
    let servedOk = false; // showed a good echo (live or cached) — don't clobber it with an error card

    async function tick() {
      let result: GetEchoResult;
      try {
        result = await io.getEcho(id);
      } catch {
        result = { kind: 'error', status: 0, message: 'network error' };
      }
      if (cancelled) return;

      // Keep a copy for offline replay once the script (and its URLs) exist.
      if (result.kind === 'found' && result.echo.sentences.length > 0) {
        io.saveEcho(result.echo);
      }

      const decision = decidePoll(result, consecutiveErrors);
      consecutiveErrors = decision.consecutiveErrors;

      // Network down and nothing good shown yet — fall back to the cached copy.
      if (result.kind === 'error' && !servedOk) {
        const cached = io.loadEcho(id);
        if (cached) {
          setState({ kind: 'ok', echo: cached });
          servedOk = true;
        }
      }

      if (decision.state) {
        const isErrorCard = decision.state.kind === 'error';
        if (!(servedOk && isErrorCard)) setState(decision.state);
        if (decision.state.kind === 'ok') servedOk = true;
      }

      if (decision.continuePolling && !cancelled) {
        timer = setTimeout(tick, POLL_INTERVAL_MS);
      }
    }

    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [id, reloadToken, io]);

  return state;
}
```

> Note: `decidePoll` and the existing `use-echo.test.ts` are unchanged — `decidePoll` stays pure, and the default `io` preserves current behavior.

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `npm test --workspace @echolingo/web -- use-echo`
Expected: PASS — both `use-echo.test.ts` (decidePoll) and `use-echo.offline.test.tsx`.

- [ ] **Step 5: Commit**

```bash
git add src/web/hooks/use-echo.ts src/web/hooks/use-echo.offline.test.tsx
git commit -m "feat(web): cache found echoes and fall back to them when offline"
```

---

## Task 6: Audio cache helper — persist + clear by id

**Files:**
- Create: `src/web/lib/audio-cache.ts`
- Test: `src/web/lib/audio-cache.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/web/lib/audio-cache.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { clearEchoAudio, AUDIO_CACHE } from './audio-cache.js';

// Minimal in-memory CacheStorage/Cache double keyed by request url.
function fakeCaches(urls: string[]): CacheStorage {
  const entries = new Map<string, unknown>(urls.map((u) => [u, {}]));
  const cache = {
    keys: async () => [...entries.keys()].map((u) => ({ url: u }) as Request),
    delete: async (req: Request) => entries.delete((req as { url: string }).url),
    match: async () => undefined,
    put: async () => {},
    add: async () => {},
    addAll: async () => {},
    matchAll: async () => [],
  } as unknown as Cache;
  return {
    open: async (name: string) => {
      if (name !== AUDIO_CACHE) throw new Error(`unexpected cache ${name}`);
      return cache;
    },
  } as unknown as CacheStorage;
}

describe('clearEchoAudio', () => {
  it('deletes only the target echo\'s audio, by id path segment', async () => {
    const caches = fakeCaches([
      'https://x/abc/gr/0.mp3',
      'https://x/abc/native/0.mp3',
      'https://x/zzz/gr/0.mp3',
    ]);
    await clearEchoAudio('abc', caches);
    const cache = await caches.open(AUDIO_CACHE);
    const left = (await cache.keys()).map((r) => r.url);
    expect(left).toEqual(['https://x/zzz/gr/0.mp3']);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `npm test --workspace @echolingo/web -- audio-cache`
Expected: FAIL — module `./audio-cache.js` does not exist.

- [ ] **Step 3: Implement the helper**

Create `src/web/lib/audio-cache.ts`:

```ts
// Must match the cache name used by the service worker in public/sw.js.
export const AUDIO_CACHE = 'echolingo-audio-v1';

/**
 * Remove one echo's cached audio. Audio URLs contain the echo id as a path
 * segment (`.../{id}/{lang}/{idx}.mp3`), so we match on `/{id}/`. Used by the
 * reload/repair control to recover from a stale or corrupt cache.
 */
export async function clearEchoAudio(
  id: string,
  cacheStorage: CacheStorage = caches,
): Promise<void> {
  const cache = await cacheStorage.open(AUDIO_CACHE);
  const keys = await cache.keys();
  await Promise.all(
    keys.filter((req) => req.url.includes(`/${id}/`)).map((req) => cache.delete(req)),
  );
}

/** Ask the browser to keep our caches across eviction. Best-effort. */
export async function persistStorage(): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
      return await navigator.storage.persist();
    }
  } catch {
    // ignore
  }
  return false;
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `npm test --workspace @echolingo/web -- audio-cache`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/web/lib/audio-cache.ts src/web/lib/audio-cache.test.ts
git commit -m "feat(web): audio-cache helper (persist + clear an echo's audio by id)"
```

---

## Task 7: Prefetch — cache every ready URL

**Files:**
- Create: `src/web/hooks/use-prefetch.ts`
- Test: `src/web/hooks/use-prefetch.test.tsx` (create)

- [ ] **Step 1: Write the failing tests**

Create `src/web/hooks/use-prefetch.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { expectedUrls, usePrefetch } from './use-prefetch.js';
import type { Echo, SentenceStatus } from '@echolingo/shared/types';

function echoWith(statuses: SentenceStatus[], mode: 'bilingual' | 'target_only' = 'bilingual'): Echo {
  return {
    id: 'e',
    params: {
      topic: 't', targetLang: 'el', nativeLang: 'en',
      lengthMin: 5, level: 3, mode, bilingualOrder: 'target_first', ttsEngine: 'openai',
    },
    status: 'generating_audio', createdAt: 'x', updatedAt: 'x',
    totalSentences: statuses.length, readySentences: statuses.filter((s) => s === 'ready').length,
    sentences: statuses.map((status, i) => ({
      i, gr: `g${i}`, native: `n${i}`, status,
      grUrl: status === 'ready' ? `https://e/gr/${i}.mp3` : undefined,
      nativeUrl: status === 'ready' ? `https://e/native/${i}.mp3` : undefined,
      grDurSec: 1, nativeDurSec: 1,
    })),
  };
}

describe('expectedUrls', () => {
  it('lists target+native urls for ready sentences in bilingual mode', () => {
    expect(expectedUrls(echoWith(['ready', 'pending']))).toEqual([
      'https://e/gr/0.mp3',
      'https://e/native/0.mp3',
    ]);
  });

  it('lists only target urls in target_only mode', () => {
    expect(expectedUrls(echoWith(['ready'], 'target_only'))).toEqual(['https://e/gr/0.mp3']);
  });
});

describe('usePrefetch', () => {
  it('fetches each ready url once across re-renders', async () => {
    const calls: string[] = [];
    const fetcher = vi.fn(async (u: string) => void calls.push(u));
    function P({ e }: { e: Echo }) {
      usePrefetch(e, fetcher);
      return null;
    }
    const { rerender } = render(<P e={echoWith(['ready', 'pending'])} />);
    await waitFor(() => expect(calls).toContain('https://e/gr/0.mp3'));
    rerender(<P e={echoWith(['ready', 'ready'])} />);
    await waitFor(() => expect(calls).toContain('https://e/gr/1.mp3'));
    expect(calls.filter((u) => u === 'https://e/gr/0.mp3')).toHaveLength(1); // not refetched
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `npm test --workspace @echolingo/web -- use-prefetch`
Expected: FAIL — module `./use-prefetch.js` does not exist.

- [ ] **Step 3: Implement the hook**

Create `src/web/hooks/use-prefetch.ts`:

```ts
'use client';

import { useEffect, useRef, useState } from 'react';
import type { Echo } from '@echolingo/shared/types';

/**
 * Every audio URL worth caching for an echo: each ready sentence's target audio,
 * plus its native audio in bilingual mode.
 */
export function expectedUrls(echo: Echo): string[] {
  const bilingual = echo.params.mode === 'bilingual';
  const out: string[] = [];
  for (const s of echo.sentences) {
    if (s.status !== 'ready') continue;
    if (s.grUrl) out.push(s.grUrl);
    if (bilingual && s.nativeUrl) out.push(s.nativeUrl);
  }
  return out;
}

async function runWithCap(items: string[], cap: number, fn: (u: string) => Promise<void>): Promise<void> {
  let i = 0;
  const workers = Array.from({ length: Math.min(cap, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx]!);
    }
  });
  await Promise.all(workers);
}

// Module-level so the default keeps a stable identity across renders (the effect
// depends on `fetcher`). no-cors warms the service-worker audio cache; the opaque
// response is fine for <audio> playback.
const defaultFetcher = (url: string): Promise<unknown> => fetch(url, { mode: 'no-cors' });

/**
 * Eagerly cache every ready sentence's audio (all of it, not a sliding window) so
 * the whole echo becomes offline-ready as fast as it generates and playback never
 * waits on download. `allCached` is true once every expected URL has been fetched.
 */
export function usePrefetch(
  echo: Echo | null,
  fetcher: (url: string) => Promise<unknown> = defaultFetcher,
): { allCached: boolean } {
  const fetched = useRef<Set<string>>(new Set());
  const [, bump] = useState(0);

  useEffect(() => {
    if (!echo) return;
    const todo = expectedUrls(echo).filter((u) => !fetched.current.has(u));
    if (todo.length === 0) return;
    let cancelled = false;
    // Mark optimistically so the 2s re-polls don't re-enqueue in-flight URLs;
    // unmark on failure so a later poll retries.
    todo.forEach((u) => fetched.current.add(u));
    void runWithCap(todo, 6, async (u) => {
      try {
        await fetcher(u);
      } catch {
        fetched.current.delete(u);
      }
    }).then(() => {
      if (!cancelled) bump((n) => n + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [echo, fetcher]);

  const want = echo ? expectedUrls(echo) : [];
  const allCached = want.length > 0 && want.every((u) => fetched.current.has(u));
  return { allCached };
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `npm test --workspace @echolingo/web -- use-prefetch`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/web/hooks/use-prefetch.ts src/web/hooks/use-prefetch.test.tsx
git commit -m "feat(web): prefetch every ready sentence's audio into the offline cache"
```

---

## Task 8: Service worker — cache audio first

**Files:**
- Modify: `src/web/public/sw.js`

No unit test (service workers run in a worker context with no test harness here); verified manually in Task 12.

- [ ] **Step 1: Add the audio cache name**

In `src/web/public/sw.js`, after line 2 (`const SHELL_URLS = [...]`) add:

```js
// Audio is cached forever (cache-first), separate from the network-first shell so
// deploys still refresh the app but offline audio survives. Name must match
// AUDIO_CACHE in src/web/lib/audio-cache.ts.
const AUDIO_CACHE = 'echolingo-audio-v1';
```

- [ ] **Step 2: Preserve the audio cache across SW updates**

Replace the `activate` handler's cleanup (the `caches.keys().then(...)` block) so it keeps both caches:

```js
self.addEventListener('activate', (event) => {
  const keep = new Set([CACHE_NAME, AUDIO_CACHE]);
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => !keep.has(k)).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});
```

- [ ] **Step 3: Add a cache-first branch for audio**

In the `fetch` handler, immediately after the existing `if (url.pathname.startsWith('/api/')) return;` line, insert:

```js
  // Audio: cache-first, kept forever. Matches sentence MP3s on any host (prod
  // blob storage or the local azurite emulator). Enables offline replay.
  if (request.method === 'GET' && url.pathname.endsWith('.mp3')) {
    event.respondWith(cacheFirstAudio(request));
    return;
  }
```

Then add this function at the end of the file:

```js
async function cacheFirstAudio(request) {
  const cache = await caches.open(AUDIO_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  try {
    const res = await fetch(request);
    // Store full responses (ok same-origin/cors, or cross-origin opaque). Skip
    // 206 partials so we never persist half a file.
    if (res && res.status !== 206 && (res.ok || res.type === 'opaque')) {
      cache.put(request, res.clone()).catch(() => {});
    }
    return res;
  } catch (err) {
    const fallback = await cache.match(request);
    if (fallback) return fallback;
    throw err;
  }
}
```

- [ ] **Step 4: Sanity-check the file**

Run: `node --check src/web/public/sw.js`
Expected: no output (valid JS).

- [ ] **Step 5: Commit**

```bash
git add src/web/public/sw.js
git commit -m "feat(web): service worker caches sentence audio for offline replay"
```

---

## Task 9: Player controls — dock states + status line

**Files:**
- Create: `src/web/lib/echo-status.ts`
- Test: `src/web/lib/echo-status.test.ts`
- Modify: `src/web/components/player-controls.tsx`

- [ ] **Step 1: Write the failing test for the status line**

Create `src/web/lib/echo-status.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { statusLine } from './echo-status.js';
import type { Echo, EchoStatus } from '@echolingo/shared/types';

function echo(status: EchoStatus, ready: number, total: number): Echo {
  return {
    id: 'x',
    params: {
      topic: 't', targetLang: 'el', nativeLang: 'en',
      lengthMin: 5, level: 3, mode: 'bilingual', bilingualOrder: 'target_first', ttsEngine: 'openai',
    },
    status, createdAt: '', updatedAt: '', totalSentences: total, readySentences: ready, sentences: [],
  };
}

describe('statusLine', () => {
  it('announces script writing', () => {
    expect(statusLine(echo('generating_script', 0, 0))).toBe('writing the script…');
  });
  it('counts audio progress', () => {
    expect(statusLine(echo('generating_audio', 2, 8))).toBe('recording audio · 2/8');
  });
  it('is empty once ready', () => {
    expect(statusLine(echo('ready', 8, 8))).toBe('');
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `npm test --workspace @echolingo/web -- echo-status`
Expected: FAIL — module `./echo-status.js` does not exist.

- [ ] **Step 3: Implement the status line**

Create `src/web/lib/echo-status.ts`:

```ts
import type { Echo } from '@echolingo/shared/types';

/** One short line for the player dock describing what generation is doing. */
export function statusLine(echo: Echo): string {
  switch (echo.status) {
    case 'generating_script':
      return 'writing the script…';
    case 'generating_audio':
      return `recording audio · ${echo.readySentences}/${echo.totalSentences}`;
    default:
      return '';
  }
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `npm test --workspace @echolingo/web -- echo-status`
Expected: PASS.

- [ ] **Step 5: Extend `PlayerControlsView`**

Edit `src/web/components/player-controls.tsx`.

(a) Add the new props to the destructured signature and its type (after `onToggleTranslation` in both places, lines 9–27):

```tsx
export function PlayerControlsView({
  state,
  controls,
  elapsedSec,
  totalSec,
  onSeek,
  bilingual,
  showTranslation,
  onToggleTranslation,
  status,
  buffering,
  offlineSaved,
  canPlay,
  ready,
  onReload,
}: {
  state: PlayerState;
  controls: Controls;
  elapsedSec: number;
  totalSec: number;
  onSeek: (sec: number) => void;
  bilingual: boolean;
  showTranslation: boolean;
  onToggleTranslation: () => void;
  status: string;
  buffering: boolean;
  offlineSaved: boolean;
  canPlay: boolean;
  ready: boolean;
  onReload: () => void;
}) {
```

(b) Gate the transport buttons on `canPlay`. In each of the three transport `<button>`s (prev, play/pause, next) add `disabled={!canPlay}` and append `disabled:opacity-40 disabled:active:scale-100` to their `className` strings. For example the play/pause button becomes:

```tsx
        <button
          type="button"
          onClick={controls.toggle}
          disabled={!canPlay}
          aria-label={state.isPlaying ? 'Pause' : 'Play'}
          className="flex h-[62px] w-[62px] items-center justify-center rounded-full bg-ink text-paper-2 shadow-[var(--shadow-2)] transition active:scale-90 disabled:opacity-40 disabled:active:scale-100"
        >
          {state.isPlaying ? <PauseIcon size={26} /> : <PlayIcon size={26} />}
        </button>
```

Apply the same `disabled={!canPlay}` + `disabled:opacity-40 disabled:active:scale-100` to the `Previous sentence` and `Next sentence` buttons.

(c) Add a status/offline row at the very end, just before the closing `</div>` of the outer wrapper (after the speed/translation row, ~line 95):

```tsx
      <div className="mt-2.5 flex min-h-[18px] items-center justify-center gap-2 text-[12px] text-ink-mute">
        {buffering && (
          <span
            className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-line border-t-accent"
            aria-hidden
          />
        )}
        {status && <span>{status}</span>}
        {ready && offlineSaved && <span aria-live="polite">saved for offline ✓</span>}
        {ready && (
          <button
            type="button"
            onClick={onReload}
            className="underline decoration-dotted underline-offset-2 hover:text-ink-soft"
          >
            re-download
          </button>
        )}
      </div>
```

- [ ] **Step 6: Run the web suite to confirm nothing regressed**

Run: `npm test --workspace @echolingo/web -- echo-status player`
Expected: PASS (no test references the old `PlayerControlsView` prop shape directly; it's exercised via `echo-client`, updated next).

- [ ] **Step 7: Commit**

```bash
git add src/web/lib/echo-status.ts src/web/lib/echo-status.test.ts src/web/components/player-controls.tsx
git commit -m "feat(web): player dock shows generation status, buffering, offline tick + reload"
```

---

## Task 10: echo-client — progressive listen frame

**Files:**
- Modify: `src/web/components/echo-client.tsx`

This wires the pieces together. There is no new unit test (the parts are tested in Tasks 1–9; this is integration, verified in Task 12). Work in `ExistingEcho`.

- [ ] **Step 1: Add imports**

At the top of `src/web/components/echo-client.tsx`, add to the existing import group (near lines 6–21):

```ts
import { usePrefetch } from '../hooks/use-prefetch';
import { statusLine } from '../lib/echo-status';
import { persistStorage, clearEchoAudio } from '../lib/audio-cache';
import { clearEcho } from '../lib/offline-echo';
```

- [ ] **Step 2: Build the playlist during generation (not only when ready)**

Replace the `playlist` memo (lines 157–160):

```ts
  // The playable prefix grows as sentences finish generating; empty until the
  // first sentence's audio lands.
  const playlist = useMemo(() => {
    if (state.kind !== 'ok') return [];
    return playablePlaylist(state.echo, showTranslation);
  }, [state, showTranslation]);

  const generating =
    state.kind === 'ok' &&
    (state.echo.status === 'generating_script' || state.echo.status === 'generating_audio');

  const player = usePlayer(playlist, id, generating);
```

(Delete the old `const player = usePlayer(playlist, id);` on line 161.)

- [ ] **Step 3: Wire prefetch + persistent storage**

Immediately after the `player` line, add:

```ts
  const { allCached } = usePrefetch(state.kind === 'ok' ? state.echo : null);

  // Ask for persistent storage once there's audio worth keeping.
  const persistedRef = useRef(false);
  useEffect(() => {
    if (!persistedRef.current && playlist.length > 0) {
      persistedRef.current = true;
      void persistStorage();
    }
  }, [playlist.length]);
```

- [ ] **Step 4: Clamp the elapsed-time chunk index**

Replace the `elapsedSec` line (line 184):

```ts
  // While buffering, currentChunk parks one past the end; clamp so elapsed/total
  // doesn't snap back to zero.
  const safeChunk = Math.min(player.state.currentChunk, Math.max(0, playlist.length - 1));
  const elapsedSec = (cum[safeChunk] ?? 0) + audioCurrentTime;
```

- [ ] **Step 5: Add the reload/repair handler**

Add inside `ExistingEcho` (e.g. just after `retryFailed`, before `const headerTitle`):

```ts
  async function reloadEcho() {
    try {
      await clearEchoAudio(id);
    } catch {
      // cache may be unavailable; clearing the JSON + re-poll still recovers
    }
    clearEcho(id);
    setReloadToken((t) => t + 1);
  }
```

- [ ] **Step 6: Render the listen frame for `generating_audio` and `ready`**

Find the ready gate (lines 340–348):

```ts
  const ready = echo.status === 'ready';

  if (!ready) {
    return (
      <PageFrame title={echo.params.topic}>
        <EchoProgress echo={echo} />
      </PageFrame>
    );
  }
```

Replace it with — only `generating_script` keeps the composing spinner (no text exists yet); `generating_audio` falls through to the player frame:

```ts
  const ready = echo.status === 'ready';

  // Script not written yet — keep the composing spinner; there's no text to show.
  if (echo.status === 'generating_script') {
    return (
      <PageFrame title={echo.params.topic}>
        <EchoProgress echo={echo} />
      </PageFrame>
    );
  }
```

- [ ] **Step 7: Pass the new props to `PlayerControlsView`**

In the final `return` (the player layout, lines 350–381), replace the `<PlayerControlsView ... />` element with:

```tsx
          <PlayerControlsView
            state={player.state}
            controls={player.controls}
            elapsedSec={elapsedSec}
            totalSec={total}
            onSeek={onSeek}
            bilingual={bilingual}
            showTranslation={showTranslation}
            onToggleTranslation={toggleTranslation}
            status={statusLine(echo)}
            buffering={player.state.buffering}
            offlineSaved={allCached}
            canPlay={playlist.length > 0}
            ready={ready}
            onReload={() => void reloadEcho()}
          />
```

- [ ] **Step 8: Build shared, then run the full web suite + lint**

```bash
npm run build --workspace @echolingo/shared
npm test --workspace @echolingo/web
npm run lint
```
Expected: all web tests PASS; eslint clean. (If lint flags an unused `EchoProgress` import — it is still used by the `generating_script` branch, so it should not.)

- [ ] **Step 9: Commit**

```bash
git add src/web/components/echo-client.tsx
git commit -m "feat(web): progressive listen frame — play and prefetch during generation"
```

---

## Task 11 (optional): Failed echo keeps playing what's ready

**Files:**
- Modify: `src/web/components/echo-client.tsx`

Per the spec, if generation fails after some sentences were produced, those should still play. Skip if you want to ship the core first.

- [ ] **Step 1: Gate the failure card on having nothing to play**

In `ExistingEcho`, find the `if (echo.status === 'failed') { ... }` block (lines 303–338). Change its opening condition so the full error card shows only when there's nothing playable:

```ts
  if (echo.status === 'failed' && echo.readySentences === 0) {
```

Leave the body (retry states + `ErrorCard`) unchanged.

- [ ] **Step 2: Show a non-blocking banner above the transcript when partly ready**

In the final player-layout `return`, inside the scroll region just before `<TranscriptView ... />`, add:

```tsx
          {echo.status === 'failed' && (
            <div className="mx-[22px] mt-3 border-l-2 border-accent bg-paper px-4 py-3 text-sm text-ink-soft">
              <p className="font-medium text-ink">Generation stopped early</p>
              <p>Some sentences couldn’t be generated. The rest play normally.</p>
              <button
                type="button"
                onClick={() => void retryFailed(echo)}
                className="mt-2 rounded-full bg-accent px-5 py-1.5 text-sm font-medium text-accent-ink"
              >
                Retry
              </button>
            </div>
          )}
```

Also relax the early-return guard for non-ready so a `failed` echo with ready sentences reaches the player frame. The `generating_script` guard already returns early; `failed` now only early-returns when `readySentences === 0` (Step 1), so a partly-ready `failed` echo falls through to the player frame. No further change needed.

- [ ] **Step 3: Verify + commit**

```bash
npm test --workspace @echolingo/web
git add src/web/components/echo-client.tsx
git commit -m "feat(web): a failed echo still plays the sentences that were produced"
```

---

## Task 11b (optional): Auto-heal a corrupt cached chunk

**Files:**
- Modify: `src/web/lib/audio-cache.ts`
- Modify: `src/web/hooks/use-player.ts`

The manual reload (Task 10) is the primary corruption recovery. This adds a cheap automatic recovery: when an `<audio>` element errors loading a (cached) chunk, evict that one URL and retry once from the network. No automated test (media `error` + Cache eviction don't simulate cleanly in jsdom); verified manually.

- [ ] **Step 1: Add a per-URL evictor**

In `src/web/lib/audio-cache.ts`, add:

```ts
/** Evict a single cached audio URL — used to recover from a corrupt chunk. */
export async function evictAudioUrl(url: string, cacheStorage: CacheStorage = caches): Promise<void> {
  try {
    const cache = await cacheStorage.open(AUDIO_CACHE);
    await cache.delete(url);
  } catch {
    // cache unavailable — the network reload below still recovers
  }
}
```

- [ ] **Step 2: Reload a failed chunk once in `usePlayer`**

In `src/web/hooks/use-player.ts`:

(a) Add the import:

```ts
import { evictAudioUrl } from '../lib/audio-cache';
```

(b) Mirror `isPlaying` into a ref (so the error handler reads the current value), placed after the `isPlaying` state declaration:

```ts
  const isPlayingRef = useRef(isPlaying);
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);
```

(c) Add the auto-heal effect (near the other audio-listener effects):

```ts
  // Auto-heal a corrupt/partial cached chunk: on a media error, evict that one
  // URL from the cache and reload it once from the network before giving up.
  const healedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onError = () => {
      const src = audio.currentSrc || audio.src;
      if (!src || healedRef.current.has(src)) return; // retry each src at most once
      healedRef.current.add(src);
      void evictAudioUrl(src).then(() => {
        audio.load();
        if (isPlayingRef.current) void audio.play().catch(() => {});
      });
    };
    audio.addEventListener('error', onError);
    return () => audio.removeEventListener('error', onError);
  }, [playlist.length]);
```

- [ ] **Step 3: Confirm the suite still passes + manual check**

```bash
npm test --workspace @echolingo/web -- use-player
```
Expected: PASS (existing player suites unaffected; the new listener is inert without a media error).

Manual: in DevTools → Application → Cache Storage, delete or corrupt one `*.mp3` entry while it's the current chunk; confirm playback recovers (the entry is re-fetched and play continues) rather than stalling.

- [ ] **Step 4: Commit**

```bash
git add src/web/lib/audio-cache.ts src/web/hooks/use-player.ts
git commit -m "feat(web): auto-heal a corrupt cached audio chunk on media error"
```

---

## Task 12: Full verification

**Files:** none (verification only).

- [ ] **Step 1: All workspaces' tests**

Run: `npm test`
Expected: PASS in `@echolingo/shared`, `@echolingo/web`, `@echolingo/api` (api unchanged).

- [ ] **Step 2: Lint + web build (static export)**

```bash
npm run lint
npm run build --workspace @echolingo/shared
npm run build --workspace @echolingo/web
```
Expected: eslint clean; `next build` static export succeeds.

- [ ] **Step 3: Manual progressive-flow check (mock engines)**

```bash
npm run dev
```
Open http://localhost:4280, create an echo, and confirm:
- The page shows the composing spinner, then the full transcript appears (all lines, pending ones dimmed/pulsing) without a full-screen spinner.
- The play button enables as soon as the first sentence is ready; tapping plays and auto-advances; the dock shows "recording audio · n/m".
- With real timing too fast on mocks, also verify the buffering/streaming logic via the unit tests in Task 2.

- [ ] **Step 4: Manual offline check (DevTools)**

- DevTools → Application → Cache Storage: confirm an `echolingo-audio-v1` cache fills with `*.mp3` entries as the echo generates.
- DevTools → Application → Service Workers → check **Offline**, then reload the echo URL: the transcript renders (from the offline JSON store) and cached sentences play.
- Tap **re-download**: confirm the `echolingo-audio-v1` entries for that id are purged and re-fetched, and the echo re-polls.

- [ ] **Step 5: (Optional) real-provider playback check**

With OpenAI/Azure keys in `src/api/local.settings.json`, repeat Step 3 to hear real audio and observe genuine out-of-order/streaming behavior and buffering at the frontier.

---

## Notes for the implementer

- **Run web tests by file** with `npm test --workspace @echolingo/web -- <substring>` (vitest filters by path).
- **jsdom vs node:** web tests default to node; DOM/hook tests must start with `// @vitest-environment jsdom` (see existing tests). Pure-logic tests stay in node.
- **PlaylistEntry shape:** use the real type from `@echolingo/shared/playlist` — `{ sentenceIndex, lang: 'gr' | 'native', url, durationSec }`. (Some older tests use a looser shape that only survives because vitest/esbuild strips types without checking; don't copy it.)
- **Keep `AUDIO_CACHE` in sync** between `src/web/lib/audio-cache.ts` and `src/web/public/sw.js` (`echolingo-audio-v1`).
- **Shared rebuild** before running the app after Task 1 (`npm run dev` handles it automatically).
