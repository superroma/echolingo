# Shared echo discovery — design

## Goal

A friend who opens a shared `/echo/[id]/` link can play the echo, create their own, and find the one they just heard later — without ever using the browser back button or needing context they don't have. The same affordances are visible to the echo's owner, so there is one consistent app chrome instead of two.

## Problem

Today the echo screen has a `←` button in the top-left that routes to `/`. For the owner this is fine. For a friend who arrived via a shared link:
- "Back" implies undoing a navigation they never made.
- The home screen's empty echoes list gives them no anchor to the echo they just played.
- Nothing writes the played echo into their local library, so it disappears the moment they leave the URL.

## Approach

Two small changes:

1. **Persistent top app bar** with a wordmark on the left (tap → home) and a `+ new` pill on the right (tap → `/echo/new`). Replaces the `←` button. Same bar on home and play screens.
2. **Silent adoption**: when `ExistingEcho` first observes `state.kind === 'ok'`, call `addEcho` with the lesson's params. `useEchoes` already de-dupes by `id`, so opening one's own echo is a no-op. The friend's library gains the echo with no explicit "save" gesture.

The bar lives at the top, not the bottom, because the play screen already has a fixed bottom player (scrubber, prev/next, play/pause, speed). Stacking nav above player controls eats ~140px of bottom chrome on a phone, and a bottom bar that hides on the play screen would leave the friend without `+ new` exactly when they most need it.

## Scope

In scope:
- Replace the `PageFrame` header in `src/web/components/echo-client.tsx` with the new top app bar.
- Adopt the same top app bar on home (`src/web/components/home-client.tsx`), replacing the current centered `<header>` wordmark block.
- Add an effect to `ExistingEcho` that calls `addEcho` once per lesson load, when `state.kind === 'ok'`.
- Tests covering the new bar and silent adoption.

Out of scope:
- Server changes. The fix is web-only.
- Sharing affordances on the echo screen (Web Share API, copy-link button). Separate concern.
- Onboarding for first-time visitors arriving without an echo URL.
- Cross-device library sync.

## Top app bar

A single component, used on every screen, sticky to the top of the viewport.

Layout (left → middle → right):

| Slot   | Content                                                                                              |
|--------|------------------------------------------------------------------------------------------------------|
| Left   | `echolingo` wordmark — lowercase serif (matches the current home logotype). Tap → `router.push('/')`. |
| Middle | Empty on home. On `/echo/[id]/`, the truncated echo title (the current header content).               |
| Right  | `+ new` pill button. Tap → `router.push('/echo/new')`.                                                |

Visual:
- 48px tall, sticky, `bg-paper/95` with `backdrop-blur` and a `border-b border-hairline`. Matches today's `PageFrame` header.
- Wordmark: text-base (~16px), `font-serif lowercase tracking-tight text-ink`. No icon glyph.
- `+ new`: short pill, `bg-terracotta text-white text-sm font-medium`, ~28px tall, ~14px horizontal padding. The `+` glyph reads as "create" without needing the word.
- Middle title: `text-sm font-medium text-ink truncate`, centered in remaining space.

Behavior:
- On `/`, tapping the wordmark is a no-op route push (Next.js dedupes); fine.
- On `/echo/new`, the wordmark and `+ new` are both visible. Tapping `+ new` while already on `/echo/new` is a no-op route push; fine.
- The bar replaces:
  - The `<header>` block in `home-client.tsx` that contains the centered `echolingo` heading and tagline. The tagline ("listening lessons, on demand") moves into the home page body, just above the create form, so the page still introduces itself.
  - The `<header>` inside `PageFrame` in `echo-client.tsx`. The `← Back` button is removed entirely.

## Silent adoption

Where: `ExistingEcho` in `src/web/components/echo-client.tsx`.

Trigger: on the first render where `state.kind === 'ok'`, call `addEcho` with the params we already have. Use a ref to ensure it only fires once per lesson id per mount, so subsequent polls don't keep calling it.

Payload (the existing `EchoSummary` shape used elsewhere):

```ts
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
```

`useEchoes.addEcho` already de-dupes by `id`, so:
- Opening your own echo: no-op.
- Opening a friend's echo: appends to your local list.
- Refreshing the page: no-op.

The existing `updateEcho` effect (`lastStatus`, `error`) still fires; the new adoption effect runs once and then yields to it.

The `createdAt` we record is the lesson's actual creation timestamp from the server, not "now" — so the entry sorts naturally with the friend's other echoes.

## Files touched

- `src/web/components/echo-client.tsx` — replace `PageFrame` header with the new bar; add adoption effect to `ExistingEcho`.
- `src/web/components/home-client.tsx` — replace the centered header block with the new bar; relocate tagline into the body.
- `src/web/components/app-bar.tsx` *(new)* — the shared top app bar component.
- `src/web/hooks/use-echoes.ts` — no change expected; verify `addEcho` is idempotent on duplicate ids.
- Tests: extend `use-echoes.test.ts` (or add a new file) to cover the idempotent add; add a component test for `EchoClient` that asserts a previously-unseen `id` is added to the list once the lesson loads.

## Testing

- Unit: `useEchoes.addEcho` called twice with the same `id` results in a single list entry; verify in `use-echoes.test.ts`.
- Component (vitest + RTL): mount `ExistingEcho` with a stubbed `useEcho` returning `kind:'ok'` and assert that `localStorage` (or a stubbed `useEchoes`) receives one `addEcho` call with the lesson's params.
- Manual: open a fresh browser profile, visit a known `/echo/<id>/`, confirm the echo appears on `/` after navigation.
- Existing player tests should be unaffected by the header change. The transcript's `pb-40` bottom padding for the fixed player still applies; only the top changes.

## Risks and trade-offs

- **Silent adoption persists state without consent.** A friend who opens a link and bounces still has the echo in their library next visit. We accept this — it's a useful memory aid, and the library is local-only with no network or account effect. If we ever add account-bound history, revisit.
- **Removing the `←` button** means the only way back from the play screen is the wordmark. Browser back still works. The friend never needed `←` in the first place; the owner is a tap of the wordmark away from home.
- **`+ new` on `/echo/new`** is a redundant affordance for the user who is already on the form. Acceptable — the alternative (conditional hiding) costs more in inconsistency than the redundancy costs.
