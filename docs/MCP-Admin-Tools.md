---
tags:
  - mcp
  - backend
  - plan
  - status/todo
created: 2026-10-19
updated: 2026-10-19
---

# Narzędzia MCP dla administratora — projekt

Dokument projektowy dla brakujących narzędzi administracyjnych serwera MCP
(`POST /api/mcp`, kod w `server/mcp/`). Uzupełnia [[mcp]] i [[api-admin]].

## 1. Problem, który to uruchomił

Administrator dostał wynik **38%** z quizu i zapytał, czy pytania są za trudne.
Nie mógł tego sprawdzić, bo:

- `student_results` i `student_analyze` działają **tylko dla członka klasy**
  (`studentResults` zwraca `null` dla osoby spoza klasy), a quiz nie był do żadnej
  klasy przydzielony;
- nie istnieje narzędzie „pokaż podejścia do tego quizu” ani „pokaż odpowiedzi
  z jednego podejścia”;
- nie istnieje statystyka pytań, więc ocena trudności byłaby zgadywaniem.

Odpowiedź „3 z 8 punktów” też była nieuprawniona — **quiz nie zwraca liczby
punktów wprost**, a 38% przy ośmiu punktach to tylko jedna z możliwych
kombinacji. Narzędzie `attempt_get` musi zwracać `score`/`maxScore` wprost,
żeby takie wnioski miały podstawę.

Wniosek: brakuje **ścieżki odczytu wyników poza klasą** i **analizy na poziomie
pytania**. Reszta (quizy, klasy, uczniowie) jest już pokryta.

## 2. Co już istnieje

25 narzędzi w trzech modułach:

| Moduł | Narzędzia |
| --- | --- |
| `server/mcp/quizTools.ts` | `quiz_list`, `quiz_get`, `quiz_create`, `quiz_update`, `quiz_delete`, `quiz_schema`, `verbs_list` |
| `server/mcp/classTools.ts` → `tools/classes.ts` | `class_list`, `class_get`, `class_create`, `class_update`, `class_archive`, `class_regenerate_code`, `class_report`, `class_analyze` |
| `server/mcp/tools/students.ts` | `student_list`, `student_search`, `student_add`, `student_remove`, `student_results`, `student_analyze` |
| `server/mcp/tools/assignments.ts` | `assignment_create`, `assignment_update_due`, `assignment_delete`, `course_list` |

### Co administrator może już teraz

- **odczytać dowolny quiz** — `quiz_get(id)` nie sprawdza właściciela;
- **edytować i usunąć dowolny quiz** — `canEdit` w `quizRepo` to flaga
  uprawnienia (`write:quizzes`), nie własności; `quizzes.owner_id` jest tylko
  zapisywany;
- **czytać każdą klasę** — `readableClass` dopuszcza admina (`manage:users`) do
  wszystkich klas, ale **bez prawa zmiany** (`notOwner`);
- czytać uczniów i raporty klas (`scope=all`).

### Czego nie ma

| Luka | Skutek |
| --- | --- |
| podejścia **poza klasą** | brak odpowiedzi na „kto i jak rozwiązał ten quiz” |
| pojedyncze podejście z odpowiedziami | brak danych do oceny pytań |
| statystyka pytań | brak podstaw do oceny trudności |
| użytkownicy (lista, role, blokada) | tylko panel WWW (`/api/admin/*`) |
| audyt, zgłoszenia, ustawienia | tylko panel WWW |
| stan systemu | brak |

## 3. Zasady wspólne dla nowych narzędzi

1. **Nowy moduł** `server/mcp/tools/admin.ts` z `registerAdminTools(server, ctx)`,
   wywoływany w `buildServer` (`server/mcp/index.ts`) po `registerClassTools`.
2. **Jedna straż** `adminOnly` obok istniejących `reading`/`changing`:

   ```ts
   // context.ts
   export const needAdmin = () =>
     failure('Ta operacja wymaga roli admina (uprawnienie manage:users, logowanie OAuth).')
   ```

   Straż sprawdza `ctx.viewer.admin` (`manage:users`) — ta sama flaga, której
   używają REST-owe endpointy `/api/admin/*`.
