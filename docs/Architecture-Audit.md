---
tags:
  - docs
  - architecture
  - quiz
  - backend
  - frontend
  - status/done
created: 2026-10-20
updated: 2026-10-20
---

# Audyt zależności modułów

> Pomiar odległości kodu od granic z [[Learning-Slice-Plan]] (sekcje „Zasada docelowa”, „Docelowa struktura”, „Egzekwowanie granic”). Narzędzie: `npm run arch:audit` (`scripts/arch-audit.mjs`), reguły: `scripts/arch-manifest.json`, kanarek: `tests/architecture.test.ts`. Stan kodu: commit `0d880c1` (gałąź `vercel-neon`); od tego commita zmieniła się tylko dokumentacja. Liczby w sekcjach „Wynik w skrócie”, „Manifest” i „Pełny wynik” pochodzą z uruchomienia `node scripts/arch-audit.mjs` na tym stanie.

## Wynik w skrócie

- 381 plików kodu (`server/`, `src/`, `api-src/`, `scripts/`, `tests/`): wszystkie przypisane do modułu, 0 nieprzypisanych. 12 plików niekodowych pominięto.
- 1169 względnych importów rozwiązano do plików, 0 nierozwiązanych. Poza zakresem: 821 importów pakietów npm, 2 importy zasobów (CSS), 1 import dynamiczny bez literału (`scripts/dev-server.mjs:52`).
- **2 importy łamią zasadę w 2 parach modułów**, oba to `import type` w `src/shared/quiz/types.ts`: `shared-types -> shared-media` (`MediaMap`) i `shared-types -> shared-quizzes` (`QuizResult`, `QuestionType`). Obie są na liście wyjątków (`scripts/arch-allowlist.json`) z opisem „do naprawy w 5.C”. Znikną dopiero po podziale `types.ts` (5.1, opcjonalne).
- **1 cykl** między modułami: `shared-quizzes` ↔ `shared-types`. Zniknie razem z podziałem `types.ts`.
- Reguły twarde (`media` nie zna domeny, `src/**` nie importuje `server/**`): 0 naruszeń, 0 wyjątków (`HARD_RULE_EXCEPTIONS` pusta).
- Importy z testów (336) są raportowane w tabeli, ale nigdy nie są naruszeniem.

## Historia

Liczba naruszeń (importy łamiące zasadę, w nawiasie pary modułów i cykle) po kolejnych etapach. Wszystkie wartości z uruchomienia skryptu na danym commicie.

| Etap | Commit | Naruszenia (importy) | Pary modułów | Cykle |
|---|---|---:|---:|---:|
| Pierwszy audyt | `a2591f2` | 36 (w tym 8 `import type`) | 21 | 3 |
| Po korekcie manifestu (decyzje a–f) | `94955b4` | 24 (7 typów) | 13 | 3 |
| Po fazie 1 (5.C: sloty UI, platforma, media i próby) | `6ccc533` | 9 (2 typy) | 5 | 2 |
| Po fazie 2 (5.C: hooki postępu, trasy generowania quizów) — stan teraz | `0d880c1` | 2 (2 typy) | 2 | 1 |

Kanarek (`tests/architecture.test.ts`) został dodany w `d70c869`. Od tego commita każdy nowy import łamiący granicę, nowy cykl albo wpis allowlisty, który już nie narusza zasady, przerywa `npm test`. Bramka lokalna (`npm run gate`) i CI uruchamiają ten test razem z resztą.

## Decyzje właściciela (korekta manifestu)

Commit „correct the module manifest” (`94955b4`) stosuje sześć decyzji. To decyzje projektowe, nie błędy audytu. Pliki i reguły zmieniono tylko w `scripts/arch-manifest.json`.

