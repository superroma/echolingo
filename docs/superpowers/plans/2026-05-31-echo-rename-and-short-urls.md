# Echo Rename + Short URLs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename "lesson" → "echo" across the whole codebase, make the backend trust a client-supplied id (no id math on the server, just shape validation), shorten the id to 8 base62 chars, and serve echoes at bare `/{id}` instead of `/echo/{id}`.

**Architecture:** Content-addressing stays a *client* concern: the web computes a short deterministic id from the params and supplies it; the API validates the id's shape and stores under it. The web is a static Next export behind the Static Web Apps fallback; the dynamic route moves to the root segment.

**Tech Stack:** TypeScript, npm workspaces (`@echolingo/shared`, `@echolingo/web` = Next.js App Router, `@echolingo/api` = Azure Functions), Vitest (node + opt-in jsdom), Playwright e2e, Azure Static Web Apps + Blob/Queue storage.

---

## Design reference

Spec: `docs/superpowers/specs/2026-05-31-echo-rename-and-short-urls-design.md`

## Conventions used by every task

- Run from the repo root `/Users/romae/work/newapp`.
- Build the shared package before running web/api tests if you changed it: `npm run build --workspace @echolingo/shared`.
- Full unit/integration suite: `npm run test --workspaces --if-present`. The shared and web vitests resolve `@echolingo/shared` from source (alias), so a prior dist build is only needed by the API and by `next build`.
- Web component/DOM tests opt into jsdom with a top-of-file docblock `// @vitest-environment jsdom`; `src/web/test/setup.ts` already mocks `matchMedia`/`HTMLMediaElement` and cleans up. Pure-logic tests stay in the default node env.
- Use Read/Edit/Glob/Grep tools for inspecting and changing files — not `sed`/`cat`/`awk` over Bash.

## File structure (what changes and why)

**Shared (`src/shared/src/` — the source of truth; the API mirrors a subset in `src/api/src/_shared/`):**
- `types.ts` — rename all `Lesson*` types/consts → `Echo*`; add `ECHO_ID_RE` + `isEchoId`.
- `lesson-id.ts` → `echo-id.ts` — rename `lessonId` → `echoId`; later, shorten output to 8 base62 chars.
- `index.ts` — update re-exports.

**API (`src/api/src/`):**
- `_shared/` — same renames as shared; **delete** `_shared/echo-id.ts` and `_shared/canonicalize.ts` once the API no longer computes ids.
- `functions/lesson-{create,get,download}.ts` → `echo-{create,get,download}.ts` — rename handlers/routes; `create` becomes `PUT /api/echo/{id}` and trusts the path id; all three validate id shape.
- `context.ts`, `config.ts`, `_shared/jobs.ts`, `functions/worker-*.ts`, `queue/queue-client.ts`, `storage/*lesson-repository*` — rename `lessons`→`echoes`, `lessonsContainer`→`echoesContainer`, repo classes/files, job field `lessonId`→`echoId`, telemetry `lesson.*`→`echo.*`.

**Web (`src/web/`):**
- `lib/api.ts` — rename functions/types; `createEcho(id, params)` does `PUT /api/echo/{id}`; rename the `lesson` result field → `echo`.
- `app/echo/[id]/` → `app/[id]/` — bare-id route; `echo-by-id-client.tsx` reads path segment `[0]` not `[1]`.
- `components/{create-echo-form,echo-client,echoes-list}.tsx`, `hooks/use-echo.ts`, `home-client.tsx` — type renames, `/echo/${id}` → `/${id}` links, `createEcho(id, …)`, `result.echo`.
- `public/staticwebapp.config.json` — drop the `/echo/*` rule; point `navigationFallback` at the id shell.
- `next.config.mjs` — comment only.

**Tests/infra:** rename API + web + e2e test files and references; rewrite `staticwebapp-config.test.ts`; migrate e2e `/echo/…` URLs; rename the Blob container in `infra/` Bicep where hard-coded.

---

## Task 0: Branch

- [ ] **Step 1: Create a feature branch off `dev`**

```bash
git checkout -b feat/echo-rename-short-urls
git status   # ES.zip, tests/manual/, and the two docs/superpowers files are untracked — leave them
```

- [ ] **Step 2: Commit the spec + plan**

```bash
git add docs/superpowers/specs/2026-05-31-echo-rename-and-short-urls-design.md \
        docs/superpowers/plans/2026-05-31-echo-rename-and-short-urls.md
git commit -m "docs: spec + plan for echo rename and short urls"
```

---

## Task 1: Mechanical rename lesson → echo (no URL changes yet)

Pure rename. **Does not touch the `/echo/{id}` SPA URL or the `app/echo/[id]` folder** (that's Task 5) and **does not change HTTP methods** (that's Task 3). Verified by typecheck + the existing suite staying green.

