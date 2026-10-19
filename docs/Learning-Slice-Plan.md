---
tags:
  - learning
  - quiz
  - frontend
  - backend
  - plan
  - status/todo
created: 2026-10-19
updated: 2026-10-19
---

# Moduł nauki jako pionowy slice — analiza i plan

> Czy lekcje/kursy są oddzielone od quizów pionowym slice'em? **Nie.** Ten dokument opisuje stan, miejsca sprzężenia i plan rozdzielenia. Stan sprawdzony w kodzie 2026-10-19 (branch `vercel-neon`).

## Zakres

„Nauka” to dziś trzy części, które nie mają wspólnego miejsca w strukturze:

1. **Katalog czasowników** — `server/irregularVerbs.ts`, `server/verbQuizBuilder.ts`, strona `Verbs`, `features/learn/VerbTable`.
2. **Kursy i lekcje** — `server/coursesRepo.ts`, `server/routes/learning.ts`, strony `Learn`, `CourseView`, `LessonView`, `features/learn/VerbSlide` (+ swipe).
3. **Powtórki, słabe czasowniki, seria** — `server/reviewsRepo.ts`, `server/progressRepo.ts`, `features/progress/*`, `shared/quiz/{spaced,weak,streaks}.ts`.

Quizy (`quizRepo`, `routes/quizzes.ts`, `features/quizzes/*`, `shared/quiz/{engine,schema,sampling,itemStats}.ts`) są **jądrem**; nauka używa ich jako silnika egzaminu i generowanych quizów.

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
quizzes  ◄── learning ◄── progress*
   ▲            ▲
   └──── classes ┘        (klasy znają oba, nikt nie zna klas)
```

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
    quizzes/           repo, routes, mcp (quiz_*), attemptsRepo
    learning/          catalog (irregularVerbs, verbQuizBuilder), courses, reviews, routes
    progress/          progressRepo, routes
    classes/           classes, assignments, results, routes, mcp (class_*, student_*, ...)
src/
  features/
    quizzes/           pages + components + api (injectEndpoints)
    learning/          pages (Learn, CourseView, LessonView, Verbs) + VerbSlide/VerbTable/swipe + api
    progress/          StreakChip, DailyGoalCard, ReviewCard, WeakVerbs, ...
  shared/
    quizzes/           engine, schema, sampling, itemStats, types
    learning/          spaced, weak, streaks, types
    classes/           studentAnalysis, classAnalysis, csv, scoreBands, types
```

Nazwy folderów do uzgodnienia; ważna jest zasada zależności, nie układ katalogów.

## Plan (kroki)

Każdy krok to osobny commit; przed commitem `npm run lint`, `npm test`, `npm run test:ui`, `npm run build`, a przy zmianach serwera `npm run build:api` i `MCP_E2E_ALLOW_REMOTE_DB=1 npm run test:mcp`.

| # | Krok | Zakres | Ryzyko |
| --- | --- | --- | --- |
| 1 | **`pool` do `server/db.ts`** | mechaniczna zmiana 11 importów; `quizRepo` re-eksportuje na czas przejścia | niskie |
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

## Egzekwowanie granic

- Oxlint ma `no-restricted-imports`; konfiguracja per katalog przez `overrides`. **Nie sprawdzone** w tej wersji (`oxlint ^1.88`) i w `.oxlintrc.json` repo — do zweryfikowania na początku kroku 7.
- Alternatywa: `dependency-cruiser` z regułami „quizzes nie importuje learning/progress/classes” w CI.
- Test-kanarek w `tests/`: skanuje importy plików `modules/quizzes` i `features/quizzes` i pada, gdy znajdzie ścieżkę do `learning`.

## Poza zakresem

- Zmiana API REST i kontraktu MCP (ścieżki, nazwy narzędzi, kształt odpowiedzi zostają).
- Zmiana schematu bazy w krokach 1–7.
- Wydzielenie osobnych pakietów npm / monorepo.

## Metryki sukcesu

- `grep -rn "learning\|course\|lesson" server/modules/quizzes src/features/quizzes` → brak trafień poza komentarzami (po kroku 8 także brak `course_id`).
- Żaden plik poza `modules/learning` nie zawiera SQL na `lessons`, `lesson_progress`, `courses`.
- `pool` importowany wyłącznie z `server/platform/db`.

## Powiązane

- [[Architecture]] — obecna architektura
- [[Quiz-Engine]] — silnik quizów (jądro)
- [[Progress]] — powtórki i seria
- [[Classes]] — klasy i zadania (konsument obu modułów)
- [[Documentation-Plan]]
