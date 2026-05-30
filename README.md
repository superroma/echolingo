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

One command brings up the whole stack:

```bash
npm run dev
```

This builds `@echolingo/shared` first (the web app imports it via its `dist/`
`exports`, so it must exist before Next compiles), then runs four processes
together under [`concurrently`](https://www.npmjs.com/package/concurrently) with
colour-coded prefixes:

- `azurite` — storage emulator (blob/queue/table on `10000`–`10002`)
- `shared` — `tsc --watch` so edits to shared types recompile live
- `api`    — Azure Functions on http://localhost:7071
- `web`    — Next.js on http://localhost:3000

No keys required: with no `OPENAI_API_KEY`/`AZURE_OPENAI_ENDPOINT` set, the API
runs the **mock** LLM + TTS engines (see [Real provider configuration](#real-provider-configuration-plan-4)).
`Ctrl+C` stops all four (`--kill-others`).

Smoke-test the API:

```bash
curl http://localhost:7071/api/health
```

> Need them in separate terminals? The underlying scripts are still available
> individually: `npm run azurite`, `npm run dev:shared`, `npm run dev:api`,
> `npm run dev:web`.

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

### Static-export deploy notes

The `/lesson/[id]/` route is emitted as a single static shell at `/lesson/shell/index.html`. `src/web/public/staticwebapp.config.json` rewrites any `/lesson/<id>/` request to that shell, which then reads the actual id from `window.location.pathname` at runtime.

## Deploy (Plan 5)

Echolingo provisions and deploys through `azd`. Infra is composed of Azure Verified Modules; the Function App uses **Flex Consumption** on Node 22 with a system-assigned managed identity (SAMI). The SAMI gets `Storage Blob/Queue/Table Data Contributor` on the storage account and `Cognitive Services OpenAI User` on the Azure OpenAI resource — no API keys are stored anywhere.

### First-time setup

```bash
# Authenticate (one-time)
azd auth login
az login

# Create env (one-time)
azd env new prod
azd env set AZURE_LOCATION westeurope
azd env set AZURE_OPENAI_LOCATION westeurope

# Provision + deploy
azd up
```

`azd up` will:
1. Provision the resource group, monitoring, storage, Azure OpenAI (with `gpt-5.4-mini` + `tts` GlobalStandard deployments at 150K TPM), Function App, and Static Web App.
2. Build the shared package, then the Function App TS source, package as a Flex Consumption zip, and upload to the `deploymentpackage` blob container.
3. Build the Next.js static export and upload to the Static Web App.
4. Print the public URL.

### Model availability fallback

If `gpt-5.4-mini` isn't available in your tenant/region, override at deploy time:

```bash
azd env set LLM_MODEL_NAME gpt-4o-mini
azd env set LLM_MODEL_VERSION 2024-07-18
azd provision
```

### CI deploys (GitHub Actions OIDC)

One-time:

```bash
azd pipeline config --provider github
```

This registers federated credentials and adds the required secrets/vars to the repo. Pushes to `main` then trigger `.github/workflows/deploy.yml`, which runs `azd up --no-prompt`.

### Verification

```bash
curl https://func-echolingo-prod.azurewebsites.net/api/health
curl -X POST $(azd env get-values | grep WEB_URL | cut -d= -f2- | tr -d '"')/api/lesson \
  -H 'content-type: application/json' \
  -d '{"topic":"at the bakery","lengthMin":5,"level":3,"style":"dialogue","mode":"bilingual","bilingualOrder":"gr_first","nativeLang":"en","ttsEngine":"openai"}'
```

## Status

All plans (1, 2, 3, 4, 5) complete. Echolingo runs locally and deploys to Azure with one `azd up`. Production auth is exclusively SAMI; local dev uses `az login` via `DefaultAzureCredential`. No API keys live in env or code.
