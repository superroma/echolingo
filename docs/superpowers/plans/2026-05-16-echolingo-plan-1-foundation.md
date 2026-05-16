# Echolingo — Plan 1: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold an `azd`-managed monorepo with shared TypeScript package, Next.js PWA, Azure Functions backend, Azurite local emulator, and CI — all booting locally with tests green, no Azure resources required yet.

**Architecture:** npm workspaces monorepo following Azure Developer CLI (`azd`) conventions: `azure.yaml` at root, `infra/` for Bicep, `src/web` (Next.js), `src/api` (Azure Functions v4 isolated, Node 20 TS), `src/shared` (pure-TS package referenced via workspace dependency). All cross-cutting domain logic (canonicalization, IDs, prompts, parsers, TTS interface) lives in `src/shared` so both frontend and backend share types and behavior.

**Tech Stack:** Node 20, TypeScript 5, npm workspaces, Next.js 15 (app router, static export), Tailwind CSS, Azure Functions v4 (programmatic model, TS), Vitest, ESLint + Prettier, `azd`, Bicep (placeholder modules in this plan), Azurite (Storage + Queue emulator), GitHub Actions.

---

## File structure produced by this plan

```
/
├── azure.yaml                       # azd service map
├── package.json                     # workspaces root
├── package-lock.json
├── tsconfig.base.json
├── .nvmrc                           # Node 20
├── .editorconfig
├── .gitignore                       # extended
├── .prettierrc.json
├── eslint.config.js
├── docker-compose.yml               # Azurite
├── README.md                        # extended with dev setup
├── .github/
│   └── workflows/
│       └── ci.yml                   # lint + test on PR
├── infra/
│   ├── main.bicep                   # PLACEHOLDER (real resources in Plan 5)
│   └── main.parameters.json
├── src/
│   ├── shared/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── vitest.config.ts
│   │   ├── src/
│   │   │   ├── index.ts             # barrel
│   │   │   ├── types.ts             # Lesson, LessonParams, Sentence
│   │   │   ├── canonicalize.ts      # stable JSON canonicalization
│   │   │   ├── lesson-id.ts         # sha256(canonicalize(params))
│   │   │   ├── prompts.ts           # buildPrompt(params)
│   │   │   ├── parse-script.ts      # parseScript(text) → Sentence[]
│   │   │   └── tts/
│   │   │       ├── interface.ts     # TtsEngine
│   │   │       └── mock-engine.ts   # MockTtsEngine
│   │   └── test/
│   │       ├── canonicalize.test.ts
│   │       ├── lesson-id.test.ts
│   │       ├── prompts.test.ts
│   │       ├── parse-script.test.ts
│   │       └── mock-engine.test.ts
│   ├── web/
│   │   ├── package.json
│   │   ├── next.config.mjs
│   │   ├── tsconfig.json
│   │   ├── tailwind.config.ts
│   │   ├── postcss.config.mjs
│   │   ├── public/
│   │   │   ├── manifest.webmanifest
│   │   │   └── sw.js                # stub
│   │   └── app/
│   │       ├── layout.tsx
│   │       ├── page.tsx             # placeholder home
│   │       └── globals.css
│   └── api/
│       ├── package.json
│       ├── tsconfig.json
│       ├── host.json
│       ├── local.settings.json.example
│       ├── src/
│       │   ├── index.ts             # app entry (registers functions)
│       │   └── functions/
│       │       └── health.ts        # GET /api/health
│       └── test/
│           └── health.test.ts
```

---

## Task 1: Initialize npm workspaces monorepo

**Files:**
- Create: `package.json`
- Create: `tsconfig.base.json`
- Create: `.nvmrc`
- Create: `.editorconfig`
- Modify: `.gitignore`
- Create: `.prettierrc.json`
- Create: `eslint.config.js`

- [ ] **Step 1: Write root `package.json`**

```json
{
  "name": "echolingo",
  "version": "0.0.0",
  "private": true,
  "workspaces": [
    "src/shared",
    "src/web",
    "src/api"
  ],
  "engines": {
    "node": ">=20.0.0 <21"
  },
  "scripts": {
    "lint": "eslint \"src/**/*.{ts,tsx}\"",
    "format": "prettier --write \"src/**/*.{ts,tsx,json,md}\"",
    "test": "npm run test --workspaces --if-present",
    "build": "npm run build --workspaces --if-present",
    "dev:web": "npm run dev --workspace @echolingo/web",
    "dev:api": "npm run start --workspace @echolingo/api",
    "azurite": "docker compose up -d azurite"
  },
  "devDependencies": {
    "@eslint/js": "^9.14.0",
    "eslint": "^9.14.0",
    "globals": "^15.12.0",
    "prettier": "^3.3.3",
    "typescript": "^5.6.3",
    "typescript-eslint": "^8.14.0"
  }
}
```

- [ ] **Step 2: Write `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM"],
    "strict": true,
    "noImplicitAny": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "declaration": true,
    "sourceMap": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

- [ ] **Step 3: Write `.nvmrc`**

```
20
```

- [ ] **Step 4: Write `.editorconfig`**

```ini
root = true

[*]
indent_style = space
indent_size = 2
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true
```

- [ ] **Step 5: Extend `.gitignore`**

Append the following lines to the existing `.gitignore`:

```
# tooling
*.tsbuildinfo
.turbo/

# Azure / azd
.azure/
azurite-data/

# Functions
local.settings.json
bin/
obj/

# next
.next/
out/
```

- [ ] **Step 6: Write `.prettierrc.json`**

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2
}
```

- [ ] **Step 7: Write `eslint.config.js`**

```js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default [
  {
    ignores: ['**/dist/**', '**/.next/**', '**/out/**', '**/node_modules/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.browser },
    },
  },
];
```

