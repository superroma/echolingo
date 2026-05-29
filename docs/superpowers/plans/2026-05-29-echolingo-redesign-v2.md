# Echolingo Redesign v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recreate the high-fidelity design handoff (home/create, player, shared-link landing, generating) inside the existing Next.js PWA, adding CSS-variable theming (auto light/dark + toggle), Literata/IBM Plex Sans fonts, and 6-level CEFR.

**Architecture:** Tailwind colors are rewired to CSS custom properties so existing utilities become theme-aware; two token blocks (`.theme-light` / `.theme-dark`) plus a `prefers-color-scheme` default drive appearance, with an explicit override persisted to `localStorage` and applied pre-paint. Levels become 1–6 CEFR end-to-end (shared types → API prompt → web). The player becomes a flex column (sticky bar / scrollable transcript / fixed transport) with ported inline-SVG controls and resume-position persistence.

**Tech Stack:** TypeScript, Next.js 15 (app router, static export), React 18, Tailwind CSS, vitest + Testing Library, Playwright, Azure Functions (API), npm workspaces.

**Design reference:** `tmp/design_handoff_echolingo/` — `styles.css` is the canonical visual spec; `README.md` documents intent. The prototype's `ios-frame.jsx` and `tweaks-panel.jsx` are NOT ported.

**Spec:** `docs/superpowers/specs/2026-05-29-echolingo-redesign-v2-design.md`

**Conventions for the implementer:**
- Use Read/Edit/Grep tools, not `sed`/`cat`/`grep` via Bash.
- `npm` workspace names: `@echolingo/shared`, `@echolingo/web`, `@echolingo/api`.
- Run a single web test file: `npm run test --workspace @echolingo/web -- <path>`.
- Run all web tests: `npm run test --workspace @echolingo/web`.
- Run shared/api tests: `npm run test --workspace @echolingo/shared` / `@echolingo/api`.
- Typecheck web: `npm run build --workspace @echolingo/shared && npx tsc -p src/web/tsconfig.json --noEmit`.
- e2e: `npm run test:e2e` (requires azurite + api + web running; see README).
- Commit after every task with the message shown.

---

## File Structure

**Phase 1 — Foundation**
- Modify `src/shared/src/types.ts` — add level 6, `CEFR_LABEL`, `cefr()`.
- Modify `src/api/src/_shared/types.ts` — mirror the shared change (the API keeps its own copy).
- Modify `src/api/src/_shared/prompts.ts` — `LEVEL_DESCRIPTOR` keys 1–6 as CEFR bands.
- Modify `src/web/hooks/use-echoes.ts` — `isEcho` level `<= 6`.
- Modify `src/web/hooks/use-prefs.ts` — level validation `<= 6`.
- Modify `src/web/tailwind.config.ts` — colors → `var(--…)`; add tokens.
- Modify `src/web/app/globals.css` — token blocks + `prefers-color-scheme`.
- Modify `src/web/app/layout.tsx` — fonts + pre-paint theme script.
- Create `src/web/hooks/use-theme.ts` + `use-theme.test.ts` — effective theme + toggle.

**Phase 2 — Home / create**
- Create `src/web/components/icons.tsx` — inline SVG glyphs.
- Create `src/web/components/select.tsx` + `select.test.tsx` — language dropdown.
- Modify `src/web/components/app-bar.tsx` — wordmark dot, conditional `+ new`, theme toggle.
- Modify `src/web/components/create-echo-form.tsx` — topic textarea, chips, Select, pills, CEFR slider, go.
- Modify `src/web/components/echoes-list.tsx` — row redesign + progress ring + CEFR meta.
- Modify `src/web/components/home-client.tsx` — first-run hero/chips vs compact.

**Phase 3 — Player**
- Modify `src/web/hooks/use-player.ts` + `use-player.test.ts` (new) — position/speed persistence.
- Modify `src/web/components/scrubber.tsx` — custom track/knob.
- Modify `src/web/components/player-controls.tsx` — icon controls + translation toggle.
- Modify `src/web/components/transcript-view.tsx` — tint/bar/dimming + `showNative` prop.
- Modify `src/web/components/echo-client.tsx` — flex layout, generating restyle.
- Modify `src/web/components/echo-progress.tsx` — generating restyle.

**Phase 4 — Shared-link landing**
- Modify `src/web/components/echo-client.tsx` — `shared` detection + strips/card.
- Create `src/web/components/share-affordances.tsx` — context strip + conversion card.
- Modify `tests/e2e/*` — selector updates + shared scenario.

---

# PHASE 1 — Foundation (theming, fonts, CEFR)

### Task 1: CEFR levels in shared types

**Files:**
- Modify: `src/shared/src/types.ts:24-25` (LESSON_LEVELS) and add helpers
- Test: `src/shared/src/types.test.ts` (create if absent)

- [ ] **Step 1: Write the failing test**

Create or append to `src/shared/src/types.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  LESSON_LEVELS,
  CEFR_LABEL,
  cefr,
  isLessonParams,
  type LessonParams,
} from './types.js';

describe('CEFR levels', () => {
  it('has six levels 1..6', () => {
    expect(LESSON_LEVELS).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('maps each level to a CEFR band', () => {
    expect(CEFR_LABEL).toEqual({ 1: 'A1', 2: 'A2', 3: 'B1', 4: 'B2', 5: 'C1', 6: 'C2' });
  });

  it('cefr() returns the label, clamping out-of-range input', () => {
    expect(cefr(3)).toBe('B1');
    expect(cefr(6)).toBe('C2');
    expect(cefr(0 as never)).toBe('A1');
    expect(cefr(99 as never)).toBe('C2');
  });

  it('accepts level 6 in isLessonParams', () => {
    const params: LessonParams = {
      topic: 'at the bakery',
      targetLang: 'el',
      nativeLang: 'en',
      lengthMin: 5,
      level: 6,
      mode: 'bilingual',
      bilingualOrder: 'target_first',
      ttsEngine: 'openai',
    };
    expect(isLessonParams(params)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace @echolingo/shared`
Expected: FAIL — `CEFR_LABEL`/`cefr` not exported; `LESSON_LEVELS` is `[1,2,3,4,5]`.

- [ ] **Step 3: Implement**

In `src/shared/src/types.ts`, change the levels block:

```ts
export const LESSON_LEVELS = [1, 2, 3, 4, 5, 6] as const;
export type LessonLevel = (typeof LESSON_LEVELS)[number];

export const CEFR_LABEL: Record<LessonLevel, string> = {
  1: 'A1',
  2: 'A2',
  3: 'B1',
  4: 'B2',
  5: 'C1',
  6: 'C2',
};

/** CEFR band label for a level, clamping out-of-range input to the nearest end. */
export function cefr(level: number): string {
  const n = Math.min(6, Math.max(1, Math.round(level))) as LessonLevel;
  return CEFR_LABEL[n];
}
```

(`isLessonParams` is unchanged — it already gates on `LESSON_LEVELS.includes(...)`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace @echolingo/shared`
Expected: PASS.

- [ ] **Step 5: Build shared (downstream packages import the built output)**

Run: `npm run build --workspace @echolingo/shared`
Expected: clean build.

- [ ] **Step 6: Commit**

```bash
git add src/shared/src/types.ts src/shared/src/types.test.ts
git commit -m "feat(shared): 6-level CEFR (A1–C2) with cefr() helper"
```

---

### Task 2: API prompt + types mirror for level 6

**Files:**
- Modify: `src/api/src/_shared/types.ts` (mirror LESSON_LEVELS/CEFR — match shared)
- Modify: `src/api/src/_shared/prompts.ts:5-11` (LEVEL_DESCRIPTOR)
- Test: `src/api/test/prompts.test.ts`

> Note: the API keeps its own copy of the domain types under `_shared/`. Keep it byte-identical to `src/shared/src/types.ts` for the levels block (copy the same `LESSON_LEVELS`, `CEFR_LABEL`, `cefr`).

- [ ] **Step 1: Write the failing test**

Append to `src/api/test/prompts.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildPrompt } from '../src/_shared/prompts.js';
import type { LessonParams } from '../src/_shared/types.js';

const base: LessonParams = {
  topic: 'ordering coffee',
  targetLang: 'el',
  nativeLang: 'en',
  lengthMin: 5,
  level: 6,
  mode: 'bilingual',
  bilingualOrder: 'target_first',
  ttsEngine: 'openai',
};

