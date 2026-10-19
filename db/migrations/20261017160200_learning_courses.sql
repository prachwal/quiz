-- Learning module: courses -> lessons -> verbs, per-user lesson progress and a final exam
-- (a generated quiz whose attempt is stored with the course and a pass/fail flag).

ALTER TABLE quizzes ADD COLUMN difficulty_id SMALLINT REFERENCES difficulty_levels(id);

CREATE TABLE courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  difficulty_id SMALLINT REFERENCES difficulty_levels(id),
  popularity_id SMALLINT REFERENCES popularity_tiers(id),
  pass_percent INTEGER NOT NULL DEFAULT 70 CHECK (pass_percent BETWEEN 1 AND 100),
  position INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  title TEXT NOT NULL,
  intro TEXT NOT NULL DEFAULT '',
  UNIQUE (course_id, position)
);

CREATE TABLE lesson_verbs (
  lesson_id UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  verb_id INTEGER NOT NULL REFERENCES irregular_verbs(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  PRIMARY KEY (lesson_id, verb_id)
);

CREATE INDEX lesson_verbs_verb_idx ON lesson_verbs (verb_id);

CREATE TABLE lesson_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Auth0 `sub`; NULL = anonymous until auth is integrated (NULLs count as equal below)
  user_id TEXT,
  lesson_id UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (user_id, lesson_id)
);

ALTER TABLE quizzes ADD COLUMN course_id UUID REFERENCES courses(id) ON DELETE SET NULL;

ALTER TABLE quiz_attempts
  ADD COLUMN course_id UUID REFERENCES courses(id) ON DELETE SET NULL,
  ADD COLUMN passed BOOLEAN;

CREATE INDEX quiz_attempts_course_idx ON quiz_attempts (course_id, user_id);

-- Seed: one course per difficulty level + a "most popular verbs" course, lessons of 8 verbs.
INSERT INTO courses (slug, title, description, difficulty_id, popularity_id, position)
SELECT 'irregular-' || d.code,
       'Czasowniki nieregularne – poziom ' || lower(d.name_pl),
       'Lekcje z czasownikami nieregularnymi z grupy trudności: ' || lower(d.name_pl) || '. Na koniec egzamin sprawdzający wiedzę.',
       d.id, NULL, d.id
FROM difficulty_levels d;

INSERT INTO courses (slug, title, description, difficulty_id, popularity_id, position)
SELECT 'irregular-top',
       'Najczęstsze czasowniki nieregularne',
       'Najpopularniejsze czasowniki nieregularne w języku angielskim - od nich warto zacząć. Na koniec egzamin sprawdzający wiedzę.',
       NULL, p.id, 0
FROM popularity_tiers p WHERE p.code = 'core';

CREATE TEMP TABLE course_verbs AS
SELECT c.id AS course_id, v.id AS verb_id,
       row_number() OVER (
         PARTITION BY c.id
         ORDER BY CASE WHEN c.difficulty_id IS NULL THEN v.difficulty_id ELSE v.popularity_id END,
                  v.pattern_id, v.base
       ) AS rn
FROM courses c
JOIN irregular_verbs v
  ON (c.difficulty_id IS NOT NULL AND v.difficulty_id = c.difficulty_id)
  OR (c.difficulty_id IS NULL AND v.popularity_id = c.popularity_id);

INSERT INTO lessons (course_id, position, title, intro)
SELECT course_id, ((rn - 1) / 8) + 1, 'Lekcja ' || (((rn - 1) / 8) + 1),
       'Przyjrzyj się formom, znaczeniom i przykładom. Spróbuj powtórzyć je na głos, a potem oznacz lekcję jako ukończoną.'
FROM course_verbs
GROUP BY course_id, ((rn - 1) / 8) + 1;

INSERT INTO lesson_verbs (lesson_id, verb_id, position)
SELECT l.id, cv.verb_id, ((cv.rn - 1) % 8) + 1
FROM course_verbs cv
JOIN lessons l ON l.course_id = cv.course_id AND l.position = ((cv.rn - 1) / 8) + 1;

DROP TABLE course_verbs;
