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
`MEDIA_URL_FETCH` (`true` tylko na Preview — przypinanie połączeń zweryfikowane na Vercelu 2026-10-20; na Production nieustawione = wyłączone) oraz
`VITE_MEDIA_PUBLIC_BASE_URL` (to samo co `MEDIA_PUBLIC_BASE_URL`, wartość budowania: po zmianie wdróż ponownie);
`CRON_SECRET` (sprzątanie, poniżej). `MEDIA_CLEANUP_OWNER_FILTER` ustawia tylko `npm run test:mcp`; w produkcji
nie wolno jej ustawiać. Bucket `media` (Neon Object Storage, `public_read`) jest wspólny dla wszystkich środowisk,
ale `S3_KEY_PREFIX` rozdziela ich obiekty (`dev/`, `preview/`, Production bez prefiksu), więc Preview nie widzi
plików Production i odwrotnie. Klucze S3 z `neon env pull --project-id broad-leaf-41334668 --branch main -s object-storage`
dodaje się na Vercelu ręcznie (`vercel env add`); automatycznej integracji Neon–Vercel nie potwierdzono.

## Środowiska i bazy danych

Projekt Neon `quiz-neon` (`broad-leaf-41334668`) ma cztery gałęzie. `main` to **produkcja**; `preview`, `dev`
i `e2e` są kopiami `main` utworzonymi z `--parent main`, z których usunięto dane osobowe i stan użytkowników
(skrypt `scripts/scrub-neon-branch.mjs`). Każda gałąź ma własny bucket `media` z własnym endpointem
(`br-<id gałęzi>.storage…`) i własnymi kluczami.

| Środowisko | Gałąź Neon (id, host) | Bucket i zmienne S3 | Uwagi |
| --- | --- | --- | --- |
| Lokalny dev (`npm run dev:full`, `.env.local`) | `dev` (`br-noisy-thunder-b77gflw2`, `ep-lingering-tooth-…`) | bucket `media` gałęzi `dev`, prefiks `dev/` | `DATABASE_URL` |
| Testy: `npm run test:mcp`, `npm run test:e2e` | `e2e` (`br-tiny-leaf-b7at7qm3`, `ep-rough-forest-…`), zmienna `NEON_E2E_DATABASE_URL` | `test:mcp` używa pamięci (`MEDIA_DRIVER=memory`); `test:e2e` bucketu z `S3_*` z `.env.local` (dziś gałąź `dev`) | skrypty czyszczą wiersze `mcp-e2e` i `[E2E]`; bez `NEON_E2E_DATABASE_URL` idą do `dev` z ostrzeżeniem |
| Vercel **Preview** (każdy podgląd) | `preview` (`br-muddy-mud-b78ol4b6`, `ep-gentle-wind-…`), wspólna dla wszystkich podglądów | bucket `media` gałęzi `preview` | jedna stabilna gałąź, nie kopia per deployment |
| **Produkcja** (Vercel Production) | `main` (`br-broad-butterfly-b70003zq`, `ep-old-rice-…`) | bucket `media` gałęzi `main`, bez prefiksu | jedyne dane użytkowników |

### Zmienne w Vercel

- `DATABASE_URL` i `DATABASE_URL_UNPOOLED` są osobno dla **Production** (`main`), **Preview** (`preview`)
  i **Development** (`dev`).
- `POSTGRES_*` i `PG*` istnieją tylko dla **Production**. Preview i Development ich nie dostają, więc
  kod ani skrypty uruchomione tam nie trafią do produkcyjnej bazy przez domyślne nazwy.
- `S3_*` oraz `MEDIA_PUBLIC_BASE_URL` / `VITE_MEDIA_PUBLIC_BASE_URL` są osobno dla każdego środowiska
  (każda gałąź ma własny bucket i klucze). `S3_SECRET_ACCESS_KEY` i pozostałe klucze są wrażliwe
  (`--sensitive`), więc nie da się ich odczytać przez `vercel env pull`.
