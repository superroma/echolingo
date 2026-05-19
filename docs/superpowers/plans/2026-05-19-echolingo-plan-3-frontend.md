# Echolingo — Plan 3: Frontend PWA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a usable Next.js PWA: a topic form on `/` (with localStorage-remembered prefs), a `/lesson/[id]` page that polls the backend until ready then plays the lesson through a sentence-aware player with transcript highlight, speed control, repeat, prev/next, MediaSession lockscreen integration, and a service worker that caches the app shell for offline launch.

**Architecture:** Next.js 15 app router, static export. The app talks to the Plan 2/4 backend via relative `/api/*` URLs; the Next.js dev server rewrites those to `http://localhost:7071` in development, and Azure Static Web Apps' linked-Functions feature handles the same path in production (Plan 5). All cross-cutting domain logic (playlist building, prefs schema) lives in `@echolingo/shared` so the future React Native client can reuse it. Pure-logic gets unit tests; React hooks and components rely on manual smoke since adding RTL + JSDOM would inflate the plan for little near-term value.

**YAGNI cuts from the design spec:** streaming-while-generating playback (we wait for `status:"ready"`; streaming lives in a follow-up); ±15s seek (next/prev sentence covers the same ergonomics for chunked audio); recent-lessons history list (defer until users ask).

**Tech Stack:** Plan 1+2+4 + browser primitives (HTML5 audio, MediaSession API, Service Worker, localStorage). No new npm dependencies in `src/web`. New shared exports under `@echolingo/shared`.

---

## File structure produced by this plan

```
src/shared/
├── src/
│   ├── playlist.ts                # buildPlaylist(lesson) → ordered chunks
│   └── index.ts                   # MODIFY: add Playlist exports
└── test/
    └── playlist.test.ts

src/web/
├── next.config.mjs                # MODIFY: rewrites /api → localhost:7071 in dev
├── lib/
│   ├── api.ts                     # typed fetch wrapper
│   └── api.test.ts                # unit tests with mocked fetch
├── hooks/
│   ├── use-prefs.ts               # localStorage prefs
│   ├── use-prefs.test.ts          # pure-logic unit tests
│   ├── use-lesson.ts              # polls GET /api/lesson/{id}
│   └── use-player.ts              # HTMLAudioElement state machine
├── components/
│   ├── lesson-form.tsx
│   ├── lesson-progress.tsx        # "generating 12/38 sentences..."
│   ├── player-controls.tsx
│   └── transcript-view.tsx
├── app/
│   ├── page.tsx                   # MODIFY: render LessonForm
│   └── lesson/
│       └── [id]/
│           └── page.tsx           # render LessonScreen
├── public/
│   └── sw.js                      # MODIFY: real app-shell cache
└── vitest.config.ts               # NEW: test config for web workspace
```

Existing files modified: `src/web/next.config.mjs`, `src/web/app/page.tsx`, `src/web/public/sw.js`, `src/web/package.json` (add vitest devDep), `src/shared/src/index.ts`, `README.md`.

---

## Conventions

- All web imports of shared types go through `@echolingo/shared`.
- Components that read browser APIs (localStorage, document, Audio, navigator.mediaSession) are client components — declare `'use client'` at the top.
- API calls use relative paths (`/api/lesson`) — Next.js dev rewrites + Azure SWA linked Functions both proxy `/api/*` to the Function App.
- The `<audio>` element is the source of truth for playback time. The `usePlayer` hook subscribes to its events; it never overrides `audio.currentTime` except for "repeat sentence" and "seek to sentence."
- Sentence highlight is driven by `audio.ended` (advance chunk pointer) plus `timeupdate` (recompute current sentence index from cumulative duration if needed). For MVP we drive highlight purely off the chunk pointer — accurate to a sentence boundary, which is exactly the user-visible unit.

---

## Task 1: Next.js API proxy + web vitest config

**Files:**
- Modify: `src/web/next.config.mjs` (add rewrites)
- Modify: `src/web/package.json` (add vitest devDep + test scripts)
- Create: `src/web/vitest.config.ts`

The dev rewrite makes the web app's relative `/api/*` calls reach the Functions backend without CORS. In production (static export), Azure Static Web Apps proxies `/api/*` to the linked Function App natively, so the same code path works.

- [ ] **Step 1: Add vitest devDep to web workspace**

Edit `src/web/package.json` — replace the `scripts` block and the existing test stub, and add devDep:

```json
{
  "name": "@echolingo/web",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev -p 3000",
    "build": "next build",
    "start": "next start -p 3000",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "next": "^15.0.3",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "@echolingo/shared": "*"
  },
  "devDependencies": {
    "@types/node": "^20.16.10",
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.49",
    "tailwindcss": "^3.4.14",
    "vitest": "^2.1.4"
  }
}
```

Then from the repo root:

```bash
npm install
```

- [ ] **Step 2: Add vitest config**

Create `src/web/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['{lib,hooks}/**/*.test.ts'],
    environment: 'node',
  },
});
```

(Pure-logic tests don't need JSDOM. Hook + component tests are out of scope for Plan 3.)

- [ ] **Step 3: Update `src/web/next.config.mjs`**

Replace the file with:

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  reactStrictMode: true,
  trailingSlash: true,
  images: { unoptimized: true },
  async rewrites() {
    // Dev only — in production the Azure Static Web Apps linked-Functions feature
    // proxies /api/* to the Function App natively. With output:'export', rewrites
    // are stripped from the static build but still active under `next dev`.
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:7071/api/:path*',
      },
    ];
  },
};

export default nextConfig;
```

- [ ] **Step 4: Verify**

```bash
npm run typecheck --workspace @echolingo/web
npm run build --workspace @echolingo/web
npm run test --workspace @echolingo/web
```

Expected: all exit 0. `npm test` will report "no test files" since none exist yet — that's fine; the script is just plumbing.

- [ ] **Step 5: Commit**

```bash
git add src/web/next.config.mjs src/web/vitest.config.ts src/web/package.json package-lock.json
git commit -m "feat(web): add /api dev proxy and vitest config"
```

---

## Task 2: `buildPlaylist` in shared

**Files:**
- Create: `src/shared/src/playlist.ts`
- Create: `src/shared/test/playlist.test.ts`
- Modify: `src/shared/src/index.ts`

`buildPlaylist(lesson)` returns an ordered list of `PlaylistEntry` objects — what the player actually plays. Pure transform on a Lesson, no I/O, easy to test.

- [ ] **Step 1: Write the failing test**

Create `src/shared/test/playlist.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildPlaylist } from '../src/playlist.js';
import type { Lesson } from '../src/types.js';

