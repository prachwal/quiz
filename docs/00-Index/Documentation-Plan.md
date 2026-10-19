---
tags:
  - plan
  - docs
  - status/todo
created: 2026-10-19
updated: 2026-10-19
---

# Plan uzupełnienia dokumentacji

Stan na 2026-10-19. Vault `docs/` zawiera głównie dokumenty procesowe (plany, MCP,
deploy). Brakuje dokumentacji referencyjnej i onboardingowej. Poniższy plan
uporządkowuje braki według priorytetu.

## Priorytet 1 (blokuje nowych współtwórców)

1. `docs/Setup.md` — onboarding: wymagania (Node, npm 11.21+, Vercel CLI), clone,
   `.env.local` z `.env.example`, `npm install`, `npm run dev:full`, migracje, seed.
   Tagi: `#docs #setup #runbook`.
2. `docs/Architecture.md` — przegląd architektury (frontend/backend/db/auth) z
   diagramem; wyciąg z `CLAUDE.md` zaktualizowany i skrócony.
   Tagi: `#docs #architecture`.
3. `docs/Environment.md` — wszystkie zmienne środowiskowe (frontend/server),
   gdzie ustawiane (lokalnie/Vercel).
   Tagi: `#docs #deploy #security`.
4. `docs/Database.md` — schemat (tabele, relacje), migracje, jak stosować,
   `npm run db:migrate`, ostrzeżenia.
   Tagi: `#docs #database #runbook`.

## Priorytet 2 (przydatne przy pracy)

5. `docs/API.md` — lista endpointów REST (`/api/*`) z metodami, auth, przykłady.
   Tagi: `#docs #api #backend`.
6. `docs/Auth.md` — Auth0 tenant, role, uprawnienia, dev bypass, tokeny API.
   Tagi: `#docs #auth #security`.
7. `docs/Testing.md` — `npm test`, `npm run test:mcp`, konwencje testów czystej
   logiki, esbuild bundle.
   Tagi: `#docs #testing`.
8. `docs/Components.md` — kluczowe komponenty UI, breakpoints, focus mode,
   style cascade.
   Tagi: `#docs #frontend #ui`.

## Priorytet 3 (nice to have)

9. `docs/Quiz-Engine.md` — typy pytań, rejestr, grading, sampling, spaced rep.
   Tagi: `#docs #quiz`.
10. `docs/Classes.md` — moduł klas/nauczyciela, uprawnienia, raporty.
    Tagi: `#docs #classes`.
11. `docs/Progress.md` — streak, cel dzienny, powtórki, słabe czasowniki.
    Tagi: `#docs #progress`.
12. `docs/Contributing.md` — konwencje commitów, lint (Oxlint), PR, i18n pl.
    Tagi: `#docs #process`.

## Zasady wykonania

- Każdy nowy dokument: frontmatter z tagami (min. domena + typ), wpis w
  `00-Index/Index.md`, aktualizacja `updated:`.
- Dokumenty referencyjne powinny być generowane/aktualizowane przy zmianach kodu
  (hook w PR checklist).
- Preferuj krótkie dokumenty z linkami do `CLAUDE.md` zamiast duplikacji.

## Kolejność

Priorytet 1 → 2 → 3. Każdy dokument to osobny PR/commit z tagiem `docs`.
