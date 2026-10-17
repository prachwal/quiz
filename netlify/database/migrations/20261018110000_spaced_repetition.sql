-- Spaced repetition: which verb a question is about, and per-user review state (Leitner boxes).

ALTER TABLE questions ADD COLUMN verb_id INTEGER REFERENCES irregular_verbs(id) ON DELETE SET NULL;
CREATE INDEX questions_verb_idx ON questions (verb_id);

CREATE TABLE verb_reviews (
  user_id TEXT NOT NULL,
  verb_id INTEGER NOT NULL REFERENCES irregular_verbs(id) ON DELETE CASCADE,
  box SMALLINT NOT NULL DEFAULT 0 CHECK (box BETWEEN 0 AND 6),
  due_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  repetitions INTEGER NOT NULL DEFAULT 0,
  lapses INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0,
  correct INTEGER NOT NULL DEFAULT 0,
  last_reviewed_at TIMESTAMPTZ,
  PRIMARY KEY (user_id, verb_id)
);

CREATE INDEX verb_reviews_due_idx ON verb_reviews (user_id, due_at);