- **a)** `server/mcp/index.ts` → `root`. Jest kompozycją narzędzi MCP wszystkich modułów, więc składanie należy do roota. Zamknięte pary: `mcp-platform -> admin` (3), `-> learning` (1), `-> media` (1), `-> quizzes` (1).
- **b)** `src/shared/quiz/userHistory.ts` → `shared-classes` (test w `tests/` bez zmian, bo `tests` jest osobnym modułem). Zamknięta para `shared-quizzes -> shared-classes` (1, typ). Plik importuje `studentAnalysis` z `shared-classes`.
- **c)** `src/vite-env.d.ts` → `f-platform` (ambientne typy Vite). Lista nieprzypisanych plików jest pusta.
- **d)** `src/components/AppLayout.tsx` → `root` (składa widżety funkcji: `StreakChip`, `useTimezoneSync`, feedback). Zamknięta para `f-platform -> f-progress` (2). Pozostałe `src/components/**` zostają w `f-platform`.
- **e)** `src/features/results/useScoreColors.ts` i `src/features/results/Score.tsx` (`ScoreTag`, `ScoreProgress`) → `f-platform`, reguła przed ogólną regułą `src/features/results/**`. Te atomy są współdzielone przez klasy, quizy, wyniki i panel admina. Zamknięte pary: `f-quizzes -> f-results` (1). Pliki `AttemptsTable`/`AttemptDetails` zostają w `f-results`.
- **f)** `f-classes` może importować `f-results` (dodane do `allow`). Zamknięta para `f-classes -> f-results` (1).

Efekt: naruszenia 36 → 24 importów, pary 21 → 13. Pary, które zniknęły: `mcp-platform -> admin`, `mcp-platform -> learning`, `mcp-platform -> media`, `mcp-platform -> quizzes`, `f-platform -> f-progress`, `f-classes -> f-results`, `f-quizzes -> f-results`, `shared-quizzes -> shared-classes`.

Dla porównania, naruszenia przed korektą (`node scripts/arch-audit.mjs` na `a2591f2`): `f-classes -> f-results` 1, `f-learning -> f-progress` 2, `f-platform -> f-progress` 2, `f-platform -> shared-quizzes` 3 (typy), `f-quizzes -> f-progress` 2, `f-quizzes -> f-results` 1, `learning -> progress` 4, `mcp-platform -> admin` 3, `mcp-platform -> classes` 4 (1 typ), `mcp-platform -> learning` 1, `mcp-platform -> media` 1, `mcp-platform -> quizzes` 1, `mcp-platform -> shared-quizzes` 1, `media -> quizzes` 1, `platform -> shared-quizzes` 1, `quizzes -> classes` 2 (1 typ), `quizzes -> learning` 2, `quizzes -> progress` 1, `shared-quizzes -> shared-classes` 1 (typ), `shared-types -> shared-media` 1 (typ), `shared-types -> shared-quizzes` 1 (typ).

## Jak działa audyt

- **Manifest** (`scripts/arch-manifest.json`): reguły sprawdzane po kolei, pierwsza pasująca wygrywa. Wzorzec to dokładna ścieżka, prefiks katalogu (kończy się `/`) albo glob (`*` w segmencie, `**` między segmentami).
- **`allow`**: lista modułów, z których moduł może importować (siebie zawsze wolno). `*` oznacza dowolny moduł.
- **`open`**: moduły, które może importować każdy: `platform`, `mcp-platform`, `shared-platform`, `shared-types`, `f-platform`.
- **`incoming`**: kto może importować dany moduł. `admin` i `f-admin` tylko z `root`, `root` z nikogo.
- **Warstwy** (reguła dopisana ponad plan, bo plan jej wprost nie zapisał): plik w `src/**` nie importuje z `server/**`, a plik serwerowy (`server/`, `api-src/`, `scripts/`) importuje z `src/` tylko `src/shared/**`. Naruszenie tego typu to `tier`.
- **Reguły twarde** (`HARD_RULES` w `scripts/arch-core.mjs`): moduły `media`, `f-media` i `shared-media` nie importują domeny (`quizzes`, `learning`, `progress`, `classes`). Nie mają wpisów na liście wyjątków, więc naruszenie nie da się ukryć.
- **`shared-X`** to część współdzielona modułu X. Moduł może importować `shared-Y` tylko tam, gdzie wolno mu importować Y (domknięcie zbioru z planu).
- **Parser**: tekst jest czyszczony z komentarzy (znaki nowej linii zostają, więc numery linii są dokładne), następnie szukane są `import … from`, `export … from`, `import '…'`, `import('…')`, `require('…')`. Import `type` i lista `{ type X }` są oznaczane jako typowe. Wywołania `vi.mock` nie są czytane. Względne specyfikatory rozwiązywane są przez `.ts`, `.tsx`, `.mts`, `.cts`, `.mjs`, `.js`, `.jsx`, `.cjs`, `/index.*` i zamianę `.js` na `.ts`. W repo nie ma aliasów `paths`.
- **Wyjścia**: tabela krawędzi, naruszenia pogrupowane wg krawędzi, nieprzypisane pliki, cykle (Tarjan), nierozwiązane importy, importy dynamiczne, podsumowanie. `--json` daje to samo jako JSON; `--fail-on-violations` kończy się kodem 1, gdy są naruszenia; `--print-allowlist` wypisuje listę wyjątków (patrz „Kanarek”). Wynik jest deterministyczny.

