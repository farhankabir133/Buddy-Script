BEGIN;

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    first_name VARCHAR(50),
    last_name VARCHAR(50),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    content TEXT,
    image_url TEXT,
    is_private BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES comments(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE post_likes (
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, post_id)
);

CREATE TABLE comment_likes (
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    comment_id UUID REFERENCES comments(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, comment_id)
);

-- Feed visibility + sort. (is_private, created_at DESC) serves the public-feed
-- filter; (user_id, created_at DESC, id DESC) serves "my posts" and keyset
-- pagination; (created_at DESC, id DESC) lets the cursor walk the index instead
-- of sorting + OFFSET.
CREATE INDEX idx_posts_feed_lookup ON posts (is_private, created_at DESC);
CREATE INDEX idx_posts_user_created ON posts (user_id, created_at DESC, id DESC);
CREATE INDEX idx_posts_created_at_id ON posts (created_at DESC, id DESC);

-- Comments are read by post_id and ordered by (created_at, id) for pagination.
CREATE INDEX idx_comments_post_created ON comments (post_id, created_at ASC, id ASC);
CREATE INDEX idx_comments_user_id ON comments (user_id);
CREATE INDEX idx_comments_parent_id ON comments (parent_id);

-- Likes are looked up by their *target* id (not by the PK's leading user_id
-- column), so add indexes for those access patterns.
CREATE INDEX idx_post_likes_post_id ON post_likes (post_id);
CREATE INDEX idx_comment_likes_comment_id ON comment_likes (comment_id);

-- Self-referential parent_id scales for threaded nesting because each comment row
-- carries only one pointer to its parent, keeping the adjacency list O(1) to append
-- and O(depth) to traverse; depth is naturally bounded by typical discussion threads.

-- Cursor pagination: anchor the feed query on the last seen created_at value (e.g.
-- WHERE is_private = false AND created_at < 'last_seen_ts' ORDER BY created_at DESC)
-- so each page boundary is resolved in O(log N) using the idx_posts_feed_lookup index,
-- eliminating OFFSET table scans and guaranteeing stable ordering across inserts.

-- Storage: create a 'post-images' bucket in the Supabase dashboard for user-uploaded images.
-- The bucket should be set to 'Public' so that getPublicUrl() returns accessible URLs.

-- =============================================================================
-- Row Level Security (RLS)
-- -----------------------------------------------------------------------------
-- Private posts and other owner-scoped data are now enforced at the DATABASE
-- level via RLS, not just in application code. These policies evaluate against
-- `auth.uid()`, which is populated from the `sub` claim of the JWT forwarded to
-- Supabase by the API server (see lib/supabase.ts -> getUserSupabase).
--
-- PREREQUISITE (deployment): Supabase must accept our application's session JWT.
-- Set the project's JWT secret (Settings -> API -> JWT Secret) to the same value
-- as the app's JWT_SECRET. Our token is signed with role:'authenticated' and
-- aud:'authenticated', so Supabase treats forwarded requests as the
-- `authenticated` role and `auth.uid()` resolves to the user id.
--
-- Requests sent with no session run as the `anon` role, where auth.uid() is
-- NULL; the policies below therefore expose only public data to anonymous
-- callers (e.g. public posts).
-- =============================================================================

-- Roles & privileges ------------------------------------------------------------
-- Read access for both API roles; write access only for authenticated users.
GRANT SELECT ON users, posts, comments, post_likes, comment_likes TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON posts, comments, post_likes, comment_likes TO authenticated;
-- Users can update their own profile; inserts happen server-side via service role.
GRANT UPDATE ON users TO authenticated;

-- CRITICAL: never let the API roles read credential material. password_hash is
-- only ever read by the service-role login path (lib/supabase getServiceSupabase),
-- which bypasses these grants. Service role keeps full access.
REVOKE SELECT (password_hash) ON users FROM anon, authenticated;

-- Enable RLS on every table (default-deny until a policy allows access) --------
ALTER TABLE users         ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts         ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_likes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE comment_likes ENABLE ROW LEVEL SECURITY;

