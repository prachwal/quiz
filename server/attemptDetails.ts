import { promptText } from '../src/shared/quiz/engine'
import type { StudentAttemptQuestion } from '../src/shared/quiz/types'
import { pool } from './db'

/**
 * Per-question details of saved attempts. Used by the admin attempt read path (`attemptsRepo`) and by the class results
 * of a student (`classes/results`), so it belongs to the quiz side that owns the attempt rows.
 */

export interface AttemptRow {
  id: string
  quiz_id: string | null
  course_id: string | null
  score: number
  max_score: number
  percent: number
  passed: boolean | null
  created_at: Date
  answers: Record<string, { optionIds?: string[]; text?: string }> | null
  results:
    | {
        questionId: string
        correct: boolean
        earned: number
        points: number
        correctAnswers: string[]
        answerText?: string
      }[]
    | null
}

/**
 * Per-question view of saved attempts: prompt, the student's answer as text and the correct answers.
 * Best effort - questions edited away since the attempt show without a prompt.
 */
export async function questionDetails(rows: AttemptRow[]): Promise<(a: AttemptRow) => StudentAttemptQuestion[]> {
  const questionIds = [...new Set(rows.flatMap((a) => (a.results ?? []).map((r) => r.questionId)))]
  const prompts = new Map<string, string>()
  const optionTexts = new Map<string, string>()
  if (questionIds.length > 0) {
    const q = await pool().query<{ id: string; prompt: string }>('SELECT id, prompt FROM questions WHERE id = ANY($1::uuid[])', [questionIds])
    for (const r of q.rows) prompts.set(r.id, r.prompt)
    const o = await pool().query<{ id: string; text: string }>('SELECT id, text FROM options WHERE question_id = ANY($1::uuid[])', [questionIds])
    for (const r of o.rows) optionTexts.set(r.id, r.text)
  }
  return (a) =>
    (a.results ?? []).map((r) => {
      const given = a.answers?.[r.questionId]
      // attempts saved after the config work carry the readable answer; older rows fall back
      const answer =
        r.answerText ??
        (given?.optionIds?.length
          ? given.optionIds.map((id) => optionTexts.get(id) ?? '?').join(', ')
          : (given?.text ?? ''))
      const prompt = prompts.get(r.questionId)
      return {
        questionId: r.questionId,
        prompt: prompt === undefined ? null : promptText(prompt),
        correct: r.correct,
        earned: r.earned,
        points: r.points,
        answer,
        correctAnswers: r.correctAnswers,
      }
    })
}
