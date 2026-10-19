---
tags:
  - docs
  - quiz
  - frontend
  - backend
created: 2026-10-19
updated: 2026-10-19
---

# Silnik quizów

## Typy pytań

Rejestr w `src/shared/quiz/engine.ts`: `single`, `multiple`, `truefalse`, `text`,
`numeric`, `ordering`, `matching`, `cloze`.

Każdy typ definiuje: `usesOptions`, `defaultOptions`/`defaultConfig`, `validate`,
`grade`, `playerView`, `describe`.

## Normalizacja odpowiedzi

Porównania tekstowe idą przez `normalizeText`: NFC, trim, zwinięcie spacji,
złożenie typograficznych znaków interpunkcyjnych i `toLocaleLowerCase`.

- Składane: `’ ‘ ʼ \`` → `'`, `“ ” „` → `"`, `– — ‑ −` → `-`.
- **Nietknięte:** polskie diakrytyki (`szkoły` ≠ `szkoly`) i kolejność znaków.

Powód: klawiatura telefonu (iOS „smart punctuation”) zamienia apostrof i myślnik
na znaki typograficzne, więc `don’t` musi być tym samym co `don't`. Dotyczy to
wszystkich typów porównywanych po tekście (`text`, `cloze`, `ordering`,
`matching`) — jednej definicji, więc nie da się ich rozjechać.

## `cloze` — znaczniki i limity

- Znacznik ma jedną definicję (`CLOZE_MARKER` / `clozeParts` w `engine.ts`):
  `{{n}}`, gdzie `n ≥ 1` **bez zer wiodących**. `{{01}}` nie jest znacznikiem,
  bo gracz wysłałby odpowiedź pod kluczem `"01"`, a ocena czyta `"1"` — pytanie
  byłoby nie do rozwiązania. Walidacja odrzuca taką treść.
- Ograniczenia luki (te same w `validate` i w `data/quiz.schema.json`): 1–10
  akceptowanych odpowiedzi, każda 1–200 znaków i co najmniej jeden znak inny
  niż spacja.
- Limity są egzekwowane tylko przy zapisie (`validate`), nie przy odczycie:
  `clozeConfig` służy też ocenie i widokowi gracza, więc zaostrzenie go
  sprawiłoby, że starsze pytania dawałyby 0 punktów.

## Grading

- Wyłącznie server-side (`gradeQuiz`).
- Frontend dostaje widok gracza (`playerView`) bez odpowiedzi/poprawnej kolejności.
- `GET /api/quizzes/:id` pomija `isCorrect`, wyjaśnienia i opcje pytań tekstowych;
  `?include=answers` zwraca widok edytora.

## Dodawanie typu

1. `QUESTION_TYPES` + wpis w `questionTypes`.
2. Renderer w `src/features/quizzes/questionRenderers.tsx`.
3. Gałąź w `OptionsEditor`/`ConfigEditor`.
4. Gałąź w `data/quiz.schema.json`.
5. Testy w `tests/engine.test.ts` + `tests/quizSchema.test.ts`.

## Play settings

- `shuffle_questions` (NULL = ustawienie gracza, true/false wymusza).
- `shuffle_options`, `sample_size` (10/20/30 lub NULL).
- Helpers: `src/shared/quiz/sampling.ts`.
- `QuizPlayer.prepareQuestions` próbk/tasuje po stronie klienta i wysyła `questionIds`;
  server ocenia dokładnie te (`resolveGradedIds`).

## Generowane quizy

- `server/irregularVerbs.ts` buduje z katalogu czasowników; `kind='generated'`,
  `source` (`irregular-verbs`/`course-exam`).
- Ukryte z `GET /api/quizzes`, nigdy nie czyszczone.

## Powiązane

- [[question-types]]
- [[question-types-plan]]