function lesson(overrides: Partial<Lesson> = {}): Lesson {
  return {
    id: 'l1',
    params: {
      topic: 'at the bakery',
      lengthMin: 5,
      level: 3,
      style: 'dialogue',
      mode: 'bilingual',
      bilingualOrder: 'gr_first',
      nativeLang: 'en',
      ttsEngine: 'openai',
    },
    status: 'ready',
    createdAt: 'x',
    updatedAt: 'x',
    totalSentences: 2,
    readySentences: 2,
    sentences: [
      {
        i: 0,
        gr: 'Καλημέρα.',
        native: 'Good morning.',
        status: 'ready',
        grUrl: 'https://e/gr/0.mp3',
        nativeUrl: 'https://e/native/0.mp3',
        grDurSec: 1.2,
        nativeDurSec: 1.1,
      },
      {
        i: 1,
        gr: 'Γεια σου.',
        native: 'Hello.',
        status: 'ready',
        grUrl: 'https://e/gr/1.mp3',
        nativeUrl: 'https://e/native/1.mp3',
        grDurSec: 1.0,
        nativeDurSec: 0.9,
      },
    ],
    ...overrides,
  };
}

describe('buildPlaylist', () => {
  it('produces gr-then-native pairs in bilingual gr_first mode', () => {
    const entries = buildPlaylist(lesson());
    expect(entries).toEqual([
      { sentenceIndex: 0, lang: 'gr', url: 'https://e/gr/0.mp3', durationSec: 1.2 },
      { sentenceIndex: 0, lang: 'native', url: 'https://e/native/0.mp3', durationSec: 1.1 },
      { sentenceIndex: 1, lang: 'gr', url: 'https://e/gr/1.mp3', durationSec: 1.0 },
      { sentenceIndex: 1, lang: 'native', url: 'https://e/native/1.mp3', durationSec: 0.9 },
    ]);
  });

  it('produces native-then-gr pairs in bilingual native_first mode', () => {
    const entries = buildPlaylist(
      lesson({ params: { ...lesson().params, bilingualOrder: 'native_first' } }),
    );
    expect(entries.map((e) => `${e.sentenceIndex}-${e.lang}`)).toEqual([
      '0-native',
      '0-gr',
      '1-native',
      '1-gr',
    ]);
  });

  it('produces only gr entries in greek_only mode', () => {
    const entries = buildPlaylist(
      lesson({ params: { ...lesson().params, mode: 'greek_only' } }),
    );
    expect(entries).toEqual([
      { sentenceIndex: 0, lang: 'gr', url: 'https://e/gr/0.mp3', durationSec: 1.2 },
      { sentenceIndex: 1, lang: 'gr', url: 'https://e/gr/1.mp3', durationSec: 1.0 },
    ]);
  });

  it('skips sentences that are not ready', () => {
    const l = lesson();
    l.sentences[1]!.status = 'pending';
    l.sentences[1]!.grUrl = undefined;
    l.sentences[1]!.nativeUrl = undefined;
    const entries = buildPlaylist(l);
    expect(entries).toHaveLength(2);
    expect(entries.every((e) => e.sentenceIndex === 0)).toBe(true);
  });

  it('skips a side of a bilingual pair if its URL is missing', () => {
    const l = lesson();
    l.sentences[0]!.nativeUrl = undefined;
    const entries = buildPlaylist(l);
    expect(entries.map((e) => `${e.sentenceIndex}-${e.lang}`)).toEqual([
      '0-gr',
      '1-gr',
      '1-native',
    ]);
  });
});
```

- [ ] **Step 2: Run — red**

```bash
npm run test --workspace @echolingo/shared
```

Expected: `Cannot find module '../src/playlist.js'`.

- [ ] **Step 3: Implement**

Create `src/shared/src/playlist.ts`:

```ts
import type { AudioLang } from './storage/audio-storage.js';
import type { Lesson } from './types.js';

export interface PlaylistEntry {
  sentenceIndex: number;
  lang: AudioLang;
  url: string;
  durationSec: number;
}

export function buildPlaylist(lesson: Lesson): PlaylistEntry[] {
  const out: PlaylistEntry[] = [];
  const mode = lesson.params.mode;
  const order = lesson.params.bilingualOrder;

  for (const s of lesson.sentences) {
    if (s.status !== 'ready') continue;

    const grEntry: PlaylistEntry | null = s.grUrl
      ? {
          sentenceIndex: s.i,
          lang: 'gr',
          url: s.grUrl,
          durationSec: s.grDurSec ?? 0,
        }
      : null;
    const nativeEntry: PlaylistEntry | null = s.nativeUrl
      ? {
          sentenceIndex: s.i,
          lang: 'native',
          url: s.nativeUrl,
          durationSec: s.nativeDurSec ?? 0,
        }
      : null;

    if (mode === 'greek_only') {
      if (grEntry) out.push(grEntry);
      continue;
    }
    // bilingual
    const first = order === 'gr_first' ? grEntry : nativeEntry;
    const second = order === 'gr_first' ? nativeEntry : grEntry;
    if (first) out.push(first);
    if (second) out.push(second);
  }
  return out;
}
```

- [ ] **Step 4: Export from barrel**

Edit `src/shared/src/index.ts`. Insert before `export * from './types.js';`:

```ts
export { buildPlaylist } from './playlist.js';
export type { PlaylistEntry } from './playlist.js';
```

- [ ] **Step 5: Run — green**

```bash
npm run build --workspace @echolingo/shared
npm run test --workspace @echolingo/shared
```

- [ ] **Step 6: Commit**

```bash
git add src/shared/src/playlist.ts src/shared/test/playlist.test.ts src/shared/src/index.ts
git commit -m "feat(shared): add buildPlaylist for sentence-pair playback ordering"
```

---

## Task 3: API client

**Files:**
- Create: `src/web/lib/api.ts`
- Create: `src/web/lib/api.test.ts`

The API client wraps `fetch` with typed shapes for the three endpoints the web app uses: `POST /api/lesson`, `GET /api/lesson/{id}`, `POST /api/lesson/{id}/download`. Returns a discriminated union so callers handle 429 vs 4xx vs 5xx explicitly.

- [ ] **Step 1: Write the failing test**

Create `src/web/lib/api.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createLesson, getLesson, downloadLesson } from './api.js';
import type { LessonParams } from '@echolingo/shared';

