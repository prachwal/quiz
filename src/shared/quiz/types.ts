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
  /** The current user may edit/delete this quiz (owner, or legacy quiz without an owner). */
  canEdit: boolean
  /** Number of times the quiz has been played (saved attempts). */
  plays: number
  questionCount: number
  /** Questions drawn from the pool on each play; null = all of them. */
  sampleSize: number | null
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
  canEdit: boolean
  /** null = follow the player's setting, true/false = override it. */
  shuffleQuestions: boolean | null
  shuffleOptions: boolean
  /** Questions drawn from the pool on each play; null = all of them. */
  sampleSize: number | null
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

export interface ApiTokenSummary {
  id: string
  name: string
  /** First characters of the token, to recognise it in the list. */
  prefix: string
  permissions: string[]
  createdAt: string
  expiresAt: string | null
  lastUsedAt: string | null
}

/** Returned once, right after creation - the plain token is never stored. */
export type CreatedApiToken = ApiTokenSummary & { token: string }

export const MANAGED_ROLES = ['admin', 'teacher', 'student'] as const
export type ManagedRole = (typeof MANAGED_ROLES)[number]

export interface AdminUser {
  id: string
  email: string | null
  name: string | null
  picture: string | null
  /** Login method, e.g. google-oauth2, discord, auth0 (e-mail + password) */
  provider: string
  lastLogin: string | null
  loginsCount: number
  blocked: boolean
  /** Only the roles managed by this app; other tenant roles are left alone. */
  roles: ManagedRole[]
}

export interface AdminUsersPage {
  users: AdminUser[]
  total: number
  page: number
  perPage: number
}

export interface AuditEntry {
  id: string
  actorId: string
  actorLabel: string | null
  action: 'roles.update' | 'user.block' | 'user.unblock' | 'feedback.status' | 'mcp.call'
  targetId: string | null
  targetLabel: string | null
  details: Record<string, unknown>
  createdAt: string
}

export type FeedbackKind = 'bug' | 'idea' | 'other'
export type FeedbackStatus = 'new' | 'in_progress' | 'done'

export interface FeedbackContext {
  route?: string
  appVersion?: string
  userAgent?: string
  viewport?: string
  theme?: string
  sentryEventId?: string
  requestId?: string
}

export interface FeedbackItem {
  id: string
  userId: string
  userLabel: string | null
  kind: FeedbackKind
  message: string
  status: FeedbackStatus
  context: FeedbackContext
  createdAt: string
  updatedAt: string
}

export interface ProgressSummary {
  timezone: string
  dailyGoal: number
  currentStreak: number
  longestStreak: number
  /** Activity of the current day in the user's time zone. */
  today: { day: string; answered: number; correct: number; lessons: number }
  /** Last 7 days (oldest first, today last). */
  last7: { day: string; answered: number; correct: number; lessons: number }[]
}

export interface ReviewSummary {
  /** Verbs whose review is due now (including new verbs from completed lessons). */
  dueCount: number
  /** Subset of `dueCount` never answered yet. */
  newCount: number
  trackedCount: number
  /** Earliest future review when nothing is due, otherwise null. */
  nextDueAt: string | null
}

export interface WeakVerb {
  verb: IrregularVerb
  attempts: number
  correct: number
  /** Share of correct answers, 0..1. */
  accuracy: number
  lastWrongAt: string | null
}

export interface ClassSummary {
  id: string
  name: string
  /** Auth0 id of the teacher who owns the class. */
  ownerId: string
  joinCode: string
  memberCount: number
  assignmentCount: number
  /** false = the code is valid but new students cannot join. */
  joiningOpen: boolean
  archived: boolean
  createdAt: string
}

export interface ClassMember {
  userId: string
  name: string | null
  email: string | null
  joinedAt: string
}

export interface AssignmentItem {
  id: string
  classId: string
  kind: 'course' | 'quiz'
  courseId: string | null
  quizId: string | null
  title: string
  dueAt: string | null
  createdAt: string
}

export type AssignmentStatus = 'todo' | 'in_progress' | 'done'

/** An assignment as seen by a student, with their progress. */
export interface MyAssignment extends AssignmentItem {
  className: string
  status: AssignmentStatus
  overdue: boolean
  /** e.g. completed lessons / total (course) or best percent (quiz) */
  detail: string
}

export interface MyClass {
  id: string
  name: string
  joinedAt: string
}

export interface ClassReportRow {
  userId: string
  name: string | null
  email: string | null
  lessonsCompleted: number
  lastActiveDay: string | null
  weakVerbs: number
  /** assignment id -> status */
  statuses: Record<string, AssignmentStatus>
  /** assignment id -> best percent (null when never attempted / not applicable) */
  bestPercent: Record<string, number | null>
}

export interface ClassReport {
  assignments: AssignmentItem[]
  rows: ClassReportRow[]
}

export interface ClassDetail extends ClassSummary {
  members: ClassMember[]
  assignments: AssignmentItem[]
}

/** One question of a student's attempt, as seen by the teacher. */
export interface StudentAttemptQuestion {
  questionId: string
  /** null when the quiz was edited afterwards and the question no longer exists */
  prompt: string | null
  correct: boolean
  earned: number
  points: number
  /** What the student answered (option texts or typed text), empty when skipped. */
  answer: string
  correctAnswers: string[]
}

export interface StudentAttempt {
  id: string
  assignmentId: string
  title: string
  score: number
  maxScore: number
  percent: number
  passed: boolean | null
  createdAt: string
  questions: StudentAttemptQuestion[]
}

export interface StudentAssignmentProgress {
  assignmentId: string
  title: string
  kind: 'course' | 'quiz'
  dueAt: string | null
  status: AssignmentStatus
  detail: string
  bestPercent: number | null
}

/** A class member's results on the class assignments (only those - nothing else about the student). */
export interface StudentResults {
  userId: string
  name: string | null
  email: string | null
  joinedAt: string
  lessonsCompleted: number
  lastActiveDay: string | null
  weakVerbs: number
  assignments: StudentAssignmentProgress[]
  attempts: StudentAttempt[]
}

/** A student as the teacher knows them: identity plus the classes they share with the teacher. */
export interface StudentListItem {
  userId: string
  name: string | null
  email: string | null
  classes: { id: string; name: string }[]
}