-- users ------------------------------------------------------------------------
-- Profiles are public (any authenticated/anon reader may see names), but a user
-- may only modify their own row. Registration inserts the row via the service
-- role, so no INSERT policy is defined here by design.
CREATE POLICY users_select ON users FOR SELECT USING (true);
CREATE POLICY users_update ON users FOR UPDATE USING (auth.uid() = id);
CREATE POLICY users_delete ON users FOR DELETE USING (auth.uid() = id);

-- posts ------------------------------------------------------------------------
-- Private posts are visible ONLY to their owner; public posts are visible to
-- everyone. This is the core rule that previously lived only in app code.
CREATE POLICY posts_select ON posts FOR SELECT
  USING (is_private = false OR auth.uid() = user_id);
CREATE POLICY posts_insert ON posts FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY posts_update ON posts FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY posts_delete ON posts FOR DELETE
  USING (auth.uid() = user_id);

-- comments ---------------------------------------------------------------------
-- A comment is visible only if its parent post is visible.
CREATE POLICY comments_select ON comments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM posts p
      WHERE p.id = comments.post_id
        AND (p.is_private = false OR p.user_id = auth.uid())
    )
  );
CREATE POLICY comments_insert ON comments FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY comments_update ON comments FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY comments_delete ON comments FOR DELETE
  USING (auth.uid() = user_id);

-- post_likes -------------------------------------------------------------------
-- Who liked a post is visible only when the post itself is visible.
CREATE POLICY post_likes_select ON post_likes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM posts p
      WHERE p.id = post_likes.post_id
        AND (p.is_private = false OR p.user_id = auth.uid())
    )
  );
CREATE POLICY post_likes_insert ON post_likes FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY post_likes_delete ON post_likes FOR DELETE
  USING (auth.uid() = user_id);

-- comment_likes ----------------------------------------------------------------
-- Visible only when the comment's parent post is visible.
CREATE POLICY comment_likes_select ON comment_likes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM comments c
      JOIN posts p ON p.id = c.post_id
      WHERE c.id = comment_likes.comment_id
        AND (p.is_private = false OR p.user_id = auth.uid())
    )
  );
CREATE POLICY comment_likes_insert ON comment_likes FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY comment_likes_delete ON comment_likes FOR DELETE
  USING (auth.uid() = user_id);

-- =============================================================================
-- Denormalized counters + query performance (tasks 9 & 11)
-- -----------------------------------------------------------------------------
-- like_count / comment_count are stored on posts so the feed no longer has to
-- COUNT() likes and comments per post on every read. They are maintained by
-- database triggers, so they stay correct regardless of which code path
-- inserts/removes a like or comment.
-- =============================================================================

ALTER TABLE posts ADD COLUMN like_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE posts ADD COLUMN comment_count INTEGER NOT NULL DEFAULT 0;

-- Backfill any pre-existing rows.
UPDATE posts p
SET like_count = (SELECT count(*) FROM post_likes pl WHERE pl.post_id = p.id),
    comment_count = (SELECT count(*) FROM comments c WHERE c.post_id = p.id);

-- SECURITY DEFINER so the counter UPDATE is not blocked by the posts RLS UPDATE
-- policy (a like on post Y is written by user X, who does not own post Y).
CREATE OR REPLACE FUNCTION sync_post_like_count() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE posts SET like_count = like_count + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE posts SET like_count = greatest(like_count - 1, 0) WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION sync_post_comment_count() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE posts SET comment_count = comment_count + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE posts SET comment_count = greatest(comment_count - 1, 0) WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_post_like_count ON post_likes;
CREATE TRIGGER trg_post_like_count
  AFTER INSERT OR DELETE ON post_likes
  FOR EACH ROW EXECUTE FUNCTION sync_post_like_count();

DROP TRIGGER IF EXISTS trg_post_comment_count ON comments;
CREATE TRIGGER trg_post_comment_count
  AFTER INSERT OR DELETE ON comments
  FOR EACH ROW EXECUTE FUNCTION sync_post_comment_count();

COMMIT;
