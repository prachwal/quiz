-- Per-quiz play settings managed by the quiz owner/admin.
--   shuffle_questions: NULL = follow the player's own setting, true/false = override it
--   shuffle_options:   shuffle the answer options of choice questions on every play
--   sample_size:       NULL = play every question, otherwise draw this many at random from the whole pool
ALTER TABLE quizzes
  ADD COLUMN shuffle_questions BOOLEAN,
  ADD COLUMN shuffle_options BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN sample_size INTEGER CHECK (sample_size IN (10, 20, 30));
