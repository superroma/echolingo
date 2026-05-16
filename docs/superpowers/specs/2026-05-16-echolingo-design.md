# Echolingo — Design Spec

**Date:** 2026-05-16
**Status:** Draft, awaiting user review

## Summary

Echolingo is an on-demand AI-generated Greek listening lessons app for learners walking, driving, or otherwise away from a screen. The user picks a topic, length, level, and listening mode; within seconds, audio begins streaming. A bilingual mode echoes each sentence in Greek and the user's native language (English or Russian for v1). Ships first as a PWA (Azure Static Web Apps), with a React Native wrapper planned later.

No login. Lessons are addressable by a deterministic URL derived from their parameters, so sharing a URL gives anyone the same lesson instantly without re-generation.

## Goals

- "Topic + Go" → audio playing in ≤ 10 seconds
- Greek-only and bilingual modes, both with sentence-level transcript sync
- Single codebase that becomes a phone app later (PWA → RN wrapper)
- Serverless, IaC, cheap to run when idle, scales when popular
- Functional on a lockscreen with bluetooth headphones — background-audio safe

## Non-goals (v1)

- Login, accounts, payments
- Multi-target languages (Greek only; architecture leaves room)
- Voice picker UI (single curated voice per language; engine-supported override via query param only)
- Favorites or "mark sentence to revisit"
- Word-level karaoke sync
- Social features, streaks, leaderboards
- Generation while fully offline (online needed; offline playback supported via download)
- Native iOS/Android (RN wrapper deferred until PWA validates the idea)

## User flow (happy path)

1. User opens the PWA. Home screen shows recent server-cached sessions plus a "New lesson" form.
2. Form fields:
   - **Topic** — free text
   - **Length** — preset chips: 5 / 10 / 20 / 30 minutes
   - **Level** — slider 1–5
   - **Style** — Monologue / Dialogue / Story
   - **Mode** — Greek-only / Bilingual
   - **Bilingual order** — GR → native / native → GR (visible only when mode = Bilingual)
   - **Native language** — English / Russian
3. Form fields **pre-populate from last-used values in localStorage**. Topic is the only required input each time.
4. On submit, the client `POST`s to the API. API hashes the params into a deterministic `id`; if cached, redirect to `/lesson/<id>` and play immediately. Else create the row and start generation; redirect immediately with status updates streamed in.
5. Player view at `/lesson/<id>`:
   - Play / pause (required)
   - Skip ±15 s
   - **Repeat current sentence** (taps go back to start of current sentence)
   - **Speed** 0.75× / 1× / 1.25×
   - Synchronized transcript scroll, current sentence highlighted
6. URL is shareable. Anyone with the link gets the same lesson.
7. Optional **"Download MP3"** — full lesson is concatenated server-side and offered as a single file for offline listening.

## Architecture

```
[ PWA (Next.js, static export) ]  ←─  Azure Static Web Apps  ─→  [ Azure Functions (Node 20 TS) ]
   - React + Tailwind                                                - POST /api/lesson
   - Service Worker                                                  - GET  /api/lesson/:id
   - MediaSession API                                                - POST /api/lesson/:id/download
   - localStorage: form prefs
                                          ┌──────────────────────────┘
                                          ↓
                              [ Cosmos DB (serverless, SQL API) ]
                                 - lessons       (metadata, transcript, status)
                                 - rate_limits   (per-IP daily counts, TTL ~25h)
                                          ↓
                              [ Blob Storage ]
                                 - lessons/{id}/gr/{i}.mp3
                                 - lessons/{id}/native/{i}.mp3
                                 - lessons/{id}/full.mp3  (on demand)
                                          ↓
                              [ External APIs ]
                                 - OpenAI Chat (GPT-4o-mini) — script generation
                                 - TTS provider behind interface:
                                     OpenAITts (default), ElevenLabsTts, GoogleTts
                                          ↓
                              [ Storage Queue ]
                                 - script-generation jobs
                                 - tts-sentence jobs (fan-out)
                                          ↓
                              [ Azure Web PubSub ]
                                 - per-lesson channels for chunk-ready updates
```

### Hosting & compute

- **One Azure Static Web App** hosts the Next.js static export and the integrated Functions API. Single resource, single deploy.
- **Azure Functions consumption plan**, Node 20 TypeScript.
- **Each function execution stays under 30 seconds.** No long-running streaming functions.

### Secrets & identity

- OpenAI, ElevenLabs, and Google TTS keys live in **Azure Key Vault**.
- Functions access Key Vault via **managed identity**. No keys in env files or code.

### Repo layout (npm workspaces, `azd` conventions)

