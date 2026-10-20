---
tags:
  - testing
  - docs
  - status/done
created: 2026-10-20
updated: 2026-10-20
---

# Testy przeglądarkowe (Playwright)

Zestaw end-to-end w Chromium (`tests/e2e/`, konfiguracja `playwright.config.ts`) automatyzuje sprawdzenia obrazów,
które wcześniej wykonywano ręcznie: wysyłanie obrazka w edytorze quizu, granie quizem z obrazami (desktop jasny,
telefon ciemny) i lekcję z obrazem we wstępie oraz ilustracją czasownika.

## Co jest pokryte

- **Edytor** (`editor-upload.spec.ts`, tylko desktop): wstawienie obrazka do treści pytania przez „Wstaw obrazek”
  (dialog, opis alt, „Wyślij i wstaw”). Sprawdzana jest wartość pola (nowa linia przed obrazem), załadowanie podglądu,
  zapis quizu („Quiz zapisany”), gra quizem (obraz się ładuje, poprawna odpowiedź daje 100 %) oraz to, że ten sam plik
  wstawiony ponownie w tej samej stronie dostaje odpowiedź `reused`.
- **Gracz** (`quiz-player-images.spec.ts`, desktop i telefon): quiz z trzema pytaniami utworzony przez REST z obrazami
  wysłanymi prawdziwym przepływem API (start, PUT na presigned URL bez nagłówka Authorization, complete): obraz w treści,
  opcje będące obrazami i obraz w zdaniu z lukami (cloze). Każde pytanie jest znajdowane po tekście, bo gracz tasuje
  pytania. Na każdej stronie i na wyniku wszystkie obrazy muszą się załadować. Na telefonie przewijanie do dołu i
  sprawdzenie, że dolna krawędź ostatniej opcji jest nad górną krawędzią stałego paska `.action-bar`.
- **Lekcja** (`lesson-images.spec.ts`, desktop i telefon): kurs i lekcja z SQL (ta sama forma wierszy co aplikacja),
  wstęp z obrazem (licznik `1 / 4`), pierwszy czasownik z ilustracją (alt = forma podstawowa), kolejny czasownik bez
  obrazu oraz miniatura 56 px na `/verbs`.

## Jak uruchomić

```bash
E2E_ALLOW_REMOTE_DB=1 npm run test:e2e
```

Skrypt `scripts/e2e-browser.sh`:

1. odmawia startu bez `E2E_ALLOW_REMOTE_DB=1` (komunikat tłumaczy, co zostanie zapisane i usunięte),
2. bierze wspólny lock `flock` (`GATE_LOCK_FILE`, domyślnie `/tmp/claude-1000/mcp-e2e.lock`) i czeka do 20 min,
   wypisując raz `waiting for the e2e lock…`, tak jak `npm run test:mcp`,
3. sprawdza przez `ss`, czy porty 8888 i 5173 są wolne (czeka 60 s, potem kończy się błędem; nic nie zabija),
4. losuje `DEV_AUTH_TOKEN` (nie jest wypisywany) i ustawia `VITE_DEV_AUTH_TOKEN`, `DEV_AUTH_ROLES=admin,teacher`,
   `DEV_AUTH_USER_ID=dev|mcp-e2e-browser` oraz `VITE_MEDIA_PUBLIC_BASE_URL` (z `MEDIA_PUBLIC_BASE_URL` z `.env.local`),
5. uruchamia Playwrighta przez `node --env-file-if-exists=.env --env-file-if-exists=.env.local`; pliki env nie są
   source'owane w bashu, bo connection string zawiera `&`.

