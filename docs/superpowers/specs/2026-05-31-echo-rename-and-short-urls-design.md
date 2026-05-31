# Echo rename + short URLs — design

Date: 2026-05-31
Status: approved-pending-review

## Problem

Two things to fix in one pass, because they touch the same identity surface:

1. The product was renamed **lesson → echo**, but the code and API still say "lesson"
   everywhere (`Lesson`, `LessonParams`, `lessonId`, `/api/lesson`, `lesson-create.ts`,
   the `lessons` blob container, telemetry `lesson.*`, tests).
2. Echo URLs are long and ugly to share. Today an echo is addressed by
   `sha256(canonicalize(params))` — a **64-char hex** string — and the web route carries
   an `/echo/` prefix: `echolingo.audio/echo/3f8a9c2b1d4e…` (70+ chars).

We want short, shareable URLs like `echolingo.audio/k7Xp2qB9`, and the naming to match the
product.

This is a tiny two-page app (home `/`, player `/{id}`). The whole thing fits in one head;
this is a single coordinated change, not a multi-phase program.

## Goals

- Short shareable URL: bare `/{id}` (no `/echo/` prefix), 8-char id.
- Rename **lesson → echo** consistently across shared, API, web, infra config, and tests.
- Remove the duplicated id implementation by **removing the need for it on the backend**.
- Keep the two properties the current design earned:
  - **No round-trip on create** — the web computes the id locally and navigates straight
    to `/{id}` (the work in commit `1b854ce`).
  - **Dedup / idempotency** — identical params map to the same id, so an echo is created
    once.

## Non-goals

- No data migration. Changing the id algorithm and storage names orphans existing blobs;
  there are no legacy links and the app is pre-launch, so we start fresh.
- No backward-compatible `/echo/{id}` alias.
- No server-side rendering. The frontend stays a static export behind the SWA fallback.

## Key decisions (and why)

### 1. The id is a client concern; the API just stores it

Today the API recomputes `lessonId(params)` in exactly one place — `lesson-create.ts` — to
use as the storage key. Every other endpoint (`get`, `download`) and both workers already
just *use* the id they're handed. So:

- The client mints the id from the params and supplies it.
- The API **does not compute ids**. It drops `lessonId` and `canonicalize` entirely.
- This deletes the only shared code that could *behaviorally* diverge between the two
  runtimes (the hash). There is no second id implementation to keep in sync, so the
  symlink / vendoring / "import the shared package" question disappears for the id.

**Trade-off (accepted):** the server no longer proves `id == hash(params)`.
- Dedup still holds: the id is a deterministic hash computed in one place (shared, used by
  the web), so identical params still collapse via `createIfAbsent`.
- Nobody can overwrite an existing echo: `createIfAbsent` uses `ifNoneMatch:'*'`
  (`blob-lesson-repository.ts:55`).
- The only new vector: a malicious client could store arbitrary params under an id *of its
  choosing*. Blast radius is tiny (no auth, no PII, and hitting a specific victim id means
  brute-forcing the id space). Acceptable for this app. If it ever matters, the fix is the
  server re-deriving the id to validate — the only reason to bring id code back to the API.

### 2. Backend sanitizes the id

The API treats the id as an opaque key but **validates its shape** at every id-accepting
endpoint, returning `400` on anything malformed. This protects the blob layer (no path
traversal, no oversized keys) and bounds storage.

- Contract: `^[0-9A-Za-z]{1,16}$` — base62, 1–16 chars.
- We mint **8** chars; the cap of 16 is headroom to lengthen the id later without an API
  change.
- A shared constant/validator (`isEchoId`) lives next to the types and is used by the API
  to reject bad input. (A regex constant carries no behavioral-drift risk, unlike a hash.)

### 3. Short id scheme — shortened deterministic hash

Keep content-addressing (it powers dedup + no-round-trip); just shorten and densify the
existing hash. Computed once, in `@echolingo/shared`, used by the web:

```
echoId(params):
  normalized = { ...params, topic: trim → lowercase → collapse-whitespace }   # unchanged
  digest     = SHA-256(canonicalize(normalized))            # 32 bytes
  n          = bigint(first 8 bytes of digest) mod 62**8
  return base62(n) left-padded to exactly 8 chars
```

- Alphabet: `0-9A-Za-z` (62). 8 chars ≈ 47.6 bits of entropy.
- Collisions are content-hash collisions (two *different* param sets → same id),
  birthday-bounded — safe well into the tens of millions of echos for an indie app.
- The existing `crypto.subtle` (Web Crypto) implementation already runs on both browsers
  and Node 22, so it stays isomorphic and async.

Result: `echolingo.audio/k7Xp2qB9` instead of `echolingo.audio/echo/3f8a9c2b1d4e…`.

### 4. Routing — bare `/{id}`, no custom rewrite

It is genuinely a two-route app, so the id lives at the root.