## Decyzje i odchylenia od propozycji

1. `src/test/**` (`setup.ts`, `msw.ts`) przypisane do `tests`. Plan wymieniał tylko `*.test.*`, a to jest infrastruktura testów.
2. `admin`, `f-admin` i `root` mają `allow: *`, a ograniczenie wejścia realizuje `incoming`. Dla `tests` też `*`, bo jego krawędzi nikt nie sprawdza.
3. `shared-*` w `allow` to domknięcie zbiorów z planu. Np. `shared-quizzes` może importować `shared-platform` i `shared-media` (plan: „platform + media”), ale nie serwerowe pliki.
4. `platform` i `f-platform` nie importują nic poza `shared-*` (plan: „nothing”), a ich wejście jest otwarte.
5. `src/vite-env.d.ts` przypisany do `f-platform` (decyzja c).
6. CSS (`src/index.css`, `src/styles/*`) nie jest skanowane, bo nie tworzy krawędzi modułów.
7. Decyzje a–f: patrz wyżej. Propozycje naprawy 1, 3, 6, 8, 10, 11, 12 i 19 z pierwotnego audytu załatwiła korekta manifestu, bez zmian w kodzie.

## Manifest: podsumowanie

Pliki na moduł (stan `0d880c1`) i zbiór modułów, z których moduł może importować (`allow`; `open` i `incoming` opisane wyżej). `nic` oznacza brak importów w górę (poza `shared-*`, `platform` i `f-platform`, które nie importują nic poza częścią współdzieloną).

| Moduł | Pliki | Może importować (poza sobą) |
|---|---:|---|
| `admin` | 7 | `*` |
| `classes` | 12 | `platform`, `media`, `quizzes`, `learning`, `progress`, `shared-classes`, `shared-progress`, `shared-learning`, `shared-quizzes`, `shared-media`, `shared-platform` |
| `f-admin` | 7 | `*` |
| `f-classes` | 9 | `f-platform`, `f-media`, `f-quizzes`, `f-learning`, `f-progress`, `f-results`, `shared-classes`, `shared-progress`, `shared-learning`, `shared-quizzes`, `shared-media`, `shared-platform` |
| `f-learning` | 8 | `f-platform`, `f-media`, `f-quizzes`, `shared-learning`, `shared-quizzes`, `shared-media`, `shared-platform` |
| `f-media` | 14 | `f-platform`, `shared-media`, `shared-platform` |
| `f-platform` | 40 | nic |
| `f-progress` | 10 | `f-platform`, `f-media`, `f-quizzes`, `f-learning`, `shared-progress`, `shared-learning`, `shared-quizzes`, `shared-media`, `shared-platform` |
| `f-quizzes` | 12 | `f-platform`, `f-media`, `shared-quizzes`, `shared-media`, `shared-platform` |
| `f-results` | 3 | `f-platform`, `f-media`, `f-quizzes`, `f-learning`, `f-progress`, `f-classes`, `shared-classes`, `shared-progress`, `shared-learning`, `shared-quizzes`, `shared-media`, `shared-platform` |
| `learning` | 11 | `platform`, `media`, `quizzes`, `shared-learning`, `shared-quizzes`, `shared-media`, `shared-platform` |
| `mcp-platform` | 2 | nic |
| `media` | 23 | `platform`, `shared-media`, `shared-platform` |
| `platform` | 13 | nic |
| `progress` | 5 | `platform`, `media`, `quizzes`, `learning`, `shared-progress`, `shared-learning`, `shared-quizzes`, `shared-media`, `shared-platform` |
| `quizzes` | 7 | `platform`, `media`, `shared-quizzes`, `shared-media`, `shared-platform` |
| `root` | 32 | `*` |
| `shared-classes` | 4 | `shared-platform`, `shared-media`, `shared-quizzes`, `shared-learning`, `shared-progress` |
| `shared-learning` | 4 | `shared-platform`, `shared-media`, `shared-quizzes` |
| `shared-media` | 3 | `shared-platform` |
| `shared-platform` | 4 | nic |
| `shared-progress` | 1 | `shared-platform`, `shared-media`, `shared-quizzes`, `shared-learning` |
| `shared-quizzes` | 7 | `shared-platform`, `shared-media` |
| `shared-types` | 1 | nic |
| `tests` | 142 | `*` |

