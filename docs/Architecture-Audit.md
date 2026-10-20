---
tags:
  - docs
  - architecture
  - quiz
  - backend
  - frontend
  - status/todo
created: 2026-10-20
updated: 2026-10-20
---

# Audyt zależności modułów

> Pomiar odległości kodu od granic z [[Learning-Slice-Plan]] (sekcje „Zasada docelowa”, „Docelowa struktura”, „Egzekwowanie granic”) **przed przenoszeniem plików** (krok 6 planu). Narzędzie: `npm run arch:audit` (`scripts/arch-audit.mjs`), reguły: `scripts/arch-manifest.json`. Stan kodu: commit `d0c627c` (gałąź `vercel-neon`). Ten commit nie zmienia kodu produktu.

## Wynik w skrócie

- 366 plików kodu (`server/`, `src/`, `api-src/`, `scripts/`, `tests/`): wszystkie przypisane do modułu. Po korekcie manifestu (decyzje a–f) `src/vite-env.d.ts` trafia do `f-platform`.
- 1132 względne importy rozwiązano do plików, 0 nierozwiązanych. Poza zakresem: 798 importów pakietów npm, 2 importy CSS, 1 import dynamiczny bez literału (`scripts/dev-server.mjs:52`).
- **24 importy łamią zasadę w 13 parach modułów** (z 137 par, łącznie z testami). Przed korektą manifestu było 36 importów w 21 parach. Korekta usunęła 12 importów i 8 par, bez nowych naruszeń. 7 z 24 to `import type`, czyli tanie w naprawie.
- Serwer: `learning -> progress` (hooki oceny i aktywność dzienna), `quizzes -> learning/progress/classes` i `mcp-platform -> classes` (guardy klas w narzędziach MCP, `context.ts`, `tools/shared.ts`). Quizy zależą od `learning` (generator z czasowników) i `classes` (`attemptsRepo`).
- Frontend: `f-learning -> f-progress` (znacznik „słabe”), `f-quizzes -> f-progress` (wynik quizu), `f-platform -> shared-quizzes` (typy wejścia tokenów i uwag).
- **3 cykle** między modułami: klaster serwerowy (6 modułów), frontendowy (3) i `shared-quizzes` z `shared-types` (2). Cykle nie są liczone przez skrypt jako błąd; kanarek pilnuje, żeby ich liczba i składy nie rosły (`tests/architecture.test.ts`).
- Importy z testów (330) są raportowane w tabeli, ale nigdy nie są naruszeniem.

## Decyzje właściciela (korekta manifestu)

Commit „correct the module manifest” stosuje sześć decyzji. To decyzje projektowe, nie błędy audytu. Pliki i reguły zmieniono tylko w `scripts/arch-manifest.json`.

- **a)** `server/mcp/index.ts` → `root`. Jest kompozycją narzędzi MCP wszystkich modułów, więc składanie należy do roota. Zamknięte pary: `mcp-platform -> admin` (3), `-> learning` (1), `-> media` (1), `-> quizzes` (1).
- **b)** `src/shared/quiz/userHistory.ts` → `shared-classes` (test w `tests/` bez zmian, bo `tests` jest osobnym modułem). Zamknięta para `shared-quizzes -> shared-classes` (1, typ). Plik importuje `studentAnalysis` z `shared-classes`.
- **c)** `src/vite-env.d.ts` → `f-platform` (ambientne typy Vite). Lista nieprzypisanych plików jest pusta.
- **d)** `src/components/AppLayout.tsx` → `root` (składa widżety funkcji: `StreakChip`, `useTimezoneSync`, feedback). Zamknięta para `f-platform -> f-progress` (2). Pozostałe `src/components/**` zostają w `f-platform`.
- **e)** `src/features/results/useScoreColors.ts` i `src/features/results/Score.tsx` (`ScoreTag`, `ScoreProgress`) → `f-platform`, reguła przed ogólną regułą `src/features/results/**`. Te atomy są współdzielone przez klasy, quizy, wyniki i panel admina. Testów dla nich nie ma w repo. Zamknięte pary: `f-quizzes -> f-results` (1). Pliki `AttemptsTable`/`AttemptDetails` zostają w `f-results`.
- **f)** `f-classes` może importować `f-results` (dodane do `allow`). Zamknięta para `f-classes -> f-results` (1).

