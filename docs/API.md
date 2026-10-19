---
tags:
  - docs
  - api
  - backend
created: 2026-10-19
updated: 2026-10-19
---

# API (REST)

Baza URL: `/api`. Całe API prywatne (poza `GET /api/health`); wymaga
`Authorization: Bearer <token>` (Auth0 JWT lub `qz_…`).

## Quizy

- `GET /api/quizzes` — lista (filtry: `difficulty`, `sort`, `subject`, `?include`).
- `GET /api/quizzes/:id` — szczegóły (`?include=answers` dla edytora).
- `POST /api/quizzes` — utwórz (wymaga `write:quizzes`).
- `PUT /api/quizzes/:id` — zastąp (wymaga `write:quizzes`).
- `DELETE /api/quizzes/:id` — usuń (wymaga `write:quizzes`).
- `POST /api/quizzes/:id/grade` — oceń i zapisz próbę.
- `POST /api/quizzes/:id/retry-wrong` — nowy quiz z błędnych.
- `POST /api/quizzes/generate/irregular-verbs` — wygeneruj quiz.

## Próby

- `GET /api/attempts` — lista prób użytkownika.

## Czasowniki

- `GET /api/irregular-verbs` — katalog (filtry difficulty/popularity/pattern).

## Nauka

- `GET /api/courses`, `GET /api/courses/:id`.
- `GET /api/courses/:id/lessons/:lessonId`.
- `POST .../complete` — zakończ lekcję.
- `POST /api/courses/:id/exam` — egzamin końcowy.

## Postęp

- `GET /api/progress/summary`
- `PATCH /api/progress/profile`
- `GET /api/progress/weak-verbs`
- `GET /api/reviews/summary`
- `POST /api/reviews/session`

## Klasy

- `GET /api/classes`, `POST /api/classes`, `GET /api/classes/:id`.
- `POST /api/classes/join`, `POST /api/classes/:id/members`.
- `GET /api/classes/:id/report` (+ `.csv`).
- `GET /api/classes/:id/students/:userId`.

## Tokeny API

- `GET/POST /api/tokens`, `DELETE /api/tokens/:id`.

## Admin (wymaga `manage:users`)

- `GET /api/admin/users`, `PATCH ...`, `POST .../block`.
- `GET /api/admin/feedback`, `GET /api/admin/audit`.
- `GET /api/admin/students/:userId/results`.
- `GET/PUT /api/admin/settings/app`.

## MCP

- `POST /api/mcp` — serwer MCP (stateless Streamable HTTP).

## Inne

- `GET /api/health` — publiczny health check.
- `POST /api/feedback` — zgłoszenie problemu.

## Powiązane

- [[Auth]]
- [[mcp]]
