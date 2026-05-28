# Shared Echo Discovery — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the play screen's `←` back button with a persistent top app bar (wordmark + `+ new`) used on every screen, and silently adopt opened echoes into the local library so friends who arrive via shared links find them when they navigate home.

**Architecture:** One new presentational component (`AppBar`) is rendered from both `home-client.tsx` and the `PageFrame` inside `echo-client.tsx`. `ExistingEcho` gains a one-shot effect that calls `useEchoes().addEcho()` the first time the lesson resolves; `addEchoTo` already de-dupes by id. Web-only; no API changes.

**Tech Stack:** Next.js 15 app router (static export), React 18, Tailwind, vitest (unit), Playwright (e2e). No component-test runner — DOM behavior is covered by Playwright.

---

## File Structure

| File | Role |
|---|---|
| `src/web/components/app-bar.tsx` *(new)* | Stateless top bar: wordmark (left, → `/`), optional middle title, `+ new` pill (right, → `/echo/new`). |
| `src/web/components/home-client.tsx` *(modify)* | Drop centered `<header>` wordmark + tagline; render `<AppBar />`; relocate tagline above `<CreateEchoForm />`. |
| `src/web/components/echo-client.tsx` *(modify)* | Replace `PageFrame`'s internal `<header>` with `<AppBar title={…} />`. Add silent-adoption effect to `ExistingEcho`. |
| `tests/e2e/create-flow.spec.ts` *(modify)* | Existing test clicks `'Back'` — switch to clicking the wordmark. |
| `tests/e2e/shared-echo-discovery.spec.ts` *(new)* | Friend opens shared echo → returns home → sees it in list. Top bar visible on home; `+ new` navigates to `/echo/new`. |

`use-echoes.ts` already supports the idempotent-add behavior we need (`addEchoTo` filters duplicates by id then prepends). No changes there; existing tests already cover de-dup at line 85 of `use-echoes.test.ts`.

---

## Task 1: Create the AppBar component

**Files:**
- Create: `src/web/components/app-bar.tsx`

- [ ] **Step 1: Write the component**

```tsx
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
```

Notes:
- `next/link` gives client-side navigation that works with the static export.
- `z-20` puts the bar above the player controls bar (`z-10`) in case of overlap during scroll.
- The middle slot is rendered even when empty so the left wordmark and right `+ new` pill stay anchored.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck --workspace @echolingo/web`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/web/components/app-bar.tsx
git commit -m "feat(web): add persistent AppBar (wordmark + new)"
```

---

## Task 2: Adopt AppBar on the home screen

**Files:**
- Modify: `src/web/components/home-client.tsx`

- [ ] **Step 1: Replace the centered header block**

Current `home-client.tsx` (lines 41–54) returns:

```tsx
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
    <CreateEchoForm />
    <EchoesList echoes={echoes} hydrated={hydrated} onRemove={removeEcho} />
  </main>
);
```

Replace with:

```tsx
return (
  <>
    <AppBar />
    <main className="mx-auto max-w-md px-5 py-8">
      <p className="mb-6 text-center text-sm text-ink-muted">
        listening lessons, on demand
      </p>
      <CreateEchoForm />
      <EchoesList echoes={echoes} hydrated={hydrated} onRemove={removeEcho} />
    </main>
  </>
);
```

And add the import at the top of the file, next to the other component imports:

```tsx
import { AppBar } from './app-bar';
```

Rationale:
- The large `echolingo` wordmark is now in the AppBar; the body keeps only the tagline so first-time visitors still get a one-line orientation.
- `py-10` → `py-8` because the AppBar adds 48px of chrome.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck --workspace @echolingo/web`
Expected: no errors.

- [ ] **Step 3: Manual smoke (optional)**

Run: `npm run dev:web` and open `http://localhost:3000`.
Expected: sticky top bar with `echolingo` wordmark on the left, `+ new` pill on the right; tagline above the create form; echoes list below.

- [ ] **Step 4: Commit**

```bash
git add src/web/components/home-client.tsx
git commit -m "feat(web): use AppBar on home screen"
```

---

## Task 3: Adopt AppBar in the echo PageFrame (remove back arrow)

**Files:**
- Modify: `src/web/components/echo-client.tsx` (the `PageFrame` function at lines 301–328)

- [ ] **Step 1: Replace the PageFrame header**

Current `PageFrame` body (lines 310–327):

