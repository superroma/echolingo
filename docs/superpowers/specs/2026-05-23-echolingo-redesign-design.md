# Echolingo — Visual & Interaction Redesign

**Date:** 2026-05-23
**Status:** Approved, ready for implementation plan

## Summary

Redesign of Echolingo's two pages — home form (`/`) and lesson player (`/lesson/[id]`) — to reflect what the product actually is: a *listening* app whose on-screen text serves navigation, not consumption. Scope is visual and interaction only; no backend changes, no new pipeline data, no new features.

## Goals

- Make the lesson page **glanceable**: from across a room or on a sunlit phone, the user can tell at a glance which sentence is being spoken.
- Treat the transcript as a **navigation map** (jump-to-sentence) rather than a reading surface.
- Give player controls the visual weight they deserve as the primary touch surface.
- Establish a coherent visual language that ties home + lesson pages and reads as "this is a Greek-learning app," not a generic SaaS form.
- No regressions to lockscreen / MediaSession behavior, no regressions to the bilingual-mode chunk flow.

## Non-goals

- Word-level karaoke (no per-word timing data available, ruled out).
- Dark mode or podcast-player aesthetic.
- Bilingual two-column transcript (loses the "current sentence is dominant" focus).
- Editorial reading-app treatment (this is not a reading app).
- New features: favorites, history, account, sentence regeneration, etc.
- Changes to the API, the lesson data shape, or the audio chunk model.

## Visual language

### Palette

| Token       | Hex        | Use                                              |
|-------------|------------|--------------------------------------------------|
| `paper`     | `#FAF6EE`  | page background, warm off-white                  |
| `ink`       | `#1A1A1A`  | active sentence text, primary buttons            |
| `ink-muted` | `#6B7280`  | inactive sentence text (still legible)           |
| `ink-faint` | `#B5B0A5`  | native translation under inactive sentences      |
| `aegean`    | `#1E5F8B`  | current-sentence rail, progress, focus rings     |
| `aegean-50` | `#E6EEF5`  | subtle wash behind the active sentence           |
| `terracotta`| `#C8623F`  | primary CTA ("Go"), repeat-sentence button       |
| `surface`   | `#FFFFFF`  | inputs and cards, slightly raised from the page  |
| `hairline`  | `#E8E2D6`  | dividers, input borders                          |

Encoded as Tailwind theme extension (`tailwind.config.ts`) so utilities like `bg-paper` and `text-aegean` are available app-wide.

### Typography

| Family               | Use                                                     |
|----------------------|---------------------------------------------------------|
| **Source Serif 4**   | Greek body, display headings, lesson title              |
| **Inter**            | Native translation, all UI text, controls, form labels  |

Two families only. Source Serif 4 has full Greek glyph coverage. Both loaded from Google Fonts via `next/font` to avoid layout shift.

Sizes:

- Active sentence Greek: 24px mobile / 28px desktop, line-height 1.45
- Active sentence native: 16px, ink-muted
- Inactive sentence Greek: 15px, ink-muted, line-height 1.5
- Inactive sentence native: 13px, ink-faint
- Display heading (`echolingo`): 48px serif, lowercase, letter-spacing -0.02em
- Form labels: 13px Inter medium, uppercase letter-spacing 0.04em

## Lesson page (`/lesson/[id]`)

### Layout

Three vertical zones on mobile (priority: bottom > middle > top):

```
┌────────────────────────────────────┐
│  ← back     "At the bakery"   ⋯   │  thin top bar (48px)
├────────────────────────────────────┤
│  Καλημέρα! Θα ήθελα δύο…           │
│  Good morning! I'd like…           │  past — small, muted, tappable
│                                    │
│ ┃ Πόσο κάνουν, παρακαλώ;            │  CURRENT — large serif Greek,
│ ┃ How much are they, please?        │  4px aegean left rail,
│                                    │  aegean-50 background wash
│                                    │
│  Τρία ευρώ συνολικά.               │  future — small, muted, tappable
│  Three euros total.                │
│                                    │
│  Ευχαριστώ πολύ.                   │
│  Thank you very much.              │
├────────────────────────────────────┤
│  ━━━━━━●────────────  2:14 / 5:00 │  full-lesson scrubber
│                                    │
│    ⟲      ◀◀    ▶/❚❚    ▶▶        │  56px touch targets,
│  repeat  prev   play   next        │  terracotta repeat, ink play
│                                    │
│       0.75×   1×   1.25×           │  speed pills
└────────────────────────────────────┘
```

