# Echolingo

On-demand AI-generated Greek listening lessons for learners walking, driving, or away from a screen. Pick a topic, length, and level — audio streams within seconds. Bilingual mode echoes each sentence in Greek and your native language.

- PWA first (Azure Static Web Apps), React Native wrapper later
- No login; lessons addressable by a deterministic URL — share and reopen instantly
- Serverless on Azure, IaC via Bicep, deploys via `azd`

See [`docs/superpowers/specs/2026-05-16-echolingo-design.md`](docs/superpowers/specs/2026-05-16-echolingo-design.md) for the full design spec and [`docs/superpowers/plans/2026-05-16-echolingo-plan-1-foundation.md`](docs/superpowers/plans/2026-05-16-echolingo-plan-1-foundation.md) for the Plan 1 (Foundation) implementation plan.

## Repository layout

```
azure.yaml         azd service map
infra/             Bicep modules (placeholder until Plan 5)
src/
  shared/          @echolingo/shared — domain types, prompts, parsers, TTS interface
  web/             @echolingo/web    — Next.js 15 PWA (static export)
  api/             @echolingo/api    — Azure Functions v4 (Node 20 TS)
```

## Prerequisites

- Node 20 (`nvm use`)
- npm 10+
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
npm run azurite

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

## Real provider configuration (Plan 4)

The API supports two engines per role; selection is via env. Defaults: mocks when no keys are set, OpenAI when `OPENAI_API_KEY` is present.

| Env var | Purpose | Example |
|---|---|---|
| `LLM_ENGINE` | `mock` \| `openai` | `openai` |
| `OPENAI_API_KEY` | OpenAI key (LLM + TTS) | `sk-...` |
| `OPENAI_LLM_MODEL` | Chat model | `gpt-4o-mini` |
| `OPENAI_TTS_MODEL` | TTS model | `tts-1` |
| `TTS_ENGINE` | `mock` \| `openai` | `openai` |
| `RATE_LIMIT_PER_DAY` | Max fresh lessons per IP per day | `20` |
| `APPLICATIONINSIGHTS_CONNECTION_STRING` | Optional — emits named events when set | |

Copy `src/api/local.settings.json.example` to `src/api/local.settings.json`, fill in your keys, and `npm run dev:api`.

### Rate limiting

Per-IP daily quota enforced on `POST /api/lesson`. Cache hits (deterministic id → existing lesson) do **not** consume quota. On exceed: `429 { limit, used, resetAt }`. Resets at UTC midnight.

### Offline download

`POST /api/lesson/{id}/download` returns `{ url }` pointing at a concatenated MP3 of the full lesson (respecting `mode` + `bilingualOrder`). Cached after first build via `lesson.fullMp3Url`.

## Frontend (Plan 3)

The PWA lives at `src/web` (Next.js 15 app router, static export). In dev the Next.js server rewrites `/api/*` to `http://localhost:7071`; in production Azure Static Web Apps' linked-Functions feature handles the same path.

Pages:
- `/` — lesson form, prefs auto-fill from localStorage.
- `/lesson/[id]/` — polls the backend; once `status:"ready"` shows the audio player + transcript with sentence highlight. Speed slider (0.75× / 1× / 1.25×), prev/next sentence, repeat current sentence, MediaSession lockscreen controls.

```bash
npm run azurite   # in one terminal
npm run dev:api   # in another (http://localhost:7071)
npm run dev:web   # in another (http://localhost:3000)
```

### Static-export deploy notes (for Plan 5)

The `/lesson/[id]/` route is emitted as a single static shell at `/lesson/shell/index.html`. To make `/lesson/<real-id>/` requests resolve in production, the Azure Static Web Apps `staticwebapp.config.json` must rewrite that path to the shell. Plan 5 adds the file.

## Status

Plans 1, 2, 3, 4 complete. Echolingo is end-to-end usable locally: open `http://localhost:3000`, fill the form, listen to a real OpenAI-generated Greek lesson with synchronized transcript and lockscreen controls. Azure deploy (Plan 5) is next.