Efekt: naruszenia 36 → 24 importów, pary 21 → 13, cykle 3 → 3 (inne składy, patrz „Cykle”). Pary, które zniknęły: `mcp-platform -> admin`, `mcp-platform -> learning`, `mcp-platform -> media`, `mcp-platform -> quizzes`, `f-platform -> f-progress`, `f-classes -> f-results`, `f-quizzes -> f-results`, `shared-quizzes -> shared-classes`. Pozostała para `mcp-platform -> classes` ma 3 importy (było 4): `index.ts` nie importuje już klas, zostają `context.ts` i `tools/shared.ts`.

Dla porównania, naruszenia przed korektą (`node scripts/arch-audit.mjs` na `a2591f2`): `f-classes -> f-results` 1, `f-learning -> f-progress` 2, `f-platform -> f-progress` 2, `f-platform -> shared-quizzes` 3 (typy), `f-quizzes -> f-progress` 2, `f-quizzes -> f-results` 1, `learning -> progress` 4, `mcp-platform -> admin` 3, `mcp-platform -> classes` 4 (1 typ), `mcp-platform -> learning` 1, `mcp-platform -> media` 1, `mcp-platform -> quizzes` 1, `mcp-platform -> shared-quizzes` 1, `media -> quizzes` 1, `platform -> shared-quizzes` 1, `quizzes -> classes` 2 (1 typ), `quizzes -> learning` 2, `quizzes -> progress` 1, `shared-quizzes -> shared-classes` 1 (typ), `shared-types -> shared-media` 1 (typ), `shared-types -> shared-quizzes` 1 (typ).

## Jak działa audyt

- **Manifest** (`scripts/arch-manifest.json`): reguły sprawdzane po kolei, pierwsza pasująca wygrywa. Wzorzec to dokładna ścieżka, prefiks katalogu (kończy się `/`) albo glob (`*` w segmencie, `**` między segmentami).
- **`allow`**: lista modułów, z których moduł może importować (siebie zawsze wolno). `*` oznacza dowolny moduł.
- **`open`**: moduły, które może importować każdy: `platform`, `mcp-platform`, `shared-platform`, `shared-types`, `f-platform`.
- **`incoming`**: kto może importować dany moduł. `admin` i `f-admin` tylko z `root`, `root` z nikogo.
- **Warstwy** (reguła dopisana ponad plan, bo plan jej wprost nie zapisał): plik w `src/**` nie importuje z `server/**`, a plik serwerowy (`server/`, `api-src/`, `scripts/`) importuje z `src/` tylko `src/shared/**`. Naruszenie tego typu to `tier`.
- **`shared-X`** to część współdzielona modułu X. Moduł może importować `shared-Y` tylko tam, gdzie wolno mu importować Y (domknięcie zbioru z planu).
- **Parser**: tekst jest czyszczony z komentarzy (znaki nowej linii zostają, więc numery linii są dokładne), następnie szukane są `import … from`, `export … from`, `import '…'`, `import('…')`, `require('…')`. Import `type` i lista `{ type X }` są oznaczane jako typowe. Wywołania `vi.mock` nie są czytane. Względne specyfikatory rozwiązywane są przez `.ts`, `.tsx`, `.mts`, `.cts`, `.mjs`, `.js`, `.jsx`, `.cjs`, `/index.*` i zamianę `.js` na `.ts`. W repo nie ma aliasów `paths`.
- **Wyjścia**: tabela krawędzi, naruszenia pogrupowane wg krawędzi, nieprzypisane pliki, cykle (Tarjan), nierozwiązane importy, importy dynamiczne, podsumowanie. `--json` daje to samo jako JSON; `--fail-on-violations` kończy się kodem 1, gdy są naruszenia (pod kanarek). Wynik jest deterministyczny (sprawdzone dwoma uruchomieniami i diffem).

## Decyzje i odchylenia od propozycji

1. `src/test/**` (`setup.ts`, `msw.ts`) przypisane do `tests`. Plan wymieniał tylko `*.test.*`, a to jest infrastruktura testów.
2. `admin`, `f-admin` i `root` mają `allow: *`, a ograniczenie wejścia realizuje `incoming`. Dla `tests` też `*`, bo jego krawędzi nikt nie sprawdza.
3. `shared-*` w `allow` to domknięcie zbiorów z planu. Np. `shared-quizzes` może importować `shared-platform` i `shared-media` (plan: „platform + media”), ale nie serwerowe pliki.
4. `platform` i `f-platform` nie importują nic poza `shared-*` (plan: „nothing”), a ich wejście jest otwarte.
5. `src/vite-env.d.ts` zostaje nieprzypisany (ambientne typy Vite, bez importów). Propozycja: `f-platform`. **Zastosowane** (decyzja c).
6. CSS (`src/index.css`, `src/styles/*`) nie jest skanowane, bo nie tworzy krawędzi modułów.
7. **Zastosowane** (decyzja a): `server/mcp/index.ts` przenieść do `root`, bo składa narzędzia `admin`, `learning`, `media`, `quizzes` i `classes`. Pozwoliłoby to usunąć 7 z 36 naruszeń (krawędzie `mcp-platform -> *` z `index.ts`). Patrz naprawy 8–12.
8. **Zastosowane** (decyzja d): `src/components/AppLayout.tsx` razem z `src/App.tsx` (root), bo składa elementy wielu funkcji. Patrz naprawa 3.

