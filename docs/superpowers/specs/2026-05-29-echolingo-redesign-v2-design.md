# Echolingo redesign (v2) — design

Recreate the high-fidelity design handoff (`tmp/design_handoff_echolingo/`, originally
`ES.zip`) inside the existing PWA — Next.js 15 app-router, static export, Tailwind. The
handoff is a faithful spec (exact colors, type, spacing), **not** a drop-in; the prototype's
iOS bezel (`ios-frame.jsx`) and tweaks panel (`tweaks-panel.jsx`) are NOT ported.

This redesigns three surfaces — **home/create**, **player**, **shared-link landing** — plus the
**generating** transient, and introduces systems the app lacks today: CSS-variable theming with
light/dark, new fonts, and CEFR levels.

## Decisions (locked with the user)

- **Levels:** full 6-level CEFR (A1–C2) end-to-end — shared types, API prompt, validation, UI.
- **Theming:** auto light/dark via `prefers-color-scheme` plus a single light/dark toggle in the
  app bar. Accent is fixed at the default orange `#F97316`. No accent picker, no text-size UI.

## 1. Design-token & theming foundation

Rewire Tailwind to read **CSS custom properties** rather than hardcoded hex, so every existing
`bg-paper` / `text-ink` / `border-hairline` utility becomes theme-aware with no per-component
rewrite. `tailwind.config.ts` colors map to vars; the handoff token set is added.

Token map (Tailwind name → CSS var → light / dark value):

| Tailwind            | var            | light      | dark       | use                          |
|---------------------|----------------|------------|------------|------------------------------|
| `paper`             | `--paper`      | `#F6F6F7`  | `#0F0F11`  | app background               |
| `surface`/`paper-2` | `--paper-2`    | `#FFFFFF`  | `#17171A`  | raised surfaces (cards)      |
| `paper-3`           | `--paper-3`    | `#FFFFFF`  | `#202024`  | inputs / control fills       |
| `ink`               | `--ink`        | `#121214`  | `#F3F3F5`  | primary text                 |
| `ink-soft`          | `--ink-soft`   | `#52525B`  | `#A6A6AE`  | secondary text               |
| `ink-mute`          | `--ink-mute`   | `#9A9AA3`  | `#6C6C75`  | tertiary / placeholders      |
| `line`/`hairline`   | `--line`       | `#E6E6EA`  | `#2A2A30`  | hairline borders             |
| `line-soft`         | `--line-soft`  | `#EFEFF2`  | `#202024`  | faint dividers               |
| `accent`            | `--accent`     | `#F97316`  | `#F97316`  | CTAs, fills, current-line bar |
| `accent-ink`        | `--accent-ink` | `#FFFFFF`  | `#FFFFFF`  | text on accent               |
| `aegean`            | `--aegean`     | `= accent` | `= accent` | alias; keeps current code    |
| `aegean-tint`       | `--aegean-tint`| `#FEEEE3`  | `#4D2D19`  | current-line wash (precomputed)|

`--aegean-tint` is precomputed (accent fixed): light = `mix(accent 12%, #FFFFFF)`, dark =
`mix(accent 24%, #17171A)`. Also add `--radius:16px`, `--radius-lg:22px`, `--radius-pill:999px`,
the three handoff shadows, and `--fs-scale:1` (fixed; multiplies transcript/topic font sizes via
`calc()` so a future text-size control can light up without refactor).

The existing names `ink-muted`, `ink-faint`, `aegean-50`, `terracotta` remain defined (mapped to
the nearest new var) so untouched code keeps compiling; new/redesigned code uses the new tokens and
`accent` (orange) in place of `terracotta` for CTAs.

`globals.css` defines `:root, .theme-light { … }`, `.theme-dark { … }`, and an
`@media (prefers-color-scheme: dark) :root:not(.theme-light) { … }` default so unset users follow
the OS.

**Theme override + no-flash:** stored as `echolingo:theme` ∈ `auto | light | dark` (default
`auto`). A small inline script in `layout.tsx` runs before paint: reads the key, and if it is
`light`/`dark` sets `document.documentElement.className` accordingly (otherwise leaves it to the
media query). A `useTheme` hook exposes the effective theme and a `toggle()` that pins the opposite
of the current effective theme (so the first tap always visibly flips), persisting the explicit
choice. The app-bar toggle shows a sun glyph in dark mode and a moon in light.

## 2. Fonts

Replace `Inter` + `Source Serif 4` with **IBM Plex Sans** (sans) + **Literata** (serif) via
`next/font/google`, each with subsets `['latin','greek','cyrillic']` and the weights the handoff
uses (sans 400/500/600/700; serif 400/500/600 + italic). The CSS vars `--font-sans` / `--font-serif`
already drive Tailwind's `font-sans` / `font-serif`, so only `layout.tsx` and `tailwind.config.ts`
fallback lists change. Serif: wordmark, titles, hero, conversion title, **target-language**
transcript lines, topic input. Sans: all chrome, labels, buttons, time, meta, **translation** lines.

