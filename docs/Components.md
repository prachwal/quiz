---
tags:
  - docs
  - frontend
  - ui
created: 2026-10-19
updated: 2026-10-19
---

# Komponenty UI

## Look & feel

- Temat antd: `src/app/brandTheme.ts` (indigo, 16px body, jasny/ciemny).
- Tokeny CSS: `src/app/themeVars.ts` → `--app-*` na `.app-shell`.
- Style: `src/styles/` w kaskadzie (base, shell, components, pages, phones, touch,
  misc), importowane przez `src/index.css`.
- Preferuj tokeny (`theme.useToken()`) zamiast hardcoded kolorów.

## Struktura stron

- `PageHeader` (eyebrow/back, title, subtitle, meta, actions).
- `AppLayout` (header nav, drawer na < lg, bottom nav na telefonach).
- `BrandMark` (logo).

## Breakpointy

- `PHONE_QUERY` < 768px, `COARSE_QUERY` (touch) w `src/app/useMediaQuery.ts`.
- Nav: pill >= 992px, hamburger 768–991px, `BottomNav` < 768px.
- Pokazywanie/ukrywanie nawigacji czysto CSS (nie `Grid.useBreakpoint`).

## Focus mode

- `useFocusMode()` w QuizPlayer i lesson slides: na telefonach ukrywa tab bar,
  action bar staje się fixed (safe-area). Trasa fade tylko opacity na telefonach
  (brak transform na przodkach).

## Mobile

- Tabele → karty (`.card-rows`), modale → bottom sheets.
- Safe areas: `env(safe-area-inset-*)`, wysokości `dvh` z fallback `vh`.
- Swipe na slajdach (`useSwipe`, `.swipe-area`).

## Wyniki/kolory

- `useScoreColors()` / `ScoreTag` / `ScoreProgress` (`src/features/results/`),
  progi red/orange/green (domyślnie 50/80, konfigurowalne w `app_settings`).

## Powiązane

- [[Architecture]]
