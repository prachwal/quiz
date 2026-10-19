---
tags:
  - docs
  - quiz
  - frontend
  - backend
created: 2026-10-19
updated: 2026-10-19
---

# Plan: nowe typy pytań i materiały wspólne

Stan: `single`, `multiple`, `truefalse`, `text` - wszystkie opierają się na tabeli `options` (tekst + `isCorrect`) - oraz **`numeric`** (wynik liczbowy z tolerancją), **`ordering`** (elementy do ułożenia), **`matching`** (pary) i **`cloze`** (luki w treści), które trzymają dane w `questions.config` (JSONB). Ocena jest tylko po stronie serwera (`src/shared/quiz/engine.ts`, rejestr `questionTypes`). Pozostałe typy z tabeli poniżej są nadal niezrealizowane.

Plan wykonawczy (decyzje, kolejnosc commitow, kontrakty, kryteria akceptacji): [question-types-plan.md](question-types-plan.md).

## Typy do dodania

| Typ | Zastosowanie | Ocena |
| --- | ------------ | ----- |
| `numeric` ✅ | matematyka, fizyka, chemia: wynik liczbowy | tolerancja (bezwzględna/względna), jednostka, przecinek jako separator, ułamki |
| `matching` ✅ | języki (słowo-tłumaczenie), historia (wydarzenie-data), biologia (narząd-funkcja) | proporcjonalnie po parach; prawa kolumna tasowana przez serwer, kafelek należy do jednej pary |
| `ordering` ✅ | chronologia, etapy procesów, algorytmy | 0/1 za całą sekwencję; serwer tasuje elementy, gracz układa przyciskami w górę/w dół |
| `cloze` ✅ | gramatyka, odmiana czasowników, brakujące pojęcia | proporcjonalnie po lukach; 1–10 wariantów na lukę (każdy 1–200 znaków), znaczniki `{{n}}` bez zer wiodących tylko w treści |
| `categorization` | klasyfikacja organizmów, części mowy, związków | element -> grupa; jak `matching` z grupami |
| `expression` | równania, równoważne zapisy (`1/2` = `0,5`) | porównanie symboliczne (biblioteka CAS), dużo przypadków brzegowych |
| `hotspot` | mapa, anatomia, geometria | punkt w obszarze; wymaga przechowywania obrazów |
| `open` | uzasadnienie, interpretacja, dowód | kryteria oceniane przez nauczyciela lub AI z korektą; wyłamuje się z zasady „ocena tylko automatyczna po stronie serwera" |

Kolejność wdrożenia: **`numeric`, `ordering`, `matching`, `cloze`** ✅ (zrobione, patrz tabela niżej), potem `categorization`, a `expression`, `hotspot` i `open` jako osobne projekty.

## Stan wdrożenia

| Typ | Silnik | Edytor | Gracz | Testy |
| --- | ------ | ------- | ----- | ----- |
| `numeric` | `engine.ts` → `numeric` | `ConfigEditor` → `NumericEditor` | `questionRenderers` → `Numeric` | `tests/engine.test.ts`, `tests/quizSchema.test.ts` |
| `ordering` | `engine.ts` → `ordering` | `ConfigEditor` → `OrderingEditor` | `questionRenderers` → `Ordering` | `tests/engine.test.ts`, `orderingRenderer.test.tsx` |
| `matching` | `engine.ts` → `matching` | `ConfigEditor` → `MatchingEditor` | `questionRenderers` → `Matching` | `tests/engine.test.ts`, `matchingRenderer.test.tsx` |
| `cloze` | `engine.ts` → `cloze` | `ConfigEditor` → `ClozeEditor` | `questionRenderers` → `Cloze` | `tests/engine.test.ts`, `clozeRenderer.test.tsx` |

Nowe typy trzymają dane w `questions.config` (JSONB, migracja `20261019120000_question_config.sql`),
nie w `options`, i nie ujawniają odpowiedzi w `GET /api/quizzes/:id`.

## Zmiany w modelu danych

