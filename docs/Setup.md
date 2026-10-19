---
tags:
  - docs
  - setup
  - runbook
created: 2026-10-19
updated: 2026-10-19
---

# Konfiguracja środowiska deweloperskiego

## Wymagania

- Node.js 22+ (sprawdź `node --version`).
- npm 11.21+ (projekt używa `allowScripts` w `package.json`).
- Vercel CLI: `npm i -g vercel` (deploy, `vercel env pull`).
- Baza Postgres: Neon, `DATABASE_URL` w `.env.local` (`vercel env pull .env.local`).

## Instalacja

```bash
git clone <repo>
cd quiz
npm install
cp .env.example .env.local
```

Uzupełnij `.env.local` (patrz [[Environment]]).

## Uruchomienie

- Sam frontend: `npm run dev` (Vite, port 5173; bez API).
- Frontend + funkcje + DB: `npm run dev:full` (port 8888, Vite za proxy).
- Testy: `npm test` (node:test, esbuild).
- MCP e2e: `npm run test:mcp` (startuje `dev:full` sam).

## Migracje bazy

```bash
npm run db:migrate
```

Vercel nie stosuje migracji przy wdrożeniu — uruchamiaj je jawnie po każdym
deployu ze zmianą schematu (używa `DATABASE_URL`).

## TypeScript

- Frontend: `tsconfig.app.json` + `tsconfig.node.json`.
- Server: `tsconfig.server.json`.
- Sprawdzenie: `npm run build` (`tsc -b && vite build`).

## Lint

`npm run lint` (Oxlint, konfiguracja `.oxlintrc.json`) — nie ESLint.

## Powiązane

- [[Environment]]
- [[Database]]
- [[Testing]]
