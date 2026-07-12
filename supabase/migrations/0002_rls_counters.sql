-- =============================================================================
-- Incremental, IDEMPOTENT migration.
-- The base tables (users/posts/comments/post_likes/comment_likes) already exist
-- in the project's Supabase database, but the later additions — RLS policies,
-- composite indexes, denormalized like_count/comment_count columns, and the
-- sync triggers — were not applied. This script adds exactly those pieces and
-- is safe to run more than once (every statement is guarded).
--
-- How to apply: Supabase dashboard -> SQL Editor -> paste this file -> Run.
-- After running, also create a `post-images` Storage bucket set to Public.
-- =============================================================================

-- 1) Denormalized counters (task 11) ------------------------------------------
ALTER TABLE posts ADD COLUMN IF NOT EXISTS like_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS comment_count INTEGER NOT NULL DEFAULT 0;

-- Backfill existing rows from the like/comment tables.
UPDATE posts p
SET like_count = (SELECT count(*) FROM post_likes pl WHERE pl.post_id = p.id),
    comment_count = (SELECT count(*) FROM comments c WHERE c.post_id = p.id);

-- 2) Indexes (task 9) ----------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_posts_feed_lookup ON posts (is_private, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_user_created ON posts (user_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_posts_created_at_id ON posts (created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_comments_post_created ON comments (post_id, created_at ASC, id ASC);
CREATE INDEX IF NOT EXISTS idx_comments_user_id ON comments (user_id);
CREATE INDEX IF NOT EXISTS idx_comments_parent_id ON comments (parent_id);
CREATE INDEX IF NOT EXISTS idx_post_likes_post_id ON post_likes (post_id);
CREATE INDEX IF NOT EXISTS idx_comment_likes_comment_id ON comment_likes (comment_id);

-- 3) Privileges ----------------------------------------------------------------
GRANT SELECT ON users, posts, comments, post_likes, comment_likes TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON posts, comments, post_likes, comment_likes TO authenticated;
GRANT UPDATE ON users TO authenticated;

-- Never let the API roles read credential material.
REVOKE SELECT (password_hash) ON users FROM anon, authenticated;

-- 4) Row Level Security --------------------------------------------------------
ALTER TABLE users         ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts         ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_likes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE comment_likes ENABLE ROW LEVEL SECURITY;

-- 5) Policies (guarded so re-running is safe) ---------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'users' AND policyname = 'users_select') THEN
    CREATE POLICY users_select ON users FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'users' AND policyname = 'users_update') THEN
    CREATE POLICY users_update ON users FOR UPDATE USING (auth.uid() = id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'users' AND policyname = 'users_delete') THEN
    CREATE POLICY users_delete ON users FOR DELETE USING (auth.uid() = id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'posts' AND policyname = 'posts_select') THEN
    CREATE POLICY posts_select ON posts FOR SELECT USING (is_private = false OR auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'posts' AND policyname = 'posts_insert') THEN
    CREATE POLICY posts_insert ON posts FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'posts' AND policyname = 'posts_update') THEN
    CREATE POLICY posts_update ON posts FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'posts' AND policyname = 'posts_delete') THEN
    CREATE POLICY posts_delete ON posts FOR DELETE USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'comments' AND policyname = 'comments_select') THEN
    CREATE POLICY comments_select ON comments FOR SELECT
      USING (EXISTS (SELECT 1 FROM posts p WHERE p.id = comments.post_id AND (p.is_private = false OR p.user_id = auth.uid())));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'comments' AND policyname = 'comments_insert') THEN
    CREATE POLICY comments_insert ON comments FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'comments' AND policyname = 'comments_update') THEN
    CREATE POLICY comments_update ON comments FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'comments' AND policyname = 'comments_delete') THEN
    CREATE POLICY comments_delete ON comments FOR DELETE USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'post_likes' AND policyname = 'post_likes_select') THEN
    CREATE POLICY post_likes_select ON post_likes FOR SELECT
      USING (EXISTS (SELECT 1 FROM posts p WHERE p.id = post_likes.post_id AND (p.is_private = false OR p.user_id = auth.uid())));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'post_likes' AND policyname = 'post_likes_insert') THEN
    CREATE POLICY post_likes_insert ON post_likes FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'post_likes' AND policyname = 'post_likes_delete') THEN
    CREATE POLICY post_likes_delete ON post_likes FOR DELETE USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'comment_likes' AND policyname = 'comment_likes_select') THEN
    CREATE POLICY comment_likes_select ON comment_likes FOR SELECT
      USING (EXISTS (SELECT 1 FROM comments c JOIN posts p ON p.id = c.post_id WHERE c.id = comment_likes.comment_id AND (p.is_private = false OR p.user_id = auth.uid())));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'comment_likes' AND policyname = 'comment_likes_insert') THEN
    CREATE POLICY comment_likes_insert ON comment_likes FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'comment_likes' AND policyname = 'comment_likes_delete') THEN
    CREATE POLICY comment_likes_delete ON comment_likes FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

-- 6) Counter sync triggers (task 11) ------------------------------------------
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