## Pełny wynik audytu

Wynik `node scripts/arch-audit.mjs` na commicie `0d880c1` (stan kodu). Naruszenia są pogrupowane wg krawędzi; `[reason]` to `not-allowed`, `incoming` lub `tier`.

```text
arch-audit (manifest v1, 26 rules)

## Modules (files)
admin                 7
classes              12
f-admin               7
f-classes             9
f-learning            8
f-media              14
f-platform           40
f-progress           10
f-quizzes            12
f-results             3
learning             11
mcp-platform          2
media                23
platform             13
progress              5
quizzes               7
root                 32
shared-classes        4
shared-learning       4
shared-media          3
shared-platform       4
shared-progress       1
shared-quizzes        7
shared-types          1
tests               142

## Module edges (cross-module imports)
admin -> classes                              7  ok
admin -> mcp-platform                         9  ok
admin -> platform                            13  ok
admin -> progress                             2  ok
admin -> quizzes                              1  ok
admin -> shared-classes                       3  ok
admin -> shared-learning                      1  ok
admin -> shared-platform                      3  ok
admin -> shared-quizzes                       5  ok
admin -> shared-types                         2  ok
classes -> learning                           4  ok
classes -> mcp-platform                      12  ok
classes -> platform                          12  ok
classes -> progress                           3  ok
classes -> quizzes                            2  ok
classes -> shared-classes                     4  ok
classes -> shared-learning                    2  ok
classes -> shared-platform                    2  ok
classes -> shared-quizzes                     3  ok
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
f-learning -> f-quizzes                       2  ok
f-learning -> shared-media                    1  ok
f-learning -> shared-types                    5  ok
f-media -> f-platform                         3  ok
f-media -> shared-media                      12  ok
f-platform -> shared-platform                 5  ok
f-platform -> shared-types                   10  ok
f-progress -> f-learning                      1  ok
f-progress -> f-media                         2  ok
f-progress -> f-platform                      5  ok
f-progress -> f-quizzes                       2  ok
f-progress -> shared-media                    1  ok
f-progress -> shared-types                    2  ok
f-quizzes -> f-media                         18  ok
f-quizzes -> f-platform                      10  ok
f-quizzes -> shared-media                     2  ok
f-quizzes -> shared-quizzes                  19  ok
f-quizzes -> shared-types                     4  ok
f-results -> f-platform                       3  ok
f-results -> shared-quizzes                   1  ok
f-results -> shared-types                     3  ok
learning -> mcp-platform                      2  ok
learning -> media                             5  ok
learning -> platform                          5  ok
learning -> quizzes                           2  ok
learning -> shared-learning                   1  ok
learning -> shared-media                      4  ok
learning -> shared-quizzes                    4  ok
learning -> shared-types                      5  ok
mcp-platform -> platform                      5  ok
mcp-platform -> shared-platform               1  ok
media -> mcp-platform                         2  ok
media -> platform                             7  ok
media -> shared-media                         5  ok
platform -> shared-platform                   2  ok
platform -> shared-types                      6  ok
progress -> learning                          5  ok
progress -> media                             1  ok
progress -> platform                          6  ok
progress -> quizzes                           4  ok
progress -> shared-learning                   4  ok
progress -> shared-progress                   2  ok
progress -> shared-quizzes                    3  ok
progress -> shared-types                      2  ok
quizzes -> mcp-platform                       2  ok
quizzes -> media                              5  ok
quizzes -> platform                           6  ok
quizzes -> shared-quizzes                    13  ok
quizzes -> shared-types                       6  ok
root -> admin                                 4  ok
root -> classes                               2  ok
root -> f-admin                               6  ok
root -> f-classes                            17  ok
root -> f-learning                           11  ok
root -> f-media                               3  ok
root -> f-platform                           77  ok
root -> f-progress                           13  ok
root -> f-quizzes                             9  ok
root -> f-results                             3  ok
root -> learning                              7  ok
root -> mcp-platform                          1  ok
root -> media                                 8  ok
root -> platform                             12  ok
root -> progress                              3  ok
root -> quizzes                               5  ok
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
tests -> f-progress                           9  ok
tests -> f-quizzes                           26  ok
tests -> f-results                            3  ok
tests -> learning                             8  ok
tests -> media                               19  ok
tests -> platform                             3  ok
tests -> quizzes                              2  ok
tests -> root                                20  ok
tests -> shared-classes                       8  ok
tests -> shared-learning                      7  ok
tests -> shared-media                         7  ok
tests -> shared-platform                      5  ok
tests -> shared-progress                      2  ok
tests -> shared-quizzes                      17  ok
tests -> shared-types                        10  ok

## Violations
[shared-types -> shared-media] 1 import(s), 1 type-only
  src/shared/quiz/types.ts:2  shared-types -> shared-media  ../media/types  [not-allowed] (type-only)
[shared-types -> shared-quizzes] 1 import(s), 1 type-only
  src/shared/quiz/types.ts:1  shared-types -> shared-quizzes  ./engine  [not-allowed] (type-only)

## Unassigned files
none

## Cycles (between modules)
cycle 1: shared-quizzes, shared-types
  shared-quizzes -> shared-types (3)
  shared-types -> shared-quizzes (1)

## Unresolved relative imports
none

## Dynamic (non-literal) import/require
scripts/dev-server.mjs:52  import(...)

## Summary
filesScanned: 381
filesAssigned: 381
filesUnassigned: 0
nonCodeFilesSkipped: 12
importEdges: 1169
crossModuleEdgePairs: 129
violatingImports: 2
violatingImportsTypeOnly: 2
violatingModulePairs: 2
cycles: 1
unresolvedRelative: 0
dynamicSpecifiers: 1
externalPackageImports: 821
assetImportsIgnored: 2
importsOutsideScope: 0
testEdges: 336
```