## Manifest: podsumowanie

Pliki na moduł (po przypisaniu) i zbiór modułów, z których moduł może importować (`allow`, plus `open` i `incoming` opisane wyżej).

| Moduł | Pliki | Może importować (poza sobą) |
|---|---:|---|
| `admin` | 7 | `*` |
| `classes` | 11 | `platform`, `media`, `quizzes`, `learning`, `progress`, `shared-classes`, `shared-progress`, `shared-learning`, `shared-quizzes`, `shared-media`, `shared-platform` |
| `f-admin` | 7 | `*` |
| `f-classes` | 9 | `f-platform`, `f-media`, `f-quizzes`, `f-learning`, `f-progress`, `f-results`, `shared-classes`, `shared-progress`, `shared-learning`, `shared-quizzes`, `shared-media`, `shared-platform` |
| `f-learning` | 8 | `f-platform`, `f-media`, `f-quizzes`, `shared-learning`, `shared-quizzes`, `shared-media`, `shared-platform` |
| `f-media` | 14 | `f-platform`, `shared-media`, `shared-platform` |
| `f-platform` | 40 | nic |
| `f-progress` | 9 | `f-platform`, `f-media`, `f-quizzes`, `f-learning`, `shared-progress`, `shared-learning`, `shared-quizzes`, `shared-media`, `shared-platform` |
| `f-quizzes` | 12 | `f-platform`, `f-media`, `shared-quizzes`, `shared-media`, `shared-platform` |
| `f-results` | 3 | `f-platform`, `f-media`, `f-quizzes`, `f-learning`, `f-progress`, `f-classes`, `shared-classes`, `shared-progress`, `shared-learning`, `shared-quizzes`, `shared-media`, `shared-platform` |
| `learning` | 9 | `platform`, `media`, `quizzes`, `shared-learning`, `shared-quizzes`, `shared-media`, `shared-platform` |
| `mcp-platform` | 2 | nic |
| `media` | 22 | `platform`, `shared-media`, `shared-platform` |
| `platform` | 12 | nic |
| `progress` | 3 | `platform`, `media`, `quizzes`, `learning`, `shared-progress`, `shared-learning`, `shared-quizzes`, `shared-media`, `shared-platform` |
| `quizzes` | 6 | `platform`, `media`, `shared-quizzes`, `shared-media`, `shared-platform` |
| `root` | 31 | `*` |
| `shared-classes` | 4 | `shared-platform`, `shared-media`, `shared-quizzes`, `shared-learning`, `shared-progress` |
| `shared-learning` | 4 | `shared-platform`, `shared-media`, `shared-quizzes` |
| `shared-media` | 3 | `shared-platform` |
| `shared-platform` | 3 | nic |
| `shared-progress` | 1 | `shared-platform`, `shared-media`, `shared-quizzes`, `shared-learning` |
| `shared-quizzes` | 7 | `shared-platform`, `shared-media` |
| `shared-types` | 1 | nic |
| `tests` | 138 | `*` |

## Pełny wynik audytu (commit a2591f2 z korektą manifestu)

Wynik `node scripts/arch-audit.mjs` po korekcie manifestu (decyzje a–f). Naruszenia są pogrupowane wg krawędzi; `[reason]` to `not-allowed`, `incoming` lub `tier`.