const params: LessonParams = {
  topic: 'at the market',
  lengthMin: 5,
  level: 3,
  style: 'dialogue',
  mode: 'bilingual',
  bilingualOrder: 'gr_first',
  nativeLang: 'en',
  ttsEngine: 'openai',
};

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('createLesson', () => {
  it('POSTs JSON body to /api/lesson and returns the id', async () => {
    fetchMock.mockResolvedValue(jsonResponse(201, { id: 'abc', status: 'generating_script' }));
    const result = await createLesson(params);
    expect(result).toEqual({ kind: 'created', id: 'abc', status: 'generating_script' });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/lesson');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'content-type': 'application/json' });
    expect(JSON.parse(init.body)).toEqual(params);
  });

  it('returns kind=existing on 200', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { id: 'abc', status: 'ready' }));
    const result = await createLesson(params);
    expect(result).toEqual({ kind: 'existing', id: 'abc', status: 'ready' });
  });

  it('returns kind=rate_limited on 429', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(429, { limit: 20, used: 20, resetAt: '2026-05-20T00:00:00Z' }),
    );
    const result = await createLesson(params);
    expect(result).toEqual({
      kind: 'rate_limited',
      limit: 20,
      used: 20,
      resetAt: '2026-05-20T00:00:00Z',
    });
  });

  it('returns kind=error on 400/500', async () => {
    fetchMock.mockResolvedValue(jsonResponse(400, { error: 'invalid LessonParams' }));
    const result = await createLesson(params);
    expect(result).toEqual({ kind: 'error', status: 400, message: 'invalid LessonParams' });
  });
});

describe('getLesson', () => {
  it('GETs /api/lesson/{id} and returns the lesson', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        id: 'abc',
        params,
        status: 'ready',
        totalSentences: 2,
        readySentences: 2,
        sentences: [],
        createdAt: 'x',
        updatedAt: 'x',
      }),
    );
    const result = await getLesson('abc');
    expect(result.kind).toBe('found');
    if (result.kind === 'found') {
      expect(result.lesson.id).toBe('abc');
    }
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/lesson/abc');
  });

  it('returns kind=not_found on 404', async () => {
    fetchMock.mockResolvedValue(jsonResponse(404, { error: 'lesson not found' }));
    expect(await getLesson('missing')).toEqual({ kind: 'not_found' });
  });
});

describe('downloadLesson', () => {
  it('POSTs and returns the url on 200', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { url: 'https://s/x/full.mp3' }));
    const result = await downloadLesson('abc');
    expect(result).toEqual({ kind: 'ready', url: 'https://s/x/full.mp3' });
  });

  it('returns kind=not_ready on 409', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(409, { error: 'lesson is generating_audio, not ready' }),
    );
    expect(await downloadLesson('abc')).toEqual({
      kind: 'not_ready',
      message: 'lesson is generating_audio, not ready',
    });
  });
});
```

- [ ] **Step 2: Run — red**

```bash
npm run test --workspace @echolingo/web
```

Expected: `Cannot find module './api.js'`.

- [ ] **Step 3: Implement**

Create `src/web/lib/api.ts`:

```ts
import type { Lesson, LessonParams } from '@echolingo/shared';

export type CreateLessonResult =
  | { kind: 'created'; id: string; status: string }
  | { kind: 'existing'; id: string; status: string }
  | { kind: 'rate_limited'; limit: number; used: number; resetAt: string }
  | { kind: 'error'; status: number; message: string };

export type GetLessonResult =
  | { kind: 'found'; lesson: Lesson }
  | { kind: 'not_found' }
  | { kind: 'error'; status: number; message: string };

export type DownloadLessonResult =
  | { kind: 'ready'; url: string }
  | { kind: 'not_ready'; message: string }
  | { kind: 'error'; status: number; message: string };

async function readJson(res: Response): Promise<Record<string, unknown>> {
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function createLesson(params: LessonParams): Promise<CreateLessonResult> {
  const res = await fetch('/api/lesson', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(params),
  });
  const body = await readJson(res);
  if (res.status === 201) {
    return { kind: 'created', id: String(body.id), status: String(body.status) };
  }
  if (res.status === 200) {
    return { kind: 'existing', id: String(body.id), status: String(body.status) };
  }
  if (res.status === 429) {
    return {
      kind: 'rate_limited',
      limit: Number(body.limit ?? 0),
      used: Number(body.used ?? 0),
      resetAt: String(body.resetAt ?? ''),
    };
  }
  return {
    kind: 'error',
    status: res.status,
    message: String(body.error ?? res.statusText),
  };
}

export async function getLesson(id: string): Promise<GetLessonResult> {
  const res = await fetch(`/api/lesson/${encodeURIComponent(id)}`);
  if (res.status === 404) return { kind: 'not_found' };
  const body = await readJson(res);
  if (res.status === 200) {
    return { kind: 'found', lesson: body as unknown as Lesson };
  }
  return {
    kind: 'error',
    status: res.status,
    message: String(body.error ?? res.statusText),
  };
}

export async function downloadLesson(id: string): Promise<DownloadLessonResult> {
  const res = await fetch(`/api/lesson/${encodeURIComponent(id)}/download`, { method: 'POST' });
  const body = await readJson(res);
  if (res.status === 200) {
    return { kind: 'ready', url: String(body.url) };
  }
  if (res.status === 409) {
    return { kind: 'not_ready', message: String(body.error ?? 'lesson not ready') };
  }
  return {
    kind: 'error',
    status: res.status,
    message: String(body.error ?? res.statusText),
  };
}
```

- [ ] **Step 4: Run — green**

```bash
npm run test --workspace @echolingo/web
```

- [ ] **Step 5: Commit**

```bash
git add src/web/lib/api.ts src/web/lib/api.test.ts
git commit -m "feat(web): typed API client with discriminated result types"
```

---

## Task 4: `usePrefs` hook

**Files:**
- Create: `src/web/hooks/use-prefs.ts`
- Create: `src/web/hooks/use-prefs.test.ts`

Pure-logic split: the schema, defaults, parser, and serializer live as pure functions tested in isolation. The hook is a thin React wrapper around them.

- [ ] **Step 1: Failing test**

Create `src/web/hooks/use-prefs.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { DEFAULT_PREFS, loadPrefs, savePrefs, type FormPrefs } from './use-prefs.js';

function fakeStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
    removeItem: (k: string) => store.delete(k),
    clear: () => store.clear(),
  };
}

describe('FormPrefs persistence', () => {
  it('loadPrefs returns defaults for an empty storage', () => {
    expect(loadPrefs(fakeStorage())).toEqual(DEFAULT_PREFS);
  });

  it('savePrefs then loadPrefs round-trips', () => {
    const storage = fakeStorage();
    const prefs: FormPrefs = {
      ...DEFAULT_PREFS,
      lengthMin: 20,
      level: 5,
      style: 'story',
      mode: 'greek_only',
      bilingualOrder: 'native_first',
      nativeLang: 'ru',
    };
    savePrefs(storage, prefs);
    expect(loadPrefs(storage)).toEqual(prefs);
  });

  it('loadPrefs falls back to defaults on corrupt JSON', () => {
    const storage = fakeStorage();
    storage.setItem('echolingo:prefs', 'not json');
    expect(loadPrefs(storage)).toEqual(DEFAULT_PREFS);
  });

  it('loadPrefs falls back to defaults when stored fields are invalid', () => {
    const storage = fakeStorage();
    storage.setItem('echolingo:prefs', JSON.stringify({ lengthMin: 7, level: 9, style: 'rap' }));
    const result = loadPrefs(storage);
    expect(result.lengthMin).toBe(DEFAULT_PREFS.lengthMin);
    expect(result.level).toBe(DEFAULT_PREFS.level);
    expect(result.style).toBe(DEFAULT_PREFS.style);
  });

  it('savePrefs strips the topic — topic is never remembered', () => {
    const storage = fakeStorage();
    savePrefs(storage, { ...DEFAULT_PREFS, topic: 'leaked' as unknown as never });
    const raw = storage.getItem('echolingo:prefs')!;
    expect(JSON.parse(raw).topic).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run — red**

```bash
npm run test --workspace @echolingo/web
```

- [ ] **Step 3: Implement**

Create `src/web/hooks/use-prefs.ts`:

```ts
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
    topic: DEFAULT_PREFS.topic, // never persisted
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
```

- [ ] **Step 4: Run — green**

```bash
npm run test --workspace @echolingo/web
```

- [ ] **Step 5: Commit**

```bash
git add src/web/hooks/use-prefs.ts src/web/hooks/use-prefs.test.ts
git commit -m "feat(web): add usePrefs hook with localStorage round-trip"
```

---

## Task 5: Home form + submit

**Files:**
- Create: `src/web/components/lesson-form.tsx`
- Modify: `src/web/app/page.tsx`

The form pre-fills from `usePrefs`, saves on every change, validates that `topic` is non-empty, and submits via `createLesson`. On `created` or `existing`, it navigates to `/lesson/[id]/`. On `rate_limited`, it shows a banner. On `error`, it shows the message.

- [ ] **Step 1: Create the form component**

Create `src/web/components/lesson-form.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePrefs, type FormPrefs } from '../hooks/use-prefs.js';
import { createLesson } from '../lib/api.js';
import {
  LESSON_LENGTHS,
  LESSON_STYLES,
  LESSON_MODES,
  BILINGUAL_ORDERS,
  NATIVE_LANGS,
  type LessonParams,
  type LessonLength,
  type LessonLevel,
  type LessonStyle,
  type LessonMode,
  type BilingualOrder,
  type NativeLang,
} from '@echolingo/shared';

type Status =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'rate_limited'; limit: number; used: number; resetAt: string }
  | { kind: 'error'; message: string };

export function LessonForm() {
  const router = useRouter();
  const [prefs, setPrefs] = usePrefs();
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  function update<K extends keyof FormPrefs>(key: K, value: FormPrefs[K]) {
    setPrefs({ ...prefs, [key]: value });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!prefs.topic.trim()) return;
    setStatus({ kind: 'submitting' });
    const params: LessonParams = {
      topic: prefs.topic.trim(),
      lengthMin: prefs.lengthMin,
      level: prefs.level,
      style: prefs.style,
      mode: prefs.mode,
      bilingualOrder: prefs.bilingualOrder,
      nativeLang: prefs.nativeLang,
      ttsEngine: 'openai',
    };
    const result = await createLesson(params);
    if (result.kind === 'created' || result.kind === 'existing') {
      router.push(`/lesson/${result.id}/`);
    } else if (result.kind === 'rate_limited') {
      setStatus(result);
    } else {
      setStatus({ kind: 'error', message: result.message });
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <label className="block">
        <span className="text-sm font-medium text-neutral-700">Topic</span>
        <input
          type="text"
          required
          value={prefs.topic}
          onChange={(e) => update('topic', e.target.value)}
          placeholder="at the bakery"
          className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2"
        />
      </label>

      <div>
        <span className="text-sm font-medium text-neutral-700">Length (min)</span>
        <div className="mt-1 flex gap-2">
          {LESSON_LENGTHS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => update('lengthMin', m as LessonLength)}
              className={
                'rounded-md border px-3 py-1.5 text-sm ' +
                (prefs.lengthMin === m
                  ? 'border-neutral-900 bg-neutral-900 text-white'
                  : 'border-neutral-300 bg-white text-neutral-800')
              }
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <label className="block">
        <span className="text-sm font-medium text-neutral-700">Level: {prefs.level}</span>
        <input
          type="range"
          min={1}
          max={5}
          step={1}
          value={prefs.level}
          onChange={(e) => update('level', Number(e.target.value) as LessonLevel)}
          className="mt-1 block w-full"
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium text-neutral-700">Style</span>
        <select
          value={prefs.style}
          onChange={(e) => update('style', e.target.value as LessonStyle)}
          className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2"
        >
          {LESSON_STYLES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="text-sm font-medium text-neutral-700">Mode</span>
        <select
          value={prefs.mode}
          onChange={(e) => update('mode', e.target.value as LessonMode)}
          className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2"
        >
          {LESSON_MODES.map((m) => (
            <option key={m} value={m}>
              {m === 'greek_only' ? 'Greek only' : 'Bilingual'}
            </option>
          ))}
        </select>
      </label>

      {prefs.mode === 'bilingual' && (
        <label className="block">
          <span className="text-sm font-medium text-neutral-700">Bilingual order</span>
          <select
            value={prefs.bilingualOrder}
            onChange={(e) => update('bilingualOrder', e.target.value as BilingualOrder)}
            className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2"
          >
            {BILINGUAL_ORDERS.map((o) => (
              <option key={o} value={o}>
                {o === 'gr_first' ? 'Greek first' : 'Native first'}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="block">
        <span className="text-sm font-medium text-neutral-700">Native language</span>
        <select
          value={prefs.nativeLang}
          onChange={(e) => update('nativeLang', e.target.value as NativeLang)}
          className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2"
        >
          {NATIVE_LANGS.map((l) => (
            <option key={l} value={l}>
              {l === 'en' ? 'English' : 'Russian'}
            </option>
          ))}
        </select>
      </label>

      <button
        type="submit"
        disabled={status.kind === 'submitting' || !prefs.topic.trim()}
        className="w-full rounded-md bg-neutral-900 px-4 py-2 font-medium text-white disabled:bg-neutral-400"
      >
        {status.kind === 'submitting' ? 'Generating…' : 'Go'}
      </button>

      {status.kind === 'rate_limited' && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Daily limit reached ({status.used}/{status.limit}). Resets at {status.resetAt}.
        </p>
      )}
      {status.kind === 'error' && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-900">
          Error: {status.message}
        </p>
      )}
    </form>
  );
}
```

- [ ] **Step 2: Update the home page**

Replace `src/web/app/page.tsx` with:

```tsx
import { LessonForm } from '../components/lesson-form.js';

export default function HomePage() {
  return (
    <main className="mx-auto max-w-md px-4 py-8">
      <h1 className="text-3xl font-semibold">Echolingo</h1>
      <p className="mt-2 mb-6 text-neutral-600">
        Greek listening lessons, on demand.
      </p>
      <LessonForm />
    </main>
  );
}
```

- [ ] **Step 3: Verify build**

```bash
npm run build --workspace @echolingo/web
```

Expected: SUCCESS. The static export will include `index.html` and `_next/`.

- [ ] **Step 4: Commit**

```bash
git add src/web/components/lesson-form.tsx src/web/app/page.tsx
git commit -m "feat(web): home form with prefs auto-fill and submit-then-navigate"
```

---

## Task 6: `/lesson/[id]` page with polling

**Files:**
- Create: `src/web/hooks/use-lesson.ts`
- Create: `src/web/components/lesson-progress.tsx`
- Create: `src/web/app/lesson/[id]/page.tsx`

`useLesson(id)` calls `getLesson(id)` once, then polls every 2 seconds while status is `generating_script` or `generating_audio`. It stops polling once status is `ready` or `failed`.

- [ ] **Step 1: Create the polling hook**

Create `src/web/hooks/use-lesson.ts`:

```ts
'use client';

import { useEffect, useState } from 'react';
import type { Lesson } from '@echolingo/shared';
import { getLesson } from '../lib/api.js';

export type LessonState =
  | { kind: 'loading' }
  | { kind: 'not_found' }
  | { kind: 'error'; message: string }
  | { kind: 'ok'; lesson: Lesson };

const POLL_INTERVAL_MS = 2000;

export function useLesson(id: string): LessonState {
  const [state, setState] = useState<LessonState>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function tick() {
      const result = await getLesson(id);
      if (cancelled) return;
      if (result.kind === 'not_found') {
        setState({ kind: 'not_found' });
        return;
      }
      if (result.kind === 'error') {
        setState({ kind: 'error', message: result.message });
        return;
      }
      setState({ kind: 'ok', lesson: result.lesson });
      const s = result.lesson.status;
      if (s === 'generating_script' || s === 'generating_audio') {
        timer = setTimeout(tick, POLL_INTERVAL_MS);
      }
    }

    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [id]);

  return state;
}
```

- [ ] **Step 2: Progress component**

Create `src/web/components/lesson-progress.tsx`:

```tsx
'use client';

import type { Lesson } from '@echolingo/shared';

export function LessonProgress({ lesson }: { lesson: Lesson }) {
  const { status, readySentences, totalSentences } = lesson;
  const label =
    status === 'generating_script'
      ? 'Generating script…'
      : status === 'generating_audio'
        ? `Generating audio (${readySentences}/${totalSentences})`
        : status === 'failed'
          ? 'Generation failed'
          : 'Ready';

  const pct =
    status === 'generating_audio' && totalSentences > 0
      ? Math.round((readySentences / totalSentences) * 100)
      : 0;

  return (
    <div className="rounded-md border border-neutral-200 bg-white p-4">
      <p className="text-sm font-medium text-neutral-700">{label}</p>
      {status === 'generating_audio' && (
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-neutral-200">
          <div
            className="h-full bg-neutral-900 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
      {status === 'failed' && lesson.error && (
        <p className="mt-2 text-sm text-red-900">{lesson.error}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create the lesson page**

Static-export caveat: Next.js requires `generateStaticParams` for dynamic routes when `output: 'export'` is set. We emit a single shell at `/lesson/shell/index.html` and read the actual id from `window.location.pathname` at runtime — this same shell will be served for any `/lesson/<id>/` URL by the Azure SWA rewrite rule (Plan 5) or by `next dev` locally.

Create `src/web/app/lesson/[id]/page.tsx`:

```tsx
'use client';

import { useLesson } from '../../../hooks/use-lesson.js';
import { LessonProgress } from '../../../components/lesson-progress.js';
import { useEffect, useState } from 'react';

export const dynamic = 'force-static';

export function generateStaticParams() {
  // Single placeholder shell; the actual id is read from the URL at runtime.
  return [{ id: 'shell' }];
}

function readIdFromPath(): string {
  if (typeof window === 'undefined') return '';
  // /lesson/<id>/ → take the second segment
  const parts = window.location.pathname.split('/').filter(Boolean);
  return parts[1] ?? '';
}

export default function LessonPage() {
  const [id, setId] = useState('');
  useEffect(() => {
    setId(readIdFromPath());
  }, []);
  return id ? <LessonScreen id={id} /> : (
    <main className="mx-auto max-w-md px-4 py-8 text-neutral-600">Loading…</main>
  );
}

function LessonScreen({ id }: { id: string }) {
  const state = useLesson(id);

  if (state.kind === 'loading') {
    return (
      <main className="mx-auto max-w-md px-4 py-8 text-neutral-600">Loading…</main>
    );
  }
  if (state.kind === 'not_found') {
    return (
      <main className="mx-auto max-w-md px-4 py-8 text-red-900">Lesson not found.</main>
    );
  }
  if (state.kind === 'error') {
    return (
      <main className="mx-auto max-w-md px-4 py-8 text-red-900">
        Error: {state.message}
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 space-y-6">
      <h1 className="text-2xl font-semibold">{state.lesson.params.topic}</h1>
      <LessonProgress lesson={state.lesson} />
      {state.lesson.status === 'ready' && (
        <p className="text-sm text-neutral-500">
          Lesson is ready. Player UI lands in Task 8.
        </p>
      )}
    </main>
  );
}
```

- [ ] **Step 4: Build verification**

```bash
npm run build --workspace @echolingo/web
```

Expected: SUCCESS. Output includes `out/lesson/shell/index.html`.

- [ ] **Step 5: Commit**

```bash
git add src/web/hooks/use-lesson.ts src/web/components/lesson-progress.tsx src/web/app/lesson/
git commit -m "feat(web): /lesson/[id] page with polling and progress UI"
```

---

## Task 7: `usePlayer` hook

**Files:**
- Create: `src/web/hooks/use-player.ts`

`usePlayer(playlist)` owns an `HTMLAudioElement`, advances through the playlist on `ended`, exposes current sentence index, and provides controls: `play`, `pause`, `toggle`, `next`, `prev`, `repeatSentence`, `setSpeed`. The hook returns an `audioRef` the page mounts into a hidden `<audio>` tag.

- [ ] **Step 1: Implement**

Create `src/web/hooks/use-player.ts`:

```ts
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PlaylistEntry } from '@echolingo/shared';

export interface PlayerState {
  isPlaying: boolean;
  currentChunk: number;
  currentSentence: number;
  speed: number;
}

export interface PlayerControls {
  play(): void;
  pause(): void;
  toggle(): void;
  next(): void;
  prev(): void;
  repeatSentence(): void;
  setSpeed(rate: number): void;
}

export function usePlayer(playlist: PlaylistEntry[]): {
  audioRef: React.RefObject<HTMLAudioElement | null>;
  state: PlayerState;
  controls: PlayerControls;
} {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [currentChunk, setCurrentChunk] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeedState] = useState(1);

  const currentSentence = useMemo(
    () => playlist[currentChunk]?.sentenceIndex ?? 0,
    [playlist, currentChunk],
  );

  // Sync audio src whenever the chunk pointer changes
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const entry = playlist[currentChunk];
    if (!entry) return;
    if (audio.src !== entry.url) {
      audio.src = entry.url;
      audio.load();
    }
    audio.playbackRate = speed;
  }, [playlist, currentChunk, speed]);

  // Subscribe to audio events
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => {
      setCurrentChunk((c) => Math.min(c + 1, playlist.length));
    };
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);
    return () => {
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
    };
  }, [playlist.length]);

  // Auto-play when chunk advances (if we were playing)
  useEffect(() => {
    if (!isPlaying) return;
    const audio = audioRef.current;
    if (!audio) return;
    if (currentChunk >= playlist.length) {
      setIsPlaying(false);
      return;
    }
    void audio.play().catch(() => {
      // Autoplay can be blocked; surface as paused
      setIsPlaying(false);
    });
  }, [currentChunk, isPlaying, playlist.length]);

  const play = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (currentChunk >= playlist.length) setCurrentChunk(0);
    void audio.play().catch(() => setIsPlaying(false));
  }, [currentChunk, playlist.length]);

  const pause = useCallback(() => {
    audioRef.current?.pause();
  }, []);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) play();
    else pause();
  }, [play, pause]);

  const next = useCallback(() => {
    // Skip to start of NEXT sentence (not next chunk).
    let target = currentChunk + 1;
    while (
      target < playlist.length &&
      playlist[target]!.sentenceIndex === playlist[currentChunk]?.sentenceIndex
    ) {
      target += 1;
    }
    setCurrentChunk(Math.min(target, playlist.length));
  }, [currentChunk, playlist]);

  const prev = useCallback(() => {
    // Move to start of CURRENT sentence (or previous sentence if already at start).
    const currentSentenceIdx = playlist[currentChunk]?.sentenceIndex ?? 0;
    let target = currentChunk;
    while (target > 0 && playlist[target - 1]!.sentenceIndex === currentSentenceIdx) {
      target -= 1;
    }
    if (target === currentChunk && target > 0) {
      // Already at start of current sentence — step back to previous sentence's first chunk
      const prevSentenceIdx = playlist[target - 1]!.sentenceIndex;
      target -= 1;
      while (target > 0 && playlist[target - 1]!.sentenceIndex === prevSentenceIdx) {
        target -= 1;
      }
    }
    setCurrentChunk(target);
  }, [currentChunk, playlist]);

  const repeatSentence = useCallback(() => {
    // Same logic as prev's "go to start of current sentence", but never crosses a sentence boundary.
    const currentSentenceIdx = playlist[currentChunk]?.sentenceIndex ?? 0;
    let target = currentChunk;
    while (target > 0 && playlist[target - 1]!.sentenceIndex === currentSentenceIdx) {
      target -= 1;
    }
    setCurrentChunk(target);
  }, [currentChunk, playlist]);

  const setSpeed = useCallback((rate: number) => {
    setSpeedState(rate);
  }, []);

  return {
    audioRef,
    state: { isPlaying, currentChunk, currentSentence, speed },
    controls: { play, pause, toggle, next, prev, repeatSentence, setSpeed },
  };
}
```

- [ ] **Step 2: Verify typecheck**

```bash
npm run typecheck --workspace @echolingo/web
```

- [ ] **Step 3: Commit**

```bash
git add src/web/hooks/use-player.ts
git commit -m "feat(web): usePlayer hook for sentence-aware audio playback"
```

---

## Task 8: Player controls + transcript view

**Files:**
- Create: `src/web/components/player-controls.tsx`
- Create: `src/web/components/transcript-view.tsx`
- Modify: `src/web/app/lesson/[id]/page.tsx` (wire player in)

- [ ] **Step 1: Player controls**

Create `src/web/components/player-controls.tsx`:

```tsx
'use client';

