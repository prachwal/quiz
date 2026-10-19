---
tags:
  - docs
  - deploy
  - security
created: 2026-10-19
updated: 2026-10-19
---

# Zmienne środowiskowe

## Frontend (Vite, prefix `VITE_`)

| Zmienna | Opis |
| --- | --- |
| `VITE_AUTH0_DOMAIN` | Domena Auth0 |
| `VITE_AUTH0_CLIENT_ID` | Client ID SPA |
| `VITE_AUTH0_AUDIENCE` | Audience API (`https://api.quiz.local`) |
| `VITE_SENTRY_DSN` | Opcjonalny DSN Sentry (frontend) |
| `VITE_DEV_AUTH_TOKEN` | Lokalny bypass logowania (tylko dev) |
| `VITE_DEV_AUTH_ROLES` | Role bypassu (np. `admin,teacher`) |
| `VITE_DEV_AUTH_USER_ID` | ID użytkownika bypassu |

## Server (funkcja Vercel)

| Zmienna | Opis |
| --- | --- |
| `AUTH0_DOMAIN` | Domena Auth0 |
| `AUTH0_AUDIENCE` | Audience API |
| `AUTH0_MGMT_CLIENT_ID` | M2M app "Quiz Management" |
| `AUTH0_MGMT_CLIENT_SECRET` | Sekret M2M (secret) |
| `SENTRY_DSN` | Opcjonalny DSN Sentry (server) |
| `DEV_AUTH_TOKEN` | Lokalny bypass (server) |
| `DEV_AUTH_ROLES` | Role bypassu |
| `DEV_AUTH_USER_ID` | ID użytkownika bypassu |

## Baza danych

- Vercel: `DATABASE_URL` z integracji Neon (Production/Preview/Development).
- Vercel/Neon: ustaw `DATABASE_URL` ręcznie.

## Gdzie ustawiać

- Lokalnie: `.env` (gitignored), wzór w `.env.example`.
- Vercel: Project → Settings → Environment Variables (Production/Preview/Development).
- Vercel: project settings → Environment variables.

## Sekrety

`AUTH0_MGMT_CLIENT_SECRET` to sekret — nie commituj. Vercel skanuje sekrety przy
buildzie; `SECRETS_SCAN_OMIT_KEYS` pozwala pominąć klucze publiczne.

## Powiązane

- [[Setup]]
- [[Auth]]
- [[Vercel]]
