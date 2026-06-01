# Progressive create → listen flow

- **Date:** 2026-06-01
- **Status:** Approved (pending spec review)
- **Scope:** Frontend only (`src/web`, `src/shared`). No API or Bicep changes.

## Problem

Creating an echo feels like a chain of blocking waits: press **go** → wait for the
server → wait for the page → watch a full-screen spinner until the *entire* echo is
finished. Yet most of what the user is waiting for is already known long before the
spinner clears.

We want the new-echo page to fill in progressively: accept immediately, show the
script as soon as it is written, mark each sentence playable the moment its audio
lands, let the listener start playing partway through generation, prefetch the rest
into a forever cache, and replay offline.

## Key finding: the backend is already progressive

Tracing the pipeline shows the server already streams everything the UI needs. The
frontend simply discards the partial data.

- `PUT /api/echo/{id}` (`echo-create.ts`) accepts instantly, sets
  `status: "generating_script"`, enqueues script generation, returns `201`.
- `scriptGenWorker` generates **all** sentence text at once, flips to
  `status: "generating_audio"`, and writes the complete `sentences[]` (every
  sentence's `gr`/`native` text known, each `status: "pending"`), then fans out one
  TTS job per sentence.
- `ttsSentenceWorker` runs per sentence and **out of order**. As each finishes it
  flips that sentence to `status: "ready"` with `grUrl`/`nativeUrl`/durations and
  bumps `readySentences`. The echo flips to `status: "ready"` only when the last
  sentence lands. A sentence whose TTS fails becomes `status: "failed"`.
- `GET /api/echo/{id}` (`echo-get.ts`) returns this whole partial `Echo` object on
  every poll (the client polls every 2s via `use-echo.ts`).
- Audio URLs (`blob-audio-storage.ts` `getUrl`) are **stable and public** —
  `{account}.blob.core.windows.net/{container}/{id}/{lang}/{idx}.mp3`, no SAS token.
  Ideal for cache-by-URL.

So this is a **frontend-only** feature: stop hiding the partial poll data, play a
*growing* playlist, prefetch aggressively, and cache audio for offline replay.

## Goals

1. The new-echo page renders the real layout immediately and fills in progressively
   (no full-screen spinner gate).
2. Show the full transcript text as soon as the script is ready; mark each sentence
   playable as its audio lands.
3. Let the listener start playing partway through generation; auto-advance through
   sentences as they finish, buffering only when playback outruns generation.
4. Prefetch **every** sentence's audio into a cache as soon as it is ready.
5. Cache audio forever and replay the whole echo offline.
6. Provide a way to re-download a cached echo (stale/corruption recovery).

## Non-goals

- No backend / API / infra changes.
- No eager autoplay (playback always starts from a user tap; it then auto-advances).
- No separate "Download for offline" button (caching is automatic).
- No offline-library management UI beyond an inline "saved for offline" indicator and
  the per-echo reload control.

## UX: one progressive screen

`echo-client.tsx` today gates on `creating` → `loading` → `!ready` (full-screen
`EchoProgress` spinner) → `ready`. Collapse these into a single frame that is always
the real layout (`AppBar` + scrollable transcript + pinned player dock) and fills in:

| Phase | Backend state | What shows |
|---|---|---|
| **Accepting** | no echo yet / PUT in flight | Real frame immediately. Topic + meta from the stashed params (`echo:create:{id}` in sessionStorage). Transcript = a few shimmer placeholder lines. Dock disabled. Status: *"writing the script…"* |
| **Script ready** | `generating_audio` | Full transcript text rendered at once (all sentences known). `pending` lines dimmed with a faint pulse; `ready` lines normal and tappable; `failed` lines show the existing "[skipped]" marker. Status: *"recording audio · {ready}/{total}"*. Play enables once the playable playlist is non-empty (the first sentence is resolved and at least one resolved sentence has audio). |
| **Streaming** | `generating_audio`, playing | Tap play → auto-advances. If playback reaches a sentence still generating, show *"buffering…"* and auto-resume when it lands. |
| **Ready** | `ready` | Today's player UI. Polling stops. *"saved for offline ✓"* once all audio is cached. |

`failed` (whole echo), `not_found`, and `error` keep today's handling, except: if some
sentences are already `ready` when the echo fails, those remain playable (nearly free
given the playback model below).

Status copy lives in one small mapper keyed off `echo.status` + `readySentences`.

## Playback model

TTS completes out of order, so the `ready` set can have gaps (e.g. `{0,1,3}` with `2`
still `pending`). To keep a coherent, gap-free story we play the **contiguous
non-pending prefix**:

- Define the **frontier** as the first sentence index that is still `pending`.
  Sentences before the frontier are *resolved*: `ready` ones contribute audio chunks;
  `failed` ones are skipped (no audio) but do **not** block the frontier — this also
  fixes today's "[skipped]" handling.
- The playable playlist is the chunks for sentences `0 .. frontier-1`. It **grows** as
  the frontier advances on later polls.
- `shared/playlist.ts`: `playablePlaylist(echo, includeTranslation)` changes from
  "every `ready` sentence" to "the non-pending prefix." A small exported helper
  computes the frontier so it can be unit-tested directly.

Rejected alternative: a full-length playlist with placeholder entries that buffer
individually (would allow jumping to a `ready` sentence past a gap). More complex, and
gap-jumping has no value for a sequential listening story.

`hooks/use-player.ts` gains:

- A `generating: boolean` input (true while `status` is `generating_*`).
- **Buffer-at-frontier**: when auto-advance reaches the end of the playlist *while
  generating*, hold intent-to-play (a "buffering" flag) instead of stopping. When the
  playlist grows (frontier advances on a later poll), resume `audio.play()`
  automatically. When not generating, end-of-playlist stops as today. This extends the
  existing playlist-rebuild remap logic the hook already uses for the translation
  toggle.
- `PlayerState` gains `buffering: boolean` for the dock indicator.

Tap-to-jump (`jumpToSentence`) only resolves sentences present in the playlist (the
prefix); tapping a `pending` line is a no-op. Existing behavior otherwise unchanged.

## Prefetch (all, not a window)

As each sentence becomes `ready` in the poll data, eagerly fetch its audio into the
offline cache:

- On each poll update, diff against a `Set` of already-fetched URLs; for every newly
  `ready` sentence, enqueue its `grUrl` (and `nativeUrl` when bilingual).
- A small fetcher with an in-flight cap (~6, matching the browser's per-host
  connection limit) drains the queue with `fetch(url, { mode: 'no-cors' })`. The
  fetched-URL set prevents the 2s polls from re-fetching.
- This warms the service-worker audio cache, so by the time the playhead reaches a
  sentence its audio is local. Playback then only ever waits on *generation*, never
  download. The whole echo becomes offline-ready as fast as it generates.

Lives in a small `hooks/use-prefetch.ts` (or a helper invoked from `echo-client.tsx`),
kept independent of the player so it can be tested in isolation.

## Offline (auto-cache + persist)

### Service worker (`public/sw.js`)
Add a fetch-handler branch for the blob-host audio URLs → **cache-first**, stored in a
dedicated `echolingo-audio` cache (kept forever; separate from the network-first
`echolingo-shell` cache so deploys still refresh the shell). Match by full URL (stable).

Cross-origin audio fetches (`<audio>` element and the no-cors prefetch) are **opaque
responses**; Cache Storage can store and replay them for media playback. *Risk to
verify during implementation:* opaque responses are padded against quota, and `<audio>`
may issue Range requests. Sentence MP3s are a few seconds each (whole-file fetches are
typical), so this should be fine; if Range replay misbehaves, fall back to explicit
`cache.add` on prefetch and serve full bodies.

### Persistence
Call `navigator.storage.persist()` once on first play so the browser will not evict the
cache. Best-effort: caching still works if persistence is denied.

### Offline replay of the whole story
Audio lives in Cache Storage, but the sentence list/URLs come from `GET /api/echo/{id}`,
which fails offline. So:

- New `lib/offline-echo.ts`: `saveEcho(echo)` / `loadEcho(id)` / `clearEcho(id)`,
  persisting the full `Echo` JSON in **localStorage** (small text; audio is the bulk and
  lives in Cache Storage). Save/update on every successful poll once `sentences` exist;
  the final write happens at `ready`.
- `use-echo.ts`: when a network poll fails (offline), fall back to `loadEcho(id)` so the
  page still renders the transcript and plays from the audio cache. Polling logic is
  otherwise unchanged.

### Reload / repair (stale or corrupt cache)
A quiet control on the player dock (near the offline status) re-downloads this echo:

1. Delete this echo's audio from Cache Storage — `caches.open('echolingo-audio')`,
   `keys()`, delete entries whose URL contains `/{id}/`. (Cache API is available in the
   window context, not only the SW.)
2. `clearEcho(id)` from the offline JSON store.
3. Force a fresh `GET /api/echo/{id}` (bump the existing `reloadToken` in
   `echo-client.tsx`) and re-run prefetch.

Cheap auto-heal: if an `<audio>` chunk fires `error` while loading a (cached) URL, drop
that one URL from the cache and retry once from the network before surfacing the
per-sentence failure.

## Components touched (all frontend)

- `shared/src/playlist.ts` — `playablePlaylist` → non-pending-prefix semantics; export a
  `frontier`/`playableThrough` helper.
- `hooks/use-player.ts` — `generating` input; buffer-at-frontier + resume-on-growth;
  `buffering` in `PlayerState`.
- `hooks/use-echo.ts` — save ready JSON to the offline store; fall back to it on poll
  failure.
- `hooks/use-prefetch.ts` *(new)* — prefetch-all with an in-flight cap and fetched-URL
  set.
- `lib/offline-echo.ts` *(new)* — full-`Echo` JSON store (localStorage).
- `lib/audio-cache.ts` *(new)* — `persist()` wrapper, `clearEchoAudio(id)`, opaque-fetch
  helper. Keeps Cache API details out of components.
- `components/echo-client.tsx` — collapse spinner gates into the progressive frame;
  status mapper; enable play when the prefix is non-empty; wire prefetch + offline save +
  reload control.
- `components/transcript-view.tsx` — per-line styling by sentence `status`
  (`pending` dimmed + faint pulse; `ready` normal/tappable; `failed` "[skipped]");
  disable tap on non-playable lines.
- `components/player-controls.tsx` — disabled state pre-first-ready; buffering indicator;
  "recording audio · n/m" / "saved for offline ✓" status; reload control.
- `public/sw.js` — audio cache-first branch + dedicated cache bucket.

## Error handling

- **Failed sentence** (`status: "failed"`): skipped in the playlist (frontier steps
  over it); transcript shows "[skipped]".
- **Failed echo**: existing error + retry card; already-`ready` sentences still play.
- **Offline / poll failure**: fall back to the cached JSON + audio cache; if neither
  exists, show the existing not-found/error card.
- **Corrupt cached audio**: per-chunk auto-heal (drop + refetch once); manual reload
  control purges and re-downloads the whole echo.

## Testing

Unit (vitest; existing jsdom harness in `src/web`, plain vitest in `src/shared`):

- `playablePlaylist` / frontier: `pending` blocks, `failed` skips without blocking,
  prefix grows, fully-ready echo yields the full list.
- `usePlayer`: buffer-at-frontier holds intent-to-play and resumes when the playlist
  grows; end-of-playlist stops when not generating (mirrors `use-player.remap.test`).
- `offline-echo`: save/load/clear round-trip; `use-echo` falls back to the store on a
  rejected fetch.
- `transcript-view`: `pending`/`ready`/`failed` styling and tap-enablement.
- `use-prefetch`: newly-ready URLs enqueued once; fetched set prevents re-fetch; cap
  respected.

Service-worker audio caching and persistence are verified manually. The mock TTS
returns instantly, so the streaming/buffering states are exercised with crafted partial
`Echo` fixtures rather than real timing.

## Open risks

- **Opaque responses + Range requests** for cross-origin cached audio (mitigation
  above).
- **Autoplay**: not attempted (tap-to-start), so not a risk; auto-advance after the
  first tap uses the existing user-gesture chain.
- **SW `controllerchange` reload**: a new SW activating triggers a page reload
  (`layout.tsx`). Rare (deploy-time only); playback position already persists via
  `use-player`, so the reload resumes gracefully.