```tsx
const router = useRouter();
return (
  <div className={`min-h-screen ${pad ? 'pb-40' : ''}`}>
    <header className="sticky top-0 z-10 flex h-12 items-center border-b border-hairline bg-paper/95 px-3 backdrop-blur">
      <button
        type="button"
        onClick={() => router.push('/')}
        className="rounded p-1 text-ink-muted hover:text-ink"
        aria-label="Back"
      >
        ←
      </button>
      <h1 className="mx-auto max-w-[60%] truncate text-sm font-medium text-ink">{title}</h1>
      <span className="w-7" aria-hidden />
    </header>
    <main className="mx-auto max-w-2xl px-4 py-6">{children}</main>
  </div>
);
```

Replace with:

```tsx
return (
  <div className={`min-h-screen ${pad ? 'pb-40' : ''}`}>
    <AppBar title={title} />
    <main className="mx-auto max-w-2xl px-4 py-6">{children}</main>
  </div>
);
```

Then:
- Remove the now-unused `const router = useRouter();` line inside `PageFrame`.
- If `useRouter` is no longer used anywhere else in the file, leave the import — `NewEcho` and `ExistingEcho` still call `useRouter()` for `router.replace(...)` and back-on-not-found paths. Verify by grep before deleting.
- Add the import at the top of the file, next to the other component imports:

```tsx
import { AppBar } from './app-bar';
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck --workspace @echolingo/web`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/web/components/echo-client.tsx
git commit -m "feat(web): use AppBar on echo screen (remove back arrow)"
```

---

## Task 4: Update the existing e2e test that clicks "Back"

**Files:**
- Modify: `tests/e2e/create-flow.spec.ts` (line 45)

- [ ] **Step 1: Replace the "Back" click with the wordmark link**

Change:

```ts
// Go back to home — echo should be in the list
await page.getByRole('button', { name: 'Back' }).click();
await expect(page).toHaveURL('http://localhost:3000/');
await expect(page.getByText('a walk through Plaka')).toBeVisible();
```

To:

```ts
// Go back to home — echo should be in the list
await page.getByRole('link', { name: 'echolingo' }).click();
await expect(page).toHaveURL('http://localhost:3000/');
await expect(page.getByText('a walk through Plaka')).toBeVisible();
```

- [ ] **Step 2: Run the updated test**

Run: `npx playwright test tests/e2e/create-flow.spec.ts -g "persists"`
Expected: PASS.

If the existing test name doesn't match `"persists"`, run the whole file: `npx playwright test tests/e2e/create-flow.spec.ts`.

- [ ] **Step 3: Run the full e2e suite to catch regressions**

Run: `npx playwright test`
Expected: all green. The home (`home.spec.ts`), echoes-list, and error-states specs should be unaffected by AppBar — they assert by text content and roles that still exist. If any fail because they query the old centered `<h1>echolingo</h1>` heading by role, update them to query the wordmark link by role `link` with name `echolingo`. Do not weaken assertions to make them pass.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/create-flow.spec.ts
# include any other test files you had to update in step 3
git commit -m "test(e2e): update navigation tests for AppBar wordmark"
```

---

## Task 5: Silent adoption in ExistingEcho (TDD)

**Files:**
- Create: `tests/e2e/shared-echo-discovery.spec.ts`
- Modify: `src/web/components/echo-client.tsx` (the `ExistingEcho` function, around lines 110–124)

- [ ] **Step 1: Write the failing e2e test**

Create `tests/e2e/shared-echo-discovery.spec.ts`:

```ts
import { test, expect } from './fixture';
import { mockGetLesson } from './helpers';

test.describe('shared echo discovery', () => {
  test('opening a shared echo adopts it into the local library', async ({ page }) => {
    // Friend arrives with an empty library
    await mockGetLesson(page, 'shared-1', [
      { id: 'shared-1', status: 'ready', topic: 'a walk through Plaka' },
    ]);

    await page.goto('/echo/shared-1/');
    // Wait for the lesson to load (the title in the AppBar reflects the topic)
    await expect(page.getByRole('heading', { name: 'a walk through Plaka' })).toBeVisible();

    // Navigate home via the AppBar wordmark
    await page.getByRole('link', { name: 'echolingo' }).click();
    await expect(page).toHaveURL('http://localhost:3000/');

    // The shared echo is now in the friend's library
    await expect(page.getByText('a walk through Plaka')).toBeVisible();
  });

  test('AppBar +new pill navigates from the echo screen to the create form', async ({ page }) => {
    await mockGetLesson(page, 'shared-2', [
      { id: 'shared-2', status: 'ready', topic: 'morning at the bakery' },
    ]);

    await page.goto('/echo/shared-2/');
    await expect(page.getByRole('heading', { name: 'morning at the bakery' })).toBeVisible();

    await page.getByRole('link', { name: '+ new' }).click();
    await expect(page).toHaveURL(/\/echo\/new\/?$/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx playwright test tests/e2e/shared-echo-discovery.spec.ts`