- [ ] **Step 8: Install root devDependencies**

Run:

```bash
npm install
```

Expected: `package-lock.json` created, no workspace errors (workspaces are empty for now; that's fine — npm will report them as missing in later tasks).

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json tsconfig.base.json .nvmrc .editorconfig .gitignore .prettierrc.json eslint.config.js
git commit -m "chore: initialize npm workspaces monorepo"
```

---

## Task 2: Scaffold `src/shared` package

**Files:**
- Create: `src/shared/package.json`
- Create: `src/shared/tsconfig.json`
- Create: `src/shared/vitest.config.ts`
- Create: `src/shared/src/index.ts`

- [ ] **Step 1: Write `src/shared/package.json`**

```json
{
  "name": "@echolingo/shared",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "devDependencies": {
    "vitest": "^2.1.4"
  }
}
```

- [ ] **Step 2: Write `src/shared/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "composite": true
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Write `src/shared/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
});
```

- [ ] **Step 4: Write `src/shared/src/index.ts`**

```ts
export {};
```

- [ ] **Step 5: Install workspace dependencies**

Run:

```bash
npm install
```

Expected: `@echolingo/shared` workspace is recognized; `vitest` installed in `src/shared/node_modules` or hoisted to root.

- [ ] **Step 6: Verify the workspace builds**

Run:

```bash
npm run typecheck --workspace @echolingo/shared
```

Expected: PASS (no output, exit 0).

- [ ] **Step 7: Commit**

```bash
git add src/shared package.json package-lock.json
git commit -m "feat(shared): scaffold shared TS package"
```

---

## Task 3: Implement `canonicalize` (stable JSON for hashing)

**Files:**
- Create: `src/shared/src/canonicalize.ts`
- Create: `src/shared/test/canonicalize.test.ts`
- Modify: `src/shared/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `src/shared/test/canonicalize.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { canonicalize } from '../src/canonicalize.js';

describe('canonicalize', () => {
  it('sorts object keys deterministically', () => {
    expect(canonicalize({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });

  it('handles nested objects', () => {
    expect(canonicalize({ b: { y: 1, x: 2 }, a: 1 })).toBe('{"a":1,"b":{"x":2,"y":1}}');
  });

  it('preserves array order', () => {
    expect(canonicalize({ a: [3, 1, 2] })).toBe('{"a":[3,1,2]}');
  });

  it('drops undefined fields', () => {
    expect(canonicalize({ a: 1, b: undefined })).toBe('{"a":1}');
  });

  it('serializes nulls explicitly', () => {
    expect(canonicalize({ a: null })).toBe('{"a":null}');
  });

  it('produces identical output for equivalent inputs', () => {
    expect(canonicalize({ a: 1, b: 2 })).toBe(canonicalize({ b: 2, a: 1 }));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm run test --workspace @echolingo/shared
```

Expected: FAIL with "Cannot find module '../src/canonicalize.js'".

- [ ] **Step 3: Implement `canonicalize`**

Create `src/shared/src/canonicalize.ts`:

```ts
export function canonicalize(value: unknown): string {
  return JSON.stringify(sort(value));
}

function sort(v: unknown): unknown {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(sort);
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(v as Record<string, unknown>).sort()) {
    const val = (v as Record<string, unknown>)[key];
    if (val === undefined) continue;
    out[key] = sort(val);
  }
  return out;
}
```

- [ ] **Step 4: Export from barrel**

Replace `src/shared/src/index.ts` with:

```ts
export { canonicalize } from './canonicalize.js';
```

- [ ] **Step 5: Run tests to verify they pass**

Run:

```bash
npm run test --workspace @echolingo/shared
```

Expected: PASS, 6 tests.

- [ ] **Step 6: Commit**

```bash
git add src/shared/src/canonicalize.ts src/shared/test/canonicalize.test.ts src/shared/src/index.ts
git commit -m "feat(shared): add stable JSON canonicalization"
```

---

## Task 4: Implement domain types (`LessonParams`, `Sentence`, `Lesson`)

**Files:**
- Create: `src/shared/src/types.ts`
- Create: `src/shared/test/types.test.ts`
- Modify: `src/shared/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `src/shared/test/types.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  LESSON_LENGTHS,
  LESSON_STYLES,
  LESSON_MODES,
  BILINGUAL_ORDERS,
  NATIVE_LANGS,
  TTS_ENGINES,
  isLessonParams,
} from '../src/types.js';

describe('domain enums', () => {
  it('exposes the four length presets', () => {
    expect(LESSON_LENGTHS).toEqual([5, 10, 20, 30]);
  });

  it('exposes the three styles', () => {
    expect(LESSON_STYLES).toEqual(['mono', 'dialogue', 'story']);
  });

  it('exposes the two modes', () => {
    expect(LESSON_MODES).toEqual(['greek_only', 'bilingual']);
  });

  it('exposes the two bilingual orders', () => {
    expect(BILINGUAL_ORDERS).toEqual(['gr_first', 'native_first']);
  });

  it('exposes the two native languages', () => {
    expect(NATIVE_LANGS).toEqual(['en', 'ru']);
  });

  it('exposes the three TTS engines', () => {
    expect(TTS_ENGINES).toEqual(['openai', 'elevenlabs', 'google']);
  });
});

describe('isLessonParams', () => {
  const valid = {
    topic: 'at the bakery',
    lengthMin: 10,
    level: 3,
    style: 'dialogue',
    mode: 'bilingual',
    bilingualOrder: 'gr_first',
    nativeLang: 'en',
    ttsEngine: 'openai',
  };

  it('accepts a fully-valid object', () => {
    expect(isLessonParams(valid)).toBe(true);
  });

  it('rejects missing topic', () => {
    expect(isLessonParams({ ...valid, topic: '' })).toBe(false);
  });

  it('rejects unknown length', () => {
    expect(isLessonParams({ ...valid, lengthMin: 7 })).toBe(false);
  });

  it('rejects level outside 1..5', () => {
    expect(isLessonParams({ ...valid, level: 0 })).toBe(false);
    expect(isLessonParams({ ...valid, level: 6 })).toBe(false);
  });

  it('rejects unknown style/mode/order/lang/engine', () => {
    expect(isLessonParams({ ...valid, style: 'rap' })).toBe(false);
    expect(isLessonParams({ ...valid, mode: 'turkish_only' })).toBe(false);
    expect(isLessonParams({ ...valid, bilingualOrder: 'random' })).toBe(false);
    expect(isLessonParams({ ...valid, nativeLang: 'fr' })).toBe(false);
    expect(isLessonParams({ ...valid, ttsEngine: 'aws' })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm run test --workspace @echolingo/shared
```

Expected: FAIL with "Cannot find module '../src/types.js'".

- [ ] **Step 3: Implement types**

Create `src/shared/src/types.ts`:

```ts
export const LESSON_LENGTHS = [5, 10, 20, 30] as const;
export type LessonLength = (typeof LESSON_LENGTHS)[number];

export const LESSON_LEVELS = [1, 2, 3, 4, 5] as const;
export type LessonLevel = (typeof LESSON_LEVELS)[number];

export const LESSON_STYLES = ['mono', 'dialogue', 'story'] as const;
export type LessonStyle = (typeof LESSON_STYLES)[number];

export const LESSON_MODES = ['greek_only', 'bilingual'] as const;
export type LessonMode = (typeof LESSON_MODES)[number];

export const BILINGUAL_ORDERS = ['gr_first', 'native_first'] as const;
export type BilingualOrder = (typeof BILINGUAL_ORDERS)[number];

export const NATIVE_LANGS = ['en', 'ru'] as const;
export type NativeLang = (typeof NATIVE_LANGS)[number];

export const TTS_ENGINES = ['openai', 'elevenlabs', 'google'] as const;
export type TtsEngineName = (typeof TTS_ENGINES)[number];

export interface LessonParams {
  topic: string;
  lengthMin: LessonLength;
  level: LessonLevel;
  style: LessonStyle;
  mode: LessonMode;
  bilingualOrder: BilingualOrder;
  nativeLang: NativeLang;
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
  if (!LESSON_LENGTHS.includes(o.lengthMin as LessonLength)) return false;
  if (!LESSON_LEVELS.includes(o.level as LessonLevel)) return false;
  if (!LESSON_STYLES.includes(o.style as LessonStyle)) return false;
  if (!LESSON_MODES.includes(o.mode as LessonMode)) return false;
  if (!BILINGUAL_ORDERS.includes(o.bilingualOrder as BilingualOrder)) return false;
  if (!NATIVE_LANGS.includes(o.nativeLang as NativeLang)) return false;
  if (!TTS_ENGINES.includes(o.ttsEngine as TtsEngineName)) return false;
  if (o.voice !== undefined && typeof o.voice !== 'string') return false;
  return true;
}
```

- [ ] **Step 4: Export from barrel**

Replace `src/shared/src/index.ts` with:

```ts
export { canonicalize } from './canonicalize.js';
export * from './types.js';
```

- [ ] **Step 5: Run tests**

Run:

```bash
npm run test --workspace @echolingo/shared
```

Expected: PASS, all canonicalize + types tests green.

- [ ] **Step 6: Commit**

```bash
git add src/shared/src/types.ts src/shared/test/types.test.ts src/shared/src/index.ts
git commit -m "feat(shared): add domain types and validator"
```

---

## Task 5: Implement `lessonId` (deterministic hash)

**Files:**
- Create: `src/shared/src/lesson-id.ts`
- Create: `src/shared/test/lesson-id.test.ts`
- Modify: `src/shared/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `src/shared/test/lesson-id.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { lessonId } from '../src/lesson-id.js';
import type { LessonParams } from '../src/types.js';

const base: LessonParams = {
  topic: 'at the bakery',
  lengthMin: 10,
  level: 3,
  style: 'dialogue',
  mode: 'bilingual',
  bilingualOrder: 'gr_first',
  nativeLang: 'en',
  ttsEngine: 'openai',
};

describe('lessonId', () => {
  it('returns a 64-char hex string', () => {
    const id = lessonId(base);
    expect(id).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic for the same params', () => {
    expect(lessonId(base)).toBe(lessonId(base));
  });

  it('is invariant to key order', () => {
    const shuffled = JSON.parse(JSON.stringify(base));
    expect(lessonId(base)).toBe(lessonId(shuffled));
  });

  it('changes when any param changes', () => {
    expect(lessonId(base)).not.toBe(lessonId({ ...base, topic: 'at the market' }));
    expect(lessonId(base)).not.toBe(lessonId({ ...base, lengthMin: 20 }));
    expect(lessonId(base)).not.toBe(lessonId({ ...base, level: 4 }));
    expect(lessonId(base)).not.toBe(lessonId({ ...base, style: 'story' }));
  });

  it('treats absent voice and undefined voice as identical', () => {
    const withVoice = { ...base, voice: undefined };
    expect(lessonId(base)).toBe(lessonId(withVoice));
  });

  it('distinguishes by explicit voice', () => {
    expect(lessonId(base)).not.toBe(lessonId({ ...base, voice: 'alloy' }));
  });

  it('normalizes topic whitespace and case to avoid trivial cache misses', () => {
    expect(lessonId({ ...base, topic: 'At The Bakery' })).toBe(
      lessonId({ ...base, topic: '  at the bakery  ' }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm run test --workspace @echolingo/shared
```

Expected: FAIL with "Cannot find module '../src/lesson-id.js'".

- [ ] **Step 3: Implement `lessonId`**

Create `src/shared/src/lesson-id.ts`:

```ts
import { createHash } from 'node:crypto';
import { canonicalize } from './canonicalize.js';
import type { LessonParams } from './types.js';

export function lessonId(params: LessonParams): string {
  const normalized: LessonParams = {
    ...params,
    topic: params.topic.trim().toLowerCase().replace(/\s+/g, ' '),
  };
  return createHash('sha256').update(canonicalize(normalized)).digest('hex');
}
```

- [ ] **Step 4: Export from barrel**

Update `src/shared/src/index.ts`:

```ts
export { canonicalize } from './canonicalize.js';
export { lessonId } from './lesson-id.js';
export * from './types.js';
```

- [ ] **Step 5: Run tests**

Run:

```bash
npm run test --workspace @echolingo/shared
```

Expected: PASS, all tests green.

- [ ] **Step 6: Commit**

```bash
git add src/shared/src/lesson-id.ts src/shared/test/lesson-id.test.ts src/shared/src/index.ts
git commit -m "feat(shared): add deterministic lessonId hash"
```

---

## Task 6: Implement `buildPrompt` (LLM prompt builders per style)

**Files:**
- Create: `src/shared/src/prompts.ts`
- Create: `src/shared/test/prompts.test.ts`
- Modify: `src/shared/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `src/shared/test/prompts.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildPrompt } from '../src/prompts.js';
import type { LessonParams } from '../src/types.js';

const base: LessonParams = {
  topic: 'at the bakery',
  lengthMin: 10,
  level: 3,
  style: 'dialogue',
  mode: 'bilingual',
  bilingualOrder: 'gr_first',
  nativeLang: 'en',
  ttsEngine: 'openai',
};

describe('buildPrompt', () => {
  it('mentions the topic verbatim', () => {
    expect(buildPrompt(base).user).toContain('at the bakery');
  });

  it('encodes the target length in approximate word count', () => {
    const p = buildPrompt({ ...base, lengthMin: 10 }).user;
    expect(p).toMatch(/about 1[34]\d\d words|approximately/i);
  });

  it('encodes level as a difficulty descriptor', () => {
    expect(buildPrompt({ ...base, level: 1 }).user).toMatch(/beginner|level 1/i);
    expect(buildPrompt({ ...base, level: 5 }).user).toMatch(/advanced|level 5/i);
  });

  it('selects the dialogue template for style=dialogue', () => {
    expect(buildPrompt({ ...base, style: 'dialogue' }).user).toMatch(/dialogue|conversation/i);
  });

  it('selects the story template for style=story', () => {
    expect(buildPrompt({ ...base, style: 'story' }).user).toMatch(/story|narrative/i);
  });

  it('selects the monologue template for style=mono', () => {
    expect(buildPrompt({ ...base, style: 'mono' }).user).toMatch(/monologue|narrator|essay/i);
  });

  it('specifies output format: GR||NATIVE pairs, one per line', () => {
    const p = buildPrompt(base).user;
    expect(p).toContain('GR||');
  });

  it('uses English for native language when nativeLang=en', () => {
    expect(buildPrompt({ ...base, nativeLang: 'en' }).user).toMatch(/English/i);
  });

  it('uses Russian for native language when nativeLang=ru', () => {
    expect(buildPrompt({ ...base, nativeLang: 'ru' }).user).toMatch(/Russian/i);
  });

  it('returns a system prompt that sets the assistant role', () => {
    expect(buildPrompt(base).system).toMatch(/Greek/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm run test --workspace @echolingo/shared
```

Expected: FAIL with "Cannot find module '../src/prompts.js'".

- [ ] **Step 3: Implement `buildPrompt`**

Create `src/shared/src/prompts.ts`:

```ts
import type { LessonParams, LessonStyle, LessonLevel, NativeLang } from './types.js';

const WORDS_PER_MINUTE = 130;

const NATIVE_LANG_NAME: Record<NativeLang, string> = {
  en: 'English',
  ru: 'Russian',
};

const LEVEL_DESCRIPTOR: Record<LessonLevel, string> = {
  1: 'level 1 (beginner — very simple vocabulary, short present-tense sentences)',
  2: 'level 2 (high beginner — common vocabulary, simple past/present, short sentences)',
  3: 'level 3 (intermediate — everyday vocabulary, common tenses, natural sentence length)',
  4: 'level 4 (upper-intermediate — richer vocabulary, varied tenses and subordination)',
  5: 'level 5 (advanced — idiomatic vocabulary, complex grammar, long varied sentences)',
};

const STYLE_INSTRUCTION: Record<LessonStyle, string> = {
  mono: 'Write a single-narrator monologue (essay-like) on the topic.',
  dialogue: 'Write a natural dialogue between two named speakers on the topic. Prefix each line with the speaker name and a colon, e.g. "Maria: ...".',
  story: 'Write a short narrative story on the topic with a clear setting and small plot.',
};

export interface BuiltPrompt {
  system: string;
  user: string;
}

export function buildPrompt(params: LessonParams): BuiltPrompt {
  const targetWords = Math.round(params.lengthMin * WORDS_PER_MINUTE);
  const nativeName = NATIVE_LANG_NAME[params.nativeLang];
  const level = LEVEL_DESCRIPTOR[params.level];
  const styleInstruction = STYLE_INSTRUCTION[params.style];

  const system =
    'You are a Greek language tutor producing bilingual listening lessons. ' +
    `You write idiomatic Modern Greek and provide accurate ${nativeName} translations.`;

  const user = [
    `Topic: ${params.topic}`,
    `Target length: approximately ${targetWords} words of spoken Greek.`,
    `Greek difficulty: ${level}.`,
    styleInstruction,
    '',
    'OUTPUT FORMAT (strict):',
    `- One line per sentence pair, in the form: GREEK_SENTENCE||${nativeName.toUpperCase()}_SENTENCE`,
    '- Separator is exactly two pipe characters: ||',
    '- Do not number the lines.',
    '- Do not output anything outside the GR||TRANSLATION pairs (no headings, no commentary).',
    '- Translations must be accurate, natural, and complete — not literal word-for-word.',
    '- Each Greek sentence should be one sentence (not a paragraph). Split long ideas into multiple pairs.',
  ].join('\n');

  return { system, user };
}
```

- [ ] **Step 4: Export from barrel**

Update `src/shared/src/index.ts`:

```ts
export { canonicalize } from './canonicalize.js';
export { lessonId } from './lesson-id.js';
export { buildPrompt } from './prompts.js';
export type { BuiltPrompt } from './prompts.js';
export * from './types.js';
```

- [ ] **Step 5: Run tests**

Run:

```bash
npm run test --workspace @echolingo/shared
```

Expected: PASS, all tests green.

- [ ] **Step 6: Commit**

```bash
git add src/shared/src/prompts.ts src/shared/test/prompts.test.ts src/shared/src/index.ts
git commit -m "feat(shared): add per-style LLM prompt builder"
```

---

## Task 7: Implement `parseScript` (LLM output → Sentence[])

**Files:**
- Create: `src/shared/src/parse-script.ts`
- Create: `src/shared/test/parse-script.test.ts`
- Modify: `src/shared/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `src/shared/test/parse-script.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseScript } from '../src/parse-script.js';

describe('parseScript', () => {
  it('parses GR||NATIVE pairs line by line', () => {
    const raw = ['Καλημέρα.||Good morning.', 'Πώς είσαι;||How are you?'].join('\n');
    expect(parseScript(raw)).toEqual([
      { i: 0, gr: 'Καλημέρα.', native: 'Good morning.', status: 'pending' },
      { i: 1, gr: 'Πώς είσαι;', native: 'How are you?', status: 'pending' },
    ]);
  });

  it('trims surrounding whitespace per sentence', () => {
    const raw = '  Καλημέρα.  ||   Good morning.   ';
    expect(parseScript(raw)[0]).toEqual({
      i: 0,
      gr: 'Καλημέρα.',
      native: 'Good morning.',
      status: 'pending',
    });
  });

  it('skips blank lines', () => {
    const raw = ['Καλημέρα.||Good morning.', '', '   ', 'Γεια.||Hi.'].join('\n');
    expect(parseScript(raw).map((s) => s.i)).toEqual([0, 1]);
  });

  it('skips lines that lack the separator', () => {
    const raw = ['Καλημέρα.||Good morning.', 'This line has no separator', 'Γεια.||Hi.'].join('\n');
    expect(parseScript(raw).map((s) => s.gr)).toEqual(['Καλημέρα.', 'Γεια.']);
  });

  it('skips lines where either side is empty after trim', () => {
    const raw = ['||Good morning.', 'Γεια.||', 'Καλημέρα.||Good morning.'].join('\n');
    expect(parseScript(raw)).toEqual([
      { i: 0, gr: 'Καλημέρα.', native: 'Good morning.', status: 'pending' },
    ]);
  });

  it('handles dialogue speaker prefixes by preserving them on both sides', () => {
    const raw = 'Maria: Καλημέρα.||Maria: Good morning.';
    expect(parseScript(raw)[0]).toEqual({
      i: 0,
      gr: 'Maria: Καλημέρα.',
      native: 'Maria: Good morning.',
      status: 'pending',
    });
  });

  it('reindexes sequentially even when invalid lines were skipped', () => {
    const raw = ['Καλημέρα.||Good morning.', 'bad line', 'Γεια.||Hi.', 'Πώς είσαι;||How are you?'].join('\n');
    expect(parseScript(raw).map((s) => s.i)).toEqual([0, 1, 2]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm run test --workspace @echolingo/shared
```

Expected: FAIL with "Cannot find module '../src/parse-script.js'".

- [ ] **Step 3: Implement `parseScript`**

Create `src/shared/src/parse-script.ts`:

```ts
import type { Sentence } from './types.js';

const SEPARATOR = '||';

export function parseScript(raw: string): Sentence[] {
  const sentences: Sentence[] = [];
  let i = 0;
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    const sepIndex = trimmed.indexOf(SEPARATOR);
    if (sepIndex === -1) continue;
    const gr = trimmed.slice(0, sepIndex).trim();
    const native = trimmed.slice(sepIndex + SEPARATOR.length).trim();
    if (gr.length === 0 || native.length === 0) continue;
    sentences.push({ i, gr, native, status: 'pending' });
    i += 1;
  }
  return sentences;
}
```

- [ ] **Step 4: Export from barrel**

Update `src/shared/src/index.ts`:

```ts
export { canonicalize } from './canonicalize.js';
export { lessonId } from './lesson-id.js';
export { buildPrompt } from './prompts.js';
export type { BuiltPrompt } from './prompts.js';
export { parseScript } from './parse-script.js';
export * from './types.js';
```

- [ ] **Step 5: Run tests**

Run:

```bash
npm run test --workspace @echolingo/shared
```

Expected: PASS, all tests green.

- [ ] **Step 6: Commit**

```bash
git add src/shared/src/parse-script.ts src/shared/test/parse-script.test.ts src/shared/src/index.ts
git commit -m "feat(shared): add LLM-output script parser"
```

---

## Task 8: Define `TtsEngine` interface and `MockTtsEngine`

**Files:**
- Create: `src/shared/src/tts/interface.ts`
- Create: `src/shared/src/tts/mock-engine.ts`
- Create: `src/shared/test/mock-engine.test.ts`
- Modify: `src/shared/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `src/shared/test/mock-engine.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { MockTtsEngine } from '../src/tts/mock-engine.js';

describe('MockTtsEngine', () => {
  it('reports its name', () => {
    expect(new MockTtsEngine().name).toBe('mock');
  });

  it('returns a non-empty mp3 buffer and a positive duration', async () => {
    const engine = new MockTtsEngine();
    const result = await engine.synthesize({ text: 'Καλημέρα', lang: 'el' });
    expect(result.mp3.length).toBeGreaterThan(0);
    expect(result.durationSec).toBeGreaterThan(0);
  });

  it('produces deterministic output for the same input', async () => {
    const engine = new MockTtsEngine();
    const a = await engine.synthesize({ text: 'Καλημέρα', lang: 'el' });
    const b = await engine.synthesize({ text: 'Καλημέρα', lang: 'el' });
    expect(a.mp3.equals(b.mp3)).toBe(true);
    expect(a.durationSec).toBe(b.durationSec);
  });

  it('duration scales roughly with text length', async () => {
    const engine = new MockTtsEngine();
    const short = await engine.synthesize({ text: 'Γεια.', lang: 'el' });
    const long = await engine.synthesize({
      text: 'Καλημέρα σε όλους, πώς είστε σήμερα το πρωί;',
      lang: 'el',
    });
    expect(long.durationSec).toBeGreaterThan(short.durationSec);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm run test --workspace @echolingo/shared
```

Expected: FAIL with "Cannot find module '../src/tts/mock-engine.js'".

- [ ] **Step 3: Implement the interface**

Create `src/shared/src/tts/interface.ts`:

```ts
import type { TtsEngineName } from '../types.js';

export type TtsLang = 'el' | 'en' | 'ru';

export interface TtsSynthesizeRequest {
  text: string;
  lang: TtsLang;
  voice?: string;
}

export interface TtsSynthesizeResult {
  mp3: Buffer;
  durationSec: number;
}

export interface TtsEngine {
  readonly name: TtsEngineName | 'mock';
  synthesize(req: TtsSynthesizeRequest): Promise<TtsSynthesizeResult>;
}
```

- [ ] **Step 4: Implement the mock**

Create `src/shared/src/tts/mock-engine.ts`:

```ts
import { createHash } from 'node:crypto';
import type {
  TtsEngine,
  TtsSynthesizeRequest,
  TtsSynthesizeResult,
} from './interface.js';

const CHARS_PER_SECOND = 14;

export class MockTtsEngine implements TtsEngine {
  readonly name = 'mock' as const;

  async synthesize(req: TtsSynthesizeRequest): Promise<TtsSynthesizeResult> {
    const seed = createHash('sha256')
      .update(`${req.lang}::${req.voice ?? ''}::${req.text}`)
      .digest();
    const mp3 = Buffer.concat([Buffer.from('MOCKMP3'), seed]);
    const durationSec = Math.max(0.3, req.text.length / CHARS_PER_SECOND);
    return { mp3, durationSec };
  }
}
```

- [ ] **Step 5: Export from barrel**

Update `src/shared/src/index.ts`:

```ts
export { canonicalize } from './canonicalize.js';
export { lessonId } from './lesson-id.js';
export { buildPrompt } from './prompts.js';
export type { BuiltPrompt } from './prompts.js';
export { parseScript } from './parse-script.js';
export type {
  TtsEngine,
  TtsLang,
  TtsSynthesizeRequest,
  TtsSynthesizeResult,
} from './tts/interface.js';
export { MockTtsEngine } from './tts/mock-engine.js';
export * from './types.js';
```

- [ ] **Step 6: Run tests**

Run:

```bash
npm run test --workspace @echolingo/shared
```

Expected: PASS, all tests green.

- [ ] **Step 7: Commit**

```bash
git add src/shared/src/tts src/shared/test/mock-engine.test.ts src/shared/src/index.ts
git commit -m "feat(shared): add TtsEngine interface and MockTtsEngine"
```

---

## Task 9: Scaffold `src/api` (Azure Functions v4 isolated, Node 20 TS)

**Files:**
- Create: `src/api/package.json`
- Create: `src/api/tsconfig.json`
- Create: `src/api/host.json`
- Create: `src/api/local.settings.json.example`
- Create: `src/api/src/index.ts`
- Create: `src/api/src/functions/health.ts`
- Create: `src/api/test/health.test.ts`

- [ ] **Step 1: Write `src/api/package.json`**

```json
{
  "name": "@echolingo/api",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "dist/src/index.js",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "start": "npm run build && func start",
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@azure/functions": "^4.5.1",
    "@echolingo/shared": "*"
  },
  "devDependencies": {
    "@types/node": "^20.16.10",
    "vitest": "^2.1.4"
  }
}
```

- [ ] **Step 2: Write `src/api/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "dist",
    "rootDir": ".",
    "types": ["node"]
  },
  "include": ["src/**/*", "test/**/*"]
}
```

- [ ] **Step 3: Write `src/api/host.json`**

```json
{
  "version": "2.0",
  "logging": {
    "applicationInsights": {
      "samplingSettings": { "isEnabled": true, "excludedTypes": "Request" }
    }
  },
  "extensionBundle": {
    "id": "Microsoft.Azure.Functions.ExtensionBundle",
    "version": "[4.*, 5.0.0)"
  }
}
```

- [ ] **Step 4: Write `src/api/local.settings.json.example`**

```json
{
  "IsEncrypted": false,
  "Values": {
    "AzureWebJobsStorage": "UseDevelopmentStorage=true",
    "FUNCTIONS_WORKER_RUNTIME": "node",
    "FUNCTIONS_EXTENSION_VERSION": "~4",
    "AzureWebJobsFeatureFlags": "EnableWorkerIndexing"
  }
}
```

- [ ] **Step 5: Write the failing health test**

Create `src/api/test/health.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { healthHandler } from '../src/functions/health.js';

describe('healthHandler', () => {
  it('responds 200 with status ok and a timestamp', async () => {
    const res = await healthHandler();
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body as string);
    expect(body.status).toBe('ok');
    expect(typeof body.timestamp).toBe('string');
    expect(new Date(body.timestamp).toString()).not.toBe('Invalid Date');
  });
});
```

- [ ] **Step 6: Write the function entry**

Create `src/api/src/functions/health.ts`:

```ts
import { app, type HttpResponseInit } from '@azure/functions';

export async function healthHandler(): Promise<HttpResponseInit> {
  return {
    status: 200,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }),
  };
}

app.http('health', {
  route: 'health',
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: healthHandler,
});
```

Create `src/api/src/index.ts`:

```ts
import './functions/health.js';
```

- [ ] **Step 7: Add vitest config**

Create `src/api/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
});
```

- [ ] **Step 8: Install workspace dependencies**

Run:

```bash
npm install
```

Expected: `@azure/functions` installed; `@echolingo/shared` linked as workspace.

- [ ] **Step 9: Run tests**

Run:

```bash
npm run test --workspace @echolingo/api
```

Expected: PASS, 1 test.

- [ ] **Step 10: Commit**

```bash
git add src/api package.json package-lock.json
git commit -m "feat(api): scaffold Azure Functions v4 with /api/health"
```

---

## Task 10: Scaffold `src/web` (Next.js 15, app router, Tailwind, static export)

**Files:**
- Create: `src/web/package.json`
- Create: `src/web/tsconfig.json`
- Create: `src/web/next.config.mjs`
- Create: `src/web/tailwind.config.ts`
- Create: `src/web/postcss.config.mjs`
- Create: `src/web/app/layout.tsx`
- Create: `src/web/app/page.tsx`
- Create: `src/web/app/globals.css`
- Create: `src/web/public/manifest.webmanifest`
- Create: `src/web/public/sw.js`

- [ ] **Step 1: Write `src/web/package.json`**

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
    "test": "echo 'web tests run via Playwright in later plan' && exit 0"
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
    "tailwindcss": "^3.4.14"
  }
}
```

- [ ] **Step 2: Write `src/web/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "preserve",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "noEmit": true,
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "types": ["node"]
  },
  "include": ["app/**/*", "next-env.d.ts", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Write `src/web/next.config.mjs`**

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  reactStrictMode: true,
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
```

- [ ] **Step 4: Write `src/web/tailwind.config.ts`**

```ts
import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}'],
  theme: { extend: {} },
  plugins: [],
};

export default config;
```

- [ ] **Step 5: Write `src/web/postcss.config.mjs`**

```js
export default {
  plugins: { tailwindcss: {}, autoprefixer: {} },
};
```

- [ ] **Step 6: Write `src/web/app/globals.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 7: Write `src/web/app/layout.tsx`**

```tsx
import './globals.css';
import type { ReactNode } from 'react';

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
      </body>
    </html>
  );
}
```

- [ ] **Step 8: Write `src/web/app/page.tsx`**

```tsx
export default function HomePage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-3xl font-semibold">Echolingo</h1>
      <p className="mt-2 text-neutral-600">
        On-demand Greek listening lessons. The form lives here (Plan 3).
      </p>
    </main>
  );
}
```

- [ ] **Step 9: Write `src/web/public/manifest.webmanifest`**

```json
{
  "name": "Echolingo",
  "short_name": "Echolingo",
  "description": "On-demand AI-generated Greek listening lessons",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#0f172a",
  "icons": []
}
```

- [ ] **Step 10: Write `src/web/public/sw.js` (stub)**

```js
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {
  // Plan 3 implements offline caching.
});
```

- [ ] **Step 11: Install workspace dependencies**

Run:

```bash
npm install
```

- [ ] **Step 12: Verify the build**

Run:

```bash
npm run build --workspace @echolingo/web
```

Expected: SUCCESS, an `out/` directory is produced containing `index.html` and `_next/`.

- [ ] **Step 13: Commit**

```bash
git add src/web package.json package-lock.json
git commit -m "feat(web): scaffold Next.js 15 PWA with Tailwind and static export"
```

---

## Task 11: Add Azurite local emulator (docker-compose)

**Files:**
- Create: `docker-compose.yml`

- [ ] **Step 1: Write `docker-compose.yml`**

```yaml
services:
  azurite:
    image: mcr.microsoft.com/azure-storage/azurite:latest
    container_name: echolingo-azurite
    command: >
      azurite
      --blobHost 0.0.0.0
      --queueHost 0.0.0.0
      --tableHost 0.0.0.0
      --location /data
      --silent
    ports:
      - '10000:10000'
      - '10001:10001'
      - '10002:10002'
    volumes:
      - ./azurite-data:/data
```

- [ ] **Step 2: Start Azurite**

Run:

```bash
docker compose up -d azurite
```

Expected: container `echolingo-azurite` is created and reports "running".

- [ ] **Step 3: Smoke-test Azurite is reachable**

Run:

```bash
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:10000/devstoreaccount1
```

Expected: `400` (Azurite returns 400 for the unauthenticated root request; any HTTP response confirms it's up).

- [ ] **Step 4: Stop Azurite**

Run:

```bash
docker compose down
```

Expected: container removed cleanly.

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml
git commit -m "chore: add Azurite docker-compose for local Storage/Queue emulator"
```

---

## Task 12: Initialize `azd` project (azure.yaml + placeholder Bicep)

**Files:**
- Create: `azure.yaml`
- Create: `infra/main.bicep`
- Create: `infra/main.parameters.json`

- [ ] **Step 1: Write `azure.yaml`**

```yaml
name: echolingo
metadata:
  template: echolingo@0.0.1
services:
  web:
    project: ./src/web
    language: ts
    host: staticwebapp
    dist: out
  api:
    project: ./src/api
    language: ts
    host: function
```

- [ ] **Step 2: Write `infra/main.bicep` (placeholder)**

```bicep
// Placeholder Bicep module.
// Real resources (Static Web App, Function App, Cosmos DB, Storage, Web PubSub,
// Key Vault, Application Insights) are added in Plan 5 (Deploy).

targetScope = 'resourceGroup'

@description('Environment name (azd-injected).')
param environmentName string

@description('Primary Azure region (azd-injected).')
param location string

output AZURE_LOCATION string = location
output AZURE_ENVIRONMENT_NAME string = environmentName
```

- [ ] **Step 3: Write `infra/main.parameters.json`**

```json
{
  "$schema": "https://schema.management.azure.com/schemas/2019-04-01/deploymentParameters.json#",
  "contentVersion": "1.0.0.0",
  "parameters": {
    "environmentName": { "value": "${AZURE_ENV_NAME}" },
    "location": { "value": "${AZURE_LOCATION}" }
  }
}
```

- [ ] **Step 4: Verify `azd` accepts the project**

Run:

```bash
azd config show 2>&1 || true
azd env list 2>&1 || true
```

Expected: `azd` is present (skip this step if `azd` is not installed locally — the file shape is what matters; deployment lives in Plan 5).

- [ ] **Step 5: Commit**

```bash
git add azure.yaml infra/
git commit -m "chore: initialize azd project with placeholder Bicep"
```

---

## Task 13: GitHub Actions CI (lint + test on PR)

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Write `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run test
      - run: npm run build --workspace @echolingo/web
```

- [ ] **Step 2: Run the same commands locally to verify the workflow will pass**

Run:

```bash
npm ci
npm run lint
npm run test
npm run build --workspace @echolingo/web
```

Expected: every step exits 0.

- [ ] **Step 3: Commit and push**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add lint+test+build workflow for PRs and main"
git push origin main
```

Expected: CI run appears at https://github.com/superroma/echolingo/actions and turns green.

---

## Task 14: Update README with dev setup

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Replace `README.md`**

```markdown
# Echolingo

On-demand AI-generated Greek listening lessons for learners walking, driving, or away from a screen. Pick a topic, length, and level — audio streams within seconds. Bilingual mode echoes each sentence in Greek and your native language.

- PWA first (Azure Static Web Apps), React Native wrapper later
- No login; lessons addressable by a deterministic URL — share and reopen instantly
- Serverless on Azure, IaC via Bicep, deploys via `azd`

See [`docs/superpowers/specs/2026-05-16-echolingo-design.md`](docs/superpowers/specs/2026-05-16-echolingo-design.md) for the full design spec.

## Repository layout

```
azure.yaml         azd service map
infra/             Bicep modules (placeholder until Plan 5)
src/
  shared/          @echolingo/shared — domain types, prompts, parsers, TTS interface
  web/             @echolingo/web    — Next.js 15 PWA (static export)
  api/             @echolingo/api    — Azure Functions v4 (Node 20 TS)
docker-compose.yml Azurite (local Storage/Queue emulator)
```

## Prerequisites

- Node 20 (`nvm use`)
- npm 10+
- Docker (for Azurite)
- Azure Functions Core Tools v4: `npm install -g azure-functions-core-tools@4 --unsafe-perm true`
- (Plan 5) `azd` CLI: https://learn.microsoft.com/azure/developer/azure-developer-cli/install-azd

## Install

```bash
npm install
```

## Run locally

In three terminals:

```bash
# 1. Storage emulator
docker compose up -d azurite

# 2. Backend
npm run dev:api          # starts Azure Functions on http://localhost:7071

# 3. Frontend
npm run dev:web          # starts Next.js on http://localhost:3000
```

Smoke-test the API:

```bash
curl http://localhost:7071/api/health
```

## Test

```bash
npm run test             # all workspaces
npm run test --workspace @echolingo/shared
```

## Status

Plan 1 (Foundation) — scaffolding only. Lesson generation begins in Plan 2.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: README with dev setup and repo layout"
```

---

## Final verification

- [ ] **Step 1: Run the full test suite from a clean install**

```bash
rm -rf node_modules src/*/node_modules
npm ci
npm run lint
npm run test
npm run build --workspace @echolingo/web
```

Expected: every step exits 0.

- [ ] **Step 2: Boot the full local dev loop**

In separate terminals:

```bash
docker compose up -d azurite
npm run dev:api
npm run dev:web
```

Then:

```bash
curl http://localhost:7071/api/health
# {"status":"ok","timestamp":"2026-05-16T..."}

curl -I http://localhost:3000
# HTTP/1.1 200 OK
```

Expected: both URLs respond. Azurite is up on ports 10000/10001/10002.

- [ ] **Step 3: Tear down**

```bash
docker compose down
```

---

## What Plan 1 does NOT include (handed off to later plans)

- Real lesson generation endpoint (`POST /api/lesson`) — **Plan 2**
- Queue workers (script-generation, tts-sentence) — **Plan 2**
- Cosmos DB integration (currently no DB; types only) — **Plan 2**
- Blob Storage uploads — **Plan 2**
- Frontend lesson form and player UI — **Plan 3**
- Real LLM and TTS provider adapters (OpenAI, ElevenLabs, Google) — **Plan 4**
- Rate limiting, error handling beyond happy path — **Plan 4**
- Offline download endpoint and MP3 concatenation — **Plan 4**
- Application Insights wiring — **Plan 4**
- Real Bicep modules (Static Web App, Function App, Cosmos, Storage, Web PubSub, Key Vault) — **Plan 5**
- GitHub Actions OIDC deploy — **Plan 5**
