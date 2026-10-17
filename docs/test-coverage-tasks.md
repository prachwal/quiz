# Tasklist: pokrycie testami frontendu

Statusy: `[ ]` do zrobienia, `[x]` pokryte.

## Faza 1 — proste komponenty i hooki (bez Redux/API)
- [x] `src/components/BrandMark.tsx`
- [x] `src/components/BottomNav.tsx`
- [x] `src/components/GroupTags.tsx` (`DifficultyTag`, `PopularityTag`)
- [x] `src/components/PageHeader.tsx`
- [x] `src/components/useFocusMode.ts`
- [x] `src/app/useMediaQuery.ts` (`useMediaQuery`, `PHONE_QUERY`, `COARSE_QUERY`)
- [x] `src/app/useResolvedTheme.ts`
- [x] `src/app/useDocumentTheme.ts`
- [x] `src/features/learn/useSwipe.ts`
- [x] `src/features/progress/useTimezoneSync.ts`
- [x] `src/features/audio/useSpeech.ts`
- [x] `src/features/auth/useAuth.ts`
- [x] `src/features/auth/token.ts`
- [x] `src/features/auth/config.ts`

## Faza 2 — komponenty z Redux/API (stan ładowania / brak danych)
- [x] `src/features/quizzes/ChoiceTile.tsx`
- [x] `src/features/progress/WeakMark.tsx`
- [x] `src/features/progress/StreakChip.tsx`
- [x] `src/features/progress/DailyGoalCard.tsx`
- [x] `src/features/progress/ProgressLine.tsx`
- [x] `src/features/progress/ReviewCard.tsx`
- [x] `src/features/progress/WeakVerbs.tsx`
- [x] `src/features/classes/AssignmentsHint.tsx`
- [ ] `src/features/classes/statusTags.tsx` (Vitest)
- [x] `src/features/quizzes/QuizPlayer.tsx`
- [x] `src/features/quizzes/QuizEditor.tsx`
- [x] `src/features/quizzes/ResultView.tsx`
- [x] `src/features/quizzes/OptionsEditor.tsx`
- [x] `src/features/quizzes/questionRenderers.tsx`
- [x] `src/features/learn/VerbSlide.tsx`
- [x] `src/features/learn/VerbTable.tsx`
- [x] `src/features/audio/SpeakButton.tsx`
- [x] `src/features/auth/ApiTokens.tsx`
- [x] `src/features/auth/PublicShell.tsx`
- [x] `src/features/auth/RequireRole.tsx`
- [x] `src/features/feedback/FeedbackModal.tsx`
- [x] `src/features/feedback/ErrorFallback.tsx`
- [x] `src/features/admin/UsersAdmin.tsx`
- [x] `src/features/admin/FeedbackAdmin.tsx`
- [x] `src/features/admin/AuditAdmin.tsx`

## Faza 3 — strony (integracyjne, z mockami API)
- [x] `src/pages/Home.tsx`
- [x] `src/pages/Learn.tsx`
- [x] `src/pages/CourseView.tsx`
- [x] `src/pages/LessonView.tsx`
- [x] `src/pages/QuizPlay.tsx`
- [x] `src/pages/QuizNew.tsx`
- [x] `src/pages/QuizEdit.tsx`
- [x] `src/pages/Results.tsx`
- [x] `src/pages/Verbs.tsx`
- [x] `src/pages/Assignments.tsx`
- [x] `src/pages/Classes.tsx`
- [x] `src/pages/ClassDetail.tsx`
- [x] `src/pages/Settings.tsx`
- [x] `src/pages/About.tsx`
- [x] `src/pages/NotFound.tsx`

## Faza 4 — layout i app
- [x] `src/components/AppLayout.tsx`
- [x] `src/App.tsx`
- [ ] `src/main.tsx`

## Infrastruktura
- [x] Vitest + jsdom + Testing Library skonfigurowane
- [x] Mock `window.matchMedia` w setup
- [ ] MSW do mockowania RTK Query w testach
- [ ] Playwright E2E dla przepływów (quiz, lekcja, klasa)