```text
arch-audit (manifest v1, 26 rules)

## Modules (files)
admin                 7
classes              11
f-admin               7
f-classes             9
f-learning            8
f-media              14
f-platform           40
f-progress            9
f-quizzes            12
f-results             3
learning              9
mcp-platform          2
media                22
platform             12
progress              3
quizzes               6
root                 31
shared-classes        4
shared-learning       4
shared-media          3
shared-platform       3
shared-progress       1
shared-quizzes        7
shared-types          1
tests               138

## Module edges (cross-module imports)
admin -> classes                              7  ok
admin -> mcp-platform                         9  ok
admin -> platform                            13  ok
admin -> progress                             2  ok
admin -> quizzes                              1  ok
admin -> shared-classes                       3  ok
admin -> shared-learning                      1  ok
admin -> shared-quizzes                       6  ok
admin -> shared-types                         2  ok
classes -> learning                           4  ok
classes -> mcp-platform                      11  ok
classes -> platform                           7  ok
classes -> progress                           3  ok
classes -> shared-classes                     4  ok
classes -> shared-learning                    2  ok
classes -> shared-platform                    2  ok
classes -> shared-quizzes                     4  ok
classes -> shared-types                       5  ok
f-admin -> f-platform                        15  ok
f-admin -> f-progress                         1  ok
f-admin -> f-results                          2  ok
f-admin -> shared-learning                    1  ok
f-admin -> shared-platform                    2  ok
f-admin -> shared-types                       6  ok
f-classes -> f-platform                       7  ok
f-classes -> f-results                        1  ok
f-classes -> shared-platform                  1  ok
f-classes -> shared-types                     4  ok
f-learning -> f-media                         2  ok
f-learning -> f-platform                      9  ok
f-learning -> f-progress                      2  VIOLATING 2
f-learning -> f-quizzes                       2  ok
f-learning -> shared-media                    1  ok
f-learning -> shared-types                    5  ok
f-media -> f-platform                         3  ok
f-media -> shared-media                      12  ok
f-platform -> shared-platform                 2  ok
f-platform -> shared-quizzes                  3  VIOLATING 3
f-platform -> shared-types                   10  ok
f-progress -> f-learning                      1  ok
f-progress -> f-media                         2  ok
f-progress -> f-platform                      4  ok
f-progress -> f-quizzes                       1  ok
f-progress -> shared-media                    1  ok
f-progress -> shared-types                    2  ok
f-quizzes -> f-media                         18  ok
f-quizzes -> f-platform                      10  ok
f-quizzes -> f-progress                       2  VIOLATING 2
f-quizzes -> shared-media                     2  ok
f-quizzes -> shared-quizzes                  19  ok
f-quizzes -> shared-types                     4  ok
f-results -> f-platform                       3  ok
f-results -> shared-quizzes                   1  ok
f-results -> shared-types                     3  ok
learning -> mcp-platform                      2  ok
learning -> media                             5  ok
learning -> platform                          4  ok
learning -> progress                          4  VIOLATING 4
learning -> quizzes                           3  ok
learning -> shared-learning                   1  ok
learning -> shared-media                      4  ok
learning -> shared-quizzes                    4  ok
learning -> shared-types                      5  ok
mcp-platform -> classes                       3  VIOLATING 3
mcp-platform -> platform                      4  ok
mcp-platform -> shared-quizzes                1  VIOLATING 1
media -> mcp-platform                         2  ok
media -> platform                             7  ok
media -> quizzes                              1  VIOLATING 1
media -> shared-media                         5  ok
platform -> shared-platform                   1  ok
platform -> shared-quizzes                    1  VIOLATING 1
platform -> shared-types                      6  ok
progress -> learning                          3  ok
progress -> media                             1  ok
progress -> platform                          4  ok
progress -> quizzes                           1  ok
progress -> shared-learning                   4  ok
progress -> shared-progress                   2  ok
progress -> shared-quizzes                    1  ok
progress -> shared-types                      2  ok
quizzes -> classes                            2  VIOLATING 2
quizzes -> learning                           2  VIOLATING 2
quizzes -> mcp-platform                       2  ok
quizzes -> media                              5  ok
quizzes -> platform                           5  ok
quizzes -> progress                           1  VIOLATING 1
quizzes -> shared-quizzes                    12  ok
quizzes -> shared-types                       5  ok
root -> admin                                 4  ok
root -> classes                               2  ok
root -> f-admin                               6  ok
root -> f-classes                            17  ok
root -> f-learning                           11  ok
root -> f-media                               3  ok
root -> f-platform                           77  ok
root -> f-progress                            9  ok
root -> f-quizzes                             9  ok
root -> f-results                             3  ok
root -> learning                              6  ok
root -> mcp-platform                          1  ok
root -> media                                 8  ok
root -> platform                             12  ok
root -> progress                              1  ok
root -> quizzes                               4  ok
root -> shared-learning                       2  ok
root -> shared-quizzes                        6  ok
root -> shared-types                          6  ok
shared-classes -> shared-types                2  ok
shared-learning -> shared-media               1  ok
shared-learning -> shared-types               1  ok
shared-quizzes -> shared-media                2  ok
shared-quizzes -> shared-platform             1  ok
shared-quizzes -> shared-types                3  ok
shared-types -> shared-media                  1  VIOLATING 1
shared-types -> shared-quizzes                1  VIOLATING 1
tests -> admin                                1  ok
tests -> f-admin                              4  ok
tests -> f-classes                            6  ok
tests -> f-learning                          11  ok
tests -> f-media                             14  ok
tests -> f-platform                         148  ok
tests -> f-progress                           8  ok
tests -> f-quizzes                           26  ok
tests -> f-results                            3  ok
tests -> learning                             6  ok
tests -> media                               18  ok
tests -> platform                             3  ok
tests -> quizzes                              2  ok
tests -> root                                19  ok
tests -> shared-classes                       8  ok
tests -> shared-learning                      7  ok
tests -> shared-media                         7  ok
tests -> shared-platform                      3  ok
tests -> shared-progress                      2  ok
tests -> shared-quizzes                      18  ok
tests -> shared-types                        10  ok

## Violations
[f-learning -> f-progress] 2 import(s), 0 type-only
  src/features/learn/VerbSlide.tsx:4  f-learning -> f-progress  ../progress/WeakMark  [not-allowed]
  src/features/learn/VerbTable.tsx:7  f-learning -> f-progress  ../progress/WeakMark  [not-allowed]
[f-platform -> shared-quizzes] 3 import(s), 3 type-only
  src/features/auth/ApiTokens.tsx:8  f-platform -> shared-quizzes  ../../shared/quiz/schema  [not-allowed] (type-only)
  src/features/auth/api.ts:2  f-platform -> shared-quizzes  ../../shared/quiz/schema  [not-allowed] (type-only)
  src/features/feedback/api.ts:2  f-platform -> shared-quizzes  ../../shared/quiz/schema  [not-allowed] (type-only)
[f-quizzes -> f-progress] 2 import(s), 0 type-only
  src/features/quizzes/ResultView.tsx:13  f-quizzes -> f-progress  ../progress/api  [not-allowed]
  src/features/quizzes/ResultView.tsx:20  f-quizzes -> f-progress  ../progress/ProgressLine  [not-allowed]
[learning -> progress] 4 import(s), 0 type-only
  server/learningGradeHooks.ts:4  learning -> progress  ./progressRepo  [not-allowed]
  server/learningGradeHooks.ts:6  learning -> progress  ./reviewsRepo  [not-allowed]
  server/routes/learning.ts:11  learning -> progress  ../progressRepo  [not-allowed]
  server/routes/learning.ts:13  learning -> progress  ../reviewsRepo  [not-allowed]
[mcp-platform -> classes] 3 import(s), 1 type-only
  server/mcp/context.ts:7  mcp-platform -> classes  ../classAccess  [not-allowed]
  server/mcp/context.ts:8  mcp-platform -> classes  ../classAccess  [not-allowed] (type-only)
  server/mcp/tools/shared.ts:3  mcp-platform -> classes  ../../classAccess  [not-allowed]
[mcp-platform -> shared-quizzes] 1 import(s), 0 type-only
  server/mcp/tools/shared.ts:2  mcp-platform -> shared-quizzes  ../../../src/shared/quiz/schema  [not-allowed]
[media -> quizzes] 1 import(s), 0 type-only
  server/mcp/tools/media.ts:24  media -> quizzes  ../../quizRepo  [not-allowed]
[platform -> shared-quizzes] 1 import(s), 0 type-only
  server/routes/tokens.ts:2  platform -> shared-quizzes  ../../src/shared/quiz/schema  [not-allowed]
[quizzes -> classes] 2 import(s), 1 type-only
  server/attemptsRepo.ts:2  quizzes -> classes  ./classes/results  [not-allowed]
  server/attemptsRepo.ts:3  quizzes -> classes  ./classes/results  [not-allowed] (type-only)
[quizzes -> learning] 2 import(s), 0 type-only
  server/mcp/quizTools.ts:6  quizzes -> learning  ../irregularVerbs  [not-allowed]
  server/routes/quizzes.ts:11  quizzes -> learning  ../irregularVerbs  [not-allowed]
[quizzes -> progress] 1 import(s), 0 type-only
  server/routes/quizzes.ts:16  quizzes -> progress  ../reviewsRepo  [not-allowed]
[shared-types -> shared-media] 1 import(s), 1 type-only
  src/shared/quiz/types.ts:2  shared-types -> shared-media  ../media/types  [not-allowed] (type-only)
[shared-types -> shared-quizzes] 1 import(s), 1 type-only
  src/shared/quiz/types.ts:1  shared-types -> shared-quizzes  ./engine  [not-allowed] (type-only)

## Unassigned files
none

## Cycles (between modules)
cycle 1: classes, learning, mcp-platform, media, progress, quizzes
  classes -> learning (4)
  classes -> mcp-platform (11)
  classes -> progress (3)
  learning -> mcp-platform (2)
  learning -> media (5)
  learning -> progress (4)
  learning -> quizzes (3)
  mcp-platform -> classes (3)
  media -> mcp-platform (2)
  media -> quizzes (1)
  progress -> learning (3)
  progress -> media (1)
  progress -> quizzes (1)
  quizzes -> classes (2)
  quizzes -> learning (2)
  quizzes -> mcp-platform (2)
  quizzes -> media (5)
  quizzes -> progress (1)
cycle 2: f-learning, f-progress, f-quizzes
  f-learning -> f-progress (2)
  f-learning -> f-quizzes (2)
  f-progress -> f-learning (1)
  f-progress -> f-quizzes (1)
  f-quizzes -> f-progress (2)
cycle 3: shared-quizzes, shared-types
  shared-quizzes -> shared-types (3)
  shared-types -> shared-quizzes (1)

## Unresolved relative imports
none

## Dynamic (non-literal) import/require
scripts/dev-server.mjs:52  import(...)

## Summary
filesScanned: 366
filesAssigned: 366
filesUnassigned: 0
nonCodeFilesSkipped: 10
importEdges: 1132
crossModuleEdgePairs: 137
violatingImports: 24
violatingImportsTypeOnly: 7
violatingModulePairs: 13
cycles: 3
unresolvedRelative: 0
dynamicSpecifiers: 1
externalPackageImports: 798
assetImportsIgnored: 2
importsOutsideScope: 0
testEdges: 330
```