1. **Dane osobne dla każdego typu.** Nowa kolumna `questions.config jsonb` (np. tolerancja dla `numeric`, pary dla `matching`, treść z lukami dla `cloze`). `options` zostaje dla czterech istniejących typów, żeby stare pytania działały bez migracji danych.
2. **Wersjonowanie schematu.** ~~Pole `schemaVersion` w obiekcie quizu i w `config` pytania; walidacja i `data/quiz.schema.json` rozróżniają wersje, a eksport/import (`scripts/quiz-tool.mjs`) zapisuje bieżącą.~~ **Nie zrobione i celowo odłożone**: `config` jest wersjonowane przez sam kształt (klucz `items`/`pairs`/`gaps`), a walidacja odrzuca nieznane kształty. Osobne pole wersji będzie potrzebne dopiero przy zmianie znaczenia istniejącego klucza.
3. **Widok gracza bez odpowiedzi.** Dla każdego typu trzeba zdefiniować, co `GET /api/quizzes/:id` może ujawnić (np. dla `matching` - tasowane obie kolumny, bez par; dla `numeric` - bez wyniku i tolerancji).
4. **Wynik odpowiedzi.** `quiz_attempts` przechowuje odpowiedzi per pytanie; trzeba ustalić format odpowiedzi dla typów złożonych (lista par, kolejność, mapa luk) i sposób pokazania ich w przeglądzie wyników (`AttemptsTable`, widoki ucznia/admina).

## Materiał wspólny do kilku pytań

Tekst, tabela, obraz, wykres lub nagranie dołączone do grupy pytań (czytanie ze zrozumieniem, słuchanie, analiza danych).

- Nowa tabela `quiz_passages` (quiz, kolejność, rodzaj, treść/URL) i `questions.passage_id`.
- Edytor: dodawanie materiału i przypisywanie do niego pytań; odtwarzacz: materiał widoczny nad pytaniami grupy.
- Zależność z losowaniem puli (`sample_size`, `shuffle_questions`): pytania z jednego materiału nie powinny być rozdzielane ani losowane pojedynczo.
- Obrazy i nagrania wymagają magazynu plików (dziś go nie ma); wersja tylko z tekstem i tabelami nie.

## Miejsca w kodzie do zmiany przy każdym nowym typie

- `src/shared/quiz/engine.ts` (`QUESTION_TYPES`, `questionTypes`: walidacja + ocena + widok gracza) i `schema.ts` (zod)
- `src/features/quizzes/questionRenderers.tsx` (input gracza), `OptionsEditor.tsx` (edytor), `QuizPlayer.tsx`
- `server/quizRepo.ts`, `server/mcp/quizTools.ts` (opis typów w narzędziach), `data/quiz.schema.json` i `tests/quizSchema.test.ts`
- testy: `tests/engine.test.ts`, `scripts/mcp-local-e2e.ts`
- generator quizów czasowników (`server/irregularVerbs.ts`) powinien nadal produkować tylko dotychczasowe typy bez zmian zachowania

## Szacunek pracy

Razem z testami i wdrożeniem, w dniach pracy:

| Zakres | Czas |
| ------ | ---- |
| fundament (`config`, wersjonowanie, przepisanie rejestru typów, test regresji czterech typów) | ok. 1 |
| `numeric` | 0,5 |
| `ordering` (przeciąganie na telefonie to główny koszt) | 0,5-1 |
| `matching` | 1 |
| `cloze` | 1 |
| `categorization` | 1 |
| materiał wspólny: tekst i tabele | 2-3 (obrazy i nagrania drugie tyle) |
| `expression` | 2-3 lub więcej |
| `hotspot` | 2-3 |
| `open` | 3+ i osobny projekt |

Fundament plus cztery pierwsze typy: ok. tygodnia. Największe ryzyko to zgodność ze starymi i wygenerowanymi quizami, więc zaczynamy od fundamentu i `numeric` jako pierwszego przyrostu.

## Do rozstrzygnięcia przed startem

- ~~punktacja częściowa dla `matching`, `ordering`, `cloze` (całość czy proporcjonalnie)?~~ → `ordering` 0/1 za całą sekwencję, `matching` i `cloze` proporcjonalnie.
- ~~czy `numeric` ma akceptować jednostki i które notacje (`1e3`, ułamki zwykłe)?~~ → przecinek/kropka, ułamki i `1e3` tak; jednostki i `%` nie (jednostka w treści pytania).
- skąd brać obrazy/nagrania (obiektowy storage, adres zewnętrzny)?
- czy `open` ma w ogóle trafić do aplikacji (zmiana zasady „ocena tylko automatyczna")?