Expected: FAIL on the first test — `'a walk through Plaka'` is not visible on `/` because nothing is adding the echo to localStorage. The second test should already PASS (Tasks 1–3 wired the AppBar).

- [ ] **Step 3: Add the adoption effect to `ExistingEcho`**

In `src/web/components/echo-client.tsx`, inside the `ExistingEcho` function, find the existing `useEffect` that calls `updateEcho` (around lines 116–123):

```tsx
useEffect(() => {
  if (state.kind === 'ok') {
    updateEcho(id, {
      lastStatus: state.echo.status,
      error: state.echo.error,
    });
  }
}, [state, id, updateEcho]);
```

Add a new effect *immediately above* it (so the echo gets added before any update fires against it):

```tsx
const adoptedRef = useRef(false);
useEffect(() => {
  if (state.kind !== 'ok' || adoptedRef.current) return;
  adoptedRef.current = true;
  addEcho({
    id,
    topic: state.echo.params.topic,
    targetLang: state.echo.params.targetLang,
    nativeLang: state.echo.params.nativeLang,
    lengthMin: state.echo.params.lengthMin,
    level: state.echo.params.level,
    createdAt: state.echo.createdAt,
    lastStatus: state.echo.status,
  });
}, [state, id, addEcho]);
```

Notes:
- `adoptedRef` guards against the effect firing repeatedly as the poll re-renders `state`. We adopt once per mount.
- Adopting your own echo is a no-op for list count — `addEchoTo` de-dupes by id (see `use-echoes.test.ts:85`). It *will* move the entry to the top of the list and overwrite stored fields with current server truth; that's acceptable "recently-opened" behavior.
- We pass `state.echo.createdAt` (the server's timestamp) rather than `new Date().toISOString()` so the sort order reflects when the echo was actually generated.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx playwright test tests/e2e/shared-echo-discovery.spec.ts`
Expected: both tests PASS.

- [ ] **Step 5: Run the full e2e suite**

Run: `npx playwright test`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/web/components/echo-client.tsx tests/e2e/shared-echo-discovery.spec.ts
git commit -m "feat(web): adopt opened echoes into local library

Friends who arrive via shared /echo/<id>/ links now see the echo in
their list when they navigate home, no explicit save needed."
```

---

## Task 6: Final verification

- [ ] **Step 1: Run all checks**

Run, in parallel where possible:
- `npm run typecheck --workspace @echolingo/web`
- `npm run test --workspaces --if-present`
- `npx playwright test`

Expected: all green.

- [ ] **Step 2: Manual smoke (recommended)**

In three terminals: `npm run azurite`, `npm run dev:api`, `npm run dev:web`. Then:

1. Open `http://localhost:3000`. Confirm the AppBar shows `echolingo` (left) and `+ new` (right), with the tagline visible above the create form.
2. Tap `+ new`. Confirm `/echo/new` loads with the AppBar.
3. Create an echo and let it reach `ready`. Confirm the AppBar shows the topic centered, no `←`.
4. Open the same `/echo/<id>/` URL in a fresh Incognito window. Confirm the play screen loads, then tap the wordmark. Confirm the home shows that echo in the list.

- [ ] **Step 3: No final commit needed** unless step 2 surfaced anything to fix.

---

## Spec Coverage Check

- Persistent top app bar with wordmark + `+ new`: Tasks 1, 2, 3.
- Wordmark routes to `/`: Task 1 (Link `href="/"`).
- `+ new` routes to `/echo/new`: Task 1 (Link `href="/echo/new"`), verified Task 5.
- Replace `←` button on play screen: Task 3.
- Tagline relocated to home body: Task 2.
- Silent adoption (once per mount, via `addEcho` with server-truth `createdAt`): Task 5.
- Idempotent on owner-revisit: covered by existing `use-echoes.test.ts:85` (already passes; called out in spec).
- E2E coverage for the friend-flow: Task 5.
- Out of scope (no API changes, no share button, no onboarding, no sync): no tasks — correctly excluded.