## Stan napraw

Każda krawędź, która naruszała zasadę przy pierwszym audycie (numeracja jak w pierwotnej liście propozycji), z commitem, który ją usunął. Commity fazy 1 i 2 to scalenia gałęzi (`Merge phase …`) albo commity na `vercel-neon`. Zapis „pozostaje: typy, 5.D” oznacza, że naprawa wymaga podziału `types.ts`, czyli przenoszenia plików.

| # | Krawędź (przed) | Naprawa | Commit | Stan |
|---|---|---|---|---|
| 1 | `f-classes -> f-results` | przeniesienie `StudentResultsView` odrzucone: zamknięte decyzją f (`f-classes` może importować `f-results`) | `94955b4` | zamknięte (manifest) |
| 2 | `f-learning -> f-progress` (`WeakMark`, 2) | slot `renderBadge` w `VerbSlide`/`VerbTable`, składany w `LessonView`/`Verbs` | `450cd0b` (1A) | zrobione |
| 3 | `f-platform -> f-progress` (`AppLayout`, 2) | `AppLayout` do `root` (decyzja d) | `94955b4` | zamknięte (manifest) |
| 4 | `f-platform -> shared-quizzes` (typy tokenów i uwag, 3) | schematy tokenów, uwag i Auth0 id w `src/shared/platform/schema.ts` | `bfb1a42` (1B) | zrobione |
| 5 | `f-quizzes -> f-progress` (`ResultView`, 2) | sloty `resultFooter` i `reviewActionFor` w `QuizPlayer`, składane w `pages/QuizPlay.tsx` (`ProgressLine`, `NextReviewButton`) | `450cd0b` (1A) | zrobione |
| 6 | `f-quizzes -> f-results` (`useScoreColors`, 1) | `useScoreColors` i `ScoreTag`/`ScoreProgress` w `f-platform` (decyzja e) | `94955b4` | zamknięte (manifest) |
| 7 | `learning -> progress` (hooki i rejestracja, 4) | `afterSave` powtórek i aktywności w `server/progressHooks.ts`; zdarzenie „lekcja ukończona” w `server/lessonHooks.ts` i `lessonRegistry.ts`; `learning` zostaje z `beforeSave` egzaminu (`learningGradeHooks.ts`) | `addd37a` (2A) | zrobione (inna lokalizacja niż w propozycji) |
| 8 | `mcp-platform -> admin` (`index.ts`, 3) | `server/mcp/index.ts` do `root` (decyzja a) | `94955b4` | zamknięte (manifest) |
| 9 | `mcp-platform -> classes` (`context.ts`, `tools/shared.ts`, 3) | `Viewer`/`viewerOf` w `server/viewer.ts` (platform); guardy klas w `server/mcp/tools/classGuards.ts` (classes) | `bfb1a42` (1B) | zrobione (guardy w `classGuards.ts`, nie w `tools/classes.ts`) |
| 10 | `mcp-platform -> learning` (`index.ts`) | montowanie w roocie (decyzja a); `verbs_list` i `verb_set_image` w `server/mcp/lessonTools.ts` (learning) | `94955b4`, `0d880c1` (2B) | zrobione |
| 11 | `mcp-platform -> media` (`index.ts`) | montowanie w roocie (decyzja a) | `94955b4` | zamknięte (manifest) |
| 12 | `mcp-platform -> quizzes` (`index.ts`) | montowanie w roocie (decyzja a) | `94955b4` | zamknięte (manifest) |
| 13 | `mcp-platform -> shared-quizzes` (`tools/shared.ts`, auth0 id) | schemat Auth0 id w `src/shared/platform/` | `bfb1a42` (1B) | zrobione |
| 14 | `media -> quizzes` (`tools/media.ts`, `quizRepo`) | narzędzia mediów dostają opisy właścicieli przez `MediaToolDeps` (`ownerLabels` z `server/mcp/index.ts`); czysta funkcja `server/media/ownerNames.ts`. Narzędzia `quiz_*` zostają w quizach | `db5d02a` (1C) | zrobione (wstrzyknięcie zamiast przeniesienia narzędzia) |
| 15 | `platform -> shared-quizzes` (`routes/tokens.ts`) | jak w 4 | `bfb1a42` (1B) | zrobione |
| 16 | `quizzes -> classes` (`attemptsRepo.ts`, `questionDetails`, `AttemptRow`, 2) | `server/attemptDetails.ts` (quizzes); klasy importują stamtąd | `db5d02a` (1C) | zrobione |
| 17 | `quizzes -> learning` (generator z czasowników, 2) | trasy `generate/irregular-verbs` i `retry-wrong` w `server/routes/verbQuizzes.ts` (module **progress**, bo `onlyWeak` czyta powtórki); narzędzia `verbs_list`/`verb_set_image` w learning | `0d880c1` (2B) | zrobione (generator zostaje w `irregularVerbs.ts`, trasy idą do progress) |
| 18 | `quizzes -> progress` (`reviewsRepo`, 1) | jak w 17: `server/routes/verbQuizzes.ts` | `0d880c1` (2B) | zrobione |
| 19 | `shared-quizzes -> shared-classes` (`userHistory.ts`, 1 typ) | decyzja b: plik do `shared-classes` | `94955b4` | zamknięte (manifest) |
| 20 | `shared-types -> shared-media` (`MediaMap`, typ) | pozostaje: typy, 5.D (podział `types.ts`) | — | **otwarte** (allowlista) |
| 21 | `shared-types -> shared-quizzes` (`QuizResult`, `QuestionType`, typy) i cykl `shared-quizzes` ↔ `shared-types` | pozostaje: typy, 5.D (podział `types.ts`) | — | **otwarte** (allowlista, cykl w `EXPECTED_CYCLES`) |

