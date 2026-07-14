import { NextResponse } from 'next/server';
import { getUserSupabase } from '@/lib/supabase';
import { getUserId } from '@/lib/auth';
import { encodeCursor, decodeCursor } from '@/lib/cursor';
import { createPostSchema, validateJson } from '@/lib/validation';

export const runtime = 'nodejs';

type PostRow = {
  id: string;
  user_id: string;
  content: string;
  image_url: string | null;
  is_private: boolean;
  created_at: string;
  like_count: number;
  comment_count: number;
};

type FeedPost = PostRow & {
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  like_count: number;
  comment_count: number;
  liked: boolean;
  likers: Array<{ user_id: string; first_name: string | null; last_name: string | null }>;
};

export async function POST(request: Request) {
  try {
    const supabase = getUserSupabase(request);
    const userId = getUserId(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const parsed = await validateJson(createPostSchema, request);
    if ('response' in parsed) {
      return parsed.response;
    }
    const { content, image_url, is_private } = parsed.data;

    const { data: post, error } = await supabase
      .from('posts')
      .insert({
        user_id: userId,
        content,
        image_url: image_url ?? null,
        is_private,
      })
      .select('id, user_id, content, image_url, is_private, created_at')
      .single();

    if (error || !post) {
      return NextResponse.json({ error: error?.message || 'Failed to create post' }, { status: 500 });
    }

    // Resolve the author's profile name so the client can render a real
    // identity instead of a placeholder for the freshly-created post.
    const { data: authorUser } = await supabase
      .from('users')
      .select('first_name, last_name, avatar_url')
      .eq('id', post.user_id)
      .single();

    const feedPost: FeedPost = {
      ...(post as PostRow),
      first_name: authorUser?.first_name ?? null,
      last_name: authorUser?.last_name ?? null,
      avatar_url: authorUser?.avatar_url ?? null,
      like_count: 0,
      comment_count: 0,
      liked: false,
      likers: [],
    };

    return NextResponse.json({ post: feedPost }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const supabase = getUserSupabase(request);
    const userId = getUserId(request);
    const { searchParams } = new URL(request.url);
    const cursor = decodeCursor(searchParams.get('cursor'));
    const profileUserId = searchParams.get('user_id');

    const limit = 10;
    const query = supabase
      .from('posts')
      .select('id, user_id, content, image_url, is_private, created_at, like_count, comment_count')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit + 1);

    if (cursor) {
      query.or(
        `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`
      );
    }

    // Optional profile scope: only posts by a given author. Index
    // idx_posts_user_created serves this access pattern.
    if (profileUserId) {
      query.eq('user_id', profileUserId);
    }

    // Defense-in-depth visibility filter. RLS already enforces this at the DB
    // level; this keeps behavior correct even if RLS is misconfigured.
    if (userId) {
      query.or(`is_private.eq.false,user_id.eq.${userId}`);
    } else {
      query.eq('is_private', false);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = (data || []) as PostRow[];
    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;

    const ids = pageRows.map((p) => p.id);
    const authorIds = Array.from(new Set(pageRows.map((p) => p.user_id)));

    const likedByUser = new Set<string>();
    const likersMap: Record<string, Array<{ user_id: string; first_name: string | null; last_name: string | null }>> = {};
    const usersMap: Record<string, { first_name: string | null; last_name: string | null; avatar_url: string | null }> = {};

    if (ids.length > 0) {
      // Likers list per post (who liked) plus the author profiles for each post,
      // used to render real names instead of placeholders on the client.
      const [{ data: likeRows }, { data: myLikes }, { data: authorUsers }] = await Promise.all([
        supabase.from('post_likes').select('post_id, user_id, users(first_name, last_name)').in('post_id', ids),
        userId
          ? supabase.from('post_likes').select('post_id').in('post_id', ids).eq('user_id', userId)
          : Promise.resolve({ data: [] as { post_id: string }[], error: null }),
        supabase.from('users').select('id, first_name, last_name, avatar_url').in('id', authorIds),
      ]);

      for (const u of (authorUsers || []) as { id: string; first_name: string | null; last_name: string | null; avatar_url: string | null }[]) {
        usersMap[u.id] = { first_name: u.first_name, last_name: u.last_name, avatar_url: u.avatar_url };
      }

      for (const row of (likeRows || []) as { post_id: string; user_id: string; users: { first_name: string | null; last_name: string | null } | { first_name: string | null; last_name: string | null }[] | null }[]) {
        const userMeta = Array.isArray(row.users) ? row.users[0] : row.users;
        if (!likersMap[row.post_id]) likersMap[row.post_id] = [];
        likersMap[row.post_id].push({
          user_id: row.user_id,
          first_name: userMeta?.first_name ?? null,
          last_name: userMeta?.last_name ?? null,
        });
      }
      for (const row of (myLikes || []) as { post_id: string }[]) {
        likedByUser.add(row.post_id);
      }
    }

    const posts: FeedPost[] = pageRows.map((p) => ({
      ...p,
      first_name: usersMap[p.user_id]?.first_name ?? null,
      last_name: usersMap[p.user_id]?.last_name ?? null,
      avatar_url: usersMap[p.user_id]?.avatar_url ?? null,
      like_count: p.like_count,
      comment_count: p.comment_count,
      liked: likedByUser.has(p.id),
      likers: likersMap[p.id] || [],
    }));

    const last = pageRows[pageRows.length - 1];
    const nextCursor = hasMore && last ? encodeCursor(last.created_at, last.id) : null;

    return NextResponse.json({ posts, nextCursor }, { status: 200 });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