- **Next:** `app/[id]/page.tsx` replaces `app/echo/[id]/`. `app/page.tsx` (home) stays.
  `generateStaticParams` returns `[{ id: 'shell' }]` → builds one placeholder
  `/shell/index.html`. Dev (`next dev`, full router) accepts any single segment natively.
- **SWA hosting (`staticwebapp.config.json`):** delete the `{ "route": "/echo/*", … }`
  rule. Point `navigationFallback.rewrite` at the id shell `/shell/index.html`, keeping the
  existing excludes (`/_next/*`, `/api/*`, asset extensions). Then:
  - `/` → its own real file `/index.html` (home).
  - `/k7Xp2qB9` → no file → fallback → `/shell/index.html` → the echo client reads the id
    from `window.location` and loads it (unknown id → "not found" state).
- **Why a shell and a fallback at all:** under static export, runtime-minted ids can't be
  pre-rendered to files, so a client-rendered shell served via the generic SPA fallback is
  the standard (and unavoidable) pattern. We are only removing the *echo-specific* rewrite
  rule, not the generic fallback.
- **Client:** the id is read from the first path segment (as `echo-by-id-client.tsx` does
  today), now at root. All link builders use `/${id}` (`create-echo-form.tsx`,
  `echoes-list.tsx`, `echo-client.tsx`). The session-storage create stash and the
  self-correct redirect carry over unchanged (the production navigation to `/{id}` is a
  hard reload, which is exactly why the stash exists).

### 5. API surface

- **Create becomes a PUT to a client-chosen key:** `PUT /api/echo/{id}` with body
  `{ params }`. Semantics unchanged from today's POST otherwise:
  - validate `id` shape (400 if bad) and `params` shape (400 if bad),
  - if the echo exists → `200 { id, status }` (free, no rate-limit consumed),
  - else consume the per-IP daily rate limit and `createIfAbsent` → `201 { id, status }`
    (or `200` on the lost-race path), enqueue script-gen.
- `GET /api/echo/{id}` and the download endpoint: add the same id-shape validation (400 on
  malformed) before touching storage.

## Rename mapping

Rule: **lesson → echo** everywhere, preserving casing. Notable touch points (the
implementation plan enumerates the exhaustive symbol list):

- **shared:** `Lesson`→`Echo`, `LessonParams`→`EchoParams`, `LessonStatus`→`EchoStatus`,
  `Lesson{Length,Level,Mode}`→`Echo*`, `isLessonParams`→`isEchoParams`; `lessonId`→`echoId`
  (now web-only); file `lesson-id.ts`→`echo-id.ts`. Add `isEchoId` + the id regex.
- **api:** files `lesson-{create,get,download}.ts`→`echo-*`; handlers `lesson*Handler`→
  `echo*Handler`; routes `lesson`/`lesson/{id}`→`echo`/`echo/{id}`; `LessonRepository`→
  `EchoRepository`, `Blob/InMemoryLessonRepository`→`…EchoRepository`; context `lessons`→
  `echoes`; job field `lessonId`→`echoId`; telemetry `lesson.*`→`echo.*` and property
  `lessonId`→`echoId`; storage container name → `echoes`; **delete** the API's
  `_shared/lesson-id.ts` + `_shared/canonicalize.ts` (no longer used).
- **web:** `createLesson/getLesson/downloadLesson`→`createEcho/getEcho/downloadEcho`;
  `/api/lesson*`→`/api/echo*`; `Lesson` type imports → `Echo`.
- **infra/config:** rename the blob container (and any queue) name in `config.ts` defaults
  and `infra` Bicep where hard-coded. Data is disposable → no migration.
- **tests:** rename test files and all references; update the `staticwebapp-config` test for
  the new fallback/route shape and the e2e specs that hit `/echo/…`.

## Testing (high bar)

- **Unit (shared):** `echoId` produces exactly 8 base62 chars; deterministic for the same
  params; stable across topic normalization; distinct params → distinct ids (sample set).
  `isEchoId` accepts 1–16 base62, rejects empty, >16, and non-base62 (`/`, `.`, unicode).
- **Unit (api):** id validation returns 400 for malformed ids on PUT/GET/download; PUT
  create-if-absent (201 fresh, 200 existing, rate-limit consumed only when fresh);
  param-shape validation unchanged.
- **Integration (api):** PUT → blob stored under the supplied id; GET round-trips; rejects
  a traversal-ish id before hitting the blob client.
- **Config:** `staticwebapp.config.json` has no `/echo/*` rule, fallback → `/shell/`,
  excludes intact; the rewrite target exists on disk after build.
- **E2E:** create flow lands on `/{id}` and plays; a deep link to `/{id}` cold-loads via the
  fallback; an unknown `/{id}` shows the not-found state; shared-visit affordances still fire.

## Out of scope

- A dedicated "copy share link" / `navigator.share` button (separate enhancement).
- Readable/slug URLs and human-memorable ids.
- Any auth or server-side id verification.