**Files:** all of `src/shared`, `src/api`, `src/web`, `tests/e2e`, and `infra/` per the mapping below.

- [ ] **Step 1: Rename symbols (identifiers), repo-wide**

Apply these exact identifier renames everywhere they appear (both `src/shared/src/*` and the mirror `src/api/src/_shared/*`):

| From | To |
|---|---|
| `Lesson` (type) | `Echo` |
| `LessonParams` | `EchoParams` |
| `LessonStatus` | `EchoStatus` |
| `LessonLength` / `LESSON_LENGTHS` | `EchoLength` / `ECHO_LENGTHS` |
| `LessonLevel` / `LESSON_LEVELS` | `EchoLevel` / `ECHO_LEVELS` |
| `LessonMode` / `LESSON_MODES` | `EchoMode` / `ECHO_MODES` |
| `isLessonParams` | `isEchoParams` |
| `lessonId` (fn + job field + vars) | `echoId` |
| `LessonRepository` | `EchoRepository` |
| `InMemoryLessonRepository` | `InMemoryEchoRepository` |
| `BlobLessonRepository` | `BlobEchoRepository` |
| `lessonsContainer` (config) | `echoesContainer` |
| `lessons` (ApiContext field, `buildLessons`) | `echoes` (`buildEchoes`) |
| `createLesson` / `getLesson` / `downloadLesson` (web) | `createEcho` / `getEcho` / `downloadEcho` |
| `CreateLessonResult` / `GetLessonResult` / `DownloadLessonResult` | `CreateEchoResult` / `GetEchoResult` / `DownloadEchoResult` |
| `lessonParams` (test fixture helper) | `echoParams` |

- [ ] **Step 2: Rename files (`git mv`)**

```bash
git mv src/shared/src/lesson-id.ts src/shared/src/echo-id.ts
git mv src/api/src/_shared/lesson-id.ts src/api/src/_shared/echo-id.ts
git mv src/api/src/_shared/storage/lesson-repository.ts src/api/src/_shared/storage/echo-repository.ts
git mv src/api/src/_shared/storage/in-memory-lesson-repository.ts src/api/src/_shared/storage/in-memory-echo-repository.ts
git mv src/api/src/storage/blob-lesson-repository.ts src/api/src/storage/blob-echo-repository.ts
git mv src/api/src/functions/lesson-create.ts src/api/src/functions/echo-create.ts
git mv src/api/src/functions/lesson-get.ts src/api/src/functions/echo-get.ts
git mv src/api/src/functions/lesson-download.ts src/api/src/functions/echo-download.ts
git mv src/api/test/lesson-create.test.ts src/api/test/echo-create.test.ts
git mv src/api/test/lesson-create.rate-limit.test.ts src/api/test/echo-create.rate-limit.test.ts
git mv src/api/test/lesson-get.test.ts src/api/test/echo-get.test.ts
git mv src/api/test/lesson-download.int.test.ts src/api/test/echo-download.int.test.ts
git mv src/api/test/blob-lesson-repository.int.test.ts src/api/test/blob-echo-repository.int.test.ts
```

Update every `import` path and `.js` specifier that referenced the old filenames (e.g. `./lesson-id.js` → `./echo-id.js`, `../src/functions/lesson-create.js` → `echo-create.js`).

- [ ] **Step 3: Rename Azure Functions registrations + routes + telemetry strings**

In the three `functions/echo-*.ts`:
- `app.http('lessonCreate', { route: 'lesson', … })` → `app.http('echoCreate', { route: 'echo', … })` (method unchanged for now).
- `app.http('lessonGet', { route: 'lesson/{id}', … })` → `app.http('echoGet', { route: 'echo/{id}', … })`.
- `app.http('lessonDownload', { route: 'lesson/{id}/download', … })` → `app.http('echoDownload', { route: 'echo/{id}/download', … })`.
- Handler exports: `lessonCreateHandler`/`lessonGetHandler`/`lessonDownloadHandler` → `echoCreateHandler`/`echoGetHandler`/`echoDownloadHandler`.
- Error strings `'lesson not found'`/`'lesson is … not ready'` → `'echo …'`.
- Telemetry event names `lesson.created`/`lesson.cache_hit`/`lesson.rate_limited`/`lesson.downloaded` → `echo.*`; property `lessonId` → `echoId`.

