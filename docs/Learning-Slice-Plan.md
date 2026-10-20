---
tags:
  - learning
  - quiz
  - media
  - frontend
  - backend
  - plan
  - status/todo
created: 2026-10-19
updated: 2026-10-19
---

# Moduł nauki jako pionowy slice — analiza i plan

> Czy lekcje/kursy są oddzielone od quizów pionowym slice'em? **Nie.** Ten dokument opisuje stan, miejsca sprzężenia i plan rozdzielenia. Stan sprawdzony w kodzie 2026-10-19 (branch `vercel-neon`).
>
> Dodatkowo: obrazki w quizach i lekcjach wchodzą jako **osobny slice `media` (S3)**, z którego korzystają oba mechanizmy — patrz [Moduł media](#moduł-media-s3).

## Zakres

„Nauka” to dziś trzy części, które nie mają wspólnego miejsca w strukturze:

1. **Katalog czasowników** — `server/irregularVerbs.ts`, `server/verbQuizBuilder.ts`, strona `Verbs`, `features/learn/VerbTable`.
2. **Kursy i lekcje** — `server/coursesRepo.ts`, `server/routes/learning.ts`, strony `Learn`, `CourseView`, `LessonView`, `features/learn/VerbSlide` (+ swipe).
3. **Powtórki, słabe czasowniki, seria** — `server/reviewsRepo.ts`, `server/progressRepo.ts`, `features/progress/*`, `shared/quiz/{spaced,weak,streaks}.ts`.

Quizy (`quizRepo`, `routes/quizzes.ts`, `features/quizzes/*`, `shared/quiz/{engine,schema,sampling,itemStats}.ts`) są **jądrem**; nauka używa ich jako silnika egzaminu i generowanych quizów.

Czwarta część, **jeszcze nieistniejąca**: **media** — obrazki przechowywane w magazynie zgodnym z S3, używane i przez pytania quizów, i przez slajdy lekcji. Powstaje od razu jako osobny slice (nie jako dodatek do `quizRepo` ani `coursesRepo`).

## Stan obecny

### Co jest już dobrze

- Frontend: `features/learn` i strony kursów **nie importują** nic z `features/quizzes` (kierunek nauka → quizy jest czysty).
- Backend: `coursesRepo` zależy tylko od `pool` i `listVerbs`.
- Logika (Leitner, słabe czasowniki, seria) jest czysta i testowana bez bazy.

### Gdzie przecieka

**Quizy znają kursy** (zła strona zależności):

| Miejsce | Co robi |
| --- | --- |
| `server/routes/quizzes.ts:147-173` (`grade`) | woła `coursesRepo.coursePassInfo`, `reviews.applyResults`, `progress.recordActivity`; dokłada `course` do odpowiedzi |
| `server/quizRepo.ts` | `courseId` w `createQuiz`, `saveAttempt`, `QuizDetail` |
| baza | `quizzes.course_id`, `quiz_attempts.course_id` (FK do `courses`) |
| `features/quizzes/ResultView.tsx` | zna `result.course` (baner, link, „kolejny egzamin”) |
| `features/quizzes/QuizPlayer.tsx:176` | wpisany link `/learn/${courseId}` |

**Inni sięgają do tabel nauki surowym SQL-em:** `classes/assignments.ts`, `classes/results.ts`, `attemptsRepo.ts`, część narzędzi MCP (`lessons`, `lesson_progress`, `courses`).

**Wspólne rzeczy bez właściciela:**

- `quizRepo.ts` jest przypadkowym modułem platformy: `pool` importuje się stamtąd w **11 plikach** (`adminRepo`, `apiTokens`, `appSettingsRepo`, `attemptsRepo`, `classes/{assignments,classes,results}`, `coursesRepo`, `irregularVerbs`, `progressRepo`, `reviewsRepo`).
- `src/app/api.ts` — jeden plik, 366 linii, jeden tag `Course` na wszystko.
- `src/shared/quiz/types.ts` — 460 linii; quizy, nauka, klasy i seria w jednym pliku. Cały `shared/quiz/` jest jedną przestrzenią nazw.

## Zasada docelowa

```
platform (db, http, auth)
   ▲
media (S3)  ◄──────────┐   liść: nie zna żadnego innego modułu
   ▲                   │
quizzes  ◄── learning ◄── progress*
   ▲            ▲
   └──── classes ┘        (klasy znają oba, nikt nie zna klas)
```

- `media` **nic nie wie** o quizach, lekcjach ani czasownikach; `quizzes` i `learning` zależą od niego, nigdy odwrotnie.
- `quizzes` **nic nie wie** o kursach, lekcjach, powtórkach i serii.
- `learning` korzysta z publicznego API `quizzes` (tworzenie quizu egzaminu, ocena).
- Integracja przez **zdarzenie po ocenie** i **sloty w UI**, nie przez wywołania w handlerze.
- `classes` czyta wyniki przez publiczne API modułów, nie przez ich tabele.

\* `progress` (seria, cel dzienny, powtórki) może zostać osobnym slice'em obok `learning`; ocena quizu zasila go tym samym zdarzeniem.

## Docelowa struktura

```
server/
  platform/            db.ts (pool), http.ts, auth*.ts, sentry.ts
  modules/
    media/             storage driver (S3), repo (tabela media), routes (/api/media), sweep
    quizzes/           repo, routes, mcp (quiz_*), attemptsRepo
    learning/          catalog (irregularVerbs, verbQuizBuilder), courses, reviews, routes
    progress/          progressRepo, routes
    classes/           classes, assignments, results, routes, mcp (class_*, student_*, ...)
src/
  features/
    media/             ImageUpload, MediaImage, useUploadImage (dla obu modułów)
    quizzes/           pages + components + api (injectEndpoints)
    learning/          pages (Learn, CourseView, LessonView, Verbs) + VerbSlide/VerbTable/swipe + api
    progress/          StreakChip, DailyGoalCard, ReviewCard, WeakVerbs, ...
  shared/
    media/             mediaRefInput (zod), MediaRef (typ odpowiedzi), reguły typów i rozmiarów
    quizzes/           engine, schema, sampling, itemStats, types
    learning/          spaced, weak, streaks, types
    classes/           studentAnalysis, classAnalysis, csv, scoreBands, types
```

Nazwy folderów do uzgodnienia; ważna jest zasada zależności, nie układ katalogów.

## Plan (kroki)

Każdy krok to osobny commit; przed commitem `npm run lint`, `npm test`, `npm run test:ui`, `npm run build`, a przy zmianach serwera `npm run build:api` i `MCP_E2E_ALLOW_REMOTE_DB=1 npm run test:mcp`.

| # | Krok | Zakres | Ryzyko |
| --- | --- | --- | --- |
| 1 | **`pool` do `server/db.ts`** (zrobione) | mechaniczna zmiana 11 importów; bez re-eksportu z `quizRepo` | niskie |
| 2 | **Zdarzenie po ocenie** | `grade` publikuje `onGraded({ quiz, userId, result, attemptId })`; `learning` rejestruje obsługę: `passed` kursu, `reviews.applyResults`, `progress.recordActivity`; `course` w odpowiedzi dokłada `learning` | średnie (kolejność skutków ubocznych, błąd obsługi nie może zgubić zapisanego podejścia) |
| 3 | **UI quizów bez nauki** | `ResultView` dostaje `outcome?: ReactNode` i `backLink`; `QuizPlay` (poziom routingu) składa je z komponentów `learning`; `QuizPlayer` traci wpisany `/learn/...` | niskie |
| 4 | **RTK Query na slice'y** | `api.injectEndpoints` w każdym module; baza i tagi zostają w `app/api.ts` | niskie |
| 5 | **Klasy przez publiczne API nauki** | `learning.progressFacts(userIds)` zamiast SQL na `lessons`/`lesson_progress`/`courses` w `classes`, `attemptsRepo`, MCP | średnie |
| 6 | **Przeniesienie plików do slice'ów** | `server/modules/*`, `src/features/learning`, podział `shared/quiz/` i `types.ts` | niskie logicznie, duży diff |
| 7 | **Egzekwowanie granic** | reguła zakazująca importów „w górę” (patrz niżej) | niskie |
| 8 | *(opcjonalnie)* **Schemat** | tabela `course_exams(quiz_id, course_id)` + ogólne `quizzes.pass_percent` zamiast `course_id` w `quizzes`/`quiz_attempts`; migracja z backfillem | wyższe |

### Kolejność i rekomendacja

- **Najpierw 1 → 2 → 3.** Rozcinają jedyne prawdziwe sprzężenie (quizy → nauka) i dają większość zysku. Kroki 4–5 domykają granice.
- **Krok 6 dopiero po nich.** Przenoszenie plików przed rozcięciem zależności tylko przenosi problem i robi duży, trudny do przeglądu diff.
- **Kroku 8 nie robić**, dopóki nie pojawi się drugi rodzaj egzaminu lub quiz powiązany z czymś innym niż kurs; do tego czasu `course_id` w jądrze quizów jest kompromisem akceptowalnym po rozcięciu kroków 2–3 (kod jądra przestaje go interpretować).

### Szczegóły kroku 2 (zdarzenie po ocenie)

- Prosty rejestr w `quizzes` (`afterGrade(handler)`), bez zewnętrznej biblioteki zdarzeń.
- Obsługa **sekwencyjna i w tym samym żądaniu** (serverless: zadania „fire and forget” po odpowiedzi mogą zostać ucięte).
- `passed` i `courseId` muszą być znane **przed** `saveAttempt`, więc zdarzenie ma dwie fazy: `beforeSave` (zwraca `{ passed, courseId }` oraz dane do odpowiedzi) i `afterSave` (skutki uboczne). Alternatywa: najpierw zapis podejścia, potem `UPDATE quiz_attempts SET passed` — gorsza, bo daje stan pośredni.
- Test: `tests/` z atrapą rejestru — ocena bez zarejestrowanych obsług zwraca wynik bez `course`; z obsługą `learning` zachowanie jak dziś.

## Moduł media (S3)

Obrazki w pytaniach i opcjach quizów oraz na slajdach lekcji (ilustracja czasownika). Jeden moduł, dwóch konsumentów. Wybrany magazyn: **S3-kompatybilny**; pierwszy kandydat to Neon Object Storage (baza jest w `us-east-1`, a ta jest na liście regionów), ale kod zna tylko interfejs S3, więc AWS S3 lub Cloudflare R2 to zmiana zmiennych środowiskowych.

### Dlaczego osobny slice

- Quizy i lekcje potrzebują tego samego: wysłać, zweryfikować, wyświetlić, posprzątać. Dwie kopie rozjechałyby się (limity, typy plików, sprzątanie).
- Tak samo jak z `pool`: gdyby obrazki zaczęły życie w `quizRepo`, `learning` importowałoby z quizów i cofnęlibyśmy to, co robi reszta tego planu.
- Zależność jest jednokierunkowa: `quizzes → media`, `learning → media`. `media` nie wie, kto go używa.

### Kontrakt

**Tabela `media`** (jedyna własność modułu): `id uuid`, `key text unique`, `content_type`, `size_bytes`, `width`, `height`, `owner_id`, `status` (`pending` | `ready`), `created_at`. Tekst alternatywny **nie** należy do pliku, tylko do miejsca użycia (ten sam obrazek może mieć inny `alt` w innym pytaniu).

**Odwołania** trzymają konsumenci, jako klucze obce do `media`, z `ON DELETE SET NULL`:

| Kolumna | Użycie |
| --- | --- |
| `questions.image_id` + `image_alt` | obrazek pytania |
| `options.image_id` + `image_alt` | opcja jako obrazek (kafelek wyboru) |
| `irregular_verbs.image_id` + `image_alt` | ilustracja czasownika na slajdzie lekcji i w powtórkach |

**Wspólny kontrakt** w `src/shared/media/`: wejście `mediaRefInput = { mediaId: uuid, alt: string ≤ 200 }`, wyjście `MediaRef = { url, alt, width, height }`. Schemat quizu importuje `mediaRefInput` (zależność `quizzes → media` jest dozwolona); to samo trafia do `data/quiz.schema.json` i do `quiz_schema` w MCP, a `quizSchema.test.ts` pilnuje zgodności zod z JSON Schema.

**Sterownik magazynu** (`StorageDriver`): `presignPut(key, contentType)`, `head(key)`, `remove(key)`, `publicUrl(key)`. Jedna implementacja S3 (`@aws-sdk/client-s3` + presigner) i **atrapa w pamięci do testów**. Zmienne: `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE`, `MEDIA_PUBLIC_BASE_URL`, opcjonalnie `S3_KEY_PREFIX` (np. `dev/`, żeby lokalne wysyłanie nie mieszało się z produkcją).

### Przepływ wysyłania (dwie fazy)

Plik nie przechodzi przez Express: funkcja na Vercelu ma limit treści żądania około 4,5 MB, więc przeglądarka wysyła plik prosto do magazynu.

1. `POST /api/media/uploads { contentType, size }` — wymaga `write:quizzes`; waliduje typ (`png`, `jpeg`, `webp`) i rozmiar (≤ 2 MB), tworzy wiersz `pending` i zwraca `{ mediaId, uploadUrl }` (presigned PUT, krótka ważność).
2. Przeglądarka robi `PUT` na `uploadUrl`. Przed wysłaniem zmniejsza obraz (canvas → webp, ≤ 1200 px).
3. `POST /api/media/:id/complete` — serwer robi `head` obiektu, sprawdza rozmiar i typ, ustawia `ready` i zwraca `MediaRef`. Obiekt, który nie przejdzie kontroli, jest usuwany.
4. Zapis quizu lub czasownika niesie `{ mediaId, alt }`; serwer akceptuje tylko `ready`.

Dwie fazy są konieczne, bo presigned PUT sam nie ogranicza rozmiaru; kontrola po fakcie (`head`) to zabezpieczenie.

`PUT /api/quizzes/:id` kasuje i wstawia pytania od nowa, ale odwołanie do obrazka wraca w żądaniu (`mediaId`), więc edycja quizu nie gubi obrazków.

### Sprzątanie

- Osierocone: wiersze `pending` starsze niż godzina oraz `ready` bez żadnego odwołania starsze niż doba → usunięcie obiektu i wiersza.
- `media` nie zna konsumentów, więc sprawdza odwołania przez **rejestr** `{ table, column }`, który każdy moduł wypełnia przy starcie (`registerMediaReferrer('questions', 'image_id')`). Dodanie kolejnego konsumenta nie wymaga zmiany w `media`.
- Wyzwalanie: Vercel Cron wołający endpoint z `CRON_SECRET` albo leniwie przy kolejnym wysłaniu.
- Uwaga dla Neona: `DeleteObject` robi tam soft-delete na bieżącej gałęzi — do sprawdzenia, czy zwalnia miejsce.

### Frontend

`features/media/`: `ImageUpload` (wybór pliku, zmniejszenie, dwie fazy, podgląd, pole `alt`), `MediaImage` (`<img>` z `loading="lazy"`, stałe proporcje, `alt` z `MediaRef`).

| Konsument | Użycie |
| --- | --- |
| `quizzes` | `QuizEditor` (pytanie i opcja) używa `ImageUpload`; renderery i `ChoiceTile` używają `MediaImage` |
| `learning` | `VerbSlide`, `VerbTable`, karta powtórki i `WeakVerbs` używają `MediaImage` |

### Obrazki czasowników

Nie ma panelu edycji katalogu czasowników. Na start skrypt `scripts/upload-verb-images.ts` czyta katalog `<base>.webp`, wysyła pliki tą samą ścieżką (sterownik + `media`) i ustawia `irregular_verbs.image_id`. Dopiero potem ewentualny ekran w panelu admina.

### Autorzy przez MCP

MCP nie przeniesie binarnych danych, a bez obrazków narzędzia `quiz_*` zostają bez zmian. Do rozstrzygnięcia później: (a) narzędzie `media_create_upload` zwracające presigned URL dla klienta, który umie zrobić HTTP PUT; (b) akceptowanie `image.url` wyłącznie z hosta `MEDIA_PUBLIC_BASE_URL`. Na razie poza zakresem.

### Niewiadome (rozstrzyga spike M0)

Z dokumentacji Neon Object Storage (sprawdzone 2026-10-19) wynika: tylko SigV4, tylko adresowanie path-style, presigned GET/PUT i POST z formularza wspierane, bucket `public_read` zezwala na anonimowy odczyt, brak `PutBucketPolicy`/ACL, Free plan 5 GB na projekt. **Nie wynika:**

1. jak i skąd pobiera się klucze S3 dla aplikacji na Vercelu;
2. jak ustawić CORS dla naszej domeny (bez tego `PUT` z przeglądarki nie zadziała);
3. format publicznego adresu obiektu w buckecie `public_read`;
4. czy POST z formularza pozwala wymusić górny limit rozmiaru;
5. status usługi (w źródłach ślady bety) i region projektu (potwierdzić w konsoli).

### Kroki

Niezależne od kroków 2–8 podziału nauki, poza zależnością od kroku 1 (`db.ts`).

| # | Krok | Zakres | Ryzyko |
| --- | --- | --- | --- |
| M0 | **Spike** | bucket przez `neon.ts` + `neon deploy`; skrypt: presigned PUT, odczyt publiczny, test CORS z przeglądarki; odpowiedzi na niewiadome 1–5 | średnie (decyduje o dalszych krokach) |
| M1 | **Backend `media`** | migracja `media`, sterownik S3 + atrapa, trasy `uploads`/`complete`, testy na atrapie | średnie |
| M2 | **Kontrakt w schemacie quizu** | `mediaRefInput`, kolumny `image_id`/`image_alt`, `playerView`, JSON Schema, MCP `quiz_schema`, testy zgodności | niskie |
| M3 | **Wyświetlanie** | `MediaImage` w rendererach, `ChoiceTile`, `ResultView` (przegląd odpowiedzi) | niskie |
| M4 | **Wysyłanie w edytorze** | `ImageUpload` w `QuizEditor` (pytanie, opcja) | niskie |
| M5 | **Lekcje** | `irregular_verbs.image_id`, `VerbSlide`/`VerbTable`, skrypt wysyłania obrazków czasowników | niskie |
| M6 | **Sprzątanie** | rejestr odwołań, endpoint sprzątający + Cron | średnie |

### Kolejność względem podziału nauki

- **M0 można zrobić od razu** — nie dotyka kodu aplikacji i usuwa największą niewiadomą.
- **M1 po kroku 1** (`pool` w `server/db.ts`), żeby `media` od początku importowało z `platform`, a nie z `quizRepo`. Budować w docelowym kształcie (`server/media/`, przeniesione do `modules/media` w kroku 6).
- **M2–M5 nie zależą od kroków 2–3** (zdarzenie po ocenie, UI wyniku), więc nie blokują się nawzajem. Uwaga na konflikty w `engine.ts`, `schema.ts`, `types.ts` przy kroku 6.

## Egzekwowanie granic

- Oxlint ma `no-restricted-imports`; konfiguracja per katalog przez `overrides`. **Nie sprawdzone** w tej wersji (`oxlint ^1.88`) i w `.oxlintrc.json` repo — do zweryfikowania na początku kroku 7.
- Alternatywa: `dependency-cruiser` z regułami „quizzes nie importuje learning/progress/classes” w CI.
- Test-kanarek w `tests/`: skanuje importy plików `modules/quizzes` i `features/quizzes` i pada, gdy znajdzie ścieżkę do `learning`; drugi taki test pilnuje, że `media` (serwer, frontend, `shared/media`) nie importuje nic z `quizzes`, `learning`, `progress` ani `classes`.

## Poza zakresem

- Zmiana API REST i kontraktu MCP (ścieżki, nazwy narzędzi, kształt odpowiedzi zostają). Wyjątek: opcjonalne pole obrazka w pytaniu i opcji (M2), kompatybilne wstecznie.
- Zmiana schematu bazy w krokach 1–7 podziału nauki (migracje modułu media są osobne: M1, M2, M5).
- Wideo i audio w mediach, galeria obrazków do ponownego użycia, edycja obrazów po stronie serwera.
- Wydzielenie osobnych pakietów npm / monorepo.

## Metryki sukcesu

- `grep -rn "learning\|course\|lesson" server/modules/quizzes src/features/quizzes` → brak trafień poza komentarzami (po kroku 8 także brak `course_id`).
- Żaden plik poza `modules/learning` nie zawiera SQL na `lessons`, `lesson_progress`, `courses`.
- `pool` importowany wyłącznie z `server/platform/db`.
- Klient S3 (`@aws-sdk/client-s3`) importowany tylko w `modules/media`; żaden plik poza `media` nie zna endpointu, bucketu ani kluczy.
- `media` nie zawiera słów `quiz`, `question`, `verb`, `lesson` poza komentarzami; kolumny odwołań są w tabelach konsumentów.

## Powiązane

- [[Architecture]] — obecna architektura
- [[Quiz-Engine]] — silnik quizów (jądro)
- [[Progress]] — powtórki i seria
- [[Classes]] — klasy i zadania (konsument obu modułów)
- [[vercel]] — zmienne środowiskowe i wdrożenie (tu trafią `S3_*`)
- [[Database]] — migracje (tabela `media`, kolumny `image_id`)
- [[Documentation-Plan]]
