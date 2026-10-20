-- Snapshot of the graded questions with every attempt: [{id, type, prompt, points}] in the order
-- they were graded. PUT /api/quizzes/:id replaces all questions (new ids), so statistics read this
-- column instead of the current questions. Written by the grade handler; NULL for old attempts
-- that could not be backfilled.
ALTER TABLE quiz_attempts ADD COLUMN questions_snapshot JSONB;

COMMENT ON COLUMN quiz_attempts.questions_snapshot IS
  'Graded questions at attempt time: [{id, type, prompt, points}]. NULL when unknown (backfill found no matching questions).';

-- Best-effort backfill for attempts whose questions still exist. Only result entries whose
-- questionId is still a question of the attempt's quiz are kept, in the order of `results`.
-- Idempotent: rows that already have a snapshot are skipped.
UPDATE quiz_attempts AS a
SET questions_snapshot = s.snapshot
FROM (
  SELECT r.attempt_id,
         jsonb_agg(
           jsonb_build_object('id', q.id::text, 'type', q.type, 'prompt', q.prompt, 'points', q.points)
           ORDER BY r.position
         ) AS snapshot
  FROM (
    SELECT qa.id AS attempt_id, qa.quiz_id, e.item ->> 'questionId' AS question_id, e.position
    FROM quiz_attempts AS qa
    CROSS JOIN LATERAL jsonb_array_elements(qa.results) WITH ORDINALITY AS e(item, position)
    WHERE qa.questions_snapshot IS NULL
      AND qa.quiz_id IS NOT NULL
      AND jsonb_typeof(qa.results) = 'array'
  ) AS r
  JOIN questions AS q
    ON q.quiz_id = r.quiz_id AND q.id::text = r.question_id
  GROUP BY r.attempt_id
) AS s
WHERE a.id = s.attempt_id
  AND a.questions_snapshot IS NULL;
