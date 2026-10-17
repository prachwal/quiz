-- Generated quizzes (e.g. random irregular-verbs quizzes) are stored like normal quizzes
-- but hidden from the quiz list.
ALTER TABLE quizzes
  ADD COLUMN kind TEXT NOT NULL DEFAULT 'manual' CHECK (kind IN ('manual', 'generated')),
  ADD COLUMN source TEXT;

CREATE TABLE quiz_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id UUID REFERENCES quizzes(id) ON DELETE SET NULL,
  quiz_title TEXT NOT NULL,
  -- Auth0 user id (the `sub` claim, e.g. "auth0|64f1..."). NULL = anonymous until auth is integrated.
  user_id TEXT,
  score NUMERIC NOT NULL,
  max_score NUMERIC NOT NULL,
  percent INTEGER NOT NULL,
  answers JSONB NOT NULL,
  results JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX quiz_attempts_user_idx ON quiz_attempts (user_id, created_at DESC);
CREATE INDEX quiz_attempts_quiz_idx ON quiz_attempts (quiz_id, created_at DESC);
