-- When the user last got a verb wrong (used to rank weak verbs).
ALTER TABLE verb_reviews ADD COLUMN last_wrong_at TIMESTAMPTZ;