The enqueue payload `{ type: 'scriptGen', lessonId: id }` → `{ type: 'scriptGen', echoId: id }` (matches the renamed `ScriptGenJob`/`TtsSentenceJob` field in `_shared/jobs.ts`; update both workers' reads of `job.lessonId`).

- [ ] **Step 4: Rename the web HTTP paths and result field**

In `src/web/lib/api.ts`: `/api/lesson` → `/api/echo`, `/api/lesson/${id}` → `/api/echo/${id}`, `/api/lesson/${id}/download` → `/api/echo/${id}/download`. Rename the success field on `GetEchoResult` from `lesson` to `echo`:

```ts
export type GetEchoResult =
  | { kind: 'found'; echo: Echo }
  | { kind: 'not_found' }
  | { kind: 'error'; status: number; message: string };
```

Update consumers: `hooks/use-echo.ts`, `components/home-client.tsx` (`result.lesson` → `result.echo`), and any `echo-client.tsx` usage.

- [ ] **Step 5: Rename config + infra container name**

- `src/api/src/config.ts`: `lessonsContainer` → `echoesContainer`; change its default/env value from `'lessons'` to `'echoes'` (and the env var name if one exists, e.g. `LESSONS_CONTAINER` → `ECHOES_CONTAINER`).
- `infra/`: search Bicep/params for a hard-coded `lessons` container name and rename to `echoes`. Data is disposable — no migration. (If the container is created lazily at runtime via `createIfNotExists`, only the config value matters.)

- [ ] **Step 6: Update e2e + test fixtures (API path + helper names only; leave `/echo/` SPA URLs for Task 5)**

- `tests/e2e/fixture.ts` / `tests/e2e/helpers.ts`: route mocks `**/api/lesson**` → `**/api/echo**`.
- `src/api/test/helpers/fixtures.ts`: `lessonParams` → `echoParams`.
- All test references to renamed symbols/imports.

- [ ] **Step 7: Verify typecheck, build, lint, and full suite are green**

```bash
npm run build --workspace @echolingo/shared
npm run typecheck --workspace @echolingo/api
npm run lint
npm run test --workspaces --if-present
```
Expected: shared 26, web 70, api 85 tests all PASS; no `lesson`/`Lesson` identifiers remain in `src/**` except inside the `/echo/` SPA URL strings (Task 5) and the `app/echo/[id]` folder name. Quick check:

```bash
grep -rni "lesson" src --include=*.ts --include=*.tsx | grep -v "/echo/"
```
Expected: no matches (or only the `app/echo/[id]` path + `next.config.mjs` comment, handled in Task 5).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor: rename lesson -> echo across shared, api, web, tests"
```

---

## Task 2: Add the id-shape validator to shared

**Files:**
- Modify: `src/shared/src/types.ts` and the mirror `src/api/src/_shared/types.ts`
- Modify: `src/shared/src/index.ts` (re-export)
- Test: `src/shared/test/types.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/shared/test/types.test.ts`:

```ts
import { isEchoId } from '../src/types.js';

describe('isEchoId', () => {
  it('accepts 1–16 base62 chars', () => {
    expect(isEchoId('k7Xp2qB9')).toBe(true);
    expect(isEchoId('a')).toBe(true);
    expect(isEchoId('0123456789abcdef')).toBe(true); // 16
  });
  it('rejects empty, too long, and non-base62', () => {
    expect(isEchoId('')).toBe(false);
    expect(isEchoId('0123456789abcdefg')).toBe(false); // 17
    expect(isEchoId('has-hyphen')).toBe(false);
    expect(isEchoId('has.dot')).toBe(false);
    expect(isEchoId('../etc')).toBe(false);
    expect(isEchoId('späce')).toBe(false);
    expect(isEchoId(42)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm run test --workspace @echolingo/shared -- types`
Expected: FAIL — `isEchoId is not a function` / no export.

- [ ] **Step 3: Implement**

Add to `src/shared/src/types.ts` (and paste the identical block into `src/api/src/_shared/types.ts` to keep the mirror in sync):

```ts
/** Echo ids are 1–16 base62 chars. The web mints 8; the cap leaves headroom. */
export const ECHO_ID_RE = /^[0-9A-Za-z]{1,16}$/;

export function isEchoId(v: unknown): v is string {
  return typeof v === 'string' && ECHO_ID_RE.test(v);
}
```

`src/shared/src/index.ts` already does `export * from './types.js';` — no change needed there. Confirm `@echolingo/shared/types` resolves it (the web vitest alias maps to `../shared/src/types.ts`).

- [ ] **Step 4: Run tests and confirm pass**

Run: `npm run test --workspace @echolingo/shared`
Expected: PASS (28 tests).

- [ ] **Step 5: Commit**

```bash
git add src/shared/src/types.ts src/api/src/_shared/types.ts src/shared/test/types.test.ts
git commit -m "feat(shared): add isEchoId id-shape validator"
```

---

## Task 3: Backend trusts the client-supplied id (PUT), validates shape; drop server id math

After this task the id is computed in exactly one place (shared, used by the web). The API stores under the path id and never hashes params.

**Files:**
- Modify: `src/api/src/functions/echo-create.ts` (POST → `PUT /api/echo/{id}`, trust + validate id)
- Modify: `src/api/src/functions/echo-get.ts`, `echo-download.ts` (validate id shape)
- Delete: `src/api/src/_shared/echo-id.ts`, `src/api/src/_shared/canonicalize.ts`, and their re-exports in `src/api/src/_shared/index.ts`
- Modify: `src/web/lib/api.ts` (`createEcho(id, params)` → PUT)
- Modify: `src/web/components/echo-client.tsx` (pass id to `createEcho`; drop the now-dead id-divergence redirect)
- Test: `src/api/test/echo-create.test.ts`, `src/api/test/echo-get.test.ts`, `src/web/lib/api.test.ts`

- [ ] **Step 1: Rewrite the API create test for PUT + client id**

Replace the body of `src/api/test/echo-create.test.ts` so it supplies the id via `req.params.id` and no longer derives it from params. Use `echoParams()` from fixtures and a fixed valid id.

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { echoCreateHandler } from '../src/functions/echo-create.js';
import { setContextForTests, type ApiContext } from '../src/context.js';
import {
  InMemoryAudioStorage,
  InMemoryEchoRepository,
  MockLlmEngine,
  MockTtsEngine,
} from '../src/_shared/index.js';
import type { HttpRequest } from '@azure/functions';
import { echoParams } from './helpers/fixtures.js';

const ID = 'k7Xp2qB9';

class FakeQueueClient {
  scriptGen: Array<unknown> = [];
  ttsSentence: Array<unknown> = [];
  async enqueueScriptGen(job: unknown): Promise<void> { this.scriptGen.push(job); }
  async enqueueTtsSentence(job: unknown): Promise<void> { this.ttsSentence.push(job); }
  async ensureQueues(): Promise<void> {}
}

function buildContext(): { ctx: ApiContext; queue: FakeQueueClient } {
  const queue = new FakeQueueClient();
  const ctx = {
    config: {
      storageConnectionString: 'UseDevelopmentStorage=true',
      echoesContainer: 'echoes',
      audioContainer: 'audio',
      rateLimitContainer: 'rate-limits',
      scriptGenQueue: 'script-gen',
      ttsSentenceQueue: 'tts-sentence',
      llmEngine: 'mock' as const,
      ttsEngine: 'mock' as const,
      rateLimitPerDay: 1000,
    },
    echoes: new InMemoryEchoRepository(),
    audio: new InMemoryAudioStorage(),
    queue: queue as unknown as ApiContext['queue'],
    llm: new MockLlmEngine(),
    tts: new MockTtsEngine(),
    rateLimits: { get: async () => 0, increment: async () => 1 },
    telemetry: { emit: () => {} },
  };
  return { ctx, queue };
}

function putRequest(id: string, body: unknown): HttpRequest {
  return {
    method: 'PUT',
    url: `http://localhost/api/echo/${id}`,
    headers: new Headers({ 'content-type': 'application/json' }),
    query: new URLSearchParams(),
    params: { id },
    user: null, body: null, bodyUsed: false,
    arrayBuffer: async () => new ArrayBuffer(0),
    blob: async () => new Blob(),
    formData: async () => new FormData(),
    text: async () => JSON.stringify(body),
    json: async () => body,
    clone() { return this; },
  } as unknown as HttpRequest;
}

describe('echoCreateHandler', () => {
  let ctx: ApiContext;
  let queue: FakeQueueClient;
  beforeEach(() => { ({ ctx, queue } = buildContext()); setContextForTests(ctx); });

  it('returns 400 when the id is malformed', async () => {
    const res = await echoCreateHandler(putRequest('bad-id!', echoParams()));
    expect(res.status).toBe(400);
  });

  it('returns 400 when body is not valid EchoParams', async () => {
    const res = await echoCreateHandler(putRequest(ID, { topic: '' }));
    expect(res.status).toBe(400);
  });

  it('returns 201 storing under the supplied id for a fresh request', async () => {
    const res = await echoCreateHandler(putRequest(ID, echoParams()));
    expect(res.status).toBe(201);
    const body = JSON.parse(res.body as string);
    expect(body.id).toBe(ID);
    expect(body.status).toBe('generating_script');
    expect(await ctx.echoes.get(ID)).not.toBeNull();
  });

  it('enqueues exactly one scriptGen job keyed by the id', async () => {
    await echoCreateHandler(putRequest(ID, echoParams()));
    expect(queue.scriptGen).toEqual([{ type: 'scriptGen', echoId: ID }]);
  });

  it('returns 200 and skips enqueue when the echo already exists', async () => {
    await echoCreateHandler(putRequest(ID, echoParams()));
    queue.scriptGen.length = 0;
    const res = await echoCreateHandler(putRequest(ID, echoParams()));
    expect(res.status).toBe(200);
    expect(queue.scriptGen).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm run test --workspace @echolingo/api -- echo-create.test`
Expected: FAIL — `echoCreateHandler` still POST-shaped / still computes id / imports removed symbols.

- [ ] **Step 3: Rewrite `echo-create.ts` to PUT + trust the path id**

```ts
import { app, type HttpRequest, type HttpResponseInit } from '@azure/functions';
import { isEchoParams, isEchoId, type Echo } from '../_shared/index.js';
import { getContext } from '../context.js';

function clientIp(req: HttpRequest): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]!.trim();
  return 'unknown';
}
function today(): string { return new Date().toISOString().slice(0, 10); }
function tomorrowUtc(): string {
  const t = new Date();
  t.setUTCDate(t.getUTCDate() + 1);
  t.setUTCHours(0, 0, 0, 0);
  return t.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export async function echoCreateHandler(req: HttpRequest): Promise<HttpResponseInit> {
  const id = req.params.id;
  if (!isEchoId(id)) return json(400, { error: 'invalid id' });

  let body: unknown;
  try { body = await req.json(); } catch { return json(400, { error: 'invalid JSON body' }); }
  if (!isEchoParams(body)) return json(400, { error: 'invalid EchoParams' });

  const ctx = getContext();

  const existing = await ctx.echoes.get(id);
  if (existing) {
    ctx.telemetry.emit({ name: 'echo.cache_hit', properties: { echoId: id } });
    return json(200, { id, status: existing.status });
  }

  const ip = clientIp(req);
  const date = today();
  const limit = ctx.config.rateLimitPerDay;
  const used = await ctx.rateLimits.get(ip, date);
  if (used >= limit) {
    ctx.telemetry.emit({ name: 'echo.rate_limited', properties: { ip, used, limit } });
    return json(429, { limit, used, resetAt: tomorrowUtc() });
  }
  await ctx.rateLimits.increment(ip, date);

  const now = new Date().toISOString();
  const fresh: Echo = {
    id, params: body, status: 'generating_script',
    createdAt: now, updatedAt: now, totalSentences: 0, readySentences: 0, sentences: [],
  };
  const persisted = await ctx.echoes.createIfAbsent(fresh);
  const wasFresh = persisted.createdAt === fresh.createdAt;
  if (wasFresh) {
    await ctx.queue.enqueueScriptGen({ type: 'scriptGen', echoId: id });
    ctx.telemetry.emit({
      name: 'echo.created',
      properties: { echoId: id, llmEngine: ctx.config.llmEngine, ttsEngine: ctx.config.ttsEngine },
    });
    return json(201, { id, status: persisted.status });
  }
  return json(200, { id, status: persisted.status });
}

function json(status: number, body: unknown): HttpResponseInit {
  return { status, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
}

app.http('echoCreate', {
  route: 'echo/{id}',
  methods: ['PUT'],
  authLevel: 'anonymous',
  handler: echoCreateHandler,
});
```

- [ ] **Step 4: Validate id shape in get + download; delete server id code**

In `echo-get.ts`, after reading `req.params.id`:
```ts
const id = req.params.id;
if (!isEchoId(id)) return json(400, { error: 'invalid id' });
```
(import `isEchoId` from `../_shared/index.js`). Same guard at the top of `echo-download.ts`.

Delete `src/api/src/_shared/echo-id.ts` and `src/api/src/_shared/canonicalize.ts`, and remove their lines from `src/api/src/_shared/index.ts`:
```ts
// remove: export { canonicalize } from './canonicalize.js';
// remove: export { echoId } from './echo-id.js';
```

- [ ] **Step 5: Run API tests**

Run: `npm run test --workspace @echolingo/api`
Expected: PASS. If `echo-download.int.test.ts` / `pipeline.int.test.ts` POST to create, update them to `PUT /api/echo/{id}` with a fixed id (`params:{id}`, method `PUT`).

- [ ] **Step 6: Update the web client to send the id (PUT) — test first**

Rewrite the `createEcho` cases in `src/web/lib/api.test.ts`:
```ts
it('PUTs JSON params to /api/echo/{id} and returns the id', async () => {
  fetchMock.mockResolvedValue(jsonResponse(201, { id: 'k7Xp2qB9', status: 'generating_script' }));
  const result = await createEcho('k7Xp2qB9', params);
  expect(result).toEqual({ kind: 'created', id: 'k7Xp2qB9', status: 'generating_script' });
  const [url, init] = fetchMock.mock.calls[0]!;
  expect(url).toBe('/api/echo/k7Xp2qB9');
  expect(init.method).toBe('PUT');
  expect(JSON.parse(init.body)).toEqual(params);
});
```
(keep the existing/rate-limited/error cases, calling `createEcho('k7Xp2qB9', params)`).

Run: `npm run test --workspace @echolingo/web -- api.test`
Expected: FAIL (signature/method/url mismatch).

- [ ] **Step 7: Implement `createEcho(id, params)` as PUT**

In `src/web/lib/api.ts`:
```ts
export async function createEcho(id: string, params: EchoParams): Promise<CreateEchoResult> {
  const res = await fetch(`${API_BASE_URL}/api/echo/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(params),
  });
  const body = await readJson(res);
  if (res.status === 201) return { kind: 'created', id: String(body.id), status: String(body.status) };
  if (res.status === 200) return { kind: 'existing', id: String(body.id), status: String(body.status) };
  if (res.status === 429) {
    return { kind: 'rate_limited', limit: Number(body.limit ?? 0), used: Number(body.used ?? 0), resetAt: String(body.resetAt ?? '') };
  }
  return { kind: 'error', status: res.status, message: String(body.error ?? res.statusText) };
}
```

- [ ] **Step 8: Update `echo-client.tsx` to pass the id and drop the dead redirect**

The component already knows `id` (its prop) and `pendingParams`. Change the create call to `createEcho(id, pendingParams)` and remove the now-impossible divergence branch:
```ts
const result = await createEcho(id, params);
// ...
if (result.kind === 'created' || result.kind === 'existing') {
  clearPendingParams(id);
  setReloadToken((t) => t + 1);
} else if (result.kind === 'rate_limited') {
  setCreating({ kind: 'rate_limited', limit: result.limit, used: result.used, resetAt: result.resetAt });
} else {
  setCreating({ kind: 'network_error', message: result.message });
}
```
Delete the `if (result.id !== id) { router.replace(...) }` block and the import of `createLesson`’s old name is already handled by Task 1.

- [ ] **Step 9: Run web tests**

Run: `npm run test --workspace @echolingo/web`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat(api): trust client-supplied id (PUT /api/echo/{id}), validate shape, drop server id math"
```

---

## Task 4: Shorten the id to 8 base62 chars

Only one implementation now (`src/shared/src/echo-id.ts`).

**Files:**
- Modify: `src/shared/src/echo-id.ts`
- Test: `src/shared/test/echo-id.test.ts` (new)

- [ ] **Step 1: Write the failing test**

Create `src/shared/test/echo-id.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { echoId } from '../src/echo-id.js';
import { isEchoId } from '../src/types.js';
import type { EchoParams } from '../src/types.js';

const base: EchoParams = {
  topic: 'at the bakery', targetLang: 'el', nativeLang: 'en',
  lengthMin: 5, level: 3, mode: 'bilingual', bilingualOrder: 'target_first', ttsEngine: 'openai',
};

describe('echoId', () => {
  it('is exactly 8 base62 chars and a valid echo id', async () => {
    const id = await echoId(base);
    expect(id).toHaveLength(8);
    expect(isEchoId(id)).toBe(true);
  });
  it('is deterministic and normalizes the topic', async () => {
    expect(await echoId(base)).toBe(await echoId({ ...base, topic: '  At  The   Bakery ' }));
  });
  it('differs when a meaningful param differs', async () => {
    expect(await echoId(base)).not.toBe(await echoId({ ...base, level: 4 }));
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm run test --workspace @echolingo/shared -- echo-id`
Expected: FAIL — current `echoId` returns 64 hex chars (length 64 ≠ 8).

- [ ] **Step 3: Implement 8-char base62 encoding**

Replace `src/shared/src/echo-id.ts`:

```ts
import { canonicalize } from './canonicalize.js';
import type { EchoParams } from './types.js';

const B62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/**
 * Deterministic short echo id: base62 of the first 8 bytes of SHA-256(canonical
 * params), reduced into exactly 8 base62 chars (~47.6 bits). Isomorphic (Web
 * Crypto), so the web mints the same id everywhere. The API does not recompute
 * it — it only validates the shape (isEchoId).
 */
export async function echoId(params: EchoParams): Promise<string> {
  const normalized: EchoParams = {
    ...params,
    topic: params.topic.trim().toLowerCase().replace(/\s+/g, ' '),
  };
  const data = new TextEncoder().encode(canonicalize(normalized));
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', data));

  let n = 0n;
  for (let i = 0; i < 8; i++) n = (n << 8n) | BigInt(digest[i]!);
  n %= 62n ** 8n;

  let out = '';
  for (let i = 0; i < 8; i++) { out = B62[Number(n % 62n)] + out; n /= 62n; }
  return out;
}
```

- [ ] **Step 4: Run shared tests**

Run: `npm run build --workspace @echolingo/shared && npm run test --workspace @echolingo/shared`
Expected: PASS. (Build is needed because the API consumes shared `dist`, though the API no longer imports `echoId`.)

- [ ] **Step 5: Confirm web/api suites still green**

Run: `npm run test --workspaces --if-present`
Expected: PASS. Web tests that compute an id via `echoId` now get an 8-char value; none assert the old 64-char shape (verify `use-echo.test.ts` / `create` flow tests don't hardcode a 64-hex id — fix if any do).

- [ ] **Step 6: Commit**

```bash
git add src/shared/src/echo-id.ts src/shared/test/echo-id.test.ts
git commit -m "feat(shared): shorten echoId to 8 base62 chars"
```

---

## Task 5: Bare `/{id}` routing (drop the `/echo/` prefix)

**Files:**
- Move: `src/web/app/echo/[id]/page.tsx` → `src/web/app/[id]/page.tsx`
- Move: `src/web/app/echo/[id]/echo-by-id-client.tsx` → `src/web/app/[id]/echo-by-id-client.tsx` (read segment `[0]`)
- Modify: `src/web/public/staticwebapp.config.json`
- Modify: `src/web/components/{create-echo-form,echo-client,echoes-list}.tsx` (link builders)
- Modify: `src/web/next.config.mjs` (comment)
- Test: `src/web/lib/staticwebapp-config.test.ts` (rewrite), `src/web/app/[id]/echo-by-id-client.test.tsx` (new), e2e specs

- [ ] **Step 1: Rewrite the SWA-config test (failing)**

Replace `src/web/lib/staticwebapp-config.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

describe('staticwebapp.config.json', () => {
  const cfgPath = join(__dirname, '..', 'public', 'staticwebapp.config.json');
  const cfg = JSON.parse(readFileSync(cfgPath, 'utf8')) as {
    routes?: Array<{ route: string }>;
    navigationFallback: { rewrite: string; exclude: string[] };
  };

  it('has no /echo/* route rule', () => {
    expect((cfg.routes ?? []).some((r) => r.route.startsWith('/echo'))).toBe(false);
  });

  it('falls back to the bare-id shell', () => {
    expect(cfg.navigationFallback.rewrite).toBe('/shell/index.html');
    expect(cfg.navigationFallback.exclude).toEqual(
      expect.arrayContaining(['/_next/*', '/api/*']),
    );
  });

  it('the fallback target exists on disk after build (skipped if not built)', () => {
    const outDir = join(__dirname, '..', 'out');
    if (!existsSync(outDir)) return;
    expect(existsSync(join(outDir, 'shell', 'index.html'))).toBe(true);
  });
});
```

Run: `npm run test --workspace @echolingo/web -- staticwebapp-config`
Expected: FAIL — config still has the `/echo/*` rule and `navigationFallback.rewrite === '/index.html'`.

- [ ] **Step 2: Update `staticwebapp.config.json`**

```json
{
  "navigationFallback": {
    "rewrite": "/shell/index.html",
    "exclude": ["/_next/*", "/api/*", "/*.{ico,png,jpg,svg,webmanifest,js,css,mp3}"]
  },
  "globalHeaders": {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin"
  },
  "responseOverrides": {
    "404": { "rewrite": "/index.html" }
  },
  "mimeTypes": {
    ".webmanifest": "application/manifest+json"
  }
}
```
(The `routes` array — the `/echo/*` rule — is removed. `/` is served by its real `index.html`; any other extension-less path falls back to the id shell.)

- [ ] **Step 3: Move the dynamic route to the root segment**

```bash
mkdir -p src/web/app/[id]
git mv src/web/app/echo/[id]/page.tsx src/web/app/[id]/page.tsx
git mv src/web/app/echo/[id]/echo-by-id-client.tsx src/web/app/[id]/echo-by-id-client.tsx
rmdir src/web/app/echo/[id] src/web/app/echo 2>/dev/null || true
```
Fix the relative import depth in the moved files (`../../../components/echo-client` was 3 levels under `app/echo/[id]`; from `app/[id]` it is `../../components/echo-client`). `page.tsx` becomes:
```tsx
import { EchoByIdClient } from './echo-by-id-client';
export const dynamic = 'force-static';
export function generateStaticParams() { return [{ id: 'shell' }]; }
export default function EchoPage() { return <EchoByIdClient />; }
```

- [ ] **Step 4: Read the id from path segment 0 (test first)**

Create `src/web/app/[id]/echo-by-id-client.test.tsx`:
```tsx
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { readIdFromPath } from './echo-by-id-client';

describe('readIdFromPath', () => {
  it('reads the first path segment as the id', () => {
    window.history.pushState({}, '', '/k7Xp2qB9');
    expect(readIdFromPath()).toBe('k7Xp2qB9');
  });
  it('returns empty string at root', () => {
    window.history.pushState({}, '', '/');
    expect(readIdFromPath()).toBe('');
  });
});
```

Run: `npm run test --workspace @echolingo/web -- echo-by-id-client`
Expected: FAIL — `readIdFromPath` is not exported / still reads `parts[1]`.

- [ ] **Step 5: Update `echo-by-id-client.tsx`**

Export `readIdFromPath` and read segment `[0]`:
```tsx
'use client';
import { useEffect, useState } from 'react';
import { EchoClient } from '../../components/echo-client';

export function readIdFromPath(): string {
  if (typeof window === 'undefined') return '';
  const parts = window.location.pathname.split('/').filter(Boolean);
  return parts[0] ?? '';
}

export function EchoByIdClient() {
  const [id, setId] = useState('');
  useEffect(() => { setId(readIdFromPath()); }, []);
  if (!id) return null;
  return <EchoClient id={id} />;
}
```

- [ ] **Step 6: Update link builders to `/${id}/`**

- `src/web/components/create-echo-form.tsx`: `router.push(\`/echo/${id}/\`)` → `router.push(\`/${id}/\`)`; update the two `/echo/{id}` comments.
- `src/web/components/echoes-list.tsx`: `router.push(\`/echo/${echo.id}/\`)` → `router.push(\`/${echo.id}/\`)`.
- `src/web/components/echo-client.tsx`: the remaining `router.replace(\`/echo/${result.id}/\`)` at the bottom → `router.replace(\`/${result.id}/\`)`; update the create-on-arrival comment.
- `src/web/next.config.mjs`: comment `dynamic /echo/[id] routes` → `dynamic /[id] routes`.

- [ ] **Step 7: Run web unit tests**

Run: `npm run test --workspace @echolingo/web`
Expected: PASS.

- [ ] **Step 8: Migrate e2e specs to bare `/{id}`**

In `tests/e2e/*.spec.ts` replace SPA navigations and URL assertions:
- `page.goto('/echo/${X}/')` → `page.goto('/${X}/')` (`error-states`, `shared-echo-discovery`, `player-panel-pinned`).
- `toHaveURL(new RegExp('/echo/${id}/?$'))` → `toHaveURL(new RegExp('/${id}/?$'))` (`create-flow`, `error-states`).
- Update comment text mentioning `/echo/{id}`.
- (Optional cleanup: the fixture ids `shared-1`/`pinned-1` contain hyphens — fine as mocked SPA path segments, but if you prefer, rename them to base62 like `shared1`/`pinned1` and update the matching route mocks.)

- [ ] **Step 9: Verify the production routing actually works (build + serve)**

```bash
npm run build --workspace @echolingo/shared
npm run build --workspace @echolingo/web   # next export → src/web/out
ls src/web/out/shell/index.html            # the fallback target must exist
ls src/web/out/index.html                  # home
```
Expected: both files exist. Then the SWA-config test's on-disk check passes:
```bash
npm run test --workspace @echolingo/web -- staticwebapp-config
```
Expected: PASS (3 tests).

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat(web): serve echoes at bare /{id}, drop /echo/* rewrite"
```

---

## Task 6: Full verification + e2e

- [ ] **Step 1: Whole suite + lint + typecheck**

```bash
npm run lint
npm run typecheck --workspace @echolingo/api
npm run build --workspace @echolingo/shared
npm run test --workspaces --if-present
```
Expected: all PASS; no `lesson`/`Lesson` left:
```bash
grep -rni "lesson" src tests --include=*.ts --include=*.tsx --include=*.json --include=*.mjs
```
Expected: no matches.

- [ ] **Step 2: E2E (Playwright)**

```bash
npm run test:e2e
```
Expected: all specs PASS against the dev stack (Playwright config starts the app). Investigate any failures with `--headed`/`--debug`; the most likely breakage is a missed `/echo/` URL.

- [ ] **Step 3: Manual smoke (optional but recommended)**

`npm run dev`, create an echo from the home form, confirm the URL is `/{8-char-id}`, the player loads, a hard refresh of `/{id}` cold-loads via the fallback, and an unknown `/{id}` shows the not-found state.

- [ ] **Step 4: Final commit if anything changed during verification**

```bash
git add -A && git commit -m "test: migrate e2e + verify echo rename and short urls" || echo "nothing to commit"
```

---

## Self-review notes (author)

- **Spec coverage:** API-trusts-id + validation (Task 3), short 8-char id (Task 4), bare `/{id}` + fallback (Task 5), rename incl. routes/container/telemetry/tests (Tasks 1, 3, 5), no-migration/no-legacy (no alias added anywhere), high-bar tests (id+validator units, API 400/PUT, config, e2e) — all mapped.
- **Sequencing:** rename first (green), validator, then API-trust (removes the second id impl), then shorten (one impl to change), then routing. Each task ends on a green suite + commit.
- **Type consistency:** `EchoParams`/`Echo`/`isEchoParams`/`isEchoId`/`echoId`/`createEcho(id, params)`/`GetEchoResult.echo`/`ctx.echoes`/`echoesContainer`/job field `echoId` used consistently across tasks.
- **Known sharp edge:** the validator forbids `-`; e2e fixture ids use hyphens but only as mocked SPA path segments (the real handler isn't hit in e2e), so they pass — flagged in Task 5 Step 8.