describe('buildPrompt CEFR levels', () => {
  it('describes level 6 as CEFR C2', () => {
    const { user } = buildPrompt(base);
    expect(user).toMatch(/C2/);
  });

  it('describes level 1 as CEFR A1', () => {
    const { user } = buildPrompt({ ...base, level: 1 });
    expect(user).toMatch(/A1/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace @echolingo/api -- prompts`
Expected: FAIL — level 6 has no descriptor (`undefined`), no `C2` in output.

- [ ] **Step 3: Implement**

First mirror the levels block in `src/api/src/_shared/types.ts` exactly as in Task 1 (LESSON_LEVELS = `[1..6]`, `CEFR_LABEL`, `cefr`).

Then replace `LEVEL_DESCRIPTOR` in `src/api/src/_shared/prompts.ts`:

```ts
const LEVEL_DESCRIPTOR: Record<LessonLevel, string> = {
  1: 'CEFR A1 (beginner — very simple high-frequency vocabulary, short present-tense sentences)',
  2: 'CEFR A2 (elementary — common everyday vocabulary, simple past/present, short sentences)',
  3: 'CEFR B1 (intermediate — everyday vocabulary, common tenses, natural sentence length)',
  4: 'CEFR B2 (upper-intermediate — richer vocabulary, varied tenses and subordination)',
  5: 'CEFR C1 (advanced — idiomatic vocabulary, complex grammar, long varied sentences)',
  6: 'CEFR C2 (mastery — nuanced, idiomatic, sophisticated register and structure)',
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace @echolingo/api -- prompts`
Expected: PASS.

- [ ] **Step 5: Run the full API suite (guard against level-bound fixtures)**

Run: `npm run test --workspace @echolingo/api`
Expected: PASS. If any test hardcodes `level: 5` as "max" or asserts old "level N" wording, update it to the CEFR wording / a valid 1–6 value.

- [ ] **Step 6: Commit**

```bash
git add src/api/src/_shared/types.ts src/api/src/_shared/prompts.ts src/api/test/prompts.test.ts
git commit -m "feat(api): CEFR level descriptors (A1–C2)"
```

---

### Task 3: Web prefs + echoes accept level 6

**Files:**
- Modify: `src/web/hooks/use-prefs.ts:60-63`
- Modify: `src/web/hooks/use-echoes.ts:50-52`
- Test: `src/web/hooks/use-prefs.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/web/hooks/use-prefs.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { loadPrefs } from './use-prefs';

function storageWith(value: string) {
  return { getItem: () => value, setItem: () => {} };
}

describe('loadPrefs level range', () => {
  it('accepts level 6', () => {
    const prefs = loadPrefs(storageWith(JSON.stringify({ level: 6 })));
    expect(prefs.level).toBe(6);
  });

  it('rejects level 7 and falls back to default', () => {
    const prefs = loadPrefs(storageWith(JSON.stringify({ level: 7 })));
    expect(prefs.level).toBe(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace @echolingo/web -- use-prefs`
Expected: FAIL — level 6 rejected (current guard is `<= 5`).

- [ ] **Step 3: Implement**

In `src/web/hooks/use-prefs.ts`, change the level guard:

```ts
    level:
      typeof parsed.level === 'number' && parsed.level >= 1 && parsed.level <= 6
        ? (parsed.level as LessonLevel)
        : DEFAULT_PREFS.level,
```

In `src/web/hooks/use-echoes.ts`, change the `isEcho` level guard (line ~51):

```ts
    typeof o.level === 'number' &&
    o.level >= 1 &&
    o.level <= 6 &&
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace @echolingo/web -- use-prefs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/web/hooks/use-prefs.ts src/web/hooks/use-prefs.test.ts src/web/hooks/use-echoes.ts
git commit -m "feat(web): accept CEFR level 6 in prefs and echoes validation"
```

---

### Task 4: Tailwind colors → CSS variables + token blocks

**Files:**
- Modify: `src/web/tailwind.config.ts`
- Modify: `src/web/app/globals.css`

This task has no unit test (it is global CSS); verification is a successful production build plus a visual check in Task 5/Phase 2.

- [ ] **Step 1: Rewrite the Tailwind color map to reference CSS vars**

Replace the `colors` block in `src/web/tailwind.config.ts` with:

```ts
      colors: {
        paper: 'var(--paper)',
        'paper-2': 'var(--paper-2)',
        surface: 'var(--paper-2)',
        'paper-3': 'var(--paper-3)',
        ink: 'var(--ink)',
        'ink-soft': 'var(--ink-soft)',
        'ink-mute': 'var(--ink-mute)',
        // legacy aliases kept so untouched code compiles:
        'ink-muted': 'var(--ink-soft)',
        'ink-faint': 'var(--ink-mute)',
        line: 'var(--line)',
        hairline: 'var(--line)',
        'line-soft': 'var(--line-soft)',
        accent: 'var(--accent)',
        'accent-ink': 'var(--accent-ink)',
        aegean: 'var(--aegean)',
        'aegean-50': 'var(--aegean-tint)',
        'aegean-tint': 'var(--aegean-tint)',
        terracotta: 'var(--accent)',
      },
      borderRadius: {
        DEFAULT: 'var(--radius)',
        lg: 'var(--radius-lg)',
        pill: 'var(--radius-pill)',
      },
```

- [ ] **Step 2: Add the token blocks to globals.css**

Replace `src/web/app/globals.css` with:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root,
.theme-light {
  --paper: #f6f6f7;
  --paper-2: #ffffff;
  --paper-3: #ffffff;
  --ink: #121214;
  --ink-soft: #52525b;
  --ink-mute: #9a9aa3;
  --line: #e6e6ea;
  --line-soft: #efeff2;
  --accent: #f97316;
  --accent-ink: #ffffff;
  --aegean: var(--accent);
  --aegean-tint: #feeee3; /* mix(accent 12%, #fff) */
  --radius: 16px;
  --radius-lg: 22px;
  --radius-pill: 999px;
  --fs-scale: 1;
  --shadow-1: 0 1px 2px rgba(20, 20, 25, 0.04), 0 2px 8px rgba(20, 20, 25, 0.05);
  --shadow-2: 0 4px 14px rgba(20, 20, 25, 0.08), 0 1px 3px rgba(20, 20, 25, 0.05);
  --shadow-up: 0 -8px 24px rgba(20, 20, 25, 0.07);
}

.theme-dark {
  --paper: #0f0f11;
  --paper-2: #17171a;
  --paper-3: #202024;
  --ink: #f3f3f5;
  --ink-soft: #a6a6ae;
  --ink-mute: #6c6c75;
  --line: #2a2a30;
  --line-soft: #202024;
  --aegean-tint: #4d2d19; /* mix(accent 24%, #17171a) */
  --shadow-1: 0 1px 2px rgba(0, 0, 0, 0.3), 0 2px 8px rgba(0, 0, 0, 0.3);
  --shadow-2: 0 4px 14px rgba(0, 0, 0, 0.4), 0 1px 3px rgba(0, 0, 0, 0.3);
  --shadow-up: 0 -8px 24px rgba(0, 0, 0, 0.35);
}

/* Unset users follow the OS, unless an explicit .theme-light override is set. */
@media (prefers-color-scheme: dark) {
  :root:not(.theme-light):not(.theme-dark) {
    --paper: #0f0f11;
    --paper-2: #17171a;
    --paper-3: #202024;
    --ink: #f3f3f5;
    --ink-soft: #a6a6ae;
    --ink-mute: #6c6c75;
    --line: #2a2a30;
    --line-soft: #202024;
    --aegean-tint: #4d2d19;
    --shadow-1: 0 1px 2px rgba(0, 0, 0, 0.3), 0 2px 8px rgba(0, 0, 0, 0.3);
    --shadow-2: 0 4px 14px rgba(0, 0, 0, 0.4), 0 1px 3px rgba(0, 0, 0, 0.3);
    --shadow-up: 0 -8px 24px rgba(0, 0, 0, 0.35);
  }
}

@layer base {
  body {
    font-feature-settings: 'kern' 1, 'liga' 1, 'calt' 1;
  }

  input::placeholder,
  textarea::placeholder {
    @apply text-ink-mute;
  }
}
```

- [ ] **Step 3: Verify the web build succeeds**

Run: `npm run build --workspace @echolingo/web`
Expected: build completes; no "unknown utility class" errors.

- [ ] **Step 4: Commit**

```bash
git add src/web/tailwind.config.ts src/web/app/globals.css
git commit -m "feat(web): CSS-variable theming with light/dark token blocks"
```

---

### Task 5: Fonts + pre-paint theme script in layout

**Files:**
- Modify: `src/web/app/layout.tsx`

- [ ] **Step 1: Swap fonts and add the no-flash theme script**

Replace the imports and `RootLayout` in `src/web/app/layout.tsx`:

```tsx
import './globals.css';
import type { ReactNode } from 'react';
import Script from 'next/script';
import { IBM_Plex_Sans, Literata } from 'next/font/google';
import { InstallPanel } from '../components/install-panel';

const sans = IBM_Plex_Sans({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
});

const serif = Literata({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '600'],
  style: ['normal', 'italic'],
  variable: '--font-serif',
  display: 'swap',
});

export const metadata = {
  title: 'Echolingo',
  description: 'On-demand AI-generated listening echoes',
  manifest: '/manifest.webmanifest',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable}`}>
      <head>
        <Script id="theme-init" strategy="beforeInteractive">
          {`
            try {
              var t = localStorage.getItem('echolingo:theme');
              if (t === 'light' || t === 'dark') {
                document.documentElement.classList.add('theme-' + t);
              }
            } catch (e) {}
          `}
        </Script>
      </head>
      <body className="min-h-screen bg-paper font-sans text-ink antialiased">
        {children}
        <InstallPanel />
        <Script id="register-sw" strategy="afterInteractive">
          {`
            if ('serviceWorker' in navigator) {
              navigator.serviceWorker
                .register('/sw.js')
                .then((reg) => {
                  reg.update().catch(() => {});
                  let reloaded = false;
                  navigator.serviceWorker.addEventListener('controllerchange', () => {
                    if (reloaded) return;
                    reloaded = true;
                    window.location.reload();
                  });
                })
                .catch(() => {});
            }
          `}
        </Script>
      </body>
    </html>
  );
}
```

> Note: Greek glyphs come from the `latin` subset for IBM Plex Sans; Literata's Greek ships in its `latin`/`greek` subset. If the build errors that `greek` is an unknown subset for a family, drop `greek` and keep `['latin','cyrillic']` — Greek renders from the extended latin set. Do NOT add subsets the family doesn't expose.

- [ ] **Step 2: Verify the build**

Run: `npm run build --workspace @echolingo/web`
Expected: build succeeds and downloads the two Google fonts.

- [ ] **Step 3: Commit**

```bash
git add src/web/app/layout.tsx
git commit -m "feat(web): Literata + IBM Plex Sans fonts; pre-paint theme override"
```

---

### Task 6: useTheme hook

**Files:**
- Create: `src/web/hooks/use-theme.ts`
- Test: `src/web/hooks/use-theme.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/web/hooks/use-theme.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { resolveEffective, nextOverride } from './use-theme';

describe('resolveEffective', () => {
  it('follows the system when mode is auto', () => {
    expect(resolveEffective('auto', true)).toBe('dark');
    expect(resolveEffective('auto', false)).toBe('light');
  });
  it('honors an explicit override', () => {
    expect(resolveEffective('light', true)).toBe('light');
    expect(resolveEffective('dark', false)).toBe('dark');
  });
});

describe('nextOverride', () => {
  it('pins the opposite of the current effective theme', () => {
    // currently effective light -> tapping selects dark
    expect(nextOverride('light')).toBe('dark');
    expect(nextOverride('dark')).toBe('light');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace @echolingo/web -- use-theme`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/web/hooks/use-theme.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace @echolingo/web -- use-theme`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/web/hooks/use-theme.ts src/web/hooks/use-theme.test.ts
git commit -m "feat(web): useTheme — auto-follow OS with persisted light/dark toggle"
```

---

# PHASE 2 — Home / create

### Task 7: Inline SVG icon set

**Files:**
- Create: `src/web/components/icons.tsx`

Ported from `tmp/design_handoff_echolingo/icons.jsx` (cross-check exact paths there).

- [ ] **Step 1: Create the icon module**

Create `src/web/components/icons.tsx`:

```tsx
type IconProps = { size?: number; className?: string };

export function PlayIcon({ size = 26, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M8 5.5v13a1 1 0 0 0 1.5.87l11-6.5a1 1 0 0 0 0-1.74l-11-6.5A1 1 0 0 0 8 5.5Z" />
    </svg>
  );
}

export function PauseIcon({ size = 26, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <rect x="6.5" y="5" width="4" height="14" rx="1.3" />
      <rect x="13.5" y="5" width="4" height="14" rx="1.3" />
    </svg>
  );
}

export function PrevIcon({ size = 22, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M7 6a1 1 0 0 1 2 0v4.3l8.5-5a1 1 0 0 1 1.5.87v11.6a1 1 0 0 1-1.5.87L9 13.7V18a1 1 0 0 1-2 0V6Z" />
    </svg>
  );
}

export function NextIcon({ size = 22, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M17 6a1 1 0 0 0-2 0v4.3L6.5 5.3A1 1 0 0 0 5 6.17v11.6a1 1 0 0 0 1.5.87L15 13.7V18a1 1 0 0 0 2 0V6Z" />
    </svg>
  );
}

export function ChevronDownIcon({ size = 18, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

export function CheckIcon({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M5 12.5l4.5 4.5L19 6.5" />
    </svg>
  );
}

export function ArrowRightIcon({ size = 18, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M5 12h14" />
      <path d="M13 6l6 6-6 6" />
    </svg>
  );
}

export function SparkIcon({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M12 2.5l1.7 5.3a4 4 0 0 0 2.5 2.5L21.5 12l-5.3 1.7a4 4 0 0 0-2.5 2.5L12 21.5l-1.7-5.3a4 4 0 0 0-2.5-2.5L2.5 12l5.3-1.7a4 4 0 0 0 2.5-2.5L12 2.5Z" />
    </svg>
  );
}

export function SunIcon({ size = 20, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

export function MoonIcon({ size = 20, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
    </svg>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -p src/web/tsconfig.json --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/web/components/icons.tsx
git commit -m "feat(web): inline SVG icon set ported from handoff"
```

---

### Task 8: Language Select dropdown

**Files:**
- Create: `src/web/components/select.tsx`
- Test: `src/web/components/select.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/web/components/select.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LangSelect } from './select';

describe('LangSelect', () => {
  it('opens and selects a language', () => {
    const onChange = vi.fn();
    render(<LangSelect value="en" disabledValue="el" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /english/i }));
    fireEvent.click(screen.getByText('Spanish'));
    expect(onChange).toHaveBeenCalledWith('es');
  });

  it('does not fire onChange for the disabled (other-field) language', () => {
    const onChange = vi.fn();
    render(<LangSelect value="en" disabledValue="el" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /english/i }));
    fireEvent.click(screen.getByText('Greek'));
    expect(onChange).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace @echolingo/web -- select`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/web/components/select.tsx`:

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { LANG_CODES, LANG_NAME, type LangCode } from '@echolingo/shared/types';
import { ChevronDownIcon, CheckIcon } from './icons';

export function LangSelect({
  value,
  disabledValue,
  onChange,
}: {
  value: LangCode;
  disabledValue: LangCode;
  onChange: (c: LangCode) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-[54px] w-full items-center justify-between rounded-[16px] border border-line bg-paper-3 px-4 text-[17px] font-medium text-ink shadow-[var(--shadow-1)]"
      >
        <span>{LANG_NAME[value]}</span>
        <span className="flex text-ink-mute">
          <ChevronDownIcon size={18} />
        </span>
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-[60] max-h-[260px] overflow-y-auto rounded-[16px] border border-line bg-paper-3 p-1.5 shadow-[var(--shadow-2)]">
          {LANG_CODES.map((code) => {
            const isActive = code === value;
            const isDisabled = code === disabledValue;
            return (
              <div
                key={code}
                onClick={() => {
                  if (isDisabled) return;
                  onChange(code);
                  setOpen(false);
                }}
                className={
                  'flex cursor-pointer items-center justify-between rounded-[10px] px-3 py-[11px] text-base ' +
                  (isActive ? 'font-semibold text-accent ' : 'text-ink ') +
                  (isDisabled ? 'pointer-events-none opacity-50' : 'hover:bg-paper')
                }
              >
                <span>{LANG_NAME[code]}</span>
                {isActive && <CheckIcon size={16} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace @echolingo/web -- select`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/web/components/select.tsx src/web/components/select.test.tsx
git commit -m "feat(web): custom language Select with collision-disable"
```

---

### Task 9: AppBar — wordmark dot, conditional `+ new`, theme toggle

**Files:**
- Modify: `src/web/components/app-bar.tsx`
- Test: `src/web/components/app-bar.test.tsx` (create)

- [ ] **Step 1: Write the failing test**

Create `src/web/components/app-bar.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AppBar } from './app-bar';

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock('../hooks/use-theme', () => ({
  useTheme: () => ({ effective: 'light', toggle: vi.fn() }),
}));

describe('AppBar', () => {
  it('hides the + new action on the home surface', () => {
    render(<AppBar />);
    expect(screen.queryByText(/new/i)).toBeNull();
  });

  it('shows + new and a title when given them', () => {
    render(<AppBar title="at the bakery" showNew />);
    expect(screen.getByText(/new/i)).toBeTruthy();
    expect(screen.getByText('at the bakery')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace @echolingo/web -- app-bar`
Expected: FAIL — current AppBar always renders `+ new` and has no `showNew` prop.

- [ ] **Step 3: Implement**

Replace `src/web/components/app-bar.tsx`:

```tsx
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
      <Link href="/" aria-label="home" className="font-serif text-[21px] font-semibold leading-none tracking-[-0.01em] text-ink">
        echolingo<span className="text-accent">.</span>
      </Link>

      <div className="min-w-0">
        {title && (
          <div className="truncate text-center font-serif text-[17px] font-semibold text-ink">{title}</div>
        )}
      </div>

      <div className="flex items-center gap-1.5 justify-self-end">
        <button
          type="button"
          onClick={toggle}
          aria-label={effective === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          className="flex h-9 w-9 items-center justify-center rounded-full text-ink-soft hover:bg-paper-3"
        >
          {effective === 'dark' ? <SunIcon size={20} /> : <MoonIcon size={20} />}
        </button>
        {showNew && (
          <Link
            href="/echo/new"
            className="inline-flex h-10 items-center gap-1.5 rounded-pill bg-accent px-[18px] text-[15px] font-semibold text-accent-ink shadow-[var(--shadow-1)]"
          >
            <span className="text-[18px] leading-none">+</span> new
          </Link>
        )}
      </div>
    </header>
  );
}
```

> The player's `+ new` should route to `/` per the handoff (`onNew = goHome`). On the player screen pass `showNew` and the bar links to `/echo/new`; if you prefer the handoff's exact "+ new → home" behavior, change the player to render its own bar — but `/echo/new` is the create surface and is acceptable. Keep `/echo/new` for consistency with the rest of the app.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace @echolingo/web -- app-bar`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/web/components/app-bar.tsx src/web/components/app-bar.test.tsx
git commit -m "feat(web): AppBar with theme toggle, accent dot, optional + new"
```

---

### Task 10: CreateEchoForm redesign

**Files:**
- Modify: `src/web/components/create-echo-form.tsx`

This is a visual rebuild reusing existing prefs logic. Verification is typecheck + build + the existing form behavior (submit routes to `/echo/new?…`).

- [ ] **Step 1: Add suggestion constant and rebuild the form**

Replace `src/web/components/create-echo-form.tsx`:

```tsx
'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { usePrefs, type FormPrefs } from '../hooks/use-prefs';
import { LESSON_LENGTHS, cefr, type LangCode, type LessonLength, type LessonLevel } from '@echolingo/shared/types';
import { LangSelect } from './select';
import { ArrowRightIcon } from './icons';

const SUGGESTIONS = [
  'at the bakery',
  'ordering coffee',
  'checking into a hotel',
  'small talk with a neighbour',
  'at the pharmacy',
  'asking for directions',
];

const CEFR_TICKS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

export function CreateEchoForm({ showSuggestions = false }: { showSuggestions?: boolean }) {
  const router = useRouter();
  const [prefs, setPrefs] = usePrefs();
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  function autosize() {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${ta.scrollHeight}px`;
  }
  useEffect(autosize, [prefs.topic]);

  function update<K extends keyof FormPrefs>(key: K, value: FormPrefs[K]) {
    setPrefs({ ...prefs, [key]: value });
  }
  function pickNative(code: LangCode) {
    setPrefs({ ...prefs, nativeLang: code, targetLang: code === prefs.targetLang ? prefs.nativeLang : prefs.targetLang });
  }
  function pickTarget(code: LangCode) {
    setPrefs({ ...prefs, targetLang: code, nativeLang: code === prefs.nativeLang ? prefs.targetLang : prefs.nativeLang });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const topic = prefs.topic.trim();
    if (!topic) return;
    const q = new URLSearchParams({
      topic,
      targetLang: prefs.targetLang,
      nativeLang: prefs.nativeLang,
      lengthMin: String(prefs.lengthMin),
      level: String(prefs.level),
    });
    router.push(`/echo/new?${q.toString()}`);
  }

  const fillPct = ((prefs.level - 1) / (CEFR_TICKS.length - 1)) * 100;

  return (
    <form onSubmit={submit} className="space-y-[18px]">
      <textarea
        ref={taRef}
        rows={1}
        required
        value={prefs.topic}
        onChange={(e) => update('topic', e.target.value)}
        onInput={autosize}
        placeholder="at the bakery, ordering coffee, asking the barista what they recommend…"
        className="block w-full resize-none overflow-hidden border-0 bg-transparent p-0 font-serif text-[calc(30px*var(--fs-scale))] leading-[1.22] tracking-[-0.015em] text-ink outline-none placeholder:text-ink-mute"
      />

      {showSuggestions && (
        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => update('topic', s)}
              className="rounded-pill border border-line bg-paper-2 px-3.5 py-[9px] font-serif text-[15px] italic text-ink-soft"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="h-px bg-line" />

      <div className="grid grid-cols-2 items-end gap-3">
        <div>
          <Label>I speak</Label>
          <LangSelect value={prefs.nativeLang} disabledValue={prefs.targetLang} onChange={pickNative} />
        </div>
        <div>
          <Label>learning</Label>
          <LangSelect value={prefs.targetLang} disabledValue={prefs.nativeLang} onChange={pickTarget} />
        </div>
      </div>

      <div>
        <Label>length</Label>
        <div className="flex gap-[9px]">
          {LESSON_LENGTHS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => update('lengthMin', m as LessonLength)}
              className={
                'h-12 flex-1 rounded-pill text-[15px] font-semibold shadow-[var(--shadow-1)] transition ' +
                (prefs.lengthMin === m
                  ? 'border border-ink bg-ink text-paper-2'
                  : 'border border-line bg-paper-3 text-ink-soft')
              }
            >
              {m} min
            </button>
          ))}
        </div>
      </div>

      <div>
        <Label>level · {cefr(prefs.level)}</Label>
        <div className="relative">
          <input
            type="range"
            min={1}
            max={CEFR_TICKS.length}
            step={1}
            value={prefs.level}
            onChange={(e) => update('level', Number(e.target.value) as LessonLevel)}
            className="h-1.5 w-full cursor-pointer appearance-none rounded-full outline-none"
            style={{ background: `linear-gradient(to right, var(--accent) ${fillPct}%, var(--line) ${fillPct}%)` }}
          />
          <div className="mt-2.5 flex justify-between text-[12px] font-semibold tracking-[0.03em] text-ink-mute">
            {CEFR_TICKS.map((code, i) => (
              <span key={code} className={prefs.level === i + 1 ? 'text-accent' : undefined}>
                {code}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="flex justify-center py-1">
        <button
          type="submit"
          disabled={!prefs.topic.trim()}
          className="inline-flex h-[54px] items-center justify-center gap-2.5 rounded-pill bg-accent px-[30px] font-serif text-[19px] font-semibold text-accent-ink shadow-[0_6px_16px_color-mix(in_srgb,var(--accent)_34%,transparent)] transition disabled:opacity-40 disabled:shadow-none"
        >
          go <ArrowRightIcon size={18} />
        </button>
      </div>
    </form>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-2.5 block text-[12px] font-semibold uppercase tracking-[0.12em] text-ink-mute">
      {children}
    </span>
  );
}
```

> The range thumb uses the browser default; to match the handoff's 26px paper knob, add the `::-webkit-slider-thumb` / `::-moz-range-thumb` rules from `tmp/design_handoff_echolingo/styles.css:365-378` to `globals.css` under a `.range` class and add `className="range …"`. Optional polish; functionality does not depend on it.

- [ ] **Step 2: Typecheck + build**

Run: `npm run build --workspace @echolingo/shared && npx tsc -p src/web/tsconfig.json --noEmit`
Expected: no errors. (`cefr` is imported from shared — built in Task 1.)

- [ ] **Step 3: Commit**

```bash
git add src/web/components/create-echo-form.tsx
git commit -m "feat(web): redesign create form (topic, Select, pills, CEFR slider, go)"
```

---

### Task 11: Echoes library row redesign

**Files:**
- Modify: `src/web/components/echoes-list.tsx`

- [ ] **Step 1: Rebuild the list and row**

Replace the render portions of `src/web/components/echoes-list.tsx` (keep `formatRelative` and `RelativeTime` as-is at the bottom). The full file:

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { LANG_NAME, cefr, type LessonStatus } from '@echolingo/shared/types';
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
    <section className="mt-[26px]">
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
      {isNew && <span className="h-[9px] w-[9px] flex-shrink-0 rounded-full bg-accent" />}
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
```

> The empty-state text ("your echoes will appear here") is dropped — the section is hidden when empty (handoff behavior). The home first-run hero covers the empty case (Task 12).

- [ ] **Step 2: Typecheck**

Run: `npx tsc -p src/web/tsconfig.json --noEmit`
Expected: no errors.

- [ ] **Step 3: Check for tests referencing the removed empty-state string**

Run: `npm run test --workspace @echolingo/web -- echoes`
Expected: PASS. If a test asserts the old "your echoes will appear here" copy or the old `L${level}` meta, update it to the new behavior (hidden when empty; `cefr(level)` meta).

- [ ] **Step 4: Commit**

```bash
git add src/web/components/echoes-list.tsx
git commit -m "feat(web): redesign echo rows (play affordance, progress ring, CEFR meta)"
```

---

### Task 12: HomeClient — first-run hero / compact

**Files:**
- Modify: `src/web/components/home-client.tsx`

- [ ] **Step 1: Rebuild HomeClient**

Replace the JSX return in `src/web/components/home-client.tsx` (keep the existing refresh `useEffect`):

```tsx
'use client';

import { useEffect, useRef } from 'react';
import { AppBar } from './app-bar';
import { CreateEchoForm } from './create-echo-form';
import { EchoesList } from './echoes-list';
import { useEchoes } from '../hooks/use-echoes';
import { getLesson } from '../lib/api';

export function HomeClient() {
  const { echoes, hydrated, updateEcho, removeEcho } = useEchoes();
  const refreshedRef = useRef(false);

  useEffect(() => {
    if (!hydrated || refreshedRef.current) return;
    refreshedRef.current = true;
    const pending = echoes.filter(
      (e) => e.lastStatus === 'generating_script' || e.lastStatus === 'generating_audio',
    );
    let cancelled = false;
    void Promise.all(
      pending.map(async (e) => {
        const result = await getLesson(e.id);
        if (cancelled) return;
        if (result.kind === 'found') {
          if (result.lesson.status !== e.lastStatus) {
            updateEcho(e.id, { lastStatus: result.lesson.status, error: result.lesson.error });
          }
        } else if (result.kind === 'not_found') {
          updateEcho(e.id, { lastStatus: 'failed', error: 'lesson not found' });
        }
      }),
    );
    return () => {
      cancelled = true;
    };
  }, [hydrated, echoes, updateEcho]);

  const firstRun = hydrated && echoes.length === 0;

  return (
    <>
      <AppBar />
      <main className="mx-auto max-w-md px-6 pb-7 pt-[18px]">
        {firstRun && (
          <div className="px-2 pb-[18px] pt-1.5 text-center">
            <h1 className="mb-2.5 font-serif text-[34px] font-semibold leading-[1.04] tracking-[-0.025em] text-ink">
              listening lessons,
              <br />
              on demand
            </h1>
            <p className="font-serif text-[17px] italic leading-[1.4] text-ink-soft">
              name a topic — get a narrated lesson
              <br />
              in seconds. no account, ever.
            </p>
          </div>
        )}
        <CreateEchoForm showSuggestions={firstRun} />
        <EchoesList echoes={echoes} hydrated={hydrated} onRemove={removeEcho} />
      </main>
    </>
  );
}
```

- [ ] **Step 2: Typecheck + build**

Run: `npx tsc -p src/web/tsconfig.json --noEmit && npm run build --workspace @echolingo/web`
Expected: no errors; static export emits.

- [ ] **Step 3: Manual visual check**

Start the app per the README (`npm run azurite`, `npm run dev:api`, `npm run dev:web`), open `http://localhost:3000`. Verify: wordmark with orange dot; theme toggle flips light/dark and persists across reload; first-run hero + chips show in a fresh profile; after creating one echo the form is compact and the library shows the row. (Phase 3 makes the player usable.)

- [ ] **Step 4: Commit**

```bash
git add src/web/components/home-client.tsx
git commit -m "feat(web): home first-run hero + chips, compact returning view"
```

---

# PHASE 3 — Player

### Task 13: Position + speed persistence in usePlayer

**Files:**
- Modify: `src/web/hooks/use-player.ts`
- Create: `src/web/hooks/use-player.test.ts`

The hook gains an `echoId` arg and an `initialSpeed`/persistence. To keep persistence pure and testable, add exported helpers.

- [ ] **Step 1: Write the failing test**

Create `src/web/hooks/use-player.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadSpeed, saveSpeed, posKey, savePosition, loadPosition } from './use-player';

describe('player persistence helpers', () => {
  beforeEach(() => localStorage.clear());

  it('round-trips speed', () => {
    saveSpeed(1.25);
    expect(loadSpeed()).toBe(1.25);
  });

  it('defaults speed to 1 when unset or invalid', () => {
    expect(loadSpeed()).toBe(1);
    localStorage.setItem('echo:speed', 'nope');
    expect(loadSpeed()).toBe(1);
  });

  it('keys position by echo id and round-trips', () => {
    expect(posKey('abc')).toBe('echo:pos:abc');
    savePosition('abc', 42);
    expect(loadPosition('abc')).toBe(42);
  });

  it('returns 0 position for an unknown id', () => {
    expect(loadPosition('missing')).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace @echolingo/web -- use-player`
Expected: FAIL — helpers not exported.

- [ ] **Step 3: Implement helpers + wire persistence**

At the top of `src/web/hooks/use-player.ts` add the exported helpers:

```ts
const SPEED_KEY = 'echo:speed';
export const posKey = (id: string) => `echo:pos:${id}`;

export function loadSpeed(): number {
  try {
    const v = Number(localStorage.getItem(SPEED_KEY));
    return v === 0.75 || v === 1 || v === 1.25 ? v : 1;
  } catch {
    return 1;
  }
}
export function saveSpeed(rate: number): void {
  try {
    localStorage.setItem(SPEED_KEY, String(rate));
  } catch {
    /* ignore */
  }
}
export function loadPosition(id: string): number {
  try {
    const v = Number(localStorage.getItem(posKey(id)));
    return Number.isFinite(v) && v > 0 ? v : 0;
  } catch {
    return 0;
  }
}
export function savePosition(id: string, sec: number): void {
  try {
    localStorage.setItem(posKey(id), String(sec));
  } catch {
    /* ignore */
  }
}
```

Change the signature to accept an `echoId` and initialize speed from storage:

```ts
export function usePlayer(playlist: PlaylistEntry[], echoId?: string): {
  audioRef: React.RefObject<HTMLAudioElement | null>;
  state: PlayerState;
  controls: PlayerControls;
} {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [currentChunk, setCurrentChunk] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeedState] = useState(() => (typeof window !== 'undefined' ? loadSpeed() : 1));
```

Persist speed inside `setSpeed`:

```ts
  const setSpeed = useCallback((rate: number) => {
    setSpeedState(rate);
    saveSpeed(rate);
  }, []);
```

Persist position on every `timeupdate`. Add this effect near the other audio effects (uses `echoId`):

```ts
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !echoId) return;
    const onTime = () => {
      if (audio.currentTime > 0) savePosition(echoId, audio.currentTime);
    };
    audio.addEventListener('timeupdate', onTime);
    return () => audio.removeEventListener('timeupdate', onTime);
  }, [echoId]);
```

> Resume-to-position: full restore-across-chunks requires the elapsed→chunk math that lives in `echo-client.tsx`. For this task, persistence of the latest `currentTime` is sufficient and unit-tested. The consumer (Task 17) restores by seeking via the existing `onSeek` once the playlist is ready, using `loadPosition(echoId)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace @echolingo/web -- use-player`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/web/hooks/use-player.ts src/web/hooks/use-player.test.ts
git commit -m "feat(web): persist player speed and per-echo position"
```

---

### Task 14: Scrubber redesign (custom track + knob)

**Files:**
- Modify: `src/web/components/scrubber.tsx`

- [ ] **Step 1: Rebuild the scrubber with a clickable track**

Replace `src/web/components/scrubber.tsx`:

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
  const safeTotal = Math.max(totalSec, 0.01);
  const pct = Math.min(100, Math.max(0, (elapsedSec / safeTotal) * 100));

  const seekFromEvent = useCallback(
    (clientX: number, el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      const p = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
      onSeek(p * safeTotal);
    },
    [onSeek, safeTotal],
  );

  return (
    <div className="mb-[11px] flex items-center gap-3">
      <div
        role="slider"
        aria-label="Lesson progress"
        aria-valuemin={0}
        aria-valuemax={Math.round(safeTotal)}
        aria-valuenow={Math.round(elapsedSec)}
        tabIndex={0}
        onClick={(e) => seekFromEvent(e.clientX, e.currentTarget)}
        className="relative flex h-4 flex-1 cursor-pointer items-center"
      >
        <div className="absolute left-0 right-0 h-[5px] overflow-hidden rounded-full bg-line">
          <div className="absolute inset-y-0 left-0 rounded-full bg-accent" style={{ width: `${pct}%` }} />
        </div>
        <div
          className="absolute h-[15px] w-[15px] -translate-x-1/2 rounded-full border border-line bg-paper-3 shadow-[var(--shadow-1)]"
          style={{ left: `${pct}%` }}
        />
      </div>
      <span className="whitespace-nowrap text-[13px] font-medium tabular-nums text-ink-soft">
        {formatTime(elapsedSec)} / {formatTime(totalSec)}
      </span>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -p src/web/tsconfig.json --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/web/components/scrubber.tsx
git commit -m "feat(web): custom scrubber track + knob with tap-to-seek"
```

---

### Task 15: Player controls redesign (icons + translation toggle)

**Files:**
- Modify: `src/web/components/player-controls.tsx`

The `repeatSentence` control is dropped from the UI (still exists on the hook). A new `showTranslation`/`onToggleTranslation`/`bilingual` set of props drives the translation pill.

- [ ] **Step 1: Rebuild the controls**

Replace `src/web/components/player-controls.tsx`:

```tsx
'use client';

import type { PlayerControls as Controls, PlayerState } from '../hooks/use-player';
import { Scrubber } from './scrubber';
import { PlayIcon, PauseIcon, PrevIcon, NextIcon } from './icons';

const SPEEDS = [0.75, 1, 1.25] as const;

export function PlayerControlsView({
  state,
  controls,
  elapsedSec,
  totalSec,
  onSeek,
  bilingual,
  showTranslation,
  onToggleTranslation,
}: {
  state: PlayerState;
  controls: Controls;
  elapsedSec: number;
  totalSec: number;
  onSeek: (sec: number) => void;
  bilingual: boolean;
  showTranslation: boolean;
  onToggleTranslation: () => void;
}) {
  return (
    <div>
      <Scrubber elapsedSec={elapsedSec} totalSec={totalSec} onSeek={onSeek} />

      <div className="flex items-center justify-center gap-4">
        <button
          type="button"
          onClick={controls.prev}
          aria-label="Previous sentence"
          className="flex h-12 w-12 items-center justify-center rounded-full border border-line bg-paper-3 text-ink shadow-[var(--shadow-1)] transition active:scale-90"
        >
          <PrevIcon size={20} />
        </button>
        <button
          type="button"
          onClick={controls.toggle}
          aria-label={state.isPlaying ? 'Pause' : 'Play'}
          className="flex h-[62px] w-[62px] items-center justify-center rounded-full bg-ink text-paper-2 shadow-[var(--shadow-2)] transition active:scale-90"
        >
          {state.isPlaying ? <PauseIcon size={26} /> : <PlayIcon size={26} />}
        </button>
        <button
          type="button"
          onClick={controls.next}
          aria-label="Next sentence"
          className="flex h-12 w-12 items-center justify-center rounded-full border border-line bg-paper-3 text-ink shadow-[var(--shadow-1)] transition active:scale-90"
        >
          <NextIcon size={20} />
        </button>
      </div>

      <div className="mt-3 flex items-center justify-center gap-2">
        {SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => controls.setSpeed(s)}
            className={
              'rounded-pill px-4 py-[7px] text-[13px] font-semibold transition ' +
              (Math.abs(state.speed - s) < 0.01
                ? 'border border-ink bg-ink text-paper-2'
                : 'border border-line bg-paper-3 text-ink-soft')
            }
          >
            {s}×
          </button>
        ))}
        {bilingual && (
          <>
            <span className="mx-[3px] h-[18px] w-px bg-line" />
            <button
              type="button"
              onClick={onToggleTranslation}
              aria-pressed={showTranslation}
              title={showTranslation ? 'hide translation' : 'show translation'}
              className={
                'rounded-pill px-4 py-[7px] text-[13px] font-semibold transition ' +
                (showTranslation
                  ? 'border border-accent bg-accent text-accent-ink'
                  : 'border border-line bg-paper-3 text-ink-soft')
              }
            >
              translation
            </button>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -p src/web/tsconfig.json --noEmit`
Expected: errors in `echo-client.tsx` (missing new props) — fixed in Task 17. The component file itself is correct.

- [ ] **Step 3: Commit**

```bash
git add src/web/components/player-controls.tsx
git commit -m "feat(web): icon player controls + bilingual translation toggle"
```

---

### Task 16: Transcript redesign + translation toggle prop

**Files:**
- Modify: `src/web/components/transcript-view.tsx`

- [ ] **Step 1: Rebuild the transcript with a `showNative` prop and new styling**

Replace `src/web/components/transcript-view.tsx`:

```tsx
'use client';

import { useEffect, useRef } from 'react';
import type { Lesson, Sentence } from '@echolingo/shared/types';

export function TranscriptView({
  lesson,
  currentSentence,
  showNative,
  onJump,
}: {
  lesson: Lesson;
  currentSentence: number;
  showNative: boolean;
  onJump: (sentenceIdx: number) => void;
}) {
  const containerRef = useRef<HTMLOListElement | null>(null);
  const currentRef = useRef<HTMLLIElement | null>(null);
  const manualScrollUntil = useRef<number>(0);

  useEffect(() => {
    const c = containerRef.current;
    if (!c) return;
    const onWheel = () => {
      manualScrollUntil.current = Date.now() + 2600;
    };
    c.addEventListener('wheel', onWheel, { passive: true });
    c.addEventListener('touchmove', onWheel, { passive: true });
    return () => {
      c.removeEventListener('wheel', onWheel);
      c.removeEventListener('touchmove', onWheel);
    };
  }, []);

  useEffect(() => {
    if (Date.now() < manualScrollUntil.current) return;
    const el = currentRef.current;
    const box = containerRef.current;
    if (!el || !box) return;
    const top = el.offsetTop - box.clientHeight * 0.3;
    box.scrollTo({ top, behavior: 'smooth' });
  }, [currentSentence]);

  return (
    <ol ref={containerRef} className="h-full overflow-y-auto px-[22px] pb-7 pt-3.5">
      {lesson.sentences.map((s) => {
        const isCurrent = s.i === currentSentence;
        const isPast = s.i < currentSentence;
        return (
          <SentenceRow
            key={s.i}
            sentence={s}
            isCurrent={isCurrent}
            isPast={isPast}
            showNative={showNative}
            onJump={() => onJump(s.i)}
            attachRef={isCurrent ? (el) => (currentRef.current = el) : undefined}
          />
        );
      })}
    </ol>
  );
}

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
  const targetTone = isCurrent ? 'text-ink' : isPast ? 'text-ink-soft' : 'text-ink-soft opacity-[0.72]';
  return (
    <li
      ref={attachRef}
      onClick={onJump}
      className={
        'my-0.5 cursor-pointer rounded-[16px] px-4 py-4 transition ' +
        (isCurrent ? 'bg-aegean-tint shadow-[inset_3px_0_0_var(--aegean)]' : '')
      }
    >
      <p className={`font-serif text-[calc(25px*var(--fs-scale))] leading-[1.32] tracking-[-0.01em] ${targetTone}`}>
        {sentence.gr}
      </p>
      {showNative && (
        <p
          className={
            'mt-2 font-sans text-[calc(16px*var(--fs-scale))] leading-[1.4] ' +
            (isCurrent ? 'text-[color-mix(in_srgb,var(--aegean)_70%,var(--ink-soft))]' : 'text-ink-mute')
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

> Auto-scroll now scrolls the transcript's own scroll container (the `<ol>`), since the player makes the transcript the scroll region (Task 17). The manual-scroll pause is 2.6s to match the handoff.

- [ ] **Step 2: Typecheck**

Run: `npx tsc -p src/web/tsconfig.json --noEmit`
Expected: error in `echo-client.tsx` (missing `showNative`) — fixed in Task 17.

- [ ] **Step 3: Commit**

```bash
git add src/web/components/transcript-view.tsx
git commit -m "feat(web): transcript tint/bar/dimming + translation visibility prop"
```

---

### Task 17: EchoClient player layout + generating restyle

**Files:**
- Modify: `src/web/components/echo-client.tsx`
- Modify: `src/web/components/echo-progress.tsx`

This wires the new transport props, makes the player a flex column, restyles the generating/error states, and restores the saved position.

- [ ] **Step 1: Restyle the generating screen in echo-progress.tsx**

Read `src/web/components/echo-progress.tsx` first to preserve its props. Replace its rendered output with the handoff "composing your echo…" treatment. Example (adapt to the file's actual prop names — it receives the `echo`):

```tsx
'use client';

import { cefr, LANG_NAME, type Lesson } from '@echolingo/shared/types';

export function EchoProgress({ echo }: { echo: Lesson }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-[22px] p-10 text-center">
      <div className="h-[54px] w-[54px] animate-spin rounded-full border-[3px] border-line border-t-accent" />
      <div>
        <div className="font-serif text-[18px] italic text-ink-soft">composing your echo…</div>
        <div className="mt-2.5 max-w-[26ch] font-serif text-[22px] font-semibold tracking-[-0.01em] text-ink">
          {echo.params.topic}
        </div>
        <div className="mt-2.5 font-serif text-[14px] italic text-ink-soft">
          {LANG_NAME[echo.params.targetLang].toLowerCase()} · {echo.params.lengthMin} min · {cefr(echo.params.level)}
        </div>
      </div>
    </div>
  );
}
```

> If `echo-progress.tsx` currently renders a per-sentence progress bar/count, keep that data available but the handoff replaces it with the spinner treatment above. Preserve any exported name the file already uses.

- [ ] **Step 2: Update echo-client.tsx — player layout, props, position restore**

In `src/web/components/echo-client.tsx`:

(a) Import `cefr`/`LANG_NAME` and `loadPosition`:

```tsx
import { cefr, LANG_NAME } from '@echolingo/shared/types';
import { loadPosition } from '../hooks/use-player';
```

(b) Pass `echoId` to the player and add translation state. Inside `ExistingEcho`, after `const player = usePlayer(playlist);` change to:

```tsx
  const player = usePlayer(playlist, id);
  const bilingual = state.kind === 'ok' && state.echo.params.mode === 'bilingual';
  const [showTranslation, setShowTranslation] = useState(true);
```

(c) Restore saved position once when the playlist becomes ready:

```tsx
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current || playlist.length === 0) return;
    restoredRef.current = true;
    const saved = loadPosition(id);
    if (saved > 0) onSeek(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playlist.length, id]);
```

(d) Replace the ready-state `return` block (the `<PageFrame …>` with audio/transcript/fixed controls) with a flex-column player. Replace from `return (` of the final ready render through its closing `);` with:

```tsx
  return (
    <div className="flex h-[100dvh] flex-col">
      <AppBar title={echo.params.topic} showNew />
      <audio ref={player.audioRef as RefObject<HTMLAudioElement>} preload="auto" />
      <div className="min-h-0 flex-1 overflow-hidden">
        <TranscriptView
          lesson={echo}
          currentSentence={player.state.currentSentence}
          showNative={bilingual && showTranslation}
          onJump={player.controls.jumpToSentence}
        />
      </div>
      <div className="flex-none border-t border-line bg-paper/[0.92] px-[22px] pb-[max(30px,env(safe-area-inset-bottom))] pt-3 shadow-[var(--shadow-up)] backdrop-blur-[14px]">
        <div className="mx-auto max-w-2xl">
          <PlayerControlsView
            state={player.state}
            controls={player.controls}
            elapsedSec={elapsedSec}
            totalSec={total}
            onSeek={onSeek}
            bilingual={bilingual}
            showTranslation={showTranslation}
            onToggleTranslation={() => setShowTranslation((v) => !v)}
          />
        </div>
      </div>
    </div>
  );
```

(e) The non-ready states (`loading`, `not_found`, `error`, `failed`, and `NewEcho`'s `creating`) still use `PageFrame`. Update `PageFrame` to use the new tokens and pass `showNew`:

```tsx
function PageFrame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <AppBar title={title} showNew />
      <main className="mx-auto max-w-2xl px-4 py-6">{children}</main>
    </div>
  );
}
```

(Drop the `pad` prop and its `pb-40` — the ready player no longer uses `PageFrame`.)

(f) Restyle `NewEcho`'s `creating` state to the generating treatment (mirror Task 17 Step 1 using `params`):

```tsx
      {state.kind === 'creating' && (
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-[22px] p-10 text-center">
          <div className="h-[54px] w-[54px] animate-spin rounded-full border-[3px] border-line border-t-accent" />
          <div>
            <div className="font-serif text-[18px] italic text-ink-soft">composing your echo…</div>
            <div className="mt-2.5 max-w-[26ch] font-serif text-[22px] font-semibold tracking-[-0.01em] text-ink">
              {params.topic}
            </div>
            <div className="mt-2.5 font-serif text-[14px] italic text-ink-soft">
              {LANG_NAME[params.targetLang].toLowerCase()} · {params.lengthMin} min · {cefr(params.level)}
            </div>
          </div>
        </div>
      )}
```

(g) Restyle `ErrorCard`/`Spinner` tokens: change `border-terracotta`/`bg-terracotta`/`text-white` to `border-accent`/`bg-accent`/`text-accent-ink`, and `border-t-aegean` stays (aliased to accent). Keep behavior identical.

- [ ] **Step 3: Typecheck + build**

Run: `npm run build --workspace @echolingo/shared && npx tsc -p src/web/tsconfig.json --noEmit && npm run build --workspace @echolingo/web`
Expected: no errors; static export emits.

- [ ] **Step 4: Run the full web test suite**

Run: `npm run test --workspace @echolingo/web`
Expected: PASS. Fix any test still passing the old `repeatSentence`-era controls or `TranscriptView` without `showNative`.

- [ ] **Step 5: Manual check**

With the app running, create an echo, wait for ready, and verify: transport pinned to the bottom and fully visible; prev/play/next icon buttons; speed pills persist across reload; translation pill toggles native lines (bilingual only); reloading mid-listen resumes near the saved position; current line has the accent wash + left bar; auto-scroll keeps the current line ~30% down.

- [ ] **Step 6: Commit**

```bash
git add src/web/components/echo-client.tsx src/web/components/echo-progress.tsx
git commit -m "feat(web): flex-column player, generating restyle, resume position"
```

---

# PHASE 4 — Shared-link landing

### Task 18: Shared detection + context strip + conversion card

**Files:**
- Create: `src/web/components/share-affordances.tsx`
- Modify: `src/web/components/echo-client.tsx`

- [ ] **Step 1: Write the failing test for shared detection logic**

Create `src/web/components/share-affordances.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { isSharedVisit } from './share-affordances';

describe('isSharedVisit', () => {
  it('is true when the id was NOT already in the library at mount', () => {
    expect(isSharedVisit({ libraryHadId: false })).toBe(true);
  });
  it('is false for an echo already in the library (owner)', () => {
    expect(isSharedVisit({ libraryHadId: true })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace @echolingo/web -- share-affordances`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the affordances + helper**

Create `src/web/components/share-affordances.tsx`:

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { cefr, LANG_NAME, type Lesson } from '@echolingo/shared/types';
import { SparkIcon, ArrowRightIcon } from './icons';

export function isSharedVisit({ libraryHadId }: { libraryHadId: boolean }): boolean {
  return !libraryHadId;
}

export function ShareContextStrip({ echo }: { echo: Lesson }) {
  const router = useRouter();
  return (
    <div className="mx-[22px] mb-1 mt-3.5 flex flex-col items-start gap-[11px] rounded-[16px] border border-line bg-paper-2 p-4">
      <p className="text-[13.5px] leading-[1.45] text-ink-soft">
        a <b className="font-semibold capitalize text-ink">{LANG_NAME[echo.params.targetLang]}</b> listening lesson someone
        shared with you · {echo.params.lengthMin} min · {cefr(echo.params.level)}. press play to listen —
      </p>
      <button
        type="button"
        onClick={() => router.push('/')}
        className="inline-flex items-center gap-[7px] whitespace-nowrap rounded-pill border border-[color-mix(in_srgb,var(--accent)_55%,var(--line))] bg-[color-mix(in_srgb,var(--accent)_8%,var(--paper-3))] px-[15px] py-[9px] text-[13.5px] font-semibold text-accent"
      >
        <SparkIcon size={14} /> or make your own <ArrowRightIcon size={15} />
      </button>
    </div>
  );
}

export function ConversionCard() {
  const router = useRouter();
  return (
    <div className="mx-[22px] mb-2 mt-[18px] rounded-[22px] border border-line bg-paper-2 px-[26px] pb-7 pt-[30px] text-center shadow-[var(--shadow-1)]">
      <div className="mb-3 text-[12px] font-semibold uppercase tracking-[0.14em] text-accent">your turn</div>
      <div className="mb-3 font-serif text-[30px] font-semibold leading-[1.08] tracking-[-0.02em] text-ink">
        learn anything,
        <br />
        the same way
      </div>
      <p className="mx-auto mb-[22px] max-w-[30ch] text-[15px] leading-[1.5] text-ink-soft">
        echolingo turns any topic into a narrated lesson — your languages, your level, ready in seconds. no sign-up required.
      </p>
      <button
        type="button"
        onClick={() => router.push('/')}
        className="flex h-14 w-full items-center justify-center gap-2 rounded-pill bg-accent text-[17px] font-semibold text-accent-ink shadow-[0_6px_18px_color-mix(in_srgb,var(--accent)_36%,transparent)]"
      >
        <SparkIcon size={16} /> make your own echo
      </button>
      <div className="mt-3.5 text-[12.5px] text-ink-mute">free · no account · works offline</div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace @echolingo/web -- share-affordances`
Expected: PASS.

- [ ] **Step 5: Wire detection into ExistingEcho**

In `src/web/components/echo-client.tsx`:

(a) Import the affordances:

```tsx
import { isSharedVisit, ShareContextStrip, ConversionCard } from './share-affordances';
```

(b) Capture whether the library already had this id, the first time the library is hydrated. The hook exposes `echoes` and `hydrated`. Add near the top of `ExistingEcho`:

```tsx
  const { echoes, hydrated, addEcho, updateEcho, removeEcho } = useEchoes();
  const libraryHadIdRef = useRef<boolean | null>(null);
  if (libraryHadIdRef.current === null && hydrated) {
    libraryHadIdRef.current = echoes.some((e) => e.id === id);
  }
  const shared = libraryHadIdRef.current === true ? false : isSharedVisit({ libraryHadId: libraryHadIdRef.current ?? true });
```

> `libraryHadIdRef` is captured before the silent-adoption effect appends this id (adoption runs in an effect, after this render-time read). Default to non-shared until hydrated to avoid a flash of the conversion card for owners.

(c) Render the strip and card inside the transcript scroll region only when `shared`. In the ready-state JSX from Task 17, wrap the transcript area:

```tsx
      <div className="min-h-0 flex-1 overflow-y-auto">
        {shared && <ShareContextStrip echo={echo} />}
        <TranscriptView
          lesson={echo}
          currentSentence={player.state.currentSentence}
          showNative={bilingual && showTranslation}
          onJump={player.controls.jumpToSentence}
        />
        {shared && <ConversionCard />}
      </div>
```

> Note: `TranscriptView`'s `<ol>` is itself scrollable. When wrapping with strip/card, make the outer div the scroll region and change `TranscriptView`'s `<ol>` from `h-full overflow-y-auto` to `overflow-visible` so the strip and card scroll with the transcript. Apply that adjustment: in `transcript-view.tsx` the `<ol>` className becomes `px-[22px] pb-7 pt-3.5` (remove `h-full overflow-y-auto`), and the auto-scroll target box is now `containerRef.current?.parentElement`. Update the scroll effect to use `const box = containerRef.current?.parentElement` and guard for null.

- [ ] **Step 6: Typecheck + build + test**

Run: `npm run build --workspace @echolingo/shared && npx tsc -p src/web/tsconfig.json --noEmit && npm run test --workspace @echolingo/web && npm run build --workspace @echolingo/web`
Expected: all pass.

- [ ] **Step 7: Manual check**

In a fresh browser profile, open a known `/echo/<id>/` you did not create on this profile → context strip + conversion card appear, and the echo is silently adopted into the library. Reload → it is now "owned", no strip/card. Create your own echo → no strip/card.

- [ ] **Step 8: Commit**

```bash
git add src/web/components/share-affordances.tsx src/web/components/share-affordances.test.tsx src/web/components/echo-client.tsx src/web/components/transcript-view.tsx
git commit -m "feat(web): shared-link context strip + conversion card"
```

---

### Task 19: Update Playwright e2e for the redesign

**Files:**
- Modify: existing specs under `tests/` (find with the grep below)

- [ ] **Step 1: Locate e2e specs and their stale selectors**

Run: `grep -rn "+ new\|listening lessons, on demand\|L[0-9]\|repeat\|↺\|▶▶\|◀◀\|level " tests`
Note each hit: the home tagline moved/removed, `+ new` is gone from home, level meta is now CEFR (`B1` not `L3`), and emoji transport glyphs are replaced by aria-labelled icon buttons (`Play`, `Pause`, `Previous sentence`, `Next sentence`).

- [ ] **Step 2: Update selectors**

Apply these substitutions in the e2e specs:
- Home: assert the wordmark `echolingo` link exists and that `+ new` is **absent** on `/` (it is present on the player).
- Player controls: select by accessible name — `getByRole('button', { name: 'Play' })`, `'Pause'`, `'Previous sentence'`, `'Next sentence'`. Remove any assertion on a repeat button.
- Level text: replace `L3` / `level 3` assertions with `B1` (and the create form label `level · B1`).
- If a test waits on the old fixed bottom bar layout, it still works (the transport is a bottom region); selectors by role are robust.

- [ ] **Step 3: Add a shared-link scenario**

Add a spec (e.g. in the existing navigation spec file) that:
1. Mocks `GET /api/lesson/:id` to return a `ready` bilingual lesson (reuse the existing create-flow mock pattern in the suite).
2. Visits `/echo/<unknown-id>/` with empty `localStorage` → asserts the conversion card text `learn anything` / `make your own echo` is visible.
3. Reloads → asserts the conversion card is now **absent** (the echo was adopted, so it is "owned").

Example assertion fragment (adapt to the suite's mock helper):

```ts
await page.goto('/echo/shared-test-id/');
await expect(page.getByText('make your own echo')).toBeVisible();
await page.reload();
await expect(page.getByText('make your own echo')).toHaveCount(0);
```

- [ ] **Step 4: Run e2e**

Start azurite + api + web (see README), then run: `npm run test:e2e`
Expected: PASS. Iterate on selectors until green.

- [ ] **Step 5: Commit**

```bash
git add tests
git commit -m "test(e2e): update selectors for redesign + shared-link scenario"
```

---

## Final verification

- [ ] `npm run build --workspace @echolingo/shared`
- [ ] `npm run test` (all workspaces) — green
- [ ] `npx tsc -p src/web/tsconfig.json --noEmit` — clean
- [ ] `npm run build --workspace @echolingo/web` — static export emits
- [ ] `npm run lint` — clean
- [ ] `npm run test:e2e` — green
- [ ] Manual sweep: light/dark toggle + OS-follow; first-run vs returning home; create → generating → player; resume position; translation toggle; shared-link landing in a fresh profile.

---

## Self-review notes (author)

- **Spec coverage:** §1 tokens → Task 4; §1 theme toggle/no-flash → Tasks 5–6, 9; §2 fonts → Task 5; §3 CEFR → Tasks 1–3; §4 home/create → Tasks 7–12; §5 player → Tasks 13–17; §6 shared-landing → Task 18; §7 generating → Task 17; testing → tasks inline + Task 19.
- **Known approximation:** library-row progress uses `pos / (lengthMin*60)` (Echo summary has no audio duration) — documented in spec and Task 11.
- **Type consistency:** `cefr` (shared) used in Tasks 1, 2, 10, 11, 17, 18; `loadPosition`/`saveSpeed` (Task 13) used in Task 17; `usePlayer(playlist, id)` signature set in Task 13, called in Task 17; `TranscriptView` gains `showNative` (Task 16) supplied in Task 17/18; `PlayerControlsView` gains `bilingual`/`showTranslation`/`onToggleTranslation` (Task 15) supplied in Task 17; `AppBar` gains `showNew` (Task 9) used in Task 17.