## Nieprzypisane pliki

- Brak. `src/vite-env.d.ts` przypisany do `f-platform` (decyzja c).

## Cykle

- **Cykl 1 (serwer, 6 modułów):** `classes`, `learning`, `mcp-platform`, `media`, `progress`, `quizzes`. Wszystkie krawędzie w cyklu to naruszenia albo zależności dozwolone, więc każdy cykl zawiera pozycje z listy. Najbardziej ruchome: `learning -> progress` i `quizzes -> progress/learning/classes` (naprawy 7, 16–18) oraz `mcp-platform -> classes` (naprawa 9).
- **Cykl 2 (frontend, 3 moduły):** `f-learning`, `f-progress`, `f-quizzes`. Zamykają go naprawy 2 i 5 (`f-learning -> f-progress`, `f-quizzes -> f-progress`). Krawędzie `f-progress -> f-learning` i `f-progress -> f-quizzes` są dozwolone.
- **Cykl 3 (`shared-*`, 2 moduły):** `shared-quizzes`, `shared-types`. Zamyka go naprawa 21 (rozbicie `types.ts`).

## Podział `src/shared/quiz/types.ts` (propozycja, bez zmian w kodzie)

Plik ma 460 linii i mieszankę wszystkich modułów. Proponowany przydział eksportów:

