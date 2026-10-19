---
tags:
  - docs
  - architecture
created: 2026-10-19
updated: 2026-10-19
---

# Architektura

## Przegląd

Aplikacja quizowa: React 19 + TypeScript + Vite (frontend) na Vercel, backend to
Express 5 w jednej funkcji serverless (Vercel) z bazą Postgres w Neon (patrz [[Vercel]]).

## Frontend

- Wejście: `index.html` → `src/main.tsx` (Redux `Provider`) → `src/App.tsx`
  (antd v6 `ConfigProvider` + React Router).
- Stan: Redux Toolkit + RTK Query (`src/app/api.ts`, base URL `/api`),
  slice `settings` (motyw, gęstość, ustawienia quizu) persistowany w
  `localStorage`.
- Routing: `/`, `/learn`, `/verbs`, `/results`, `/quizzes/*`, `/about`,
  `/settings`, `/assignments`, `/classes`.
- Style: `src/styles/` (kaskada), tokeny antd w `src/app/brandTheme.ts`.

## Backend

- Pojedyncza funkcja `api-src/index.ts` (bundlowana przez `npm run build:api` do
  `api/index.mjs`) owija aplikację Express z `server/app.ts` (composition root).
- Handlery w `server/routes/` (quizzes, tokens, classes, progress, learning,
  admin). Wspólne: `server/http.ts`.
- Dostęp do danych: repozytoria (`server/*Repo.ts`, `server/classes/`).
- Auth: `server/auth.ts` (Auth0 JWT lub token `qz_…`).

## Baza danych

- Migracje SQL w `db/migrations/`.
- Tabele: `quizzes`, `questions`, `options`, `quiz_attempts`, `irregular_verbs`,
  `courses`, `lessons`, `user_profiles`, `daily_activity`, `classes`, itd.
- Szczegóły: [[Database]].

## Moduły funkcjonalne

- Quizy (CRUD, generowanie z czasowników, próbkowanie, tasowanie).
- Nauka (kursy, lekcje, egzaminy).
- Powtórki (spaced repetition, Leitner).
- Postęp (streak, cel dzienny).
- Słabe czasowniki (trening błędów).
- Klasy i nauczyciel (zadania, raporty).
- MCP server (`POST /api/mcp`).

## Powiązane

- [[CLAUDE]] (główny przewodnik)
- [[Frontend]] (TODO) / [[Backend]] (TODO)
