---
tags:
  - docs
  - auth
  - security
created: 2026-10-19
updated: 2026-10-19
---

# Uwierzytelnianie i autoryzacja

## Auth0

- Tenant: `dev-4xxb1z18b3z4hc6s.us.auth0.com`.
- SPA app "Quiz SPA" + API "Quiz API" (audience `https://api.quiz.local`).
- Role RBAC: `admin` (Google, `write:quizzes`), `student` (Discord),
  `teacher` (`manage:classes`).
- Action "Quiz: roles claim" dodaje `https://quiz.local/roles` do tokenów (UI).

## Przepływ

- Frontend: `AuthProvider` pokazuje stronę logowania anonimowym; token getter
  używany przez RTK Query `prepareHeaders`.
- Server: `authenticate` rozwiązuje Bearer (JWT lub token `qz_…`); `requireAuthenticated`
  zwraca 401 z `WWW-Authenticate`.

## Tokeny API (`qz_…`)

- Tworzenie/lista/unieważnianie: `/api/tokens` (tylko sesja JWT).
- Max 20 aktywnych, pokazywane raz.
- Migawka uprawnień z chwili utworzenia (`write:quizzes` tylko jeśli twórca admin).
- Personalny token może mieć `manage:classes` tylko jeśli nauczyciel utworzy go z
  `classes: true`.

## Dev bypass

- `DEV_AUTH_TOKEN` w `.env` akceptowany jako Bearer (działa jak `DEV_AUTH_USER_ID`
  z `DEV_AUTH_ROLES`), tylko pod `npm run dev:full`.
- `VITE_DEV_AUTH_TOKEN` pomija login Auth0 w dev buildach (usuwany z produkcji).

## Uprawnienia

- `write:quizzes` — quizy create/update/delete i `?include=answers`.
- `manage:users` — panel admina (tylko JWT, nigdy personalny token).
- `manage:classes` — klasy i wyniki (nauczyciel).

## Powiązane

- [[Environment]]
- [[api-admin]] (szczegóły panelu)
- [[mcp-clients]] (OAuth dla MCP)