| Eksport | Proponowany moduł | Uwagi |
|---|---|---|
| `QuizSummary`, `QuizOption`, `QuizQuestion`, `QuizDetail`, `AttemptSummary`, `GradedAttempt` | `shared-quizzes` | `GradedAttempt` opiera się na `QuizResult` z `engine.ts` (już w `shared-quizzes`) |
| `SUBJECTS`, `SubjectCode`, `SUBJECT_LABELS` | `shared-quizzes` | przedmioty quizów, używane przez `subjectGroups` |
| `DifficultyCode`, `PopularityCode`, `PatternCode`, `DIFFICULTY_LABELS`, `POPULARITY_LABELS` | `shared-learning` | katalog czasowników; lista quizów filtruje po trudności, więc to otwarte: wspólny `shared-catalog` albo zostawić w `shared-quizzes` |
| `IrregularVerb`, `CourseSummary`, `CourseDetail`, `LessonSummary`, `LessonDetail`, `WeakVerb` | `shared-learning` | kursy, lekcje i słabe czasowniki (`weak.ts`) |
| `ProgressSummary`, `ReviewSummary` | `shared-progress` | seria, cel dzienny, powtórki (`streaks.ts`) |
| `ApiTokenSummary`, `CreatedApiToken`, `FeedbackKind`, `FeedbackStatus`, `FeedbackContext`, `FeedbackItem`, `MANAGED_ROLES`, `ManagedRole`, `AppSettings` | `shared-platform` | tokeny, uwagi, role i ustawienia aplikacji (globalne) |
| `AdminUser`, `AdminUsersPage`, `AuditEntry` | nowy `shared-admin` | tylko panel admina; wymaga wpisu w manifeście |
| `AdminStudentAttempt`, `AdminStudentResults`, `AdminStudentListItem` | `shared-classes` (lub `shared-admin`) | `userHistory.ts` (`shared-quizzes`) importuje `AdminStudentAttempt`, więc to musi się rozstrzygnąć przy naprawie 19 |
| `ClassSummary`, `ClassMember`, `AssignmentItem`, `AssignmentStatus`, `MyAssignment`, `MyClass`, `ClassReportRow`, `ClassReport`, `ClassDetail` | `shared-classes` | klasy i zadania |
| `StudentAttemptQuestion`, `StudentAttempt`, `StudentAssignmentProgress`, `StudentResults`, `StudentCandidate`, `StudentListItem` | `shared-classes` | wyniki ucznia w klasie |

