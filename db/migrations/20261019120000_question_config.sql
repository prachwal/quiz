-- Per-type payload for question types that do not fit the options table (numeric tolerances,
-- ordering items, matching pairs, cloze gaps). NULL for the four original types, so existing rows
-- need no backfill.
ALTER TABLE questions
  ADD COLUMN config JSONB CHECK (config IS NULL OR jsonb_typeof(config) = 'object');
