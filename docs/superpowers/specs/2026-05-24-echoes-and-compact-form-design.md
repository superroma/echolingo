# Echoes list + compact create form — design

## Goal

The home page becomes a list of previously-generated lessons ("echoes") with a compact create-echo form at the top. Submitting a new echo navigates straight to the lesson page, where all generation progress and errors are surfaced. The form drops fields that rarely change (style, mode, bilingual order) and replaces the language chip grids with native `<select>` controls.

## Scope

In scope:
- Home page redesign (create form + echoes list).
- New `useEchoes` hook backed by `localStorage`.
- New `/lesson/new` route that takes form params via query string, POSTs to the API, then `router.replace`s to `/lesson/[id]/`.
- Lesson page error/`creating`/`failed` states with retry affordances.
- Form simplifications: remove style and mode controls; remove bilingual-order toggle; replace language chip grids with `<select>`s; topic becomes a multi-line textarea.

Out of scope:
- Server-side changes. Web continues to send `mode: 'bilingual'`, `style: 'dialogue'`, `bilingualOrder: 'target_first'` so the API stays unchanged.
- Echoes sync across devices/browsers (local-only).
- Search/filter over the echoes list.

## Home page (`/`)

Single phone-width column. Two sections, both inside `main`:

1. **Create echo** — the form (see below).
2. **Echoes** — the list of locally-remembered lessons.

### Create form

Fields, top to bottom:

| Field         | Control                                                                                         |
|---------------|-------------------------------------------------------------------------------------------------|
| Topic         | `<textarea>` 3 rows, serif, auto-grows up to ~8 rows. Placeholder e.g. `at the bakery, ordering coffee, …`. |
| Languages     | Two side-by-side `<select>`s: `I speak [native ▾]` and `Learning [target ▾]`.                   |
| Length        | Chip row: 5 / 10 / 20 / 30 min.                                                                 |
| Level         | Range slider 1–5 (label shows current value).                                                   |
| Submit        | Terracotta pill "Go". No text change on click.                                                  |

Language selects:
- `target` options: all `LANG_CODES` minus `nativeLang`.
- `native` options: all `LANG_CODES` minus `targetLang`.
- If the user picks a `target` that equals current `native`, swap `native` to the previous `target` (matches existing `pickTarget` behavior).

The form persists prefs to `localStorage` exactly as today (key `echolingo:prefs`, topic excluded). The persisted shape loses `style`, `mode`, `bilingualOrder` — `loadPrefs` ignores any leftover keys.

### Echoes list

Heading: lowercase serif `echoes`.

Empty state: muted line "your echoes will appear here".

Each row (most recent first):
- Topic (single line, truncated).
- Meta line: `{targetLang name} · {lengthMin}min · L{level}`.
- Relative time (`just now`, `3 min ago`, `2 days ago`).
- Status indicator dot:
  - `generating_script` / `generating_audio` — pulsing aegean dot.
  - `ready` — filled ink dot.
  - `failed` — terracotta ring.
- Tap row → `router.push('/lesson/{id}/')`.
- Small `×` button on the right → confirms removal from local list (does not delete on the server).

List is capped at **50 entries**. New entries push, oldest fall off.

On home page mount, for every echo whose `lastStatus` is `generating_*`, fetch `/api/lesson/{id}` once and update the cached status. Failed fetches (404 / network) leave the status as-is; a 404 marks the echo as `failed` with `error: 'lesson not found'`. No long-running polling on the home page.

## Local storage shape

Key: `echolingo:echoes`.

```ts
interface Echo {
  id: string;
  topic: string;
  targetLang: LangCode;
  nativeLang: LangCode;
  lengthMin: LessonLength;
  level: LessonLevel;
  createdAt: string;          // ISO from server response or client time
  lastStatus: LessonStatus;   // mirrors server status
  error?: string;             // present when lastStatus === 'failed'
}
```

Storage value: `Echo[]`, newest-first.

Hook: `useEchoes()` returns `{ echoes, addEcho, updateEcho, removeEcho }`. SSR-safe (empty array until mount, same pattern as `usePrefs`).

Invalid JSON or schema mismatch → reset to `[]`.

## Submit flow

User clicks Go:

1. Form serializes prefs + topic to a query string.
2. `router.push('/lesson/new?topic=...&targetLang=...&...')`. No state change on the home page — no spinner, no button-text change.

The `/lesson/new` route:

1. Reads query params; validates them with `isLessonParams` (after injecting the constants `mode`, `style`, `bilingualOrder`, `ttsEngine`).
2. Calls `createLesson(params)`.
3. On `created` / `existing`:
   - `addEcho({ id, ...params subset, createdAt: now, lastStatus: 'generating_script' })`.
   - `router.replace('/lesson/{id}/')`.
