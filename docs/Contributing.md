---
tags:
  - docs
  - process
created: 2026-10-19
updated: 2026-10-19
---

# Wkład w projekt

## Konwencje

- Język UI i komunikatów: polski.
- Lint: Oxlint (`npm run lint`), nie ESLint.
- Format: Prettier nie jest wymuszony; trzymaj styl istniejącego kodu.
- Commity: krótkie, po polsku lub angielsku, w trybie rozkazującym.

## Przed PR

- `npm run build` (tsc -b + vite build).
- `npm run lint`.
- `npm test`.
- Zaktualizuj `CLAUDE.md` i odpowiednie notatki w `docs/` przy zmianach architektury.

## Migracje

- Tylko nowe pliki w `db/migrations/`.
- Zastosowanych migracji nie edytuj.

## Dokumentacja

- Vault Obsidiana w `docs/`. Nowa notatka: frontmatter `tags:` + wpis w
  `00-Index/Index.md`.
- Taksonomia: `00-Index/Tags.md`.

## Powiązane

- [[Setup]]
- [[Testing]]
