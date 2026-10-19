-- Classes: a teacher groups students (join by code) and assigns courses or quizzes with a due date.

CREATE TABLE classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  -- Auth0 user id (`sub`) of the teacher
  owner_id TEXT NOT NULL,
  join_code TEXT NOT NULL UNIQUE,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX classes_owner_idx ON classes (owner_id, created_at DESC);

CREATE TABLE class_members (
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (class_id, user_id)
);

CREATE INDEX class_members_user_idx ON class_members (user_id);

CREATE TABLE assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('course', 'quiz')),
  course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
  quiz_id UUID REFERENCES quizzes(id) ON DELETE CASCADE,
  due_at TIMESTAMPTZ,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (kind = 'course' AND course_id IS NOT NULL AND quiz_id IS NULL) OR
    (kind = 'quiz' AND quiz_id IS NOT NULL AND course_id IS NULL)
  )
);

CREATE INDEX assignments_class_idx ON assignments (class_id, created_at DESC);

-- Identity shown to teachers; filled from the verified access token (never from client input).
ALTER TABLE user_profiles ADD COLUMN display_name TEXT, ADD COLUMN email TEXT;