Desktop: same layout, just wider (max 720px column), with the controls zone *not* fixed — it sits at the natural bottom of the page after the transcript.

Mobile: controls zone is `position: sticky` at the bottom of the viewport so the user can always reach play/pause without scrolling. Transcript scrolls behind it; ensure the last sentence has enough bottom padding to be reachable above the sticky controls.

### Current sentence treatment

- 4px-wide `aegean` left rail extending the full height of the sentence block
- `aegean-50` background wash (subtle, ~5% saturation against `paper`)
- Greek text in `ink`, serif, 24px mobile / 28px desktop
- Native text in `ink-muted`, sans, 16px
- Roughly 2× the vertical padding of neighboring rows

### Past / future sentences

- 15px Source Serif Greek, `ink-muted`
- 13px Inter native, `ink-faint`
- No rail, no background
- Click/tap → jump to that sentence. Requires extending `usePlayer` with a new `jumpToSentence(sentenceIdx: number)` control, since today's API only exposes prev/next/repeat. The new action finds the first chunk whose `sentenceIndex === sentenceIdx` and sets `currentChunk` accordingly.
- Cursor: pointer on hover (desktop), full-width tap target on mobile
- Hover state on desktop: faint paper-tone background to signal tappability

### Auto-scroll

When the current sentence changes, smooth-scroll the transcript so the active sentence sits at ~40% from the top of the viewport (mobile) or the scroll container (desktop). If the user has manually scrolled away in the last 5 seconds, pause auto-scroll — re-enable as soon as the current sentence next changes after that grace period. Standard "follow mode with manual override" pattern.

### Player controls

| Control      | Size / weight                          | Token         |
|--------------|----------------------------------------|---------------|
| Play/Pause   | 56px circle, primary                   | `ink` fill    |
| Repeat       | 56px circle                            | `terracotta`  |
| Prev/Next    | 48px circle, secondary                 | `surface` with `hairline` border |
| Speed pills  | 32px height, smaller pill row beneath  | active = `ink` fill, inactive = `surface` |
| Scrubber     | 4px track, 16px thumb, draggable       | `aegean` fill, `hairline` track |

The scrubber is the only *new* control. Today there's no within-lesson scrubbing — only sentence-step. Scrubber implementation: derive total duration by summing per-sentence durations; thumb position = elapsed-time-so-far / total. Drag fires `jumpToSentence(idx)` where idx is the sentence whose cumulative duration contains the drag position. Sub-sentence seeking is not in scope.

### Top bar

- 48px height, `paper` background, hairline bottom border
- Back arrow (left) — `router.back()` or fallback to `/`
- Lesson topic (center, truncated, single line, Inter medium 14px)
- `⋯` menu (right) — opens a small popover with: *Download MP3*, *Copy link*, *Regenerate* (regenerate disabled for now; placeholder for future)

## Generating state

Replace the single progress bar + label with a live transcript that fills in as TTS jobs complete.

- The script (Greek + native pairs) renders as soon as the lesson's `sentences` array is populated — typically right after script generation, before any audio is ready
- Each sentence starts at 30% opacity. When that sentence's audio becomes `ready`, fade to full opacity over 300ms
- A 2px hairline progress bar sits under the top bar showing `readySentences / totalSentences`
- The `▶ Play` button appears as soon as sentence 0 is ready — user does not need to wait for the full lesson
- No spinner. The fade animation IS the progress signal.

Failed state: the failed sentence renders with `[skipped]` after its Greek text, in `terracotta`, ink-muted weight. Lesson can still play around it.

## Home page (`/`)

### Layout

```
┌────────────────────────────────────┐
│                                    │
│              echolingo              │  48px Source Serif lowercase
│       greek lessons, on demand      │  16px Inter, ink-muted
│                                    │
│  ┌──────────────────────────────┐  │
│  │ at the bakery               │ │ │  big topic input, serif
│  └──────────────────────────────┘  │  placeholder
│                                    │
│  LENGTH    5  10  20  30  min      │  chips, current = ink fill
│                                    │
│  LEVEL     ●━━━━━━━━○━━━━○  3      │  slider with value
│                                    │
│  STYLE     mono · dialogue · story  │  pill toggles
│  MODE      greek only · bilingual   │  pill toggles
│                                    │
│  greek first ↔ english             │  inline, bilingual-only
│                                    │
│           ┌──────────────┐          │
│           │      go      │          │  terracotta, centered
│           └──────────────┘          │
│                                    │
└────────────────────────────────────┘
```

### Notable changes from the current form

