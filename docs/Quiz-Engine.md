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
`numeric`, `ordering`, `matching`.

Każdy typ definiuje: `usesOptions`, `defaultOptions`/`defaultConfig`, `validate`,
`grade`, `playerView`, `describe`.

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
