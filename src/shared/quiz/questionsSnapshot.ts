// Snapshot of the graded questions, stored with each attempt (quiz_attempts.questions_snapshot).
// Only the four fields below are kept: never options, explanations or config, so no answer can
// leak through the snapshot. Statistics read it instead of the current questions, which a quiz
// edit replaces (PUT generates new question ids).

export interface SnapshotQuestion {
  id: string
  type: string
  prompt: string
  points: number
}

export function buildQuestionsSnapshot(
  questions: { id: string; type: string; prompt: string; points: number }[],
): SnapshotQuestion[] {
  return questions.map((q) => ({ id: q.id, type: q.type, prompt: q.prompt, points: q.points }))
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

// Tolerant reader for the jsonb value: malformed items are dropped, not the whole snapshot.
export function parseQuestionsSnapshot(value: unknown): SnapshotQuestion[] | null {
  if (!Array.isArray(value)) return null
  const parsed: SnapshotQuestion[] = []
  for (const item of value) {
    if (!isRecord(item)) continue
    const { id, type, prompt, points } = item
    if (typeof id !== 'string' || typeof type !== 'string' || typeof prompt !== 'string') continue
    if (typeof points !== 'number' || !Number.isFinite(points)) continue
    parsed.push({ id, type, prompt, points })
  }
  return parsed
}