3. **Widok czyta / zmienia.** Narzędzia tylko do czytania dostają
   `annotations: { readOnlyHint: true }`; nieodwracalne wymagają `confirm: true`
   (jak `student_remove`, `quiz_delete`).
4. **Audyt.** Każda zmiana idzie do `admin_audit_log` jako `mcp.call` z
   `details.tool` i szczegółami (`from`/`to`). Kolumna `action` to zwykły `text`
   bez ograniczenia `CHECK`, więc **migracja nie jest potrzebna**; wystarczy
   rozszerzyć unię `AuditEntry['action']`, jeśli kiedyś dodamy dedykowane akcje.
5. **Rozmiar odpowiedzi.** Odpowiedź MCP trafia do kontekstu modelu, więc każde
   narzędzie listujące ma `limit` (domyślnie 25–50, maks. 200) i zwraca
   `total`/`hasMore`. Żadna lista nie jest nieograniczona.
6. **Liczby, nie etykiety.** Narzędzia zwracają `score`, `maxScore`, `percent`,
   `attempts` — model ma wyliczać wnioski sam, a nie dostawać gotowe oceny
   („trudne”, „łatwe”) bez danych. Wyjątkiem są progi w `quiz_stats`, które są
   jawną regułą z progiem istotności (patrz §5.1, `quiz_stats`).
7. **PII.** Narzędzia administracyjne pokazują **pełny e-mail** (tak jak panel
   WWW); `student_search` maskuje go, bo jest wyszukiwarką katalogową dla
   nauczyciela. Ta różnica jest celowa i opisana w `description` narzędzia.
8. **Brak zmian zachowania.** Żadne istniejące narzędzie nie zmienia kontraktu;
   rozszerzenia `quiz_list` są opcjonalne i domyślnie wyłączone.

## 4. Decyzje wymagające rozstrzygnięcia

### D1 — Token osobisty czy tylko OAuth

`POST /api/tokens` (`server/routes/tokens.ts`) tworzy tokeny wyłącznie z
`write:quizzes` i `manage:classes`; **`manage:users` nigdy nie trafia do
tokenu**. Skutek: narzędzia z tego dokumentu działają **tylko po zalogowaniu
OAuth** (Claude, ChatGPT, Grok), a klient z `qz_…` dostanie odmowę.

- **A (rekomendacja):** zostawić. Admin używa klienta z OAuth; skrypty
  administracyjne wołają REST z ciasteczkiem sesji. Zero nowego ryzyka.
- **B:** flaga `admin: true` przy tworzeniu tokenu (tylko dla admina, maks.
  ważność 30 dni, wymóg `confirm` przy tworzeniu). Wygodniejsze skrypty,
  ale token z `manage:users` może zmieniać role i blokować konta.

Dokument zakłada **A**; jeśli wybierzemy B, zmienia się tylko `tokens.ts` i
`context.ts` (lista uprawnień), nie kontrakt narzędzi.

### D2 — Tożsamość pytania w statystyce (najpoważniejsze)

`replaceQuiz` robi `DELETE FROM questions WHERE quiz_id = $1` i wstawia pytania
od nowa, więc **`PUT /api/quizzes/:id` generuje nowe `id` pytań**. Podejścia
zapisują `results[].questionId`; po edycji quizu te odwołania stają się
osierocone (`questionDetails` już to obsługuje — `prompt: null`).

Dziś w bazie **0 z 21 podejść** ma osierocone pytania (nikt nie edytował quizu
po rozegraniu), ale problem jest **utajony**: pierwsza edycja zepsuje statystykę
starszych podejść.

- **A (rekomendacja):** migracja dodająca `quiz_attempts.questions_snapshot jsonb`
  (tablica `{id, type, prompt, points}` zapisywana w `saveAttempt`). `quiz_stats`
  czyta snapshot i **nie zależy** od aktualnej treści quizu. Backfill dla
  istniejących wierszy możliwy tylko częściowo (z bieżących pytań tam, gdzie
  `id` jeszcze istnieje).
