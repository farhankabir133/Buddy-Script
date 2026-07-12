-- =============================================================================
-- 0003_profile_fields.sql
-- -----------------------------------------------------------------------------
-- Adds LinkedIn/Facebook-style profile fields to `users` so the app can render
-- real avatars, a cover banner, a headline, a bio, and a location.
--
-- Idempotent: safe to re-run. Every ALTER guards against an already-existing
-- column, and the post_count helper is created only if missing.
--
-- Apply in the Supabase SQL editor (or `supabase db push`) after migrations
-- 0001/0002. No RLS change is required:
--   - `users_select` is `USING (true)`  -> profiles stay publicly readable.
--   - `users_update` is `USING (auth.uid() = id)` -> a user edits only their row.
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'avatar_url'
  ) THEN
    ALTER TABLE users ADD COLUMN avatar_url TEXT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'cover_url'
  ) THEN
    ALTER TABLE users ADD COLUMN cover_url TEXT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'headline'
  ) THEN
    ALTER TABLE users ADD COLUMN headline TEXT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'bio'
  ) THEN
    ALTER TABLE users ADD COLUMN bio TEXT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'location'
  ) THEN
    ALTER TABLE users ADD COLUMN location TEXT NULL;
  END IF;
END $$;

-- Storage: create an `avatars` bucket (Public) for profile + cover images.
-- The server uploads via the service-role client (see app/api/upload/route.ts),
-- which bypasses Storage RLS, so no Storage policies are required. Set the
-- bucket to "Public" so getPublicUrl() returns accessible URLs.

COMMENT ON COLUMN users.avatar_url IS 'Public URL of the user avatar (avatars bucket). NULL -> render initials fallback.';
COMMENT ON COLUMN users.cover_url  IS 'Public URL of the profile cover banner (avatars bucket).';
COMMENT ON COLUMN users.headline  IS 'Short professional tagline (<=120 chars).';
COMMENT ON COLUMN users.bio       IS 'Free-text biography (<=500 chars).';
COMMENT ON COLUMN users.location  IS 'Human-readable location string.';
