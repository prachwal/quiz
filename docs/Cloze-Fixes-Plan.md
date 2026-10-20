---
tags:
  - quiz
  - backend
  - frontend
  - testing
  - plan
  - status/todo
created: 2026-10-19
updated: 2026-10-20
---

# Typ `cloze` (uzupełnianie luk) — plan poprawek

> Cztery błędy wykryte w analizie typu `cloze` 2026-10-19, każdy odtworzony na kodzie. Dokument opisuje poprawki, decyzje do podjęcia, kolejność commitów i testy. Stan: F1–F4 wdrożone (commity 1–4), D1 wdrożone (commit 5, decyzja D-B: tak, tylko `cloze`).

## Zakres

Dotyczy pytań typu `cloze`: treść ze znacznikami `{{1}}…{{n}}` i luki w `questions.config` (`{gaps: [{answers: []}]}`). Kod: [engine.ts](../src/shared/quiz/engine.ts) (`clozeMarkers`, `clozeConfig`, `questionTypes.cloze`, `normalizeText`, `promptText`), [schema.ts](../src/shared/quiz/schema.ts), [questionRenderers.tsx](../src/features/quizzes/questionRenderers.tsx) (`Cloze`), [ConfigEditor.tsx](../src/features/quizzes/ConfigEditor.tsx) (`ClozeEditor`), [quiz.schema.json](../data/quiz.schema.json).

Poza zakresem: pozostałe uwagi z przeglądu kodu (kolejność w `ordering`/`matching`, `withShownOrders`, długość `id` w `config`) — osobne zadania; zbliżony rozjazd zod/JSON Schema dla `ordering` i `matching` zostaje na później.

## Wykryte błędy

