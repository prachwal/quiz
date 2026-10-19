---
tags:
  - docs
  - classes
  - backend
  - frontend
created: 2026-10-19
updated: 2026-10-19
---

# Klasy i nauczyciel

## Role

- `teacher` (Auth0) z uprawnieniem `manage:classes` (nie przyznawane adminowi
  automatycznie; admin potrzebujący go dostaje rolę teacher).
- Uczniowie dołączają kodem (`POST /api/classes/join`).

## Model

- `classes` (owner = sub nauczyciela, 6-znakowy `join_code`, soft-archive,
  `joining_open`).
- `class_members`, `assignments` (kurs lub quiz ręczny, opcjonalny termin).

## Statusy zadań

Pochodne z istniejących danych (postęp lekcji + zdany egzamin dla kursów, najlepsza
próba dla quizów) — bez dodatkowej ewidencji.

## Dostęp

- Nauczyciel widzi tylko własne klasy (inne = 404).
- Admin (`manage:users`, tylko OAuth) może czytać wszystkie klasy (scope=all),
  widok tylko do odczytu.
- Zmiany tylko przez właściciela.

## Raporty

- `GET /api/classes/:id/report` (+ `.csv`, bezpieczne przed formula injection —
  `src/shared/quiz/csv.ts`).
- `GET /api/classes/:id/students/:userId` → wyniki ucznia (tylko przypisane
  quizy/egzaminy).

## UI

- `/manage/classes` (ClassPanel), `/classes/:id` (ClassDetail).
- `/results` z `StudentPicker` (nauczyciel/admin).
- `/assignments` (wszyscy).

## Powiązane

- [[api-admin]]
- [[Auth]]
