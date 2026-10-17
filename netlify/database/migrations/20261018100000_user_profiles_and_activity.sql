-- Per-user profile (daily goal, time zone) and daily activity used for streaks and goals.
-- user_id = Auth0 `sub`.

CREATE TABLE user_profiles (
  user_id TEXT PRIMARY KEY,
  daily_goal INTEGER NOT NULL DEFAULT 10 CHECK (daily_goal BETWEEN 1 AND 200),
  -- IANA zone of the user's device; days (and so streaks) are counted in it
  timezone TEXT NOT NULL DEFAULT 'UTC',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE daily_activity (
  user_id TEXT NOT NULL,
  day DATE NOT NULL,
  answered INTEGER NOT NULL DEFAULT 0,
  correct INTEGER NOT NULL DEFAULT 0,
  lessons_completed INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);
