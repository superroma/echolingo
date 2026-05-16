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

## Status

Plan 1 (Foundation) — scaffolding complete. Lesson generation begins in Plan 2.