Poza numeracją z pierwotnej listy zamknięto jeszcze: `quizzes -> classes` (drugi import, typ, też w 16), `f-platform -> shared-quizzes` (dwa pozostałe pliki, `features/auth/api.ts`, `features/feedback/api.ts`, w 4) i wyjątek twardej reguły `media-no-domain` (`server/mcp/tools/media.ts → server/quizRepo.ts`, naprawa 14; lista `HARD_RULE_EXCEPTIONS` jest pusta).

## Cykle

Pierwotne trzy cykle (serwerowy z 6 modułami, frontendowy z 3 i `shared-*` z 2) zniknęły poza jednym:

- **Cykl serwerowy** (`classes`, `learning`, `mcp-platform`, `media`, `progress`, `quizzes`): zamknięty naprawami 7, 8–12, 14, 16–18 (faza 1 i 2 oraz korekta manifestu).
- **Cykl frontendowy** (`f-learning`, `f-progress`, `f-quizzes`): zamknięty naprawami 2 i 5 (faza 1A).
- **Cykl `shared-*`** (`shared-quizzes`, `shared-types`): **pozostaje** do podziału `types.ts` (naprawa 21, 5.D). Skrypt liczy go jako cykl, kanarek zna jego skład (`EXPECTED_CYCLES`).