## 3. CEFR levels (data-model change, end-to-end)

- `src/shared/src/types.ts`: `LESSON_LEVELS = [1,2,3,4,5,6] as const`; add
  `CEFR_LABEL: Record<LessonLevel,string> = {1:'A1',2:'A2',3:'B1',4:'B2',5:'C1',6:'C2'}` and a
  `cefr(level)` helper. `isLessonParams` already gates on `LESSON_LEVELS.includes`, so 6 becomes
  valid automatically.
- `src/api/src/_shared/prompts.ts`: extend `LEVEL_DESCRIPTOR` to keys 1–6, reworded as CEFR bands
  (e.g. `1: 'CEFR A1 (beginner — …)'` … `6: 'CEFR C2 (mastery — …)'`); the user line already
  interpolates the descriptor.
- `lesson-id` / `canonicalize`: no structural change — `level` stays a number; existing SHA-256 ids
  keep resolving. New level-6 requests simply hash to new ids.
- Frontend: `use-prefs` level validation `>= 1 && <= 6`; default stays `3` (B1). The create form's
  slider gets `max=6` and six CEFR tick labels; the level label reads `level · B1` via `cefr()`.
  The echoes-list meta shows `B1` instead of `L3`.
- Tests: update `prompts.test.ts`, any level fixtures, `use-prefs.test.ts`, and e2e selectors that
  assert level text.

## 4. Home / create surface (`home-client.tsx`, `create-echo-form.tsx`)

- **App bar** (`app-bar.tsx`, extended): wordmark `echolingo.` (trailing `.` in `--accent`) → `/`;
  **no `+ new`** on home (already the create surface); theme toggle on the right. The bar accepts
  props controlling whether `+ new` and the title slot render, so home / player / generating reuse it.
- **Topic**: borderless, transparent, auto-growing Literata `<textarea>` (~`30px × --fs-scale`),
  full placeholder `at the bakery, ordering coffee, asking the barista what they recommend…`.
  Auto-resize on input (existing pattern from the prototype's `autosize`).
- **First-run vs returning:** first-run = empty library. First-run shows a hero
  (`listening lessons,\non demand` Literata 34px + italic subtext `name a topic — get a narrated
  lesson in seconds. no account, ever.`) and topic **suggestion chips** (italic Literata pills).
  Returning users get the compact form (no hero, no chips). `useEchoes.hydrated` gates this to avoid
  an SSR/first-paint flash; before hydration render the compact form.
- **Languages** (`Select` component, new): custom dropdown — 54px, `paper-3` fill, `line` border,
  radius 16, chevron in `ink-mute`; opens a `--shadow-2` menu, active item in `accent`, the other
  field's current language disabled to prevent collision; choosing a colliding language auto-swaps.
  Backed by the existing 10 `LANG_CODES` / `LANG_NAME`. Replaces the two native `<select>`s.
- **Length** pills (5/10/20/30; selected = `ink` fill, `paper-2` text), **CEFR slider** (filled
  portion + active tick in `accent`), **`go →`** accent pill (Literata 19px, arrow glyph, disabled at
  40% until topic non-empty), centered.
- **Library** ("your echoes", hidden when empty): `EchoRow` redesign — 44px circular play affordance
  with an `accent` progress ring when `0 < progress < 1`; Literata 18 title; meta
  `‹lang› · 5 min · B1 · finished · 1d ago` (lang word in `accent`, capitalized; `finished` when
  progress ≥ 1; relative time from existing `formatRelative`); trailing `accent` dot when new/unplayed.
  Keep the current hover remove (`×`) affordance. Progress comes from the persisted `echo:pos:<id>`
  vs the echo's known duration when available, else 0/unknown.

## 5. Player (`echo-client.tsx`, `transcript-view.tsx`, `player-controls.tsx`, `scrubber.tsx`)

Layout = flex column: sticky app bar / scrollable transcript (`flex-1; min-h-0; overflow-auto`) /
fixed transport — transport is always visible, never clipped. Replaces the current
`PageFrame` + `fixed bottom-0` overlay.

- **App bar:** wordmark → `/` · centered lesson title (Literata, ellipsis) · `+ new` pill → `/`.
- **Transcript:** stacked line blocks; tap a line to seek there (existing `onJump`). Current line =
  `--aegean-tint` background + `inset 3px 0 0 var(--aegean)` left bar, rounded 16, generous padding;
  past = `ink-soft`; future = `ink-soft` @ 0.72 opacity. Target line Literata `25px × --fs-scale`;
  translation sans `16px × --fs-scale` in `ink-mute`. Keep the existing auto-scroll (current line
  ~30% from top, paused ~2.6s after manual scroll) and the `[skipped]` marker for failed sentences.
- **Transport:** custom scrubber (thin `line` track, `accent` fill, knob; tap/drag to seek) wired to
  the existing `onSeek(sec)` chunk math; right-aligned `m:ss / m:ss` tabular. Controls row
  (centered, gap 16): **prev** 48px outline circle · **play/pause** 62px `ink` circle · **next** 48px
  outline circle — using the handoff's inline SVG glyphs (a small `icons.tsx` ported from
  `icons.jsx`), replacing the emoji. Speeds row: `0.75 / 1 / 1.25` pills (selected = `ink`) then a 1px
  separator then a **translation** toggle pill (filled `accent` when on, outline when off) — rendered
  only when `mode === 'bilingual'`. The dedicated **repeat** button is removed (tapping the current
  transcript line already repeats/seeks it).
