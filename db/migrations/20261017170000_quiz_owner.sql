-- Auth0 user id (`sub`) of the quiz author. NULL = legacy quiz created before auth,
-- editable by any signed-in user.
ALTER TABLE quizzes ADD COLUMN owner_id TEXT;
CREATE INDEX quizzes_owner_idx ON quizzes (owner_id);
