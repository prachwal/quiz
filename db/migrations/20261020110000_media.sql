-- Media files (quiz and lesson images) stored in the S3-compatible bucket. A row exists before the upload
-- ('pending') and becomes 'ready' once the server has checked the bytes. Keys are random and never reused.
CREATE TABLE media (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key          TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL CHECK (content_type IN ('image/png', 'image/jpeg', 'image/webp')),
  size_bytes   INTEGER NOT NULL CHECK (size_bytes > 0),
  width        INTEGER CHECK (width IS NULL OR width > 0),
  height       INTEGER CHECK (height IS NULL OR height > 0),
  sha256       TEXT NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  status       TEXT NOT NULL CHECK (status IN ('pending', 'ready')),
  source       TEXT NOT NULL CHECK (source IN ('browser', 'mcp-base64', 'mcp-url', 'mcp-presigned', 'script')),
  owner_id     TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  ready_at     TIMESTAMPTZ,
  CHECK ((status = 'ready') = (ready_at IS NOT NULL))
);

CREATE INDEX media_owner_idx ON media (owner_id, created_at DESC);
-- the same author uploading the same bytes gets the existing row (findBySha)
CREATE INDEX media_sha_idx ON media (owner_id, sha256);

-- Who uses a file. Filled by the owners (quizzes, lessons, verbs) through syncRefs; nothing else writes here.
-- ON DELETE RESTRICT: a file with references cannot be deleted from media.
CREATE TABLE media_refs (
  media_id   UUID NOT NULL REFERENCES media (id) ON DELETE RESTRICT,
  owner_kind TEXT NOT NULL CHECK (owner_kind IN ('quiz', 'lesson', 'verb')),
  owner_id   TEXT NOT NULL,
  PRIMARY KEY (media_id, owner_kind, owner_id)
);

CREATE INDEX media_refs_owner_idx ON media_refs (owner_kind, owner_id);