Po rozdzieleniu `types.ts` znika jako nośnik i krawędzie `shared-types -> *` (naprawy 20–21) przestają być potrzebne. Dziś `shared-types` importuje z `shared-media` (`MediaMap`) i z `shared-quizzes` (`QuizResult`, `QuestionType`), więc nawet jako „nośnik typów” nie jest czysty.

## Proponowane naprawy

Jedna konkretna propozycja na każdą krawędź naruszającą zasadę. `(typ)` oznacza import typu, tani w naprawie. Numer odpowiada pozycji w tabeli naruszeń wyżej.

Po korekcie manifestu naprawy 1, 3, 6, 8, 10, 11, 12 i 19 nie dotyczą już naruszeń (załatwiła je korekta). Naprawa 9 dotyczy tylko `mcp-platform -> classes` (3 importy). Pozostałe są aktualne.

1. **`f-classes -> f-results`** (`src/features/classes/StudentResultsView.tsx:7`): przenieść `StudentResultsView.tsx` do `src/features/results/`. To widok wyników, nie klas.
2. **`f-learning -> f-progress`** (`VerbSlide.tsx:4`, `VerbTable.tsx:7`, `WeakMark`): przekazać znacznik „słabe” jako slot (`weakMark?: (verbId) => ReactNode`) z stron `pages/` (root).
3. **`f-platform -> f-progress`** (`src/components/AppLayout.tsx:21-22`, `StreakChip`, `useTimezoneSync`): montować `StreakChip` i `useTimezoneSync` w `src/App.tsx` (root) i przekazać do `AppLayout` jako `headerExtra?: ReactNode`.
4. **`f-platform -> shared-quizzes`** (`features/auth/ApiTokens.tsx:8`, `features/auth/api.ts:2`, `features/feedback/api.ts:2`; `TokenInput`, `FeedbackInput`, wszystko `(typ)`): przenieść `tokenInput` i `feedbackInput` (zod i typy) do pliku `shared-platform`, np. `src/shared/quiz/platformInput.ts`. Ten sam ruch zamyka naprawę 15.
5. **`f-quizzes -> f-progress`** (`features/quizzes/ResultView.tsx:13,20`; `useStartReviewMutation`, `ProgressLine`): dostarczać oba przez `ResultOutcome`, który już istnieje dla egzaminu kursu, i składać w `pages/QuizPlay.tsx` (root).
6. **`f-quizzes -> f-results`** (`ResultView.tsx:21`, `useScoreColors`): przenieść `useScoreColors` (progi są globalnym ustawieniem `app_settings`) do `src/app/` (`f-platform`).
7. **`learning -> progress`** (`server/learningGradeHooks.ts:4,6`, `server/routes/learning.ts:11,13`): przenieść rejestrację `afterSave` (`recordActivity`, `applyResults`) do `server/progress/gradeHooks.ts`, podpiętej w `createApp`. W `routes/learning.ts` zastąpić bezpośrednie wywołania zdarzeniem `lessonCompleted` z rejestru.
8. **`mcp-platform -> admin`** (`server/mcp/index.ts:5-7`): przenieść składanie narzędzi (`index.ts`) do `root` (`server/app.ts` albo `server/mcp/mount.ts` w root). Ten sam ruch zamyka naprawy 9–12 w `index.ts`.
9. **`mcp-platform -> classes`** (`server/mcp/context.ts:7-8` `viewerOf`/`Viewer` (ostatni `(typ)`), `server/mcp/tools/shared.ts:3` guardy klas): `viewerOf` i `Viewer` przenieść do `server/auth.ts` (tożsamość z żądania, `platform`); guardy klas z `tools/shared.ts` przenieść do `tools/classes.ts`.
10. **`mcp-platform -> learning`** (`server/mcp/index.ts:10`, `lessonTools`): montowanie w roocie, jak w naprawie 8.
11. **`mcp-platform -> media`** (`server/mcp/index.ts:8`, `tools/media`): montowanie w roocie, jak w naprawie 8.
12. **`mcp-platform -> quizzes`** (`server/mcp/index.ts:11`, `quizTools`): montowanie w roocie, jak w naprawie 8.
13. **`mcp-platform -> shared-quizzes`** (`server/mcp/tools/shared.ts:2`, `auth0UserId` z `schema.ts`): przenieść regułę do `src/shared/quiz/auth0Id.ts` (`shared-platform`), o ile jest tam ta sama reguła (do sprawdzenia przy naprawie).
14. **`media -> quizzes`** (`server/mcp/tools/media.ts:24`, `../../quizRepo`): narzędzie wiążące obraz z quizem przenieść do `server/mcp/quizTools.ts` (`quizzes`), a `media` zostawić przy wysyłaniu i referencjach.
15. **`platform -> shared-quizzes`** (`server/routes/tokens.ts:2`, `tokenInput`): tak jak w naprawie 4, czyli jeden plik `shared-platform` dla wejść tokenów i uwag.
16. **`quizzes -> classes`** (`server/attemptsRepo.ts:2` `questionDetails`, `:3` `AttemptRow` (typ)): przenieść `questionDetails` i `AttemptRow` z `server/classes/results.ts` do `server/attemptsRepo.ts`. Klasy importują je stamtąd (`classes -> quizzes` jest dozwolone).
17. **`quizzes -> learning`** (`server/routes/quizzes.ts:11`, `server/mcp/quizTools.ts:6`, `irregularVerbs`): generator z czasowników przenieść do `learning` (`routes/learning.ts`, `mcp/lessonTools.ts`). `quizzes` zostaje z CRUD i oceną.
18. **`quizzes -> progress`** (`server/routes/quizzes.ts:16`, `reviewsRepo`, używane przy `weakVerbs` w linii 78): obsługę generowania „tylko słabe” przenieść do `server/routes/progress.ts`. Progress może importować learning, a wybór słabych czasowników to dane postępu.
19. **`shared-quizzes -> shared-classes`** (`src/shared/quiz/userHistory.ts:5` `AnalysisAttempt`, `AnalysisInput` (typy)): przenieść te dwa typy do `userHistory.ts`. `studentAnalysis.ts` importuje je stamtąd (`shared-classes -> shared-quizzes` jest dozwolone).
20. **`shared-types -> shared-media`** (`src/shared/quiz/types.ts:2`, `MediaMap` (typ)): pole używające `MediaMap` przenieść do typu zdefiniowanego w `src/shared/media/types.ts` (np. `QuizWithMedia`). `types.ts` nie importuje mediów.
21. **`shared-types -> shared-quizzes`** (`src/shared/quiz/types.ts:1`, `QuizResult`, `QuestionType` z `engine.ts` (typy)): rozdzielić `types.ts` wg tabeli wyżej. Typy quizowe trafiają do `shared-quizzes`, a `types.ts` przestaje istnieć jako nośnik.

## Ograniczenia pomiaru

- Parser działa na tekście, nie na AST. Komentarze są usuwane, zawartość stringów zostaje w analizie importów (wymagane przez specyfikatory). Literały regex zawierające cudzysłowy mogą zakłócić czyszczenie, ale dotyczy to najwyżej jednej linii, bo cudzysłów kończy się przy nowej linii.
- Importy dynamiczne bez literału nie są rozwiązywane. Jest jeden taki przypadek: `scripts/dev-server.mjs:52` (`import(bundle.href)`), wypisany w sekcji „Dynamic”. Nie wpływa na wyniki modułowe, bo ładuje zbudowany bundle.
- Pliki `.d.ts` i CSS są pomijane albo nieprzypisane (patrz wyżej).
- `vi.mock` i `vi.importActual` w testach nie są czytane. Testy nie są źródłem naruszeń, więc nie wpływa to na wynik.
- Wynik dotyczy stanu kodu w commicie `a2591f2` z korektą manifestu (decyzje a–f). Po przeniesieniu plików (krok 6) trzeba go uruchomić ponownie: `npm run arch:audit`, a w kanarku `node scripts/arch-audit.mjs --fail-on-violations`.