| # | Błąd | Skutek | Waga |
| --- | --- | --- | --- |
| B1 | Znacznik `{{01}}` przechodzi walidację, ale odpowiedź ląduje pod kluczem `"01"`, a ocena czyta `"1"` | pytanie, na które nie da się odpowiedzieć; zawsze 0 punktów, a `isAnswered` liczy je jako udzielone | średnia (rzadkie wejście, ciche skutki) |
| B2 | `normalizeText` nie składa typograficznych znaków: `don't` ≠ `don’t`, `well-known` ≠ `well–known`, `went.` ≠ `went` | poprawna odpowiedź wpisana na telefonie (iOS „smart punctuation”) liczona jako błędna | wysoka dla quizów angielskich |
| B3 | Zod nie egzekwuje limitów z `quiz.schema.json`: odpowiedź ≤ 200 znaków, ≤ 10 wariantów na lukę, bez pustych | serwer przyjmuje odpowiedź 5000 znaków, 50 wariantów i pusty wariant (w przeglądzie wynik wygląda jak `1:  / went`) | niska–średnia |
| B4 | `tokenSeparators={[',']}` w edytorze luk ([ConfigEditor.tsx:266](../src/features/quizzes/ConfigEditor.tsx#L266)) | nie da się wpisać akceptowanej odpowiedzi z przecinkiem (`Hello, world`, `1,5`); zostaje rozbita na dwie | średnia |

Dane w bazie sprawdzone (tylko odczyt): **16 pytań `cloze`**, żadne nie ma `{{0n}}` w treści, odpowiedzi dłuższej niż 200 znaków lub pustej, luki z więcej niż 10 wariantami ani odpowiedzi z przecinkiem. **Migracja danych nie jest potrzebna.**

## Poprawki

### F1 — kanoniczny znacznik (B1)

Jedna definicja znacznika: liczba całkowita ≥ 1 bez zer wiodących, `/\{\{([1-9]\d*)\}\}/g`.

- W `engine.ts` wyeksportować stałą (np. `CLOZE_MARKER`) i użyć jej w `clozeMarkers`, `promptText` oraz w rendererze (`split`), żeby trzy miejsca nie mogły się rozjechać.
- `{{01}}` przestaje być znacznikiem. Walidacja zgłasza wtedy istniejący błąd „Treść musi zawierać znaczniki {{1}}… — każdy dokładnie raz”, więc autor od razu widzi problem. Dodać do komunikatu wzmiankę, że numery piszemy bez zer.
- Zamiast cichego błędu przy odpowiedzi: błąd przy zapisie.

Pliki: `engine.ts`, `questionRenderers.tsx`. Brak zmian w bazie.

### F2 — składanie typograficznych znaków (B2)

Rozszerzyć `normalizeText` (wspólny dla `text`, `cloze`, `ordering`, `matching`) o bezpieczne składanie:

| Wejście | Wynik |
| --- | --- |
| `’` `‘` `ʼ` `` ` `` | `'` |
| `“` `”` `„` | `"` |
| `–` `—` `‑` (U+2011) `−` | `-` |

Zostaje bez zmian: wielkość liter, spacje (już składane), **polskie znaki diakrytyczne** (istniejący test „case, whitespace and diacritic sensitive” musi przejść), kolejność znaków.

Wspólny `normalizeText` oznacza, że poprawka dotyka też `text`, `ordering` i `matching` — to zamierzone (ten sam problem z klawiaturą), ale wymaga testów dla każdego z nich, a nie tylko dla `cloze`.

**Osobna decyzja D1:** zdejmowanie końcowej interpunkcji zdania (`.`, `!`, `?`). Przy `text` zmienia znaczenie odpowiedzi (np. „3.” vs „3”), a przy `numeric` jest już obsłużone osobno. Rekomendacja: **tylko dla `cloze`** (luka to słowo, nie zdanie), w osobnej funkcji `normalizeGapAnswer = (v) => normalizeText(v).replace(/[.!?]+$/, '')`, stosowanej po obu stronach porównania.

Pliki: `engine.ts`; testy w `tests/engine.test.ts`.

### F3 — limity przy zapisie (B3)

Limity z JSON Schema stają się regułami `validate` dla `cloze`:

- co najwyżej 10 wariantów na lukę (stała, np. `CLOZE_MAX_VARIANTS`),
- każdy wariant 1–200 znaków po przycięciu,
- brak pustych i samych białych znaków wariantów (dziś odrzucana jest tylko luka, w której **wszystkie** warianty są puste),
- komunikaty po polsku, w stylu istniejących („Uzupełnij akceptowane odpowiedzi w każdej luce”).

Ważne: limity tylko w `validate` (zapis), nie w `clozeConfig` (odczyt). `clozeConfig` służy też do oceny i widoku gracza, więc zaostrzenie go sprawiłoby, że stare pytania zwracałyby `null` i dawały 0 punktów. Dane w bazie są czyste, ale zasada obowiązuje na przyszłość.

Dodać do `tests/quizSchema.test.ts` przypadki zgodności zod ↔ JSON Schema (11 wariantów, 201 znaków, pusty wariant, wariant ze spacji) — oba walidatory mają je odrzucać.

Pliki: `engine.ts`, `data/quiz.schema.json` (jeśli któryś limit się zmienia), `tests/quizSchema.test.ts`, `tests/engine.test.ts`.

### F4 — przecinek w odpowiedzi (B4)

- Usunąć `tokenSeparators={[',']}` z `ClozeEditor`; warianty dodaje się klawiszem Enter lub opuszczeniem pola (tak jak podpowiada placeholder). Wklejenie „went, gone” nie rozbija się już automatycznie.
- Przy zmianie przycinać wpisy, odrzucać puste i duplikaty (bez względu na wielkość liter), żeby nie zbierać śmieci pasujących do F3.
- Zaktualizować tekst pomocniczy nad edytorem (bez wzmianki o separatorze).

Pliki: `ConfigEditor.tsx`; test w `QuizEditor.config.test.tsx` („Hello, world” + Enter daje jedną odpowiedź).

## Kolejność i commity

| # | Commit | Zakres |
| --- | --- | --- |
| 1 | `fix(engine): one canonical cloze marker` | F1 + testy |
| 2 | `fix(engine): fold typographic quotes and dashes when comparing answers` | F2 (bez D1) + testy dla `text`, `cloze`, `ordering`, `matching` |
| 3 | `fix(schema): enforce the cloze answer limits on save` | F3 + testy zgodności |
| 4 | `fix(quiz): keep commas inside a cloze answer` | F4 + test edytora |
| 5 | `feat(engine): ignore trailing punctuation in cloze gaps` (zrobione) | `normalizeGapAnswer` |

Przed każdym commitem: `npm run lint`, `npm test`, `npm run test:ui`, `npm run build`; po commitach dotykających serwera `npm run build:api` (bundle `api/index.mjs` jest w repo) i `MCP_E2E_ALLOW_REMOTE_DB=1 npm run test:mcp`.

Commity 1–3 mogą iść razem w jednym PR; 4 jest niezależny (tylko frontend).

## Testy

| Poprawka | Przypadki |
| --- | --- |
| F1 | `{{01}}` i `{{1}}{{1}}` odrzucone przez `validate`; `clozeMarkers('a {{01}}')` zwraca `[]`; `promptText` zostawia `{{01}}` bez zmian; renderer nie robi pola z `{{01}}` |
| F2 | `don’t` = `don't`; `„a”` = `"a"`; `well–known` = `well-known`; `Do szkoły` ≠ `do szkoly` (diakrytyki zostają); to samo w `text`, `ordering` i `matching` |
| F3 | 11 wariantów, 201 znaków, wariant pusty i z samych spacji odrzucone; 10 wariantów i 200 znaków przyjęte; stare dane (np. 5000 znaków) nadal się oceniają |
| F4 | wpis z przecinkiem + Enter = jedna odpowiedź; duplikat i pusty wpis ignorowane |
| D1 | `went.` = `went` w `cloze`, ale `3.` ≠ `3` w `text` |

Oba walidatory (zod i JSON Schema) muszą dawać ten sam wynik na nowych przypadkach (`tests/quizSchema.test.ts`).

## Decyzje do podjęcia

1. **D1** — zdejmować końcową interpunkcję w lukach? Decyzja: tak, tylko dla `cloze` (commit 5, zrobione).
2. **D2** — czy F2 (składanie cudzysłowów i myślników) ma dotyczyć także `text`/`ordering`/`matching`, czy tylko `cloze`? Rekomendacja: wszystkie; ten sam problem z klawiaturą, a ryzyko regresji niskie, bo składane znaki nie występują w dotychczasowych odpowiedziach (sprawdzić zapytaniem przed wdrożeniem).
3. **D3** — czy odrzucać pusty wariant przy zapisie (F3), czy go po cichu usuwać? Rekomendacja: odrzucać z komunikatem, bo cicha zmiana autorskich danych utrudnia debugowanie.

## Ryzyka

- **Zmiana oceny wstecz:** F2 i D1 mogą zmienić wynik już zapisanych odpowiedzi tylko przy ponownej ocenie; zapisane podejścia (`quiz_attempts.results`) nie są przeliczane, więc historia się nie zmienia.
- **Zgodność klientów MCP:** nowe limity (F3) mogą odrzucić quiz, który wcześniej przechodził. Komunikat błędu musi wskazywać pole i limit; zmiana jest zgodna z opublikowanym JSON Schema, więc poprawnie napisany klient nie powinien jej odczuć.
- **Wspólny `normalizeText`:** poprawka F2 dotyka czterech typów naraz, dlatego osobny commit z pełnym zestawem testów.

## Kolejne kroki (poza tym planem)

- **Statystyka per luka** w `quiz_stats`: dziś `topAnswers` dla `cloze` to całe napisy w rodzaju „1: a; 2: x; 3: c”, więc kombinacje rozbijają liczności. Wymaga rozstrzygnięcia D2 z [[MCP-Admin-Tools]] (snapshot pytań).
- **Generator z przykładów czasowników:** w 129 ze 136 przykładów `exampleEn` występuje forma past simple, dokładnie raz; w 18 przypadkach równa się formie podstawowej (np. *put*, *cut*), co nie przeszkadza w luce, ale podpowiedź w nawiasie byłaby wtedy identyczna z odpowiedzią. Brak formy w przykładzie w 7 przypadkach → pytanie zastępcze (`typing`). Pytania miałyby `verbId`, więc zasilałyby powtórki Leitnera. Osobny plan.
- **Lista wyboru zamiast wpisywania** jako wariant luki, podpowiedź (forma bazowa) jako pole luki oraz zachowanie podziałów wierszy w treści (`white-space: pre-wrap`) — do rozważenia po poprawkach.

## Kryteria ukończenia

- Wszystkie cztery błędy mają test, który padał przed poprawką.
- `npm run lint`, `npm test`, `npm run test:ui`, `npm run build` i `test:mcp` zielone.
- `quizSchema.test.ts` potwierdza zgodność zod ↔ JSON Schema dla nowych przypadków.
- `docs/Quiz-Engine.md` i `docs/question-types.md` opisują kanoniczny znacznik, składanie znaków i limity luk.

## Powiązane

- [[Quiz-Engine]] — silnik quizów
- [[question-types]] — typy pytań
- [[question-types-plan]] — plan wdrożenia nowych typów
- [[MCP-Admin-Tools]] — `quiz_stats` i decyzja D2
- [[Learning-Slice-Plan]] — plan rozdzielenia modułów (pozostałe uwagi z przeglądu)