- **B:** bez migracji — `quiz_stats` grupuje po `(questionId)`, a pytania
  osierocone zwraca jako `unattributedAttempts` z ostrzeżeniem. Tańsze, ale
  statystyka „po edycji” pokaże niepełne dane.

### D3 — Czy admin może zmieniać cudze klasy

Dziś `writableClass` zwraca `null` dla nie-właściciela, więc admin ma tylko
podgląd — świadoma decyzja: uczniowie są informowani, że **nauczyciel** widzi
ich wyniki i klasy. Rozszerzenie na admina jest technicznie trywialne, ale
zmienia obietnicę, nie tylko uprawnienia.

- **A (rekomendacja):** zostawić podgląd; dodać tylko `class_transfer`
  (przepisanie właściciela, gdy nauczyciel odchodzi) — jawna, audytowana
  operacja administracyjna zamiast cichego prawa zapisu.
- **B:** pełne `class_update`/`class_archive` dla admina.

### D4 — Zakres e-maili

Patrz §3.7. Do potwierdzenia: czy `attempt_list` ma pokazywać e-mail autora
podejścia, czy wystarczy `userId` + imię (e-mail dopiero w `user_get`).

## 5. Narzędzia

### 5.1. Grupa A — wyniki i podejścia

#### `attempt_list`

Podejścia po filtrach. Domyślnie wszystkie, posortowane od najnowszego.

```ts
{
  quizId?: string        // uuid
  userId?: string        // id Auth0
  courseId?: string      // uuid, egzamin kursu
  source?: 'manual' | 'irregular-verbs' | 'course-exam' | 'review' | 'weak'
  minPercent?: number    // 0..100
  maxPercent?: number
  from?: string          // ISO date
  to?: string
  limit?: number         // 25, max 200
  offset?: number
}
```

Zwraca tablicę `{ id, quizId, quizTitle, userId, userName, percent, score,
maxScore, passed, source, createdAt }` plus `total`. Zasila:
`quiz_attempts` (indeksy `(quiz_id, created_at DESC)` i `(user_id, created_at
DESC)` już istnieją) + `LEFT JOIN quizzes` (dla `source`) + `LEFT JOIN
user_profiles` (imię).

Uwagi projektowe:
- `quiz_id` ma `ON DELETE SET NULL`, więc po usunięciu quizu podejścia zostają
  z `quiz_title` — filtr `quizId` ich nie znajdzie, filtr `title` (dodatkowy,
  `ILIKE`) tak. Oba warianty w jednym narzędziu.
- `source` liczone tą samą regułą co `classes.allAttempts`: `course_id` →
  `course-exam`, `kind = 'manual'` → `manual`, inaczej `quizzes.source`. Po
  usunięciu quizu źródła nie da się już ustalić i pole jest **`null`** — filtr
  `source` takich podejść nie zwróci.
- `percent` jest `integer`; `score`/`max_score` to `numeric` — rzutować na
  `float`, inaczej `pg` zwróci string.
- Dodaje read path w repozytorium (`server/attemptsRepo.ts`), bo dzisiejsze
  `listAttempts` nie ma filtrów, a `allAttempts(userId)` jest zbyt wąskie.

#### `attempt_get`

Jedno podejście z odpowiedziami **na każde pytanie** — to domyka pytanie
„dlaczego 38%”.

```ts
{ attemptId: string /* uuid */ }
```

Zwraca to samo co `AdminStudentAttempt` (`classes/results.ts`): `score`,
`maxScore`, `percent`, `passed`, `createdAt`, `source` oraz `questions[]` z
`{ questionId, prompt, type, points, correct, earned, answer, correctAnswers }`,
plus `user: { userId, name, email }` i `quiz: { id, title }` (jeśli istnieje).

