CREATE TABLE IF NOT EXISTS planets (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  mass_kg NUMERIC NOT NULL
);

INSERT INTO planets (name, mass_kg) VALUES
  ('Mercury', 3.30e23),
  ('Venus', 4.87e24),
  ('Earth', 5.97e24),
  ('Mars', 6.42e23),
  ('Jupiter', 1.90e27),
  ('Saturn', 5.68e26),
  ('Uranus', 8.68e25),
  ('Neptune', 1.02e26)
ON CONFLICT (name) DO NOTHING;
