import type { QuestionType, QuizResult } from './engine'

export type DifficultyCode = 'easy' | 'medium' | 'hard'
export type PopularityCode = 'core' | 'common' | 'rare'
export type PatternCode = 'AAA' | 'ABA' | 'ABB' | 'ABC'

export const DIFFICULTY_LABELS: Record<DifficultyCode, string> = {
  easy: 'Łatwy',
  medium: 'Średni',
  hard: 'Trudny',
}

export const POPULARITY_LABELS: Record<PopularityCode, string> = {
  core: 'Bardzo popularny',
  common: 'Popularny',
  rare: 'Rzadszy',
}

export interface QuizSummary {
  id: string
  title: string
  description: string
  difficulty: DifficultyCode | null
  /** Number of times the quiz has been played (saved attempts). */
  plays: number
  questionCount: number
  totalPoints: number
  createdAt: string
  updatedAt: string
}

export interface QuizOption {
  id: string
  text: string
  /** Only present in the editor view (`?include=answers`). */
  isCorrect?: boolean
}

export interface QuizQuestion {
  id: string
  type: QuestionType
  prompt: string
  points: number
  /** Only present in the editor view. */
  explanation?: string
  /** Empty for `text` questions in the player view, so accepted answers don't leak. */
  options: QuizOption[]
}

export interface QuizDetail {
  id: string
  title: string
  description: string
  kind: 'manual' | 'generated'
  difficulty: DifficultyCode | null
  courseId: string | null
  /** Set for generated quizzes, e.g. `irregular-verbs`. */
  source: string | null
  createdAt: string
  updatedAt: string
  questions: QuizQuestion[]
}

export interface IrregularVerb {
  id: number
  base: string
  cefrLevel: string
  difficulty: DifficultyCode
  popularity: PopularityCode
  pattern: PatternCode
  /** Alternative accepted forms (e.g. ["learnt", "learned"]); the first one is the primary. */
  pastSimple: string[]
  pastParticiple: string[]
  meanings: string[]
  exampleEn: string
  examplePl: string
}

export interface AttemptSummary {
  id: string
  quizId: string | null
  quizTitle: string
  score: number
  maxScore: number
  percent: number
  courseId: string | null
  passed: boolean | null
  createdAt: string
}

/** Grading response: the result plus the id of the saved attempt (and course exam outcome). */
export type GradedAttempt = QuizResult & {
  attemptId: string
  course: { id: string; title: string; passPercent: number; passed: boolean } | null
}

export interface CourseSummary {
  id: string
  slug: string
  title: string
  description: string
  difficulty: DifficultyCode | null
  popularity: PopularityCode | null
  passPercent: number
  lessonCount: number
  completedLessons: number
  verbCount: number
  /** Best exam result of the current user, null when never taken. */
  bestPercent: number | null
  passed: boolean
}

export interface LessonSummary {
  id: string
  position: number
  title: string
  verbCount: number
  completed: boolean
}

export interface CourseDetail extends CourseSummary {
  lessons: LessonSummary[]
}

export interface LessonDetail {
  id: string
  courseId: string
  courseTitle: string
  position: number
  title: string
  intro: string
  completed: boolean
  prevLessonId: string | null
  nextLessonId: string | null
  verbs: IrregularVerb[]
}
