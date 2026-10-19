---
name: obsidian
description: >-
  Use when working with the project's Obsidian vault under `docs/` (notes, tags,
  templates, frontmatter, MOC index, graph). Covers the tagging taxonomy in
  `docs/00-Index/Tags.md`, the MOC in `docs/00-Index/Index.md`, templates in
  `docs/Templates/`, and the `mcp-obsidian` MCP server exposing `read_notes` and
  `search_notes`. Trigger for any task involving Obsidian notes, tagging,
  documentation vault, or reading project docs via MCP. Also use when the user
  mentions "obsidian", "vault", "tagging", "notatki", or "dokumentacja".
metadata:
  source: project
---

# Obsidian (vault w `docs/`)

Vault projektu quiz znajduje się w katalogu `docs/`. Jest to jednocześnie
dokumentacja repozytorium i baza wiedzy w formacie Obsidian.

## Struktura

- `docs/.obsidian/` — konfiguracja vaultu (app, appearance, core/community plugins,
  templates, graph color groups). Nie edytuj ręcznie bez potrzeby; zmiany w
  ustawieniach Obsidian lądują tu.
- `docs/00-Index/Index.md` — MOC (Map of Content), punkt wejścia.
- `docs/00-Index/Tags.md` — taksonomia tagów (pełna lista).
- `docs/Templates/` — szablony notatek (`Note.md`, `Doc.md`).
- `docs/Attachments/` — załączniki (puste na starcie).
- Pozostałe `*.md` — notatki/dokumenty z frontmatter `tags`.

## Tagowanie (pełne)

Każdy dokument ma frontmatter:

```yaml
---
tags:
  - docs
  - backend
created: 2026-10-19
updated: 2026-10-19
---
```

Zasady:

1. Co najmniej jeden tag z grupy **domena** (`#quiz`, `#frontend`, `#backend`,
   `#database`, `#auth`, `#mcp`, `#deploy`, `#audio`, `#progress`, `#classes`,
   `#learning`) i jeden z grupy **typ** (`#docs`, `#plan`, `#task`, `#reference`,
   `#decision`, `#runbook`).
2. Tagi zagnieżdżone z `/`: `#status/todo`, `#status/done`, `#status/blocked`,
   `#status/in-progress`.
3. Nowy tag najpierw dodaj do `docs/00-Index/Tags.md`, potem użyj.
4. Nie twórz tagów jednorazowych.
5. Tagi inline (`#tag`) tylko dla odniesień w tekście; kanoniczna lista w frontmatter.

Pełna taksonomia i zasady: [[Tags]].

## MCP (`mcp-obsidian`)

Serwer: `mcp-obsidian <vault-dir>` (stdio). Udostępnia:

- `read_notes` — odczyt wielu notatek po ścieżkach względnych do vaultu.
- `search_notes` — wyszukiwanie po nazwie (case-insensitive, regex).

Konfiguracja klientów:

- Claude Code: `.mcp.json` w roocie repo (klucz `mcpServers.obsidian`).
- VS Code / Copilot: `.vscode/mcp.json` (klucz `servers.obsidian`).

Vault path: `${workspaceFolder}/docs` (VS Code) / absolutna ścieżka do `docs/`
(Claude Code).

## Praca z notatkami

- Nowa notatka: użyj szablonu z `docs/Templates/` (Obsidian: „Wstaw szablon”).
- Aktualizuj `docs/00-Index/Index.md` (MOC) przy dodawaniu dokumentu.
- Aktualizuj `updated:` w frontmatter przy edycji.
- Linki wewnętrzne: `[[nazwa-notatki]]` (Obsidian wikilinks).

## Dokumentacja projektu

- `CLAUDE.md` jest głównym przewodnikiem dla Claude Code; vault `docs/`
  uzupełnia go szczegółami. Przy zmianach architektury aktualizuj oba.
- Plan uzupełnienia dokumentacji: `docs/00-Index/Documentation-Plan.md`.

## Kiedy NIE używać tego skilla

- Zmiany w kodzie aplikacji (React/TS/Netlify) — użyj odpowiednich skilli
  (`neon`).
- Pisanie nowych dokumentów od zera poza vaultem — najpierw zdecyduj czy lądują
  w `docs/`.