`playwright.config.ts` startuje `npm run dev:full` (serwer na http://localhost:8888, `reuseExistingServer: false`) i
zatrzymuje go po przebiegu. Projekty: `desktop-light` (1280×900, wszystkie specy) i `phone-dark` (390×844, dotyk,
ciemny motyw, tylko gracz i lekcja). Specy działają po kolei (`workers: 1`, `fullyParallel: false`), bo dzielą
właściciela danych. Raport HTML trafia do `playwright-report/`, ślady i zrzuty do `test-results/` (oba w `.gitignore`).

### Zmienne środowiskowe

| Zmienna | Gdzie | Znaczenie |
| --- | --- | --- |
| `E2E_ALLOW_REMOTE_DB=1` | wymagana, ustawiana ręcznie | zgoda na zapis w bazie współdzielonej i w prawdziwym bucketcie |
| `DATABASE_URL` | `.env.local` | baza Neon używana przez serwer i przez sprzątanie |
| `S3_*`, `MEDIA_PUBLIC_BASE_URL` | `.env.local` | prawdziwy bucket, prefiks `dev/` |
| `GATE_LOCK_FILE` | opcjonalna | inny plik locka (domyślnie `/tmp/claude-1000/mcp-e2e.lock`) |
| `DEV_AUTH_TOKEN` | losowana przez skrypt | logowanie testowe tylko pod `dev:full` (`LOCAL_DEV`) |

Przykład na maszynie, na której Chromium brakuje systemowych bibliotek i został rozpakowany lokalnie (ścieżki są
przykładowe; w repozytorium nic takiego nie jest zapisane):

```bash
LD_LIBRARY_PATH=$HOME/pw-libs/usr/lib/x86_64-linux-gnu \
PLAYWRIGHT_BROWSERS_PATH=$HOME/pw-browsers \
E2E_ALLOW_REMOTE_DB=1 npm run test:e2e
```

Na CI (lub na czystej maszynie) przeglądarkę instaluje się poleceniem `npx playwright install --with-deps chromium`.
Wersja `@playwright/test` jest przypięta (`1.64.1`), bo przeglądarki muszą pasować do wersji pakietu.

## Dlaczego baza i bucket są prawdziwe

Obrazy przechodzą przez prawdziwy przepływ: ponowne kodowanie do WebP w przeglądarce, presigned PUT do bucketa i
`complete`. Tryb `memory` nie sprawdziłby ani presigned URL, ani ładowania z publicznego adresu. Dlatego suite
nie może działać bez zgody: zapisuje w bazie współdzielonej i w bucketcie pod `dev/`. Zgodę wymagają dwie warstwy:
skrypt (przed lockiem) i `tests/e2e/support/guard.ts` (przy każdym wejściu: global setup, teardown, fixtury, helpery
bazy i API).

## Gwarancje sprzątania

- Wszystko, co suite tworzy, ma prefiks `[E2E]` w tytule (quizy, kursy, lekcje) albo należy do właściciela
  `dev|mcp-e2e-browser` (obrazy, profil, aktywność, próby, powtórki, audyt). Właściciel zawiera `mcp-e2e`, więc
  istniejące sprzątanie `test:mcp` też go obejmuje.
- Każdy spec w `afterAll` usuwa swoje quizy przez REST i wywołuje `sweepE2eData()` (`support/cleanup.ts`). Spec lekcji
  najpierw przywraca poprzednią ilustrację czasownika (`irregular_verbs.image_media_id`), w `try`/`finally`.
- Sweep: zeruje ilustracje czasowników wskazujące na obrazy właściciela, usuwa odwołania (`media_refs`), postęp,
  lekcje i kursy `[E2E]`, quizy, a potem obrazy właściciela przez narzędzie MCP `media_delete` z `confirm: true`
  (usuwa też obiekt w buckecie). Na końcu czyści próby, aktywność, powtórki, profil i audyt właściciela. Jest
  idempotentny.
- Global teardown uruchamia ten sam sweep po każdym przebiegu, także po błędzie, więc przerwany przebieg zostawia
  bazę czystą przy następnym uruchomieniu.

## Ograniczenia

- Nie działa w CI: job `e2e-browser` w `.github/workflows/ci.yml` jest wyłączony (`if: false`). Potrzebne są
  sekrety `NEON_E2E_DATABASE_URL` i zmienne bucketa; wtedy wystarczy usunąć `if: false`.
- Gracz tasuje pytania i kolejność opcji. Testy znajdują pytania po tekście, a w opcjach szukają obrazu po `alt`.
- Ponowne kodowanie do WebP nie daje gwarancji identycznych bajtów między osobnymi kontekstami przeglądarki, więc
  sprawdzenie `reused` robi się w jednej stronie (jeden przebieg edytora).
- Baza jest współdzielona: nie wolno uruchamiać suite równolegle z `npm run test:mcp` (wspólny lock to wymusza) ani
  z innymi narzędziami, które czyszczą właściciela `mcp-e2e`.
- Testy nie sprawdzają wyglądu (zrzuty są robione tylko przy błędzie), tylko ładowanie obrazów, wynik i pozycję paska.
