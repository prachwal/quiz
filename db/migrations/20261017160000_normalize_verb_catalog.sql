-- Normalizes the irregular verbs catalog:
--   * lookup tables for CEFR level, difficulty, popularity and form pattern
--   * verb forms (incl. alternatives like learnt/learned) and Polish meanings as rows
-- Existing data is migrated from the old denormalized columns, which are then dropped.

CREATE TABLE cefr_levels (
  code TEXT PRIMARY KEY,
  rank SMALLINT NOT NULL UNIQUE
);
INSERT INTO cefr_levels (code, rank) VALUES ('A2', 1), ('B1', 2), ('B2', 3), ('C1', 4);

CREATE TABLE difficulty_levels (
  id SMALLINT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name_pl TEXT NOT NULL
);
INSERT INTO difficulty_levels (id, code, name_pl) VALUES
  (1, 'easy', 'Łatwy'),
  (2, 'medium', 'Średni'),
  (3, 'hard', 'Trudny');

CREATE TABLE popularity_tiers (
  id SMALLINT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name_pl TEXT NOT NULL
);
INSERT INTO popularity_tiers (id, code, name_pl) VALUES
  (1, 'core', 'Bardzo popularny'),
  (2, 'common', 'Popularny'),
  (3, 'rare', 'Rzadszy');

-- A = base form, B/C = different forms: AAA cut-cut-cut, ABA come-came-come,
-- ABB buy-bought-bought, ABC sing-sang-sung.
CREATE TABLE verb_patterns (
  id SMALLINT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  description_pl TEXT NOT NULL
);
INSERT INTO verb_patterns (id, code, description_pl) VALUES
  (1, 'AAA', 'Wszystkie trzy formy takie same'),
  (2, 'ABA', 'Past participle jak bezokolicznik'),
  (3, 'ABB', 'Past simple i past participle takie same'),
  (4, 'ABC', 'Trzy różne formy');

ALTER TABLE irregular_verbs
  ADD COLUMN cefr_level TEXT REFERENCES cefr_levels(code),
  ADD COLUMN difficulty_id SMALLINT REFERENCES difficulty_levels(id),
  ADD COLUMN popularity_id SMALLINT REFERENCES popularity_tiers(id),
  ADD COLUMN pattern_id SMALLINT REFERENCES verb_patterns(id),
  ADD COLUMN example_en TEXT,
  ADD COLUMN example_pl TEXT;

UPDATE irregular_verbs SET cefr_level = level;
ALTER TABLE irregular_verbs ALTER COLUMN cefr_level SET NOT NULL;

CREATE TABLE verb_forms (
  id SERIAL PRIMARY KEY,
  verb_id INTEGER NOT NULL REFERENCES irregular_verbs(id) ON DELETE CASCADE,
  form_type TEXT NOT NULL CHECK (form_type IN ('past_simple', 'past_participle')),
  position SMALLINT NOT NULL,
  form TEXT NOT NULL,
  UNIQUE (verb_id, form_type, position)
);

INSERT INTO verb_forms (verb_id, form_type, position, form)
SELECT v.id, 'past_simple', (t.ord - 1)::smallint, trim(t.form)
FROM irregular_verbs v, unnest(string_to_array(v.past_simple, '/')) WITH ORDINALITY AS t(form, ord);

INSERT INTO verb_forms (verb_id, form_type, position, form)
SELECT v.id, 'past_participle', (t.ord - 1)::smallint, trim(t.form)
FROM irregular_verbs v, unnest(string_to_array(v.past_participle, '/')) WITH ORDINALITY AS t(form, ord);

CREATE TABLE verb_meanings (
  id SERIAL PRIMARY KEY,
  verb_id INTEGER NOT NULL REFERENCES irregular_verbs(id) ON DELETE CASCADE,
  position SMALLINT NOT NULL,
  translation_pl TEXT NOT NULL,
  UNIQUE (verb_id, position)
);

-- split on commas that are not inside parentheses, e.g. "jechać (konno, rowerem)" stays whole
INSERT INTO verb_meanings (verb_id, position, translation_pl)
SELECT v.id, (t.ord - 1)::smallint, trim(t.meaning)
FROM irregular_verbs v,
     unnest(regexp_split_to_array(v.translation_pl, ',\s*(?![^(]*\))')) WITH ORDINALITY AS t(meaning, ord);

-- pattern derived from the primary (position 0) forms
UPDATE irregular_verbs v
SET pattern_id = (
  SELECT p.id FROM verb_patterns p WHERE p.code = (
    SELECT CASE
      WHEN v.base = ps.form AND v.base = pp.form THEN 'AAA'
      WHEN v.base = pp.form THEN 'ABA'
      WHEN ps.form = pp.form THEN 'ABB'
      ELSE 'ABC'
    END
    FROM verb_forms ps, verb_forms pp
    WHERE ps.verb_id = v.id AND ps.form_type = 'past_simple' AND ps.position = 0
      AND pp.verb_id = v.id AND pp.form_type = 'past_participle' AND pp.position = 0
  )
);
ALTER TABLE irregular_verbs ALTER COLUMN pattern_id SET NOT NULL;

ALTER TABLE irregular_verbs
  DROP COLUMN past_simple,
  DROP COLUMN past_participle,
  DROP COLUMN translation_pl,
  DROP COLUMN level;

CREATE INDEX irregular_verbs_groups_idx ON irregular_verbs (difficulty_id, popularity_id);