4. On `rate_limited` / `error` / network failure: stay on `/lesson/new`, render the same `LessonClient` UI in its respective error state (see below). No echo is added.

`/lesson/new` and `/lesson/[id]` share a single client component that accepts either `{ kind: 'new'; params }` or `{ kind: 'existing'; id }` props. The shared component owns the state machine described below.

## Lesson page states

```
creating       — POST in flight (only on /lesson/new)
rate_limited   — POST returned 429
network_error  — POST or GET failed (network / 5xx)
generating_script   — server status
generating_audio    — server status
failed         — server status; error from `lesson.error`
ready          — server status; existing player
```

UI per state (all keep the top bar with `back → /`):

- `creating`: centered muted text "starting your echo…" + small spinner.
- `rate_limited`: card with "Daily limit reached ({used}/{limit}). Resets at {resetAt}." + a back button.
- `network_error`: card with "Couldn't reach server." + Retry button (re-runs the failing request).
- `generating_*`: existing `<LessonProgress>` UI.
- `failed`: card with `lesson.error || 'Generation failed.'` + Retry button. Retry POSTs a new lesson with the same params; on success, the old failed echo is removed from local storage, a new echo is added with the new id, and the page `router.replace`s to `/lesson/{newId}/`.
- `ready`: existing transcript + player.

The component is implemented as a small state machine; transitions:

- `new` mode: start in `creating` → `POST` → `{ ready-to-poll | rate_limited | network_error }`.
- `existing` mode: start in `loading` → `GET` → `{ ok(status) | not_found | network_error }`.
- While `ok` with `generating_*`, continue existing 2 s polling.

Existing `useLesson` hook is extended to expose the same shape but also to surface network errors (today it sets `kind: 'error'`; we keep that, mapped to `network_error` in the UI).

## Form simplifications — type and API impact

Web stops reading/writing `style`, `mode`, `bilingualOrder` from prefs. The form injects these constants when building `LessonParams`:

```ts
const params: LessonParams = {
  topic,
  targetLang, nativeLang,
  lengthMin, level,
  style: 'dialogue',
  mode: 'bilingual',
  bilingualOrder: 'target_first',
  ttsEngine: 'openai',
};
```

`FormPrefs` shrinks to `{ topic, targetLang, nativeLang, lengthMin, level }`. `loadPrefs` ignores legacy keys. No migration needed — old persisted prefs are simply over-keyed and the extra keys are dropped on next save.

The shared types (`LessonStyle`, `LessonMode`, `BilingualOrder`) and the API surface stay unchanged.

## Component layout

```
src/web/
  app/
    page.tsx                          # renders <HomeClient />
    lesson/
      [id]/page.tsx                   # renders <LessonClient kind="existing" id={...} />
      new/page.tsx                    # renders <LessonClient kind="new" params={...} />
  components/
    home-client.tsx                   # NEW — wraps <CreateEchoForm /> + <EchoesList />
    create-echo-form.tsx              # NEW — replaces lesson-form.tsx
    echoes-list.tsx                   # NEW
    lesson-client.tsx                 # MOVED from app/lesson/[id]/, generalized to handle new+existing
    lesson-progress.tsx               # unchanged
    player-controls.tsx               # unchanged
    transcript-view.tsx               # unchanged
    scrubber.tsx                      # unchanged
  hooks/
    use-echoes.ts                     # NEW
    use-prefs.ts                      # shrunk
    use-lesson.ts                     # minor changes (expose network_error cleanly)
    use-player.ts                     # unchanged
    playlist-math.ts                  # unchanged
```

`lesson-form.tsx` is deleted; the new `create-echo-form.tsx` is small enough that splitting controls into separate files is unnecessary.

## Testing

- `use-prefs.test.ts` — update for the shrunk shape; assert legacy keys are dropped.
- `use-echoes.test.ts` — NEW. Cover: empty load, add/update/remove, 50-cap eviction, invalid JSON reset.
- `lesson-client` unit tests covering each state transition (mock `createLesson` / `getLesson`).
- Manual: golden path (create, navigate, watch progress, play); rate-limit path; failed-lesson retry; home-page echoes list with mixed statuses.

## Risks & open considerations

- **Browser back from `/lesson/new` mid-POST** — the in-flight POST is abandoned; if the server still creates the lesson, the user won't have it in their echoes list. Acceptable: rare, no data loss server-side, user can re-submit and get the `existing` result (same hash) which we'll then add to echoes.
- **Echo ID conflicts across devices** — none, since echoes are local-only.
- **No "remove all"** — out of scope; user can clear via DevTools if needed.