Świadomie **jedno narzędzie zamiast dwóch**: `attempt_list` zwraca `id`, a
`attempt_get` po nim — model nie musi zgadywać.

Uwaga: `prompt` może być `null` (pytanie usunięte/zmienione) — pole jest
opcjonalne i trzeba to opisać.

#### `quiz_stats`

Statystyka pytań quizu (item analysis). **Jedyne narzędzie, które pozwala
uzasadnić ocenę trudności danymi.**

```ts
{
  quizId: string
  limit?: number   // 50 pytań, max 200
}
```

Wyjście per pytanie:

```jsonc
{
  "questionId": "…",
  "prompt": "Ile to 4,05…",
  "type": "numeric",
  "attempts": 34,          // ile razy pytanie zostało pokazane i ocenione
  "correct": 21,
  "accuracy": 0.62,        // 0..1
  "earnedPercent": 62,     // suma earned / suma points
  "topAnswers": [ { "text": "4,05", "count": 12 }, { "text": "5", "count": 8 } ],
  "flag": "ok"            // patrz reguła niżej
}
```

Plus na poziomie quizu: `attempts` (liczba podejść), `avgPercent`, `minPercent`,
`maxPercent`, `unattributedAttempts` (podejścia, których `questionId` nie ma już
w quizie — tylko w wariancie D2-B), `sampleSize` (pytania mogą być losowane z
puli, więc `attempts` per pytanie może być mniejsze niż liczba podejść).

**Reguła `flag` — jedyna „ocena” w całym narzędziu, z progiem istotności:**

| Warunek | `flag` |
| --- | --- |
| `attempts < 10` | `insufficient-data` — **nie wyciągaj wniosków** |
| `accuracy >= 0.85` | `easy` |
| `accuracy < 0.40` | `too-hard` |
| `accuracy < 0.70` i najczęstsza błędna odpowiedź ≥ 50% błędów | `ambiguous` (dystraktor przyciąga wszystkich) |
| inaczej | `ok` |

`ambiguous` ma sens tylko dla typów z rozłącznymi opcjami (`single`, `truefalse`,
`multiple`) — przy `numeric`, `text`, `ordering`, `matching` i `cloze` „najczęstsza
błędna odpowiedź” nie jest dystraktorem, więc ta reguła jest pomijana, a
typy bez opcji nigdy nie dostają tej flagi.

Logika czysta → `src/shared/quiz/itemStats.ts` + `tests/itemStats.test.ts`
(zgodnie z konwencją repo: logika bez bazy w import-free module).

Źródło danych: `quiz_attempts.results` (`correct`, `earned`, `points`,
`answerText`) dla `quiz_id`; przy wariancie D2-A dodatkowo snapshot.

Ograniczenia do opisania w `description`:
- dotyczy tylko pytań, które faktycznie pokazano (przy `sampleSize` pula jest
  większa niż liczba odpowiedzi per pytanie);
- `answerText` jest nieobecny w podejściach zapisanych przed wprowadzeniem
  `config` — `topAnswers` dla nich może być puste (fallback: `answers.optionIds`
  → teksty opcji);
- po edycji quizu starsze podejścia mogą nie mieć `prompt` (D2).

#### `user_results`

Wszystkie podejścia użytkownika **bez przydziału do klasy** — to najtańsze
narzędzie, bo `classes.allAttempts(userId)` już istnieje i zwraca komplet.

```ts
{ userId: string, limit?: number /* 50, max 200 */ }
```

Zwraca: profil (`userId`, `name`, `email`), `attempts[]` (jak `attempt_get`),
`lessonsCompleted`, `classes[]` (z `classesOfMember`), `weakVerbs` (liczba),
`lastActiveDay`.

Różnica względem `student_results`: brak `classId` i brak ograniczenia do
przydzielonych zadań.

#### `user_analysis`

Analiza jak `student_analyze`, ale po **całej historii** użytkownika.

```ts
{ userId: string }
```