1. **No native `<select>`** anywhere. All choices (style, mode, bilingual-order, native-lang) become pill-toggle groups. Native selects look poor on mobile and break the design language.
2. **Topic input is the hero.** Larger than other controls, serif placeholder, no visible label (a placeholder is enough; user can tell what to type).
3. **Form labels are short and uppercase** (`LENGTH`, `LEVEL`, etc.) — small, set apart from the controls, easier to scan.
4. **Bilingual order + native language collapse into one inline row**: `greek first ↔ english`. Two independent tap targets composing one sentence. Tapping the left half flips `bilingualOrder` (`gr_first` ↔ `native_first`) — the visible label updates to "english first ↔ english" or similar. Tapping the right half toggles `nativeLang` between `en` and `ru` (only two values, so it's a flip, not a cycle). Whole row only visible when `mode = bilingual`.
5. **Go button is terracotta, centered, fixed-width** (not full-width edge-to-edge). Reads as a single deliberate action, not a form-submit obligation.
6. **No advanced/collapsed disclosure** — all six knobs stay visible. They're not many; the people who want Greek lessons will adjust them.

### Empty / error states

- Submitting: button label changes to "generating…", button stays terracotta but slightly desaturated, no spinner.
- Rate-limited: same banner content as today (`Daily limit reached…`) but styled with `paper` background, `terracotta` left rail, no rounded amber chip.
- Error: same pattern, with `terracotta` rail and ink-muted body.

## Implementation notes

### Files affected

- `src/web/app/layout.tsx` — load Source Serif 4 + Inter via `next/font`, set body classes
- `src/web/app/globals.css` — base body bg, base text color, optional `@layer base` resets
- `src/web/tailwind.config.ts` — extend theme with `colors`, `fontFamily`
- `src/web/app/page.tsx` — small wrapper changes (header text)
- `src/web/components/lesson-form.tsx` — replace selects with pill toggles, restyle, regroup bilingual + native row
- `src/web/app/lesson/[id]/lesson-client.tsx` — new layout zones, scrubber, sticky controls on mobile
- `src/web/components/transcript-view.tsx` — current-sentence treatment, past/future styles, tap-to-jump, auto-scroll
- `src/web/components/player-controls.tsx` — bigger buttons, scrubber, repositioned speed pills
- `src/web/components/lesson-progress.tsx` — convert into a thin hairline at top + the fade-in transcript becomes the main progress signal
- `src/web/hooks/use-player.ts` — add `jumpToSentence(idx: number)` to the controls API; expose cumulative-duration / elapsed-time getters for the scrubber
- New: `src/web/components/scrubber.tsx`

### Behavior to preserve

- MediaSession lockscreen integration (play/pause/next/prev handlers)
- Bilingual chunk-pair playback order
- Rate-limit / error banners on the home form
- Service worker registration (untouched)
- URL-driven lesson loading (`readIdFromPath`)
- Per-IP rate limit / quota messages

### Out of scope

- Backend changes
- New data fields on the lesson object
- Per-word timing
- New API endpoints
- Account / favorites / history
- React Native wrapper

## Testing

### Visual / manual

- Take screenshots of all three lesson states (generating, ready, failed) and the home page, before/after, in both viewport sizes (375px mobile, 1024px desktop)
- Walk through the bilingual generating-then-playing flow end-to-end locally with the dev API
- Lockscreen smoke on a real phone (or at least Chromium MediaSession devtools panel) — verify play/pause/next/prev still drive the audio

### Unit

- Existing hook tests must still pass (`use-prefs.test.ts`, etc.)
- New `jumpToSentence` action — add a unit test in line with the existing `use-player` patterns once we have one (no test currently exists for `use-player`; not adding one as part of this redesign unless a regression demands it)
- Scrubber-position math (cumulative-duration → sentence index) — pure function, unit-testable

### Regressions to watch

- Auto-scroll fighting the user when they manually scroll
- Sticky controls overlap on short viewports (iOS Safari address-bar collapse)
- Font swap layout shift if `next/font` not configured correctly

## Open questions

- Exact Source Serif weight to load (400 vs 400+600). Start with 400 only to keep bundle small; add 600 only if display heading needs it.
- Whether the `⋯` menu should be implemented now or deferred. Recommend implementing the menu shell + *Download MP3* and *Copy link* items; defer *Regenerate*.
- Whether to ship without a smoke-test on a real phone given remote-control constraints. Probably yes — the visual + Chrome DevTools mobile emulation is a reasonable proxy for v1 of the redesign; flag any regressions found on real devices and fix in a follow-up.