## Podział `src/shared/quiz/types.ts` (propozycja, 5.D, nie zrobione)

Plik ma około 460 linii i mieszankę wszystkich modułów. Proponowany przydział eksportów:

| Eksport | Proponowany moduł | Uwagi |
|---|---|---|
| `QuizSummary`, `QuizOption`, `QuizQuestion`, `QuizDetail`, `AttemptSummary`, `GradedAttempt` | `shared-quizzes` | `GradedAttempt` opiera się na `QuizResult` z `engine.ts` (już w `shared-quizzes`) |
| `SUBJECTS`, `SubjectCode`, `SUBJECT_LABELS` | `shared-quizzes` | przedmioty quizów, używane przez `subjectGroups` |
| `DifficultyCode`, `PopularityCode`, `PatternCode`, `DIFFICULTY_LABELS`, `POPULARITY_LABELS` | `shared-learning` | katalog czasowników; lista quizów filtruje po trudności, więc to otwarte: wspólny `shared-catalog` albo zostawić w `shared-quizzes` |
| `IrregularVerb`, `CourseSummary`, `CourseDetail`, `LessonSummary`, `LessonDetail`, `WeakVerb` | `shared-learning` | kursy, lekcje i słabe czasowniki (`weak.ts`) |
| `ProgressSummary`, `ReviewSummary` | `shared-progress` | seria, cel dzienny, powtórki (`streaks.ts`) |
| `ApiTokenSummary`, `CreatedApiToken`, `FeedbackKind`, `FeedbackStatus`, `FeedbackContext`, `FeedbackItem`, `MANAGED_ROLES`, `ManagedRole`, `AppSettings` | `shared-platform` | tokeny, uwagi, role i ustawienia aplikacji (globalne) |
| `AdminUser`, `AdminUsersPage`, `AuditEntry` | nowy `shared-admin` | tylko panel admina; wymaga wpisu w manifeście |
| `AdminStudentAttempt`, `AdminStudentResults`, `AdminStudentListItem` | `shared-classes` (lub `shared-admin`) | `userHistory.ts` (`shared-classes`) importuje `AdminStudentAttempt`, więc to musi się rozstrzygnąć przy podziale |
| `ClassSummary`, `ClassMember`, `AssignmentItem`, `AssignmentStatus`, `MyAssignment`, `MyClass`, `ClassReportRow`, `ClassReport`, `ClassDetail` | `shared-classes` | klasy i zadania |
| `StudentAttemptQuestion`, `StudentAttempt`, `StudentAssignmentProgress`, `StudentResults`, `StudentCandidate`, `StudentListItem` | `shared-classes` | wyniki ucznia w klasie |

Po rozdzieleniu `types.ts` znikają krawędzie `shared-types -> *` (naprawy 20–21) i cykl. Dziś `shared-types` importuje z `shared-media` (`MediaMap`) i z `shared-quizzes` (`QuizResult`, `QuestionType`), więc nawet jako „nośnik typów” nie jest czysty.

## Kanarek

Test `tests/architecture.test.ts` działa w `npm test` (ok. 0,4 s). Analizę robi `scripts/arch-core.mjs` (czysta funkcja `auditRepo(rootDir)`, bez wypisywania i bez `exit`); `scripts/arch-audit.mjs` to tylko CLI. Test porównuje wynik z `scripts/arch-allowlist.json` i sprawdza siedem rzeczy:

1. **Nowe naruszenie.** Para plik → plik, która narusza granicę i nie jest na liście. Komunikat wypisuje `plik -> cel (moduł -> moduł)` i podpowiada: `napraw import albo (wyjątkowo) dopisz do scripts/arch-allowlist.json z uzasadnieniem`. Domyślna odpowiedź to naprawa importu (stan napraw wyżej). Wpis na liście wymaga uzasadnienia w review.
2. **Wpis nieaktualny.** Wpis, który już nie narusza granicy (plik usunięty, import naprawiony). Komunikat kończy się `usuń z scripts/arch-allowlist.json`. Dzięki temu lista tylko się kurczy.
3. **Pole `pair`.** Musi zgadzać się z aktualnym modułem plików. Inaczej test prosi o poprawienie pola (np. po przeniesieniu pliku między modułami).
4. **Cykle.** Liczba cykli modułów nie może wzrosnąć, a każdy cykl musi mieć skład znany z `EXPECTED_CYCLES` w teście (dziś: `shared-quizzes`, `shared-types`). Nowy cykl albo większy skład pada. Usunięty cykl jest w porządku (wtedy lista w teście też się skraca).
5. **Reguły twarde** (`HARD_RULES` w `arch-core.mjs`), niezależne od listy: moduły `media`, `f-media`, `shared-media` nie importują domeny (`quizzes`, `learning`, `progress`, `classes`), a `src/**` nie importuje `server/**`. Wpis allowlisty nie może ukrywać takiego importu. Lista wyjątków `HARD_RULE_EXCEPTIONS` jest pusta (wyjątek `media -> quizzes` zlikwidowano w naprawie 14, `db5d02a`); pusta lista też jest sprawdzana: wyjątek, który już nie narusza, pada z komunikatem `usuń wyjątek`.
6. **Plik poza modułami.** Każdy plik kodu musi pasować do reguły z manifestu. Plik bez modułu nie jest oceniany przez krawędzie, więc bez tego testu mógłby importować cokolwiek; test pada z komunikatem `plik poza modułami: dodaj regułę do scripts/arch-manifest.json`.
7. **Dynamiczny import bez literału.** `import(x)` i `require(x)` z argumentem niebędącym literałem ukrywają cel przed grafem; w `server/**` i `src/**` nie mogą wystąpić (w `scripts/dev-server.mjs` jeden przypadek zostaje, poza zakresem). Test wypisuje plik i linię.

**Jak czytać porażkę.** Nazwa testu mówi, która reguła padła, a komunikat wypisuje pliki i pary modułów. Dla każdego naruszenia wybierz: naprawić import (zwykle najlepsze), albo dopisać wpis z `reason` (rzadko, z review). Wpis nieaktualny zawsze się usuwa.

**Jak regenerować listę.** `node scripts/arch-audit.mjs --print-allowlist` wypisuje JSON (`$comment` i `entries`) dla bieżących naruszeń, z `reason` `do naprawy w 5.C`. Służy do przeglądu, nie do dopisywania: po naprawie porównaj wynik z plikiem (`diff`), powinny zniknąć wyłącznie wpisy naprawionych naruszeń. Obecny plik ma 2 wpisy (typy `shared-types`).

**Test syntetyczny.** Ostatni test buduje w `os.tmpdir()` drzewo z dwoma modułami i jednym naruszeniem, wpisem nieaktualnym, importem `media -> quizzes` i cyklem, i sprawdza, że kanarek to wszystko wykrywa. Dzięki temu porażka nie jest jedynym dowodem, że kanarek działa. Drugi test syntetyczny buduje drzewo z plikiem bez modułu importującym `./quizRepo` (obejście, które bez kontroli nieprzypisanych plików przechodzi zielono) oraz z `import(x)` i `require(x)`, i sprawdza, że oba są wykrywane.

## Ograniczenia pomiaru

- Parser działa na tekście, nie na AST. Komentarze są usuwane, zawartość stringów zostaje w analizie importów (wymagane przez specyfikatory). Literały regex zawierające cudzysłowy mogą zakłócić czyszczenie, ale dotyczy to najwyżej jednej linii, bo cudzysłów kończy się przy nowej linii.
- Importy dynamiczne bez literału nie są rozwiązywane. Jest jeden taki przypadek: `scripts/dev-server.mjs:52` (`import(bundle.href)`), wypisany w sekcji „Dynamic”. Nie wpływa na wyniki modułowe, bo ładuje zbudowany bundle.
- Pliki `.d.ts` i CSS są pomijane albo nieprzypisane (patrz wyżej).
- `vi.mock` i `vi.importActual` w testach nie są czytane. Testy nie są źródłem naruszeń, więc nie wpływa to na wynik.
- Wynik dotyczy stanu kodu w commicie `0d880c1`. Po podziale `types.ts` (5.D) trzeba go uruchomić ponownie: `npm run arch:audit`, a w kanarku `node scripts/arch-audit.mjs --fail-on-violations`. Przeniesienie plików zmieni też pola `pair` w allowlistcie (kanarek to zgłosi).