import type { PlayerControls as Controls, PlayerState } from '../hooks/use-player.js';

const SPEEDS = [0.75, 1, 1.25] as const;

export function PlayerControlsView({
  state,
  controls,
}: {
  state: PlayerState;
  controls: Controls;
}) {
  return (
    <div className="flex items-center justify-center gap-3">
      <button
        type="button"
        onClick={controls.prev}
        className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
        aria-label="Previous sentence"
      >
        ‹ Prev
      </button>
      <button
        type="button"
        onClick={controls.repeatSentence}
        className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
        aria-label="Repeat current sentence"
      >
        ↺ Repeat
      </button>
      <button
        type="button"
        onClick={controls.toggle}
        className="rounded-md bg-neutral-900 px-5 py-2 font-medium text-white"
        aria-label={state.isPlaying ? 'Pause' : 'Play'}
      >
        {state.isPlaying ? '❚❚ Pause' : '▶ Play'}
      </button>
      <button
        type="button"
        onClick={controls.next}
        className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
        aria-label="Next sentence"
      >
        Next ›
      </button>
      <div className="ml-2 flex items-center gap-1">
        {SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => controls.setSpeed(s)}
            className={
              'rounded-md px-2 py-1 text-xs ' +
              (Math.abs(state.speed - s) < 0.01
                ? 'bg-neutral-900 text-white'
                : 'bg-neutral-100 text-neutral-700')
            }
          >
            {s}×
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Transcript view**

Create `src/web/components/transcript-view.tsx`:

```tsx
'use client';

import type { Lesson, Sentence } from '@echolingo/shared';

export function TranscriptView({
  lesson,
  currentSentence,
}: {
  lesson: Lesson;
  currentSentence: number;
}) {
  return (
    <ol className="space-y-3">
      {lesson.sentences.map((s) => (
        <SentenceRow
          key={s.i}
          sentence={s}
          isCurrent={s.i === currentSentence}
          showNative={lesson.params.mode === 'bilingual'}
        />
      ))}
    </ol>
  );
}

function SentenceRow({
  sentence,
  isCurrent,
  showNative,
}: {
  sentence: Sentence;
  isCurrent: boolean;
  showNative: boolean;
}) {
  const cls = isCurrent
    ? 'rounded-md bg-yellow-50 px-3 py-2 ring-2 ring-yellow-400'
    : 'rounded-md px-3 py-2';
  return (
    <li className={cls}>
      <p className="text-base text-neutral-900">{sentence.gr}</p>
      {showNative && (
        <p className="mt-0.5 text-sm text-neutral-500">{sentence.native}</p>
      )}
    </li>
  );
}
```

- [ ] **Step 3: Wire into the lesson page**

Replace `src/web/app/lesson/[id]/page.tsx` with:

```tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { buildPlaylist } from '@echolingo/shared';
import { useLesson } from '../../../hooks/use-lesson.js';
import { usePlayer } from '../../../hooks/use-player.js';
import { LessonProgress } from '../../../components/lesson-progress.js';
import { PlayerControlsView } from '../../../components/player-controls.js';
import { TranscriptView } from '../../../components/transcript-view.js';

export const dynamic = 'force-static';

export function generateStaticParams() {
  return [{ id: 'shell' }];
}

function readIdFromPath(): string {
  if (typeof window === 'undefined') return '';
  const parts = window.location.pathname.split('/').filter(Boolean);
  return parts[1] ?? '';
}

export default function LessonPage() {
  const [id, setId] = useState('');
  useEffect(() => {
    setId(readIdFromPath());
  }, []);
  if (!id) {
    return <main className="mx-auto max-w-md px-4 py-8 text-neutral-600">Loading…</main>;
  }
  return <LessonScreen id={id} />;
}

function LessonScreen({ id }: { id: string }) {
  const state = useLesson(id);
  const playlist = useMemo(
    () => (state.kind === 'ok' && state.lesson.status === 'ready' ? buildPlaylist(state.lesson) : []),
    [state],
  );
  const player = usePlayer(playlist);

  if (state.kind === 'loading') {
    return <main className="mx-auto max-w-md px-4 py-8 text-neutral-600">Loading…</main>;
  }
  if (state.kind === 'not_found') {
    return <main className="mx-auto max-w-md px-4 py-8 text-red-900">Lesson not found.</main>;
  }
  if (state.kind === 'error') {
    return (
      <main className="mx-auto max-w-md px-4 py-8 text-red-900">
        Error: {state.message}
      </main>
    );
  }

  const { lesson } = state;
  const ready = lesson.status === 'ready';

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 space-y-6">
      <h1 className="text-2xl font-semibold">{lesson.params.topic}</h1>
      {!ready && <LessonProgress lesson={lesson} />}
      {ready && (
        <>
          <audio ref={player.audioRef} preload="auto" />
          <PlayerControlsView state={player.state} controls={player.controls} />
          <TranscriptView lesson={lesson} currentSentence={player.state.currentSentence} />
        </>
      )}
    </main>
  );
}
```

- [ ] **Step 4: Build verification**

```bash
npm run build --workspace @echolingo/web
```

- [ ] **Step 5: Commit**

```bash
git add src/web/components/player-controls.tsx src/web/components/transcript-view.tsx src/web/app/lesson/
git commit -m "feat(web): player controls and synchronized transcript view"
```

---

## Task 9: MediaSession lockscreen integration

**Files:**
- Modify: `src/web/hooks/use-player.ts`

MediaSession lets the browser surface play/pause/next/prev on iOS lockscreen, Android notification, and macOS Now-Playing widget. We set the metadata (title, artist) and wire the action handlers to existing controls.

- [ ] **Step 1: Extend `usePlayer` to update MediaSession**

Edit `src/web/hooks/use-player.ts`. Add the following inside the hook, after the existing event-subscription `useEffect`:

```ts
  // MediaSession integration (lockscreen controls)
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    const entry = playlist[currentChunk];
    if (!entry) {
      ms.metadata = null;
      return;
    }
    ms.metadata = new MediaMetadata({
      title: `Sentence ${entry.sentenceIndex + 1}`,
      artist: 'Echolingo',
      album: 'Greek lesson',
    });
    ms.setActionHandler('play', () => play());
    ms.setActionHandler('pause', () => pause());
    ms.setActionHandler('nexttrack', () => next());
    ms.setActionHandler('previoustrack', () => prev());
    return () => {
      ms.setActionHandler('play', null);
      ms.setActionHandler('pause', null);
      ms.setActionHandler('nexttrack', null);
      ms.setActionHandler('previoustrack', null);
    };
  }, [currentChunk, playlist, play, pause, next, prev]);
```

- [ ] **Step 2: Verify**

```bash
npm run typecheck --workspace @echolingo/web
npm run build --workspace @echolingo/web
```

- [ ] **Step 3: Commit**

```bash
git add src/web/hooks/use-player.ts
git commit -m "feat(web): MediaSession lockscreen controls"
```

---

## Task 10: Service worker (app-shell cache)

**Files:**
- Modify: `src/web/public/sw.js`
- Modify: `src/web/app/layout.tsx` (register the SW)

Caches the home page and static assets so the app launches offline. Lessons themselves need network (audio is on a remote URL). The SW is intentionally minimal — install + activate + a `fetch` handler that serves cached app-shell assets and passes everything else through.

- [ ] **Step 1: Replace `src/web/public/sw.js` with**

```js
const CACHE_NAME = 'echolingo-shell-v1';
const SHELL_URLS = ['/', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS)),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // Never cache API calls
  if (url.pathname.startsWith('/api/')) return;

  // Cache-first for shell HTML / JS / CSS / fonts; network-first for everything else.
  const isShell =
    request.destination === 'document' ||
    request.destination === 'script' ||
    request.destination === 'style' ||
    request.destination === 'font' ||
    url.pathname.endsWith('.webmanifest');

  if (isShell) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
            return response;
          }),
      ),
    );
  }
});
```

- [ ] **Step 2: Register the SW from `src/web/app/layout.tsx`**

Replace `src/web/app/layout.tsx` with:

```tsx
import './globals.css';
import type { ReactNode } from 'react';
import Script from 'next/script';

export const metadata = {
  title: 'Echolingo',
  description: 'On-demand AI-generated Greek listening lessons',
  manifest: '/manifest.webmanifest',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-neutral-900 antialiased">
        {children}
        <Script id="register-sw" strategy="afterInteractive">
          {`
            if ('serviceWorker' in navigator) {
              navigator.serviceWorker.register('/sw.js').catch(() => {});
            }
          `}
        </Script>
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Build verification**

```bash
npm run build --workspace @echolingo/web
```

Expected: SUCCESS. `out/sw.js` exists and contains the cache logic.

- [ ] **Step 4: Commit**

```bash
git add src/web/public/sw.js src/web/app/layout.tsx
git commit -m "feat(web): service worker with app-shell cache and SW registration"
```

---

## Task 11: README + final verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add a "Frontend" section to `README.md`**

Insert before the `## Status` section:

```markdown
## Frontend (Plan 3)

The PWA lives at `src/web` (Next.js 15 app router, static export). In dev the Next.js server rewrites `/api/*` to `http://localhost:7071`; in production Azure Static Web Apps' linked-Functions feature handles the same path.

Pages:
- `/` — lesson form, prefs auto-fill from localStorage.
- `/lesson/[id]/` — polls the backend; once `status:"ready"` shows the audio player + transcript with sentence highlight. Speed slider (0.75× / 1× / 1.25×), prev/next sentence, repeat current sentence, MediaSession lockscreen controls.

```bash
npm run dev:web   # http://localhost:3000
npm run dev:api   # http://localhost:7071  (in another terminal)
npm run azurite   # in another terminal
```

### Static-export deploy notes (for Plan 5)

The `/lesson/[id]/` route is emitted as a single static shell at `/lesson/shell/index.html`. To make `/lesson/<real-id>/` requests resolve in production, the Azure Static Web Apps `staticwebapp.config.json` must rewrite that path to the shell. Plan 5 adds the file.
```

- [ ] **Step 2: Run the full validation**

In separate terminals:

```bash
# 1. Azurite
npm run azurite

# 2. API
npm run dev:api

# 3. Web
npm run dev:web
```

Then in a browser, open http://localhost:3000:
- Fill in a topic (e.g. "at the bakery"), keep defaults, click **Go**.
- You should be navigated to `/lesson/<id>/`, see "Generating script…", then "Generating audio (12/38)…", then the player UI.
- Press **Play** — audio plays, transcript highlights current sentence, prev/next sentence buttons work, speed slider switches rate.
- Reload the page — you should land on the same lesson and the player still works.
- Go back to `/`, change `level` to 5, refresh — `level` should be remembered.

Lint + tests:

```bash
npm run lint
npm run test
npm run build --workspace @echolingo/web
```

Expected: every step exits 0; 0 skipped tests.

- [ ] **Step 3: Commit and push**

```bash
git add README.md
git commit -m "docs: frontend (Plan 3) overview and static-export notes"
git push origin dev
```

---

## What Plan 3 does NOT include (handed off)

- **Streaming-while-generating playback** — current behavior waits for `status:"ready"`. A follow-up plan can start playback as soon as the first sentence is ready and refresh the playlist as more arrive.
- **Real ±15s seek** — chunked audio makes precise seek tricky; we ship prev/next sentence instead, which is the right shape for a language-learning player anyway.
- **Recent-lessons history list** on the home page — design said localStorage history, deferred until users ask.
- **Lesson sharing UI** — the deterministic-id URL is already shareable manually (copy from the address bar). A share-button + native Web Share API is a small future task.
- **Server-side handling of `/lesson/<id>/` in production** — Plan 5 adds `staticwebapp.config.json` rewrites.
- **Offline-downloaded lesson playback** — the `POST /api/lesson/{id}/download` endpoint exists (Plan 4), but the frontend doesn't expose a "Download for offline" button yet. Small follow-up.
- **Playwright E2E** — manual smoke is fine for v1; automated UI tests land alongside deploy in Plan 5.
- **React Testing Library + JSDOM** for component tests — skipped to keep Plan 3 narrow; pure logic (`buildPlaylist`, `usePrefs` parser, API client) is well-covered with vitest.