- `CRON_SECRET` jest tylko w Production (cron działa tylko tam). `MEDIA_URL_FETCH=true` jest ustawione tylko na Preview
  (test `media_upload_from_url` na środowisku wykonawczym Vercela przeszedł 2026-10-20: prawdziwy adres pobrany, wrogie adresy
  odrzucone); na Production i w Development jest nieustawione, czyli pobieranie wyłączone — włączenie na Production to osobna decyzja właściciela
  (zob. `docs/Media-Storage-Plan.md`).
  `MEDIA_CLEANUP_OWNER_FILTER` i `MEDIA_DRIVER=memory` nigdy nie są ustawione w Vercel.

### Token nie działa w innym środowisku

Osobiste tokeny (`qz_…`) są zapisane w tabeli `api_tokens` **w bazie danego środowiska**, więc token
z produkcji nie działa na preview (odpowiedź `401`) i odwrotnie. To dowód izolacji: `401` od tokenu
produkcyjnego na preview oznacza, że podgląd nie widzi danych produkcyjnych. Lokalnie `QZ_PREVIEW_TOKEN`
działa na produkcji, a `QZ_PREVIEW_BRANCH_TOKEN` tylko na gałęzi preview (oba w `.env.local`, nigdy w repo).

### Migracje: dev → e2e → preview → prod

Migracje idą kolejno przez środowiska. Każdą najpierw sprawdź w trybie `--dry` (nic nie zapisuje):

```bash
npm run db:migrate:dev -- --dry        # potem bez --dry
npm run db:migrate:e2e
npm run db:migrate:preview
npm run db:migrate:prod -- --dry
npm run db:migrate:prod -- --confirm-production
```

`npm run db:migrate` (bez `--env`) migruje `DATABASE_URL` tak jak dotąd. Produkcja wymaga `--confirm-production`
przy każdym zastosowaniu; `--dry` działa też dla produkcji, bo tylko czyta `schema_migrations`.

### Odświeżenie gałęzi nieprodukcyjnej z produkcji

1. Utwórz nową gałąź z `main` bez sekretów (polecenia i identyfikatory: `.claude/skills/quiz-infra-cli/SKILL.md`):
   `neon branches create --name <nazwa> --parent main --no-secrets --project-id broad-leaf-41334668 --org-id org-shy-paper-64501177`.
2. Wyczyść dane osobowe z kopii: `node --env-file-if-exists=.env --env-file-if-exists=.env.local scripts/scrub-neon-branch.mjs <dev|e2e|preview>`
   (najpierw suchy przebieg, potem `-- --apply`). Skrypt czyta adres z odpowiedniej zmiennej `*_UNPOOLED`, więc
   najpierw ustaw ją na nową gałąź w `.env.local`. Odmawia, gdy host to host produkcji.
3. Bucket gałęzi kopiuje się razem z danymi, a skrypt czyści tylko bazę. Opróżnij bucket kopii
   (`neon buckets object`, zob. skill) przed podpięciem go do środowiska, bo pliki z produkcji nie mogą zostać dostępne z kluczy nieprodukcyjnych.
4. Zaktualizuj adresy połączeń (`neon connection-string <gałąź> --project-id broad-leaf-41334668 [--pooled]`)
   i zmienne `S3_*` (`neon env pull --branch <nazwa> -s object-storage --file <plik tymczasowy>`), a w Vercel
   rekordy danego środowiska. Potem redeploy: zmiany env działają tylko w nowych deploymentach.

Uwaga: kopie nadal zawierają treści (quizy, kursy, lekcje, `quizzes.owner_id`), a tabele z danymi osobowymi
(`user_profiles`, `quiz_attempts`, `classes`, `api_tokens`, `feedback`, `admin_audit_log` itd.) są puste.

### Wycofanie zmian środowisk

Zmienne produkcyjne (`Production`) nie były zmieniane. `Preview` i `Development` wcześniej miały wartości
produkcyjne: w razie potrzeby przywróć je z gałęzi `main` (ale wtedy podglądy znów widzą dane osobowe, więc
tylko awaryjnie).

## Baza

Neon: projekt `broad-leaf-41334668`, baza `neondb`. **Vercel nie aplikuje migracji** — po deployu ze
zmianą schematu uruchom je ręcznie:

```bash
# produkcja: sprawdź w trybie --dry, potem zastosuj (wymaga NEON_PROD_DATABASE_URL_UNPOOLED w .env.local)
npm run db:migrate:prod -- --dry
npm run db:migrate:prod -- --confirm-production
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
