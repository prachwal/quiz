-- School subjects used to group manual quizzes (lookup like difficulty_levels). A quiz has at most one.
CREATE TABLE subjects (
  id SMALLINT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name_pl TEXT NOT NULL
);
INSERT INTO subjects (id, code, name_pl) VALUES
  (1, 'math', 'Matematyka'),
  (2, 'physics', 'Fizyka'),
  (3, 'chemistry', 'Chemia'),
  (4, 'biology', 'Biologia'),
  (5, 'geography', 'Geografia'),
  (6, 'history', 'Historia'),
  (7, 'polish', 'Język polski'),
  (8, 'english', 'Język angielski'),
  (9, 'it', 'Informatyka'),
  (10, 'other', 'Inne');

ALTER TABLE quizzes ADD COLUMN subject_id SMALLINT REFERENCES subjects(id);
CREATE INDEX quizzes_subject_idx ON quizzes (subject_id);

-- existing quizzes: only the obvious ones, the rest stay unassigned
UPDATE quizzes SET subject_id = 8 WHERE kind = 'manual' AND title ILIKE '%czasownik%';
UPDATE quizzes SET subject_id = 3 WHERE kind = 'manual' AND title ILIKE '%pierwiastk%';
