-- Verb illustrations (Media-Storage-Plan L2): at most one image per irregular verb. The column is optional; a file
-- that illustrates a verb cannot be deleted from media (ON DELETE RESTRICT). The references in media_refs
-- (owner kind 'verb') are kept in step with this column by server/irregularVerbs.ts setVerbImage.
ALTER TABLE irregular_verbs ADD COLUMN image_media_id UUID REFERENCES media (id) ON DELETE RESTRICT;

CREATE INDEX irregular_verbs_image_media_idx ON irregular_verbs (image_media_id) WHERE image_media_id IS NOT NULL;
