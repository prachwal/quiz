---
tags:
  - docs
  - database
  - runbook
created: 2026-10-19
updated: 2026-10-19
---

# Baza danych

## Schemat

Główne tabele:

- `quizzes` → `questions` → `options` (kaskadowe), `quiz_attempts`.
- `irregular_verbs` + lookups (`cefr_levels`, `difficulty_levels`,
  `popularity_tiers`, `verb_patterns`) + `verb_forms`, `verb_meanings`.
- `courses`, `lessons`, `lesson_verbs`, `lesson_progress`.
- `user_profiles`, `daily_activity` (streak, cel dzienny).
- `verb_reviews` (spaced repetition, Leitner).
- `classes`, `class_members`, `assignments`.
- `api_tokens`, `feedback`, `admin_audit_log`, `app_settings`, `subjects`.

## Migracje

- Lokalizacja: `db/migrations/`.
- Nigdy nie edytuj zastosowanych migracji — dodawaj nowe pliki.
- `npm run db:migrate` stosuje je na `DATABASE_URL`. Vercel **nie** aplikuje migracji
  automatycznie, więc po deployu ze zmianą schematu trzeba je uruchomić ręcznie.

## Zasady

- `user_id` = `sub` z Auth0 (TEXT).
- Zapytania przez `pg` pool z `DATABASE_URL` (`server/quizRepo.ts` → `pool()`).
- Transakcje dla create/replace quizu.
- `PUT` quizu zastępuje wszystkie pytania/opcje (ich id się zmieniają).

## Odbudowa środowiska

Schemat i dane odtwarza się w całości: `DROP SCHEMA public CASCADE` →
`npm run db:migrate` (migracje wstawiają dane słownikowe) → deploy.
Runbook: [[Vercel]].

## Powiązane

- [[Vercel]]
- [[Setup]]
