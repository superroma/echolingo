# Echolingo Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the visual & interaction redesign of Echolingo plus multi-language target/native support, per `docs/superpowers/specs/2026-05-23-echolingo-redesign-design.md`.

**Architecture:** Bottom-up in three phases — (1) tokens + fonts foundation, (2) multi-language schema & prompts (back-end and shared types), (3) UI redesign across both pages. TDD for logic (types, prompts, prefs, jumpToSentence, scrubber math); visual verification via the Chrome DevTools MCP for UI.

**Tech Stack:** Next.js 15 (static export), TypeScript, Tailwind CSS, `next/font/google`, Azure Functions v4 (Node 22), Vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-05-23-echolingo-redesign-design.md`

---

## Phase 1 — Foundation

### Task 1: Tailwind tokens + Google fonts

**Files:**
- Modify: `src/web/tailwind.config.ts`
- Modify: `src/web/app/layout.tsx`
- Modify: `src/web/app/globals.css`

- [ ] **Step 1: Extend Tailwind theme with palette + font families**

Replace the entire contents of `src/web/tailwind.config.ts`:

```ts
import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#FAF6EE',
        ink: '#1A1A1A',
        'ink-muted': '#6B7280',
        'ink-faint': '#B5B0A5',
        aegean: '#1E5F8B',
        'aegean-50': '#E6EEF5',
        terracotta: '#C8623F',
        surface: '#FFFFFF',
        hairline: '#E8E2D6',
      },
      fontFamily: {
        serif: ['var(--font-serif)', 'Source Serif 4', 'Georgia', 'serif'],
        sans: ['var(--font-sans)', 'Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
```

- [ ] **Step 2: Load Google fonts via `next/font` in the layout**

Replace `src/web/app/layout.tsx` with:

```tsx
import './globals.css';
import type { ReactNode } from 'react';
import Script from 'next/script';
import { Inter, Source_Serif_4 } from 'next/font/google';

const inter = Inter({
  subsets: ['latin', 'cyrillic'],
  variable: '--font-sans',
  display: 'swap',
});

const serif = Source_Serif_4({
  subsets: ['latin', 'greek', 'cyrillic'],
  variable: '--font-serif',
  display: 'swap',
});

export const metadata = {
  title: 'Echolingo',
  description: 'On-demand AI-generated listening lessons',
  manifest: '/manifest.webmanifest',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${serif.variable}`}>
      <body className="min-h-screen bg-paper font-sans text-ink antialiased">
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

- [ ] **Step 3: Reset globals.css to a clean baseline**

Replace `src/web/app/globals.css` with:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  body {
    font-feature-settings: 'kern' 1, 'liga' 1, 'calt' 1;
  }

  input::placeholder,
  textarea::placeholder {
    @apply text-ink-faint;
  }
}
```

- [ ] **Step 4: Verify typecheck + dev server**

Run from project root:

```bash
npm run typecheck --workspace @echolingo/web
```

Expected: no errors.

Then verify the dev server boots and the page renders:

```bash
npm run dev:web  # (may already be running from prior session)
curl -sf -o /dev/null http://localhost:3000/ && echo OK
```

Expected: `OK`. Visit `http://localhost:3000/` and confirm the background is warm off-white (`#FAF6EE`) and text uses Inter. (No layout changes yet — colors only.)

- [ ] **Step 5: Commit**

```bash
git add src/web/tailwind.config.ts src/web/app/layout.tsx src/web/app/globals.css
git commit -m "feat(web): palette tokens + Inter/Source Serif font setup"
```

---

## Phase 2 — Multi-language schema

### Task 2: Shared types — LangCode, targetLang, value renames

**Files:**
- Modify: `src/shared/src/types.ts`
- Modify: `src/shared/src/playlist.ts`
- Modify: `src/shared/test/types.test.ts`
- Modify: `src/shared/test/playlist.test.ts`

- [ ] **Step 1: Write failing tests for new shape in `types.test.ts`**

Append these tests to `src/shared/test/types.test.ts` (before the closing of the existing `describe` block, or in a new `describe`):

```ts
import { LANG_CODES, isLessonParams } from '../src/types.js';

describe('LANG_CODES', () => {
  it('includes the curated v1 set', () => {
    expect(LANG_CODES).toEqual([
      'el', 'es', 'it', 'fr', 'de', 'pt', 'ja', 'zh', 'en', 'ru',
    ]);
  });
});

describe('isLessonParams with targetLang', () => {
  const base = {
    topic: 'cafe',
    lengthMin: 5,
    level: 3,
    style: 'dialogue',
    mode: 'bilingual',
    bilingualOrder: 'target_first',
    nativeLang: 'en',
    targetLang: 'el',
    ttsEngine: 'openai',
  };

  it('accepts a valid params object with targetLang', () => {
    expect(isLessonParams(base)).toBe(true);
  });

  it('rejects when targetLang is missing', () => {
    const { targetLang: _t, ...rest } = base;
    expect(isLessonParams(rest)).toBe(false);
  });

  it('rejects when targetLang === nativeLang', () => {
    expect(isLessonParams({ ...base, targetLang: 'en' })).toBe(false);
  });

  it('rejects unknown targetLang code', () => {
    expect(isLessonParams({ ...base, targetLang: 'xx' })).toBe(false);
  });

  it('rejects old mode value greek_only', () => {
    expect(isLessonParams({ ...base, mode: 'greek_only' })).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm run test --workspace @echolingo/shared
```

Expected: failures referring to undefined `LANG_CODES` and to `isLessonParams` not accepting the new shape.

- [ ] **Step 3: Update `src/shared/src/types.ts`**

Replace the entire file with:

```ts
export type { PlaylistEntry } from './playlist.js';

export const LANG_CODES = [
  'el', 'es', 'it', 'fr', 'de', 'pt', 'ja', 'zh', 'en', 'ru',
] as const;
export type LangCode = (typeof LANG_CODES)[number];

export const LANG_NAME: Record<LangCode, string> = {
  el: 'Greek',
  es: 'Spanish',
  it: 'Italian',
  fr: 'French',
  de: 'German',
  pt: 'Portuguese',
  ja: 'Japanese',
  zh: 'Mandarin',
  en: 'English',
  ru: 'Russian',
};

export const LESSON_LENGTHS = [5, 10, 20, 30] as const;
export type LessonLength = (typeof LESSON_LENGTHS)[number];

export const LESSON_LEVELS = [1, 2, 3, 4, 5] as const;
export type LessonLevel = (typeof LESSON_LEVELS)[number];

export const LESSON_STYLES = ['mono', 'dialogue', 'story'] as const;
export type LessonStyle = (typeof LESSON_STYLES)[number];

export const LESSON_MODES = ['target_only', 'bilingual'] as const;
export type LessonMode = (typeof LESSON_MODES)[number];

export const BILINGUAL_ORDERS = ['target_first', 'native_first'] as const;
export type BilingualOrder = (typeof BILINGUAL_ORDERS)[number];

export const TTS_ENGINES = ['openai', 'elevenlabs', 'google'] as const;
export type TtsEngineName = (typeof TTS_ENGINES)[number];

export interface LessonParams {
  topic: string;
  targetLang: LangCode;
  nativeLang: LangCode;
  lengthMin: LessonLength;
  level: LessonLevel;
  style: LessonStyle;
  mode: LessonMode;
  bilingualOrder: BilingualOrder;
  ttsEngine: TtsEngineName;
  voice?: string;
}

export type SentenceStatus = 'pending' | 'ready' | 'failed';

export interface Sentence {
  i: number;
  gr: string;
  native: string;
  status: SentenceStatus;
  grUrl?: string;
  nativeUrl?: string;
  grDurSec?: number;
  nativeDurSec?: number;
}

export type LessonStatus =
  | 'generating_script'
  | 'generating_audio'
  | 'ready'
  | 'failed';

export interface Lesson {
  id: string;
  params: LessonParams;
  status: LessonStatus;
  createdAt: string;
  updatedAt: string;
  totalSentences: number;
  readySentences: number;
  sentences: Sentence[];
  fullMp3Url?: string;
  error?: string;
}

export function isLessonParams(v: unknown): v is LessonParams {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o.topic !== 'string' || o.topic.trim().length === 0) return false;
  if (!LANG_CODES.includes(o.targetLang as LangCode)) return false;
  if (!LANG_CODES.includes(o.nativeLang as LangCode)) return false;
  if (o.targetLang === o.nativeLang) return false;
  if (!LESSON_LENGTHS.includes(o.lengthMin as LessonLength)) return false;
  if (!LESSON_LEVELS.includes(o.level as LessonLevel)) return false;
  if (!LESSON_STYLES.includes(o.style as LessonStyle)) return false;
  if (!LESSON_MODES.includes(o.mode as LessonMode)) return false;
  if (!BILINGUAL_ORDERS.includes(o.bilingualOrder as BilingualOrder)) return false;
  if (!TTS_ENGINES.includes(o.ttsEngine as TtsEngineName)) return false;
  if (o.voice !== undefined && typeof o.voice !== 'string') return false;
  return true;
}
```

- [ ] **Step 4: Update `src/shared/src/playlist.ts` to use new mode/order values**

In `src/shared/src/playlist.ts`, change:

```ts
if (mode === 'greek_only') {
```

to:

```ts
if (mode === 'target_only') {
```

And change:

```ts
const first = order === 'gr_first' ? grEntry : nativeEntry;
const second = order === 'gr_first' ? nativeEntry : grEntry;
```

to:

```ts
const first = order === 'target_first' ? grEntry : nativeEntry;
const second = order === 'target_first' ? nativeEntry : grEntry;
```

- [ ] **Step 5: Update `src/shared/test/playlist.test.ts` fixture values**

Open `src/shared/test/playlist.test.ts`. Search-and-replace within that file:

- `mode: 'greek_only'` → `mode: 'target_only'`
- `bilingualOrder: 'gr_first'` → `bilingualOrder: 'target_first'`
- `nativeLang: 'en'` (these are fine; no change unless other native is used)

Then, in the `lesson()` helper at the top of the file, ensure `params` includes `targetLang: 'el'`. Locate the helper and add `targetLang: 'el',` to the default params block (alongside `topic`, `lengthMin`, etc.).

- [ ] **Step 6: Update `src/shared/test/types.test.ts` existing fixtures**

In `src/shared/test/types.test.ts`, find any existing `isLessonParams` test fixtures using the old shape (`mode: 'greek_only'`, `bilingualOrder: 'gr_first'`, no `targetLang`). Update them to the new shape:

- Add `targetLang: 'el'`
- Change `mode: 'greek_only'` → `mode: 'target_only'`
- Change `bilingualOrder: 'gr_first'` → `bilingualOrder: 'target_first'`

- [ ] **Step 7: Run tests to verify they pass**

```bash
npm run test --workspace @echolingo/shared
```

Expected: all tests pass.

- [ ] **Step 8: Build shared so dependents see new types**

```bash
npm run build --workspace @echolingo/shared
```

Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add src/shared
git commit -m "feat(shared): LangCode + targetLang; rename modes target_only/target_first"
```

---

### Task 3: API `_shared` mirror + fixture updates

**Files:**
- Modify: `src/api/src/_shared/types.ts`
- Modify: `src/api/src/_shared/playlist.ts`
- Modify: `src/api/test/helpers/fixtures.ts`

- [ ] **Step 1: Mirror `src/shared/src/types.ts` into `src/api/src/_shared/types.ts`**

The api keeps its own inlined copy. Copy the *entire* new contents from `src/shared/src/types.ts` (from Task 2 Step 3) into `src/api/src/_shared/types.ts`, replacing whatever's there.

- [ ] **Step 2: Mirror playlist value renames into `src/api/src/_shared/playlist.ts`**

Apply the same two edits from Task 2 Step 4 to `src/api/src/_shared/playlist.ts`:

- `mode === 'greek_only'` → `mode === 'target_only'`
- `order === 'gr_first'` → `order === 'target_first'` (in both places)

- [ ] **Step 3: Update `src/api/test/helpers/fixtures.ts`**

Replace the `lessonParams` defaults block:

```ts
import type { LessonParams } from '../../src/_shared/index.js';

export function lessonParams(overrides: Partial<LessonParams> = {}): LessonParams {
  return {
    topic: 'at the bakery',
    targetLang: 'el',
    nativeLang: 'en',
    lengthMin: 5,
    level: 3,
    style: 'dialogue',
    mode: 'bilingual',
    bilingualOrder: 'target_first',
    ttsEngine: 'openai',
    ...overrides,
  };
}
```

- [ ] **Step 4: Run api tests; expect failures pointing to prompt-related assertions**

```bash
npm run test --workspace @echolingo/api
```

Some tests should still pass (those not asserting on prompt content); prompt tests may now fail because the prompt still hardcodes "Greek". That's expected and is fixed in Task 4.

If there are *type-check* errors in other test files (e.g. tests that built their own `LessonParams` literals without `targetLang`), grep and fix them:

```bash
grep -rn "mode: 'greek_only'\|bilingualOrder: 'gr_first'" src/api/test
```

For each match, add `targetLang: 'el'` to the params object and rename `mode`/`bilingualOrder` values to match.

- [ ] **Step 5: Re-run api tests; non-prompt tests should now pass**

```bash
npm run test --workspace @echolingo/api 2>&1 | tail -40
```

Note any remaining failures — they should all be in prompt-related tests, which are fixed in Task 4.

- [ ] **Step 6: Commit**

```bash
git add src/api
git commit -m "feat(api): mirror multi-lang types; fixture targetLang/target_first"
```

---

### Task 4: Prompts — template by target/native language

**Files:**
- Modify: `src/api/src/_shared/prompts.ts`
- Modify: `src/api/test/prompts.test.ts` (if it exists — otherwise the prompt assertions live inside other test files)

- [ ] **Step 1: Confirm where prompt assertions live**

```bash
grep -rn "buildPrompt\|Greek language tutor" src/api/test
```

Expected output identifies the file(s) with prompt content assertions. Use these paths in the steps below; we refer to them as `<prompt-test-file>`.

- [ ] **Step 2: Write failing tests asserting language templating**

Add to `<prompt-test-file>` (or create `src/api/test/prompts.test.ts` if no prompt tests exist):

```ts
import { describe, it, expect } from 'vitest';
import { buildPrompt } from '../src/_shared/prompts.js';
import { lessonParams } from './helpers/fixtures.js';

describe('buildPrompt — templated languages', () => {
  it('mentions target-language name in system message', () => {
    const { system } = buildPrompt(lessonParams({ targetLang: 'es', nativeLang: 'en' }));
    expect(system).toMatch(/Spanish/);
    expect(system).not.toMatch(/Greek/);
  });

  it('mentions native-language name in system message', () => {
    const { system } = buildPrompt(lessonParams({ targetLang: 'el', nativeLang: 'ru' }));
    expect(system).toMatch(/Russian/);
  });

  it('output-format uses target-lang uppercase tag for the second column', () => {
    const { user } = buildPrompt(lessonParams({ targetLang: 'it', nativeLang: 'en' }));
    expect(user).toMatch(/ITALIAN_SENTENCE\|\|ENGLISH_SENTENCE/);
  });
});
```

- [ ] **Step 3: Run tests to verify failures**

```bash
npm run test --workspace @echolingo/api 2>&1 | grep -A2 "buildPrompt"
```

Expected: the new assertions fail because the system message still says "Greek" and the output-format line still says `GREEK||...`.

- [ ] **Step 4: Rewrite `src/api/src/_shared/prompts.ts`**

Replace the entire file with:

```ts
import { LANG_NAME, type LessonParams, type LessonStyle, type LessonLevel } from './types.js';

const WORDS_PER_MINUTE = 130;

const LEVEL_DESCRIPTOR: Record<LessonLevel, string> = {
  1: 'level 1 (beginner — very simple vocabulary, short present-tense sentences)',
  2: 'level 2 (high beginner — common vocabulary, simple past/present, short sentences)',
  3: 'level 3 (intermediate — everyday vocabulary, common tenses, natural sentence length)',
  4: 'level 4 (upper-intermediate — richer vocabulary, varied tenses and subordination)',
  5: 'level 5 (advanced — idiomatic vocabulary, complex grammar, long varied sentences)',
};

const STYLE_INSTRUCTION: Record<LessonStyle, string> = {
  mono: 'Write a single-narrator monologue (essay-like) on the topic.',
  dialogue:
    'Write a natural dialogue between two named speakers on the topic. Prefix each line with the speaker name and a colon, e.g. "Maria: ...".',
  story: 'Write a short narrative story on the topic with a clear setting and small plot.',
};

export interface BuiltPrompt {
  system: string;
  user: string;
}

export function buildPrompt(params: LessonParams): BuiltPrompt {
  const targetWords = Math.round(params.lengthMin * WORDS_PER_MINUTE);
  const targetName = LANG_NAME[params.targetLang];
  const nativeName = LANG_NAME[params.nativeLang];
  const level = LEVEL_DESCRIPTOR[params.level];
  const styleInstruction = STYLE_INSTRUCTION[params.style];

  const system =
    `You are a ${targetName} language tutor producing bilingual listening lessons. ` +
    `You write idiomatic ${targetName} and provide accurate ${nativeName} translations.`;

  const user = [
    `Topic: ${params.topic}`,
    `Target length: approximately ${targetWords} words of spoken ${targetName}.`,
    `${targetName} difficulty: ${level}.`,
    styleInstruction,
    '',
    'OUTPUT FORMAT (strict):',
    `- One line per sentence pair, in the form: ${targetName.toUpperCase()}_SENTENCE||${nativeName.toUpperCase()}_SENTENCE`,
    '- Separator is exactly two pipe characters: ||',
    '- Do not number the lines.',
    '- Do not output anything outside the pairs (no headings, no commentary).',
    '- Translations must be accurate, natural, and complete — not literal word-for-word.',
    `- Each ${targetName} sentence should be one sentence (not a paragraph). Split long ideas into multiple pairs.`,
  ].join('\n');

  return { system, user };
}
```

- [ ] **Step 5: Update any pre-existing prompt tests that still assert "Greek"**

```bash
grep -rn "Greek language tutor\|GREEK_SENTENCE\|GREEK||" src/api/test
```

For each match in `<prompt-test-file>`, either update the assertion to match the templated output (e.g. expect `Greek` only when fixture uses `targetLang: 'el'` — which is the default in `lessonParams()`), or rewrite the test to be parameterized.

- [ ] **Step 6: Run all api tests**

```bash
npm run test --workspace @echolingo/api
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src/api
git commit -m "feat(api): template prompt by target/native language"
```

---

## Phase 3 — Form & home page

### Task 5: `usePrefs` — multi-language defaults + storage migration

**Files:**
- Modify: `src/web/hooks/use-prefs.ts`
- Modify: `src/web/hooks/use-prefs.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `src/web/hooks/use-prefs.test.ts`:

```ts
describe('multi-language prefs', () => {
  function memStorage(): PrefsStorage {
    const m: Record<string, string> = {};
    return {
      getItem: (k) => m[k] ?? null,
      setItem: (k, v) => {
        m[k] = v;
      },
    };
  }

  it('defaults targetLang to el and nativeLang to en', () => {
    const s = memStorage();
    const loaded = loadPrefs(s);
    expect(loaded.targetLang).toBe('el');
    expect(loaded.nativeLang).toBe('en');
    expect(loaded.mode).toBe('bilingual');
    expect(loaded.bilingualOrder).toBe('target_first');
  });

  it('falls back to defaults when stored values are unknown', () => {
    const s = memStorage();
    s.setItem(
      'echolingo:prefs',
      JSON.stringify({ targetLang: 'xx', nativeLang: 'yy', mode: 'greek_only', bilingualOrder: 'gr_first' }),
    );
    const loaded = loadPrefs(s);
    expect(loaded.targetLang).toBe('el');
    expect(loaded.nativeLang).toBe('en');
    expect(loaded.mode).toBe('bilingual');
    expect(loaded.bilingualOrder).toBe('target_first');
  });

  it('round-trips a valid Spanish-target preference', () => {
    const s = memStorage();
    savePrefs(s, {
      ...DEFAULT_PREFS,
      targetLang: 'es',
      nativeLang: 'en',
    });
    expect(loadPrefs(s).targetLang).toBe('es');
  });
});
```

The test file likely already imports `loadPrefs`, `savePrefs`, `DEFAULT_PREFS`, and `PrefsStorage`. If not, add them to the existing imports.

- [ ] **Step 2: Run tests to confirm failures**

```bash
npm run test --workspace @echolingo/web
```

Expected: failures referring to `targetLang` and the new value renames.

- [ ] **Step 3: Update `src/web/hooks/use-prefs.ts`**

Replace the entire file with:

```ts
'use client';

import { useEffect, useState } from 'react';
import {
  LESSON_LENGTHS,
  LESSON_STYLES,
  LESSON_MODES,
  BILINGUAL_ORDERS,
  LANG_CODES,
  type BilingualOrder,
  type LangCode,
  type LessonLength,
  type LessonLevel,
  type LessonMode,
  type LessonStyle,
} from '@echolingo/shared/types';

export interface FormPrefs {
  topic: string;
  targetLang: LangCode;
  nativeLang: LangCode;
  lengthMin: LessonLength;
  level: LessonLevel;
  style: LessonStyle;
  mode: LessonMode;
  bilingualOrder: BilingualOrder;
}

export const DEFAULT_PREFS: FormPrefs = {
  topic: '',
  targetLang: 'el',
  nativeLang: 'en',
  lengthMin: 5,
  level: 3,
  style: 'dialogue',
  mode: 'bilingual',
  bilingualOrder: 'target_first',
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
  const pickLang = (v: unknown, fallback: LangCode): LangCode =>
    LANG_CODES.includes(v as LangCode) ? (v as LangCode) : fallback;

  const targetLang = pickLang(parsed.targetLang, DEFAULT_PREFS.targetLang);
  let nativeLang = pickLang(parsed.nativeLang, DEFAULT_PREFS.nativeLang);
  if (nativeLang === targetLang) {
    nativeLang = targetLang === 'en' ? 'ru' : 'en';
  }

  return {
    topic: DEFAULT_PREFS.topic,
    targetLang,
    nativeLang,
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

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm run test --workspace @echolingo/web
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/web/hooks/use-prefs.ts src/web/hooks/use-prefs.test.ts
git commit -m "feat(web): usePrefs targetLang default + storage validation"
```

---

### Task 6: Lesson form — structural rebuild (multi-lang + pill toggles)

This task rebuilds the form structurally with the new language pickers and pill toggles. Styling is deferred to Task 7.

**Files:**
- Modify: `src/web/components/lesson-form.tsx`
- Modify: `src/web/lib/api.test.ts` (params fixtures)

- [ ] **Step 1: Update `src/web/lib/api.test.ts` fixtures**

Open the file; find the `params` constant near the top. Replace it with:

```ts
const params: LessonParams = {
  topic: 'cafe',
  targetLang: 'el',
  nativeLang: 'en',
  lengthMin: 5,
  level: 3,
  style: 'dialogue',
  mode: 'bilingual',
  bilingualOrder: 'target_first',
  ttsEngine: 'openai',
};
```

- [ ] **Step 2: Replace `src/web/components/lesson-form.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePrefs, type FormPrefs } from '../hooks/use-prefs';
import { createLesson } from '../lib/api';
import {
  LESSON_LENGTHS,
  LESSON_STYLES,
  LESSON_MODES,
  BILINGUAL_ORDERS,
  LANG_CODES,
  LANG_NAME,
  type LangCode,
  type LessonParams,
  type LessonLength,
  type LessonLevel,
  type LessonStyle,
  type LessonMode,
  type BilingualOrder,
} from '@echolingo/shared/types';

type Status =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'rate_limited'; limit: number; used: number; resetAt: string }
  | { kind: 'error'; message: string };

const TARGET_LANGS: LangCode[] = ['el', 'es', 'it', 'fr', 'de', 'pt', 'ja', 'zh'];
const NATIVE_LANG_OPTIONS: LangCode[] = ['en', 'ru', 'es', 'fr', 'de', 'pt', 'ja', 'zh'];

export function LessonForm() {
  const router = useRouter();
  const [prefs, setPrefs] = usePrefs();
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [nativePopoverOpen, setNativePopoverOpen] = useState(false);

  function update<K extends keyof FormPrefs>(key: K, value: FormPrefs[K]) {
    setPrefs({ ...prefs, [key]: value });
  }

  function pickTarget(code: LangCode) {
    let nextNative = prefs.nativeLang;
    if (nextNative === code) {
      nextNative = code === 'en' ? 'ru' : 'en';
    }
    setPrefs({ ...prefs, targetLang: code, nativeLang: nextNative });
  }

  function pickNative(code: LangCode) {
    if (code === prefs.targetLang) return;
    setPrefs({ ...prefs, nativeLang: code });
    setNativePopoverOpen(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!prefs.topic.trim()) return;
    setStatus({ kind: 'submitting' });
    const params: LessonParams = {
      topic: prefs.topic.trim(),
      targetLang: prefs.targetLang,
      nativeLang: prefs.nativeLang,
      lengthMin: prefs.lengthMin,
      level: prefs.level,
      style: prefs.style,
      mode: prefs.mode,
      bilingualOrder: prefs.bilingualOrder,
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
    <form onSubmit={submit} className="space-y-6">
      <input
        type="text"
        required
        value={prefs.topic}
        onChange={(e) => update('topic', e.target.value)}
        placeholder="at the bakery"
        className="block w-full border-0 border-b border-hairline bg-transparent px-0 py-2 font-serif text-2xl text-ink placeholder:text-ink-faint focus:border-aegean focus:outline-none focus:ring-0"
      />

      <Field label="LEARN">
        <ChipRow>
          {TARGET_LANGS.map((code) => (
            <Chip
              key={code}
              active={prefs.targetLang === code}
              onClick={() => pickTarget(code)}
            >
              {LANG_NAME[code].toLowerCase()}
            </Chip>
          ))}
        </ChipRow>
      </Field>

      <Field label="LENGTH">
        <ChipRow>
          {LESSON_LENGTHS.map((m) => (
            <Chip
              key={m}
              active={prefs.lengthMin === m}
              onClick={() => update('lengthMin', m as LessonLength)}
            >
              {m} min
            </Chip>
          ))}
        </ChipRow>
      </Field>

      <Field label={`LEVEL ${prefs.level}`}>
        <input
          type="range"
          min={1}
          max={5}
          step={1}
          value={prefs.level}
          onChange={(e) => update('level', Number(e.target.value) as LessonLevel)}
          className="block w-full accent-aegean"
        />
      </Field>

      <Field label="STYLE">
        <ChipRow>
          {LESSON_STYLES.map((s) => (
            <Chip
              key={s}
              active={prefs.style === s}
              onClick={() => update('style', s as LessonStyle)}
            >
              {s}
            </Chip>
          ))}
        </ChipRow>
      </Field>

      <Field label="MODE">
        <ChipRow>
          {LESSON_MODES.map((m) => (
            <Chip
              key={m}
              active={prefs.mode === m}
              onClick={() => update('mode', m as LessonMode)}
            >
              {m === 'target_only' ? 'target only' : 'bilingual'}
            </Chip>
          ))}
        </ChipRow>
      </Field>

      {prefs.mode === 'bilingual' && (
        <div className="flex items-center gap-2 text-sm text-ink-muted">
          <button
            type="button"
            onClick={() =>
              update(
                'bilingualOrder',
                (prefs.bilingualOrder === 'target_first'
                  ? 'native_first'
                  : 'target_first') as BilingualOrder,
              )
            }
            className="underline-offset-4 hover:underline"
          >
            {prefs.bilingualOrder === 'target_first' ? 'target first' : 'native first'}
          </button>
          <span>↔</span>
          <button
            type="button"
            onClick={() => setNativePopoverOpen((v) => !v)}
            className="underline-offset-4 hover:underline"
            aria-haspopup="listbox"
            aria-expanded={nativePopoverOpen}
          >
            {LANG_NAME[prefs.nativeLang].toLowerCase()}
          </button>
          {nativePopoverOpen && (
            <ul role="listbox" className="ml-2 flex flex-wrap gap-1">
              {NATIVE_LANG_OPTIONS.filter((c) => c !== prefs.targetLang).map((code) => (
                <li key={code}>
                  <button
                    type="button"
                    onClick={() => pickNative(code)}
                    className={
                      'rounded-full border border-hairline px-2 py-0.5 text-xs ' +
                      (prefs.nativeLang === code
                        ? 'bg-ink text-paper'
                        : 'bg-surface text-ink')
                    }
                  >
                    {LANG_NAME[code].toLowerCase()}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="flex flex-col items-center gap-3">
        <button
          type="submit"
          disabled={status.kind === 'submitting' || !prefs.topic.trim()}
          className="rounded-full bg-terracotta px-12 py-3 font-medium text-white shadow-sm disabled:opacity-60"
        >
          {status.kind === 'submitting' ? 'generating…' : 'go'}
        </button>

        {status.kind === 'rate_limited' && (
          <p className="border-l-2 border-terracotta bg-paper px-3 py-2 text-sm text-ink-muted">
            Daily limit reached ({status.used}/{status.limit}). Resets at {status.resetAt}.
          </p>
        )}
        {status.kind === 'error' && (
          <p className="border-l-2 border-terracotta bg-paper px-3 py-2 text-sm text-ink-muted">
            Error: {status.message}
          </p>
        )}
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wider text-ink-muted">{label}</p>
      {children}
    </div>
  );
}

function ChipRow({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-2">{children}</div>;
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'rounded-full border px-3 py-1.5 text-sm transition-colors ' +
        (active
          ? 'border-ink bg-ink text-paper'
          : 'border-hairline bg-surface text-ink hover:border-ink')
      }
    >
      {children}
    </button>
  );
}
```

- [ ] **Step 3: Run tests**

```bash
npm run test --workspace @echolingo/web
npm run typecheck --workspace @echolingo/web
```

Expected: all pass.

- [ ] **Step 4: Visually verify in the browser**

With dev server running at `http://localhost:3000/`:

1. Take a fresh screenshot (use chromedevtools MCP `navigate_page` + `take_screenshot`).
2. Confirm: target-lang chips appear ("greek / spanish / italian / ..."), pill toggles render for style and mode (no native selects), bilingual row reads e.g. "target first ↔ english", Go button is terracotta.
3. Click through: switching mode hides the bilingual row, switching target lang to one matching native should auto-flip native.

- [ ] **Step 5: Commit**

```bash
git add src/web/components/lesson-form.tsx src/web/lib/api.test.ts
git commit -m "feat(web): lesson form — target-lang chips, pill toggles, native popover"
```

---

### Task 7: Home page hero typography

**Files:**
- Modify: `src/web/app/page.tsx`

- [ ] **Step 1: Replace `src/web/app/page.tsx`**

```tsx
import { LessonForm } from '../components/lesson-form';

export default function HomePage() {
  return (
    <main className="mx-auto max-w-md px-5 py-10">
      <header className="mb-8 text-center">
        <h1 className="font-serif text-5xl lowercase tracking-tight text-ink">
          echolingo
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          listening lessons, on demand
        </p>
      </header>
      <LessonForm />
    </main>
  );
}
```

- [ ] **Step 2: Visually verify**

Reload `http://localhost:3000/`, take a screenshot. Confirm:

- Serif "echolingo" displays in lowercase, large
- Tagline reads "listening lessons, on demand"
- Form renders below the hero

- [ ] **Step 3: Commit**

```bash
git add src/web/app/page.tsx
git commit -m "feat(web): home page hero — serif echolingo, generic tagline"
```

---

## Phase 4 — Lesson page logic

### Task 8: `usePlayer.jumpToSentence` + cumulative duration helpers

**Files:**
- Modify: `src/web/hooks/use-player.ts`
- Create: `src/web/hooks/use-player.test.ts`
- Create: `src/web/hooks/playlist-math.ts`
- Create: `src/web/hooks/playlist-math.test.ts`

We extract scrubber math into a pure module so it's unit-testable without React.

- [ ] **Step 1: Write failing tests for `playlist-math.ts`**

Create `src/web/hooks/playlist-math.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { PlaylistEntry } from '@echolingo/shared/types';
import {
  cumulativeDurations,
  elapsedAtChunk,
  totalDuration,
  chunkAtElapsed,
  firstChunkOfSentence,
} from './playlist-math.js';

function entry(i: number, lang: 'gr' | 'native', dur: number): PlaylistEntry {
  return { sentenceIndex: i, lang, url: `u${i}-${lang}`, durationSec: dur };
}

const PL: PlaylistEntry[] = [
  entry(0, 'gr', 4),
  entry(0, 'native', 3),
  entry(1, 'gr', 5),
  entry(1, 'native', 4),
  entry(2, 'gr', 2),
];

describe('playlist-math', () => {
  it('cumulativeDurations returns running totals starting at 0', () => {
    expect(cumulativeDurations(PL)).toEqual([0, 4, 7, 12, 16]);
  });

  it('totalDuration sums all chunk durations', () => {
    expect(totalDuration(PL)).toBe(18);
  });

  it('elapsedAtChunk returns the start time of a given chunk', () => {
    expect(elapsedAtChunk(PL, 0)).toBe(0);
    expect(elapsedAtChunk(PL, 2)).toBe(7);
    expect(elapsedAtChunk(PL, 4)).toBe(16);
  });

  it('chunkAtElapsed returns the chunk index containing the given time', () => {
    expect(chunkAtElapsed(PL, 0)).toBe(0);
    expect(chunkAtElapsed(PL, 3.9)).toBe(0);
    expect(chunkAtElapsed(PL, 4)).toBe(1);
    expect(chunkAtElapsed(PL, 12.5)).toBe(3);
    expect(chunkAtElapsed(PL, 100)).toBe(4);
  });

  it('firstChunkOfSentence returns the first chunk whose sentenceIndex matches', () => {
    expect(firstChunkOfSentence(PL, 0)).toBe(0);
    expect(firstChunkOfSentence(PL, 1)).toBe(2);
    expect(firstChunkOfSentence(PL, 2)).toBe(4);
    expect(firstChunkOfSentence(PL, 99)).toBe(-1);
  });
});
```

- [ ] **Step 2: Run tests to confirm failures**

```bash
npm run test --workspace @echolingo/web
```

Expected: module not found.

- [ ] **Step 3: Create `src/web/hooks/playlist-math.ts`**

```ts
import type { PlaylistEntry } from '@echolingo/shared/types';

export function cumulativeDurations(pl: PlaylistEntry[]): number[] {
  const out: number[] = [];
  let acc = 0;
  for (const e of pl) {
    out.push(acc);
    acc += e.durationSec;
  }
  return out;
}

export function totalDuration(pl: PlaylistEntry[]): number {
  return pl.reduce((sum, e) => sum + e.durationSec, 0);
}

export function elapsedAtChunk(pl: PlaylistEntry[], chunk: number): number {
  if (chunk <= 0) return 0;
  let acc = 0;
  for (let i = 0; i < chunk && i < pl.length; i++) {
    acc += pl[i]!.durationSec;
  }
  return acc;
}

export function chunkAtElapsed(pl: PlaylistEntry[], elapsedSec: number): number {
  if (pl.length === 0) return 0;
  let acc = 0;
  for (let i = 0; i < pl.length; i++) {
    acc += pl[i]!.durationSec;
    if (elapsedSec < acc) return i;
  }
  return pl.length - 1;
}

export function firstChunkOfSentence(pl: PlaylistEntry[], sentenceIdx: number): number {
  for (let i = 0; i < pl.length; i++) {
    if (pl[i]!.sentenceIndex === sentenceIdx) return i;
  }
  return -1;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm run test --workspace @echolingo/web
```

Expected: all pass.

- [ ] **Step 5: Add `jumpToSentence` to `usePlayer`**

In `src/web/hooks/use-player.ts`, modify the `PlayerControls` interface:

```ts
export interface PlayerControls {
  play(): void;
  pause(): void;
  toggle(): void;
  next(): void;
  prev(): void;
  repeatSentence(): void;
  jumpToSentence(sentenceIdx: number): void;
  setSpeed(rate: number): void;
}
```

Add the new control implementation alongside the existing `prev`/`next` callbacks (paste near them):

```ts
const jumpToSentence = useCallback(
  (sentenceIdx: number) => {
    const target = playlist.findIndex((e) => e.sentenceIndex === sentenceIdx);
    if (target >= 0) setCurrentChunk(target);
  },
  [playlist],
);
```

Include `jumpToSentence` in the returned `controls` object:

```ts
return {
  audioRef,
  state: { isPlaying, currentChunk, currentSentence, speed },
  controls: { play, pause, toggle, next, prev, repeatSentence, jumpToSentence, setSpeed },
};
```

- [ ] **Step 6: Run typecheck and tests**

```bash
npm run typecheck --workspace @echolingo/web
npm run test --workspace @echolingo/web
```

Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add src/web/hooks/playlist-math.ts src/web/hooks/playlist-math.test.ts src/web/hooks/use-player.ts
git commit -m "feat(web): jumpToSentence + playlist-math (cumulative/totalDuration/chunkAtElapsed)"
```

---

## Phase 5 — Lesson page UI

### Task 9: Scrubber component

**Files:**
- Create: `src/web/components/scrubber.tsx`

- [ ] **Step 1: Create the file**

```tsx
'use client';

import { useCallback } from 'react';

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function Scrubber({
  elapsedSec,
  totalSec,
  onSeek,
}: {
  elapsedSec: number;
  totalSec: number;
  onSeek: (sec: number) => void;
}) {
  const handle = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onSeek(Number(e.target.value));
    },
    [onSeek],
  );

  const safeTotal = Math.max(totalSec, 0.01);
  return (
    <div className="flex items-center gap-3 text-xs text-ink-muted">
      <input
        type="range"
        min={0}
        max={safeTotal}
        step={0.1}
        value={Math.min(elapsedSec, safeTotal)}
        onChange={handle}
        className="block flex-1 accent-aegean"
        aria-label="Lesson progress"
      />
      <span className="tabular-nums">
        {formatTime(elapsedSec)} / {formatTime(totalSec)}
      </span>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck --workspace @echolingo/web
```

Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add src/web/components/scrubber.tsx
git commit -m "feat(web): scrubber component"
```

---

### Task 10: Player controls — large buttons, scrubber integration, speed pills

**Files:**
- Modify: `src/web/components/player-controls.tsx`

- [ ] **Step 1: Replace `src/web/components/player-controls.tsx`**

```tsx
'use client';

import type { PlayerControls as Controls, PlayerState } from '../hooks/use-player';
import { Scrubber } from './scrubber';

const SPEEDS = [0.75, 1, 1.25] as const;

export function PlayerControlsView({
  state,
  controls,
  elapsedSec,
  totalSec,
  onSeek,
}: {
  state: PlayerState;
  controls: Controls;
  elapsedSec: number;
  totalSec: number;
  onSeek: (sec: number) => void;
}) {
  return (
    <div className="space-y-4">
      <Scrubber elapsedSec={elapsedSec} totalSec={totalSec} onSeek={onSeek} />

      <div className="flex items-center justify-center gap-4">
        <RoundButton onClick={controls.repeatSentence} size="lg" tone="terracotta" label="Repeat sentence">
          ↺
        </RoundButton>
        <RoundButton onClick={controls.prev} size="md" tone="surface" label="Previous sentence">
          ◀◀
        </RoundButton>
        <RoundButton
          onClick={controls.toggle}
          size="lg"
          tone="ink"
          label={state.isPlaying ? 'Pause' : 'Play'}
        >
          {state.isPlaying ? '❚❚' : '▶'}
        </RoundButton>
        <RoundButton onClick={controls.next} size="md" tone="surface" label="Next sentence">
          ▶▶
        </RoundButton>
      </div>

      <div className="flex items-center justify-center gap-1">
        {SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => controls.setSpeed(s)}
            className={
              'rounded-full px-3 py-1 text-xs transition-colors ' +
              (Math.abs(state.speed - s) < 0.01
                ? 'bg-ink text-paper'
                : 'bg-surface text-ink-muted hover:text-ink')
            }
          >
            {s}×
          </button>
        ))}
      </div>
    </div>
  );
}

function RoundButton({
  onClick,
  size,
  tone,
  label,
  children,
}: {
  onClick: () => void;
  size: 'md' | 'lg';
  tone: 'ink' | 'surface' | 'terracotta';
  label: string;
  children: React.ReactNode;
}) {
  const sizeCls = size === 'lg' ? 'h-14 w-14 text-lg' : 'h-12 w-12 text-base';
  const toneCls =
    tone === 'ink'
      ? 'bg-ink text-paper hover:opacity-90'
      : tone === 'terracotta'
        ? 'bg-terracotta text-white hover:opacity-90'
        : 'bg-surface text-ink border border-hairline hover:border-ink';
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`${sizeCls} ${toneCls} flex items-center justify-center rounded-full transition-opacity`}
    >
      {children}
    </button>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck --workspace @echolingo/web
```

Expected: errors at the call site of `PlayerControlsView` (in `lesson-client.tsx`) because the prop signature changed. Those are fixed in Task 11.

- [ ] **Step 3: Commit**

```bash
git add src/web/components/player-controls.tsx
git commit -m "feat(web): player controls — big circular buttons, scrubber integration, speed pills"
```

---

### Task 11: Transcript view — current/past/future + tap-to-jump + auto-scroll

**Files:**
- Modify: `src/web/components/transcript-view.tsx`

- [ ] **Step 1: Replace `src/web/components/transcript-view.tsx`**

```tsx
'use client';

import { useEffect, useRef } from 'react';
import type { Lesson, Sentence } from '@echolingo/shared/types';

export function TranscriptView({
  lesson,
  currentSentence,
  onJump,
}: {
  lesson: Lesson;
  currentSentence: number;
  onJump: (sentenceIdx: number) => void;
}) {
  const containerRef = useRef<HTMLOListElement | null>(null);
  const currentRef = useRef<HTMLLIElement | null>(null);
  const manualScrollUntil = useRef<number>(0);

  // Track manual scroll to pause auto-scroll briefly
  useEffect(() => {
    const c = containerRef.current;
    if (!c) return;
    const onWheel = () => {
      manualScrollUntil.current = Date.now() + 5000;
    };
    c.addEventListener('wheel', onWheel, { passive: true });
    c.addEventListener('touchmove', onWheel, { passive: true });
    return () => {
      c.removeEventListener('wheel', onWheel);
      c.removeEventListener('touchmove', onWheel);
    };
  }, []);

  // Auto-scroll current sentence to ~40% from top
  useEffect(() => {
    if (Date.now() < manualScrollUntil.current) return;
    const el = currentRef.current;
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [currentSentence]);

  return (
    <ol ref={containerRef} className="space-y-1 pb-32">
      {lesson.sentences.map((s) => (
        <SentenceRow
          key={s.i}
          sentence={s}
          isCurrent={s.i === currentSentence}
          showNative={lesson.params.mode === 'bilingual'}
          onJump={() => onJump(s.i)}
          rowRef={s.i === currentSentence ? currentRef : null}
        />
      ))}
    </ol>
  );
}

function SentenceRow({
  sentence,
  isCurrent,
  showNative,
  onJump,
  rowRef,
}: {
  sentence: Sentence;
  isCurrent: boolean;
  showNative: boolean;
  onJump: () => void;
  rowRef: React.RefObject<HTMLLIElement | null> | null;
}) {
  if (isCurrent) {
    return (
      <li
        ref={rowRef}
        className="relative cursor-pointer rounded-r-md bg-aegean-50 px-4 py-3"
        onClick={onJump}
      >
        <span aria-hidden className="absolute left-0 top-0 h-full w-1 rounded-l bg-aegean" />
        <p className="font-serif text-2xl leading-snug text-ink">{sentence.gr}</p>
        {showNative && (
          <p className="mt-1 text-base text-ink-muted">{sentence.native}</p>
        )}
        {sentence.status === 'failed' && (
          <p className="mt-1 text-xs text-terracotta">[skipped]</p>
        )}
      </li>
    );
  }
  return (
    <li
      ref={rowRef}
      onClick={onJump}
      className="cursor-pointer rounded-md px-4 py-1.5 transition-colors hover:bg-paper"
    >
      <p className="font-serif text-base text-ink-muted">{sentence.gr}</p>
      {showNative && (
        <p className="text-xs text-ink-faint">{sentence.native}</p>
      )}
      {sentence.status === 'failed' && (
        <p className="text-xs text-terracotta">[skipped]</p>
      )}
    </li>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck --workspace @echolingo/web
```

Expected: error at the call site of `TranscriptView` (in `lesson-client.tsx`) because `onJump` is now required. Fixed in Task 12.

- [ ] **Step 3: Commit**

```bash
git add src/web/components/transcript-view.tsx
git commit -m "feat(web): transcript — current-sentence rail, dimmed past/future, tap-to-jump, auto-scroll"
```

---

### Task 12: Lesson page layout — top bar, sticky controls, scrubber wiring

**Files:**
- Modify: `src/web/app/lesson/[id]/lesson-client.tsx`

- [ ] **Step 1: Replace `src/web/app/lesson/[id]/lesson-client.tsx`**

```tsx
'use client';

import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useRouter } from 'next/navigation';
import { useLesson } from '../../../hooks/use-lesson';
import { usePlayer } from '../../../hooks/use-player';
import { LessonProgress } from '../../../components/lesson-progress';
import { PlayerControlsView } from '../../../components/player-controls';
import { TranscriptView } from '../../../components/transcript-view';
import { buildPlaylist } from '@echolingo/shared/playlist';
import {
  cumulativeDurations,
  totalDuration,
  chunkAtElapsed,
} from '../../../hooks/playlist-math';

function readIdFromPath(): string {
  if (typeof window === 'undefined') return '';
  const parts = window.location.pathname.split('/').filter(Boolean);
  return parts[1] ?? '';
}

export function LessonClient() {
  const [id, setId] = useState('');
  useEffect(() => {
    setId(readIdFromPath());
  }, []);
  if (!id) {
    return <CenteredMessage>Loading…</CenteredMessage>;
  }
  return <LessonScreen id={id} />;
}

function LessonScreen({ id }: { id: string }) {
  const router = useRouter();
  const state = useLesson(id);
  const playlist = useMemo(
    () => (state.kind === 'ok' && state.lesson.status === 'ready' ? buildPlaylist(state.lesson) : []),
    [state],
  );
  const player = usePlayer(playlist);

  // Track audio currentTime for scrubber UI
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  useEffect(() => {
    const audio = player.audioRef.current;
    if (!audio) return;
    const onTime = () => setAudioCurrentTime(audio.currentTime);
    audio.addEventListener('timeupdate', onTime);
    return () => {
      audio.removeEventListener('timeupdate', onTime);
    };
  }, [player.audioRef]);

  const cum = useMemo(() => cumulativeDurations(playlist), [playlist]);
  const total = useMemo(() => totalDuration(playlist), [playlist]);
  const elapsedSec = (cum[player.state.currentChunk] ?? 0) + audioCurrentTime;

  function onSeek(sec: number) {
    const target = chunkAtElapsed(playlist, sec);
    const chunkStart = cum[target] ?? 0;
    const offsetInChunk = Math.max(0, sec - chunkStart);
    const sentenceIdx = playlist[target]?.sentenceIndex;
    if (sentenceIdx == null) return;
    player.controls.jumpToSentence(sentenceIdx);
    // Apply within-chunk offset on next tick after audio loads
    requestAnimationFrame(() => {
      const audio = player.audioRef.current;
      if (audio) audio.currentTime = offsetInChunk;
    });
  }

  if (state.kind === 'loading') {
    return <CenteredMessage>Loading…</CenteredMessage>;
  }
  if (state.kind === 'not_found') {
    return <CenteredMessage tone="error">Lesson not found.</CenteredMessage>;
  }
  if (state.kind === 'error') {
    return <CenteredMessage tone="error">Error: {state.message}</CenteredMessage>;
  }

  const { lesson } = state;
  const ready = lesson.status === 'ready';

  return (
    <div className="min-h-screen pb-40">
      <TopBar title={lesson.params.topic} onBack={() => router.push('/')} />

      <main className="mx-auto max-w-2xl px-4 py-6">
        {!ready && <LessonProgress lesson={lesson} />}

        {ready && (
          <>
            <audio ref={player.audioRef as RefObject<HTMLAudioElement>} preload="auto" />
            <TranscriptView
              lesson={lesson}
              currentSentence={player.state.currentSentence}
              onJump={player.controls.jumpToSentence}
            />
          </>
        )}
      </main>

      {ready && (
        <div className="fixed inset-x-0 bottom-0 z-10 border-t border-hairline bg-paper/95 backdrop-blur px-4 py-4">
          <div className="mx-auto max-w-2xl">
            <PlayerControlsView
              state={player.state}
              controls={player.controls}
              elapsedSec={elapsedSec}
              totalSec={total}
              onSeek={onSeek}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function TopBar({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <header className="sticky top-0 z-10 flex h-12 items-center border-b border-hairline bg-paper/95 px-3 backdrop-blur">
      <button
        type="button"
        onClick={onBack}
        className="rounded p-1 text-ink-muted hover:text-ink"
        aria-label="Back"
      >
        ←
      </button>
      <h1 className="mx-auto max-w-[60%] truncate text-sm font-medium text-ink">{title}</h1>
      <span className="w-7" aria-hidden />
    </header>
  );
}

function CenteredMessage({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone?: 'error';
}) {
  return (
    <main className={`mx-auto max-w-md px-4 py-8 ${tone === 'error' ? 'text-terracotta' : 'text-ink-muted'}`}>
      {children}
    </main>
  );
}
```

- [ ] **Step 2: Typecheck and test**

```bash
npm run typecheck --workspace @echolingo/web
npm run test --workspace @echolingo/web
```

Expected: all pass.

- [ ] **Step 3: Visually verify**

1. Generate a fresh lesson locally (use the form). Wait for `status:"ready"`.
2. Navigate to the lesson page; take a screenshot.
3. Confirm: top bar with topic, current sentence dominant with aegean rail, past/future muted, big round play/repeat/prev/next buttons fixed at bottom, scrubber with time display, speed pills.
4. Tap a non-current sentence — playback should jump to it. Tap the scrubber — playback should seek.

- [ ] **Step 4: Commit**

```bash
git add src/web/app/lesson/[id]/lesson-client.tsx
git commit -m "feat(web): lesson page layout — top bar, sticky controls, scrubber wiring"
```

---

### Task 13: Generating state — fade-in transcript + hairline progress

**Files:**
- Modify: `src/web/components/lesson-progress.tsx`

- [ ] **Step 1: Replace `src/web/components/lesson-progress.tsx`**

```tsx
'use client';

import type { Lesson } from '@echolingo/shared/types';

export function LessonProgress({ lesson }: { lesson: Lesson }) {
  const { status, readySentences, totalSentences, sentences, params } = lesson;
  const pct = totalSentences > 0 ? Math.round((readySentences / totalSentences) * 100) : 0;

  if (status === 'failed') {
    return (
      <div className="border-l-2 border-terracotta bg-paper px-4 py-3 text-sm text-ink-muted">
        Generation failed. {lesson.error}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="h-px w-full bg-hairline">
        <div
          className="h-full bg-aegean transition-all duration-300"
          style={{ width: `${pct}%` }}
          aria-label={`${readySentences} of ${totalSentences} sentences ready`}
        />
      </div>

      <p className="text-xs uppercase tracking-wider text-ink-muted">
        {status === 'generating_script' ? 'writing script…' : `${readySentences} / ${totalSentences} ready`}
      </p>

      <ol className="space-y-1">
        {sentences.map((s) => (
          <li
            key={s.i}
            className="px-1 py-1 transition-opacity duration-300"
            style={{ opacity: s.status === 'ready' ? 1 : 0.3 }}
          >
            <p className="font-serif text-base text-ink">{s.gr}</p>
            {params.mode === 'bilingual' && (
              <p className="text-xs text-ink-muted">{s.native}</p>
            )}
            {s.status === 'failed' && (
              <p className="text-xs text-terracotta">[skipped]</p>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck and test**

```bash
npm run typecheck --workspace @echolingo/web
npm run test --workspace @echolingo/web
```

Expected: pass.

- [ ] **Step 3: Visually verify**

1. Generate a fresh lesson. While it's generating, take a screenshot of the lesson page.
2. Confirm: hairline progress bar at top, transcript appearing with sentences fading in as their audio becomes ready, no spinner.

- [ ] **Step 4: Commit**

```bash
git add src/web/components/lesson-progress.tsx
git commit -m "feat(web): generating state — fade-in transcript + hairline progress"
```

---

### Task 14: Final visual verification

This task is a verification gate, not a code change. Run before merging.

- [ ] **Step 1: Run all tests + typecheck**

```bash
npm run test
npm run typecheck --workspace @echolingo/web
npm run typecheck --workspace @echolingo/api
```

Expected: all pass.

- [ ] **Step 2: Visual end-to-end smoke**

With dev API + Azurite + dev web all running:

1. Open `http://localhost:3000/` — take screenshot, confirm new home design.
2. Submit a lesson (any target + native combo).
3. While generating — take screenshot of the lesson page, confirm fade-in transcript + hairline progress.
4. Once ready — take screenshot, confirm sticky bottom controls, aegean rail on current sentence, scrubber.
5. Tap a non-current sentence — confirm playback jumps. Drag the scrubber — confirm playback seeks.
6. Switch to greek_only mode and a non-en native, generate another lesson, smoke-test.

- [ ] **Step 3: Deploy preview (optional but recommended)**

```bash
npm run build --workspace @echolingo/web
```

Expected: clean static export build.

- [ ] **Step 4: Commit a no-op note if any small fixes surfaced; otherwise this task produces no commit.**

---

## Notes

- **Phase-ordering rationale:** schema first means the form rebuild only happens once; doing visual first would force a second form rebuild when multi-language landed.
- **No `Sentence.gr`/`Sentence.native` rename:** explicitly out of scope per the spec. Field meaning is target-language audio + native-language audio regardless of name.
- **Cache invalidation:** adding `targetLang` to `LessonParams` changes hash output for all params. Existing cached lessons become orphaned via POST but remain reachable via direct GET. No migration in this plan.
- **No tests for visual styling:** screenshots + manual verification are the testing strategy for UI presentation. Logic (types, prefs, prompts, playlist-math, jumpToSentence) is unit-tested.
- **Deferred from this plan (follow-up):** the `⋯` top-bar menu (Download MP3 / Copy link / Regenerate). The simplified `TopBar` in Task 12 has back + title only. The download endpoint already works server-side — surfacing it in a menu is a small, isolated follow-up task that doesn't depend on the redesign foundation.