Zwraca to, co `analyzeStudent` (średnia, najlepszy/ostatni wynik, trend,
pytania najczęściej błędne, zadania po terminie, dni bez aktywności,
ostrzeżenia) + `weakVerbs` z `reviews.weakVerbs` + mapowanie na czasowniki.
Wymaga jedynie złożenia `allAttempts` w strukturę, którą `analyzeStudent` już
przyjmuje — bez nowej logiki analitycznej.

### 5.2. Grupa B — użytkownicy

| Narzędzie | Wejście | Wyjście | Źródło |
| --- | --- | --- | --- |
| `user_list` | `{ q?: string, page?: number }` | `AdminUsersPage` (20/stronę) | `auth0.listUsers` |
| `user_get` | `{ userId, include?: ('attempts'\|'classes'\|'reviews')[] }` | konto + role + `blocked` + `lastLogin` + żądane sekcje | `auth0.getUser` + `classes.profileOf` |
| `user_search` | `{ q: string /* min. 2 znaki */, limit?: number }` | `{ userId, name, email, lastActiveDay, attempts }` | `classes.searchUsers` (bez `classId`!) |
| `user_roles_set` | `{ userId, roles: ManagedRole[], confirm: true }` | `{ userId, roles }` | `auth0.setManagedRoles` |
| `user_block` | `{ userId, blocked: boolean, confirm: true }` | `{ userId, blocked }` | `auth0.setBlocked` |

Zabezpieczenia przeniesione **1:1** z `server/routes/admin.ts`:

- nie można odebrać roli `admin` samemu sobie,
- nie można odebrać roli ostatniemu adminowi (`countAdmins() <= 1`),
- nie można zablokować siebie ani ostatniego admina,
- zarządzane są **tylko** role `admin`/`teacher`/`student` (inne role tenanta
  nietknięte),
- każda zmiana → audyt z `from`/`to`.

`user_search` różni się od `student_search` brakiem `classId` i maskowania
e-maila — uzupełnia lukę „szukam konta, którego nie ma w żadnej mojej klasie”.

### 5.3. Grupa C — rozszerzenia quizów

Bez nowych narzędzi, tylko parametry (kompatybilne wstecznie, domyślnie
wyłączone):

| Parametr | Efekt |
| --- | --- |
| `quiz_list.includeGenerated` | dziś `WHERE q.kind = 'manual'`; `true` dodaje generowane (`source`: `irregular-verbs`, `course-exam`, `review`, `weak`) |
| `quiz_list.q` | filtr `title ILIKE %q%` |
| `quiz_list.ownerId` | filtr po `owner_id` |

Opcjonalnie `quiz_duplicate { id, title? }` — kopiowanie quizu (przydatne do
tworzenia wariantów egzaminu); wewnętrznie `getQuiz(withAnswers)` →
`createQuiz`, więc bez nowej logiki w repozytorium.

### 5.4. Grupa D — klasy

Poza `class_transfer` (D3-A) nic nie brakuje:

```ts
class_transfer: { classId: string, newOwnerId: string, confirm: true }
```

Wymaga `UPDATE classes SET owner_id = …`, walidacji, że nowy właściciel ma rolę
`teacher` (albo `admin`), oraz wpisu audytu ze starym i nowym właścicielem.

### 5.5. Grupa E — operacje

| Narzędzie | Wejście | Wyjście | Źródło |
| --- | --- | --- | --- |
| `audit_list` | `{ action?, actorId?, targetId?, from?, to?, limit? }` | `AuditEntry[]` | `adminRepo.listAudit` (dziś tylko `limit`) |
| `feedback_list` | `{ status?, limit? }` | `FeedbackItem[]` | `listFeedback` |
| `feedback_update` | `{ id, status, confirm: true }` | `FeedbackItem` | `setFeedbackStatus` |
| `settings_get` | `{}` | `AppSettings` (`scoreThresholds`) | `getAppSettings` |
| `settings_set` | `{ scoreThresholds: { low, high }, confirm: true }` | `AppSettings` | `saveAppSettings` + `normalizeThresholds` |
| `system_stats` | `{}` | liczby i stan | nowe zapytania |

