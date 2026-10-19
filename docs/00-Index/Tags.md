---
tags:
  - meta
  - tags
created: 2026-10-19
updated: 2026-10-19
---

# Taksonomia tagów

Pełna lista tagów używanych w tym vault. Każdy dokument powinien mieć co najmniej jeden tag z grupy **domena** i jeden z grupy **typ**.

## Domena (co dotyczy)

- `#quiz` — całość aplikacji quiz
- `#frontend` — React / UI / Redux / routing
- `#backend` — Express / funkcja serverless / repozytoria
- `#database` — migracje, schemat, SQL
- `#auth` — Auth0, tokeny, uprawnienia
- `#mcp` — serwer MCP i klienci
- `#deploy` — Vercel / Neon, CI/CD
- `#audio` — TTS, wymowa
- `#progress` — streak, cel dzienny, powtórki (spaced repetition)
- `#classes` — klasy, nauczyciel, zadania
- `#learning` — kursy, lekcje, czasowniki
- `#media` — obrazki i pliki (S3, wysyłanie, wyświetlanie)

## Typ dokumentu

- `#docs` — dokumentacja techniczna
- `#plan` — plan rozwoju / wdrożenia
- `#task` — lista zadań / TODO
- `#reference` — materiał referencyjny (np. lista czasowników)
- `#decision` — decyzja architektoniczna (ADR)
- `#runbook` — procedura operacyjna

## Status

- `#status/todo` — do zrobienia
- `#status/in-progress` — w trakcie
- `#status/done` — zrobione
- `#status/blocked` — zablokowane

## Komponent / obszar

- `#api` — endpointy REST
- `#ui` — interfejs
- `#testing` — testy
- `#security` — bezpieczeństwo
- `#performance` — wydajność
- `#i18n` — internacjonalizacja (pl)

## Tagi zagnieżdżone

Obsidian wspiera tagi zagnieżdżone: `#status/todo`, `#domain/frontend`. Używaj separatora `/` dla hierarchii. Nie mieszaj z myślnikami w nazwach tagów (używaj `-` tylko wewnątrz segmentu, np. `#question-types`).

## Zasady

1. Każdy dokument ma frontmatter `tags:` z listą.
2. Tagi inline (`#tag`) tylko dla odniesień w tekście.
3. Nowy tag dodaj najpierw tutaj, potem użyj.
4. Nie twórz tagów jednorazowych — preferuj istniejące.
