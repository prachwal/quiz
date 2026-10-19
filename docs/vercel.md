# Deploy na Vercel (Neon)

Drugi hosting obok Netlify: frontend z `dist/` + Express w jednej funkcji, baza Postgres w Neon.
Netlify pozostaje źródłem prawdy dla danych (z niego robi się kopię), a Vercel jest środowiskiem
testowym — dlatego można je bez żalu odtworzyć od zera.

## Co jest w repo

| Plik | Rola |
| --- | --- |
| `vercel.json` | build `npm run build && npm run build:api`, output `dist`, `rewrites`, limit 30 s dla funkcji |
| `api-src/index.ts` | punkt wejścia funkcji: `serverless-http` + `server/app.ts` |
| `api/index.mjs` | **skompilowany i zacommitowany** bundle (`npm run build:api`) |
| `scripts/migrate.mjs` | aplikuje `netlify/database/migrations/*.sql` na dowolny `DATABASE_URL` |
| `scripts/sync-db.mjs` | kopiuje dane z Netlify DB do Neon (`docs/db-sync.md`) |

Dlaczego bundle jest w repo: Vercel nie rozwija catch-all `[...path]`, nie wykrywa `.cjs` i uruchamia
funkcję dopiero po buildzie — plik `api/index.mjs` musi więc istnieć przed deployem.
`vercel.json` używa `rewrites` (nie przestarzałego `routes` + `handle: filesystem`); kolejność reguł:
`/.well-known/*` i `/api/*` → funkcja z `?__original=…`, reszta → `/index.html` (SPA).

## Deploy

```bash
npm ci
npm run build        # tsc -b && vite build (kontrola; Vercel i tak to powtórzy)
npm run build:api    # api-src/index.ts -> api/index.mjs
vercel --prod --yes
```

Deployment z CLI nie ma aliasu git — push na `vercel-neon` tworzy tylko **Deploy Preview** (chronioną
przez Vercel Authentication, `302`). Produkcja jest publiczna: <https://quiz-vercel-rho.vercel.app>.

Zmienne środowiskowe (Production/Preview/Development): `DATABASE_URL` (+ `*_UNPOOLED`), `AUTH0_*`,
`AUTH0_MGMT_*`, `SENTRY_DSN`, `VITE_AUTH0_*`, `VITE_SENTRY_DSN`. Są wspólne dla wszystkich środowisk,
więc preview widzi te same dane co produkcja.

## Baza

Neon: projekt `broad-leaf-41334668`, baza `neondb`. **Vercel nie aplikuje migracji** — po deployu ze
zmianą schematu uruchom je ręcznie:

```bash
vercel env pull .env.local --environment production --yes
env -u DATABASE_URL node --env-file=.env.local scripts/migrate.mjs
```

### Odbudowa od zera

Środowisko jest nieprodukcyjne, więc zamiast łatać dryf można zrzucić schemat i odtworzyć całość
(~2 minuty):

```bash
# 1. zrzuć schemat
env -u DATABASE_URL node --env-file=.env.local --input-type=module -e "
import pg from 'pg'
const c = new pg.Client({ connectionString: process.env.DATABASE_URL })
await c.connect()
await c.query('DROP SCHEMA public CASCADE')
await c.query('CREATE SCHEMA public')
await c.end()"

# 2. wszystkie migracje od początku
env -u DATABASE_URL node --env-file=.env.local scripts/migrate.mjs

# 3. dane z Netlify (--replace, bo migracje wstawiają dane słownikowe)
env -u DATABASE_URL node --env-file=.env.local scripts/sync-db.mjs --replace

# 4. deploy
vercel --prod --yes
```

Sprawdzone: 19 migracji od zera i 4308 wierszy w 27 tabelach.

## Weryfikacja

```bash
U=https://quiz-vercel-rho.vercel.app
curl -s -o /dev/null -w '%{http_code}\n' $U/api/health      # 200
curl -s -o /dev/null -w '%{http_code}\n' $U/api/quizzes     # 401 — całe API jest prywatne
curl -s -o /dev/null -w '%{http_code}\n' $U/quizzes/x/play  # 200 — SPA fallback
```

Potem zaloguj się (Auth0, callback `https://quiz-vercel-rho.vercel.app`), sprawdź listę quizów
i `/results`. Przy zmianach w silniku pytań warto powtórzyć test przez API osobistym tokenem
(`POST /api/quizzes` → `GET` → `POST /:id/grade`), bo logowanie Auth0 nie jest wtedy potrzebne.

## Pułapki

- **`DATABASE_URL` w shellu wygrywa z `--env-file`** — dlatego wszędzie `env -u DATABASE_URL …`.
- **Rotacja poświadczeń Neon**: `.env.local` z `vercel env pull` się starzeje. `28P01 password
  authentication failed` = odśwież plik (`vercel env pull`) albo pobierz URL z
  `neon connection-string --project-id broad-leaf-41334668 --database-name neondb`.
- **Deployment Protection** blokuje preview (`302 Protected by Vercel Authentication`); do testów
  przez CLI użyj `vercel curl <url>` albo deployu produkcyjnego.
- **`PUT /api/quizzes/:id`** nadpisuje wszystkie pytania i opcje — identyfikatory się zmieniają
  (dotyczy też `config`). Testy muszą po `PUT` ponownie odczytać widok gracza.
- Vercel buduje z lokalnego katalogu przy `vercel --prod`; push na `vercel-neon` nie promuje produkcji.