- **Translation toggle:** per-echo UI state, defaults on for bilingual; show/hide the translation
  lines. Not persisted (session-scoped, matching the handoff).
- **Persistence:** resume position `echo:pos:<id>` and last speed `echo:speed`, wired into the real
  `<audio>` element / `usePlayer` (write on `timeupdate`/seek and speed change; restore on mount when
  saved < total). This is new behavior — `usePlayer` gains optional initial-position + persistence.

## 6. Shared-link landing

On `/echo/[id]/`, decide `shared` once at first successful load: `shared = !libraryHadIdAtMount`.
`ExistingEcho` reads whether `id` is already in `useEchoes().echoes` **before** the silent-adoption
effect runs (capture in a ref on the first render where the library is hydrated). Owners (id already
present, or an echo they just created) → `shared=false`, plain player. A friend opening a fresh link
→ `shared=true`:
- **Context strip** atop the transcript: `a `**`greek`**` listening lesson someone shared with you ·
  5 min · B1. press play to listen —` + an accent-outline button `✦ or make your own →` → `/`.
- **Conversion card** after the transcript: eyebrow `YOUR TURN` (accent, uppercase), Literata title
  `learn anything, the same way`, subtext, full-width accent CTA `✦ make your own echo`, reassurance
  `free · no account · works offline`. → `/`.

Trade-off: opening your *own* echo on a new device (not yet in that device's library) shows the
visitor view once; harmless, and it self-corrects after silent adoption writes the id.

## 7. Generating screen

Restyle both transient states to the handoff's design: centered spinner ring (3px, `accent` top
arc) + italic `composing your echo…` + the topic (Literata) + meta `‹lang› · ‹min› min · ‹CEFR›`.
Applies to `NewEcho`'s `creating` state and to `EchoProgress` while
`status ∈ {generating_script, generating_audio}`. The existing error / rate-limit / not-found / retry
cards are restyled to the new tokens but keep their behavior.

## Components touched / added

- New: `src/web/components/select.tsx` (language dropdown), `src/web/components/icons.tsx` (inline
  SVG glyphs ported from the handoff), `src/web/hooks/use-theme.ts`.
- Changed: `tailwind.config.ts`, `app/globals.css`, `app/layout.tsx` (fonts + no-flash script +
  theme), `app-bar.tsx`, `home-client.tsx`, `create-echo-form.tsx`, `echoes-list.tsx`,
  `echo-client.tsx`, `transcript-view.tsx`, `player-controls.tsx`, `scrubber.tsx`,
  `hooks/use-player.ts`, `hooks/use-prefs.ts`.
- Shared/API: `src/shared/src/types.ts`, `src/api/src/_shared/types.ts` (mirror), `prompts.ts`.

## Out of scope

Accent picker, text-size UI, the prototype iOS bezel & tweaks panel, the in-flight PWA install-prompt
work (untouched), cross-device library sync, the Web Share API / copy-link button.

## Testing

- **Unit (vitest):** theme resolver (`useTheme`: auto-follows media, toggle pins opposite, persists);
  `cefr()` + `CEFR_LABEL` + prefs level validation `1..6`; `Select` auto-swap + collision-disable;
  shared-vs-owner detection (`!libraryHadIdAtMount`); position/speed persistence
  (`echo:pos:<id>`, `echo:speed`).
- **API (vitest):** `prompts.test.ts` covers level-6 descriptor and CEFR wording.
- **e2e (Playwright):** keep the suite green — update selectors for the new app bar (no `+ new` on
  home), CEFR level text, and the new transport controls; add a shared-link scenario asserting the
  conversion card appears for an unknown id and not for a known one.
- **Manual:** light/dark toggle + OS-follow; first-run hero/chips vs returning compact form; create →
  generating → player; resume position across reload; shared-link landing in a fresh profile.

## Phasing (for the implementation plan)

1. **Foundation** — tokens/theme/fonts (Tailwind vars, globals, layout no-flash, `useTheme`) +
   CEFR data model (shared types, prompts, validation, tests).
2. **Home / create** — app bar (toggle, conditional `+ new`), `Select`, topic textarea, chips/hero,
   length/level/go, redesigned library rows.
3. **Player** — transport (scrubber/controls/speeds/translation toggle), transcript styling, icons,
   position/speed persistence, generating-screen restyle.
4. **Shared-link landing** — context strip + conversion card + shared detection; e2e scenario.
