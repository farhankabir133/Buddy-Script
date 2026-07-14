-- Multi-image gallery support for posts.
-- A post may now carry several images. `image_urls` is a Postgres text array;
-- `image_url` is retained as a convenience alias for the first image so existing
-- readers keep working until they migrate to `image_urls`.
BEGIN;

ALTER TABLE posts ADD COLUMN image_urls TEXT[] NOT NULL DEFAULT '{}';

-- Backfill: existing single image_url becomes the first gallery entry.
UPDATE posts
SET image_urls = ARRAY[image_url]
WHERE image_url IS NOT NULL AND image_url <> '';

COMMIT;