```
azure.yaml       azd service map (web + api)
infra/           Bicep templates
src/
  web/           @echolingo/web    — Next.js 15 PWA (static export)
  api/           @echolingo/api    — Azure Functions v4 (HTTP + queue triggers)
  shared/        @echolingo/shared — types, prompts, sentence parser, TTS interface
docker-compose.yml  Azurite (local Storage/Queue emulator)
```

### IaC & deploy

- **`azd`** drives provisioning + deploy from `azure.yaml`. Each service (`web`, `api`) points to its host (Static Web App, Function App).
- **Bicep** (`infra/main.bicep` + modules) provisions: Static Web App, Function App, Cosmos DB, Storage account (blob + queue), Web PubSub, Key Vault, Application Insights.
- One environment per `azd` env (e.g., `dev`, `prod`). No external state file — Bicep is declarative against ARM.

## Generation flow

1. **`POST /api/lesson`** with `{topic, lengthMin, level, style, mode, bilingualOrder, nativeLang}`.
   - Validates input and enforces per-IP rate limit (Cosmos atomic upsert on `rate_limits/{ip,date}`).
   - Computes `id = sha256(canonicalize(params))`.
   - Cache check: if `lessons/{id}` exists and `status === "ready"`, return `{id, status:"ready"}`.
   - Else insert `lessons/{id}` with `status:"generating_script"` and enqueue a `script-generation` job.
   - Returns `{id, status}` immediately.
2. **`script-generation` worker** (queue-triggered, < 30 s):
   - Calls GPT-4o-mini with a prompt template per `style`. Streaming response is fully consumed inside this function; we don't stream to client from here.
   - Parses output into ordered sentence pairs `[{i, gr, native}]`.
   - Writes the transcript to Cosmos, sets `status:"generating_audio"`, fans out one `tts-sentence` job per pair.
3. **`tts-sentence` worker** (queue-triggered, ×N parallel, each < 5 s):
   - Calls the configured TTS engine for the Greek sentence and (if bilingual) the native sentence.
   - Uploads `lessons/{id}/gr/{i}.mp3` and `lessons/{id}/native/{i}.mp3` to Blob.
   - Patches `sentences[i]` in Cosmos with URLs, durations, and `status:"ready"`. Increments `readySentences`.
   - When `readySentences === totalSentences`, sets lesson `status:"ready"`.
   - Publishes a `chunk-ready` event to the per-lesson Web PubSub channel.
4. **Client** at `/lesson/<id>`:
   - `GET /api/lesson/:id` returns the full transcript plus per-sentence readiness and URLs.
   - Subscribes to the Web PubSub channel; on each `chunk-ready` event, refreshes that sentence's URL.
   - Starts playing chunk 0 as soon as it's ready. Buffers ahead. If playback catches up to a `pending` sentence, shows "generating…".
   - On bilingual mode, plays GR audio then native audio (or reverse) per the `bilingualOrder`.

### Text↔audio sync

- **Sentence-level** in v1: each sentence's audio file has a known duration; the client maintains a running offset and advances the highlighted sentence in the transcript when `audio.currentTime` exceeds the sentence's end.
- **Word-level** (karaoke) is deferred to v2 and depends on switching the TTS engine to ElevenLabs or Google (OpenAI TTS does not return word timestamps).

### Offline download

- `POST /api/lesson/:id/download` waits for `status:"ready"`, concatenates chunks in the playback order (respecting `mode` and `bilingualOrder`) into `lessons/{id}/full.mp3`, and returns a signed URL.
- MP3 concatenation must respect frame boundaries (use `ffmpeg -c copy` or an MP3-aware library, not raw byte concat) to avoid playback glitches.
- The result is cached as the lesson's `fullMp3Url`. Subsequent requests skip concatenation.

## Data model

### Container `lessons` (partition key `/id`)

```ts
{
  id: string,                  // sha256 of canonicalized params
  params: {
    topic: string,
    lengthMin: 5 | 10 | 20 | 30,
    level: 1 | 2 | 3 | 4 | 5,
    style: "mono" | "dialogue" | "story",
    mode: "greek_only" | "bilingual",
    bilingualOrder: "gr_first" | "native_first",
    nativeLang: "en" | "ru",
    ttsEngine: "openai" | "elevenlabs" | "google",
    voice?: string             // engine-supported override
  },
  status: "generating_script" | "generating_audio" | "ready" | "failed",
  createdAt: string,
  updatedAt: string,
  totalSentences: number,
  readySentences: number,
  sentences: Array<{
    i: number,
    gr: string,
    native: string,
    status: "pending" | "ready" | "failed",
    grUrl?: string,
    nativeUrl?: string,
    grDurSec?: number,
    nativeDurSec?: number
  }>,
  fullMp3Url?: string,
  error?: string
}
```

### Container `rate_limits` (partition key `/ip`)

