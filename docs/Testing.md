---
tags:
  - docs
  - testing
created: 2026-10-19
updated: 2026-10-19
---

# Testy

## Jednostkowe

- `npm test` — `node:test`, esbuild bundle (`.test-build/`) bo Node nie uruchamia TS.
- Testy tylko czystej logiki (bez DB/przeglądarki); trzymaj ją w modułach bez importów.
- Pliki: `tests/*.test.ts` (engine, spaced, streaks, weak, csv, sampling, subjectGroups).

## MCP e2e

- `npm run test:mcp` — `scripts/mcp-local-e2e.sh/.ts`: startuje `scripts/dev-server.mjs`
  (lub używa działającego), ćwiczy wszystkie 27 narzędzi, uprawnienia i audyt.
- Wiersze testowe mają prefix `mcp-e2e` i są usuwane.

## Konwencje

- Logika czysta w `src/shared/quiz/` (importowana przez frontend i server).
- Testy dla nowych typów pytań: `tests/engine.test.ts`, `tests/quizSchema.test.ts`.
- Ręczna weryfikacja dla UI (opisana w planach).

## Powiązane

- [[test-coverage-tasks]]
- [[question-types-plan]]
