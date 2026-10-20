---
tags:
  - docs
  - deploy
  - runbook
created: 2026-10-19
updated: 2026-10-20
---

# Deploy na Vercel (Neon)

Jedyne środowisko produkcyjne: frontend z `dist/` + Express w jednej funkcji, baza Postgres w Neon.
Projekt jest nieprodukcyjny pod względem danych, więc zamiast łatać dryf schematu można odtworzyć
całość od zera (patrz runbook niżej).

## Co jest w repo

| Plik | Rola |
| --- | --- |
| `vercel.json` | build `npm run build && npm run build:api`, output `dist`, `rewrites`, limit 30 s dla funkcji |
| `api-src/index.ts` | punkt wejścia funkcji: `server/app.ts` obsługiwany jako handler Node |
| `api/index.mjs` | **skompilowany i zacommitowany** bundle (`npm run build:api`) |
| `scripts/migrate.mjs` | aplikuje `db/migrations/*.sql` na dany `DATABASE_URL` |
| `scripts/dev-server.mjs` | lokalny odpowiednik: API + proxy do Vite na `:8888` (`npm run dev:full`) |

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
`AUTH0_MGMT_*`, `SENTRY_DSN`, `VITE_AUTH0_*`, `VITE_SENTRY_DSN`; magazyn obrazów (opis w
[Media-Storage-Plan](Media-Storage-Plan.md), „Konfiguracja”): `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`,
`S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` (secret), `S3_FORCE_PATH_STYLE` (`true`), `S3_KEY_PREFIX`
(`dev/` lokalnie, `preview/` na Preview, puste na Production), `MEDIA_PUBLIC_BASE_URL`, `MEDIA_DRIVER` (`s3`), `MEDIA_MAX_BYTES`,
`MEDIA_URL_FETCH` (zostaje `false`, dopóki nie zweryfikowano przypinania połączeń na Vercelu) oraz
`VITE_MEDIA_PUBLIC_BASE_URL` (to samo co `MEDIA_PUBLIC_BASE_URL`, wartość budowania: po zmianie wdróż ponownie);
`CRON_SECRET` (sprzątanie, poniżej). `MEDIA_CLEANUP_OWNER_FILTER` ustawia tylko `npm run test:mcp`; w produkcji
nie wolno jej ustawiać. Bucket `media` (Neon Object Storage, `public_read`) jest wspólny dla wszystkich środowisk,
ale `S3_KEY_PREFIX` rozdziela ich obiekty (`dev/`, `preview/`, Production bez prefiksu), więc Preview nie widzi
plików Production i odwrotnie. Klucze S3 z `neon env pull --project-id broad-leaf-41334668 --branch main -s object-storage`
dodaje się na Vercelu ręcznie (`vercel env add`); automatycznej integracji Neon–Vercel nie potwierdzono.

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

# 2. wszystkie migracje od początku (wstawiają katalog czasowników i kursy)
env -u DATABASE_URL node --env-file=.env.local scripts/migrate.mjs

# 3. deploy
vercel --prod --yes
```

Migracje zakładają 19 plików schematu i wypełniają dane słownikowe: 136 czasowników, 4 kursy,
26 lekcji. Quizy użytkowników i próby trzeba wtedy odtworzyć z kopii zapasowej.

### Dzienne sprzątanie mediów (Vercel Cron)

`vercel.json` ma `crons`: `GET /api/media/cleanup` raz na dobę (`0 3 * * *`, UTC; limit planu Hobby to najwyżej raz
dziennie). Endpoint nie jest za logowaniem, strzeże go `CRON_SECRET`: bez tej zmiennej odpowiada `404` i nic nie
robi; z błędnym nagłówkiem `401`. Dodaj sekret (Production, losowe co najmniej 32 bajty):

```bash
openssl rand -base64 32 | vercel env add CRON_SECRET production
```

Vercel wysyła `Authorization: Bearer <CRON_SECRET>` przy każdym wywołaniu crona, gdy zmienna jest ustawiona dla
projektu. Zmiana zmiennej wymaga ponownego wdrożenia. **Cron nie działa na deploymentach Preview** (tylko produkcja).
Ręczne wywołanie produkcji: `curl -H "Authorization: Bearer $CRON_SECRET" https://quiz-vercel-rho.vercel.app/api/media/cleanup`.
Co robi jednorazowy przebieg, opisuje [Media-Storage-Plan](Media-Storage-Plan.md) (S1).

`MEDIA_CLEANUP_OWNER_FILTER` zawęża przebieg do właścicieli, których `owner_id` zawiera podany tekst (`npm run test:mcp` ustawia `mcp-e2e`). Zmienna jest tylko dla testu e2e: only for the e2e test; never set it in Production. Gdy jest ustawiona, serwer loguje ostrzeżenie `media.cleanup.owner_filter`.

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