```ts
{
  ip: string,
  date: string,                // "YYYY-MM-DD" UTC
  count: number,
  ttl: number                  // Cosmos auto-expire after ~25h
}
```

### Blob layout

```
lessons/{id}/gr/{i}.mp3        Greek sentence audio
lessons/{id}/native/{i}.mp3    Native-language sentence audio
lessons/{id}/full.mp3          Concatenated MP3 (download mode)
```

## TTS engine abstraction

```ts
interface TtsEngine {
  name: "openai" | "elevenlabs" | "google";
  synthesize(opts: {
    text: string;
    lang: "el" | "en" | "ru";
    voice?: string;
  }): Promise<{ mp3: Buffer; durationSec: number }>;
}
```

- Default implementation: `OpenAITts` (`tts-1`).
- `ElevenLabsTts` and `GoogleTts` implementations included from v1 but not the default.
- Engine selection is per-lesson via a header / env default. This keeps cost predictable and allows quick A/B without redeploy.

## Rate limiting, errors, observability

### Rate limiting

- **20 lessons/day per IP**, configurable via env var on the Function App.
- Enforced at `POST /api/lesson`.
- Cache hits do **not** count against the limit. Concurrent requests for the same uncached params: the first to insert the row consumes its rate-limit slot; subsequent identical requests attach to the in-flight lesson and are treated as cache hits.
- On exceed: `429` with `{ resetAt, limit, used }`. UI surfaces "Daily limit reached, try again at midnight UTC."

### Errors

- LLM and TTS provider 5xx: exponential backoff, 3 retries.
- **Per-sentence isolation**: a single failed TTS does not kill the lesson. The sentence is marked `failed`; the transcript shows `[skipped]` with a "regenerate this sentence" affordance.
- Total script-generation failure: lesson `status:"failed"` with `error` field; UI shows a retry button. The failed creation does **not** consume the user's rate-limit slot.

### Observability

- **Application Insights** (free tier) for traces and exceptions.
- Custom events: `lesson.created`, `lesson.cache_hit`, `lesson.script_ready`, `lesson.audio_ready`, `lesson.failed`, `lesson.downloaded`.
- Daily cost dashboard derived from event payloads (TTS characters + LLM tokens).

## Cost estimate

Per 10-min lesson, OpenAI defaults:

- GPT-4o-mini script: ~2k tokens in, ~3k out ≈ **$0.002**
- OpenAI TTS `tts-1`, ~3k chars × 2 languages = ~6k chars ≈ **~$0.09**
- Cosmos + Blob writes: negligible
- **Total: ~$0.09 per 10-minute lesson**

At 20/day per-IP × 50 active users (worst case, no cache hits): **~$90/day**. Real usage will be far lower because the deterministic-ID cache absorbs repeat-listens and shared URLs.

Switching to ElevenLabs raises the audio cost ~10–20× — controlled per-lesson via the engine selector, not blanket.

## Testing

### Unit (Vitest)

- `packages/shared` pure logic: prompt builders, sentence-pair parser, ID-hashing, rate-limit math, sentence-time-to-index lookup.
- TTS engine adapters tested against recorded fixtures (no real API calls).

### Integration (Vitest + Azurite + mocks)

- Functions API tested against **Azurite** (local Cosmos/Blob/Queue emulator).
- LLM and TTS calls intercepted with `msw` returning canned scripts/audio.
- Assertions cover: deterministic IDs, idempotent creates, rate-limit boundaries, partial-failure handling, queue fan-out.

### End-to-end (Playwright)

- One golden-path test against deployed staging: form → submit → audio plays within 10 s → transcript highlights correct sentence → share URL works in a second browser context.
- Greek + Russian native pair, both modes (greek-only and bilingual).

### Manual smoke (per release)

- Outdoor walk with locked phone and bluetooth headphones for 5 minutes → audio doesn't drop, lockscreen controls work.
- One lesson per content style (mono / dialogue / story) at level 1 and level 5; listen to first minute and sanity-check quality and pronunciation.

### Not in scope

- Load testing (defer until real usage exists)
- Automated accessibility tests (manual VoiceOver pass before launch)

## Open questions

- Which Cyprus-adjacent Azure region (West Europe vs Italy North) is closest to the user's hosting and minimises latency? Decide at deploy time.
- Exact rate-limit number — start at 20/day per IP, observe Application Insights for the first week, adjust.
- Default TTS voice IDs per language — pick during a quick A/B listening test before launch.

## Future work (post-v1)

- Word-level karaoke sync (requires ElevenLabs or Google TTS as the default)
- Voice picker UI
- Multi-target languages (architecture supports it; UI and prompts need extension)
- Favorites / "mark sentence to revisit"
- React Native wrapper (shares hooks and the API; ships through TestFlight / Play Console)
- Optional auth + history sync across devices
