---
tags:
  - docs
  - progress
  - frontend
  - backend
created: 2026-10-19
updated: 2026-10-19
---

# Postęp, powtórki i słabe czasowniki

## Streak i cel dzienny

- Tabele: `user_profiles` (`daily_goal`, `timezone`), `daily_activity`
  (odpowiedzi, poprawne, lekcje per dzień).
- `grade` i pierwsze ukończenie lekcji wywołują `progress.recordActivity`.
- Dni liczone w strefie czasowej użytkownika (IANA), synchronizowane
  (`useTimezoneSync`).
- Czysta logika: `src/shared/quiz/streaks.ts` (testy `tests/streaks.test.ts`).
- API: `GET /api/progress/summary`, `PATCH /api/progress/profile`.
- UI: `StreakChip`, `DailyGoalCard`, `WeekStrip`, `ProgressLine`.

## Spaced repetition (Leitner)

- Skrzynki 0–6, interwały 0/1/2/4/8/16/32 dni; błędna odpowiedź resetuje do 0.
- Czysta logika: `src/shared/quiz/spaced.ts` (testy `tests/spaced.test.ts`).
- `verb_reviews` trzyma stan (`box`, `due_at`, `attempts`, `correct`, `lapses`).
- Pytania mają `questions.verb_id`; grading aktualizuje stan (`reviewsRepo.applyResults`).
- Ukończenie lekcji kolejkuję jej czasowniki (`enqueueLessonVerbs`).
- API: `GET /api/reviews/summary`, `POST /api/reviews/session`.

## Słabe czasowniki

- `verb_reviews.last_wrong_at`; słaby = ≥3 próby, accuracy <75%, box <4.
- Ranking: `src/shared/quiz/weak.ts` (testy `tests/weak.test.ts`).
- API: `GET /api/progress/weak-verbs`,
  `POST /api/quizzes/generate/irregular-verbs` z `onlyWeak: true`,
  `POST /api/quizzes/:id/retry-wrong`.
- UI: `WeakVerbs` na Results, przełącznik na Home, `WeakMark`, "Powtórz błędne".

## Powiązane

- [[Architecture]]