`settings_set` musi przejść przez tę samą walidację co REST
(`normalizeThresholds`, `low < high`) i zapisać audyt `settings.update` —
inaczej dwa wejścia do tych samych danych będą się różnić.

`system_stats`:

```jsonc
{
  "users": 12, "classes": 3, "quizzes": 38, "generatedQuizzes": 0,
  "attempts": 21, "attemptsLast7Days": 14, "feedbackNew": 0,
  "activeTokens": 2, "weakVerbRows": 38,
  "db": { "migrationsApplied": 19, "schemaCurrent": true },
  "appVersion": "…"   // process.env.VERCEL_GIT_COMMIT_SHA jeśli jest
}
```

Cel: jedno wywołanie odpowiada „czy system żyje i jak wygląda”, zamiast pięciu
`SELECT COUNT(*)` wpisywanych ręcznie.

## 6. Plan wdrożenia (commity)

Każdy commit: zielone `npm run build`, `npm run lint`, `npm test`, `npm run test:ui`.

| # | Commit | Zakres |
| --- | --- | --- |
| 1 | `feat(shared): item analysis helpers` | `src/shared/quiz/itemStats.ts` + `tests/itemStats.test.ts` (czysta logika, progi z §5.1) |
| 2 | `feat(api): attempt queries for admins` | `server/attemptsRepo.ts` (`listAttemptsFiltered`, `getAttempt`, `attemptsOfQuiz`), bez MCP |
| 3 | `feat(mcp): attempt_list and attempt_get` | moduł `tools/admin.ts`, straż `adminOnly`, rejestracja w `index.ts` |
| 4 | `feat(mcp): quiz_stats` | użycie `itemStats` + zapytania z commita 2 |
| 5 | `feat(mcp): user_* tools` | lista, get, search, role, blokada + zabezpieczenia z REST |
| 6 | `feat(mcp): audit, feedback, settings, system_stats` | grupa E |
| 7 | `docs(mcp): admin tools` | [[mcp]], [[api-admin]], `CLAUDE.md`, opis w `docs/mcp-clients.md` |
| (opc.) | `feat(db): attempt question snapshot` | tylko przy D2-A: migracja + `saveAttempt` + backfill |

Razem ok. **3–4 dni** dla grupy A+B+E bez D2-A; +0,5 dnia na migrację snapshotu.

## 7. Testy

- **logika progi** (`tests/itemStats.test.ts`): `insufficient-data` poniżej 10
  prób, `too-hard` przy 3/10, `ambiguous` gdy jeden dystraktor ma ≥ 50% błędów,
  `easy` przy 9/10, poprawne liczenie `accuracy` przy `points > 1` (liczy się
  `earned`, nie `correct`), puste `results` → brak wyjątku;
- **`npm run test:mcp`**: nowe narzędzia dopisane do `scripts/mcp-local-e2e.ts`
  (odmowa dla nauczyciela i dla tokenu bez `manage:users`, poprawne dane dla
  admina, `confirm` wymagane, wpis w audycie `mcp.call`);
- **`tests/quizSchema.test.ts`** — bez zmian (nowe narzędzia nie dotykają
  schematu quizu).

## 8. Poza zakresem

- edycja cudzych klas przez admina (D3-B),
- `admin: true` na tokenach osobistych (D1-B),
- eksport CSV przez MCP (jest w REST: `GET /api/classes/:id/report.csv`),
- usuwanie kont (dziś tylko blokada — świadomie, dane wyników zostają),
- modyfikacja podejść (wyniki są niezmienne).

## 9. Powiązane

- [[mcp]] — serwer MCP, uwierzytelnianie, audyt
- [[api-admin]] — panel administracyjny i endpointy REST, z których korzystają te narzędzia
- [[Database]] — schemat `quiz_attempts`, `admin_audit_log`, `user_profiles`
- [[Auth]] — role, uprawnienia, `manage:users`
- [[Classes]] — reguły dostępu do klas
