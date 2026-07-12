import { NextResponse } from 'next/server';
import { getUserSupabase } from '@/lib/supabase';
import { getUserId } from '@/lib/auth';
import { createCommentSchema, validateJson } from '@/lib/validation';
import { encodeCursor, decodeCursor } from '@/lib/cursor';

const COMMENT_PAGE_SIZE = 50;

export const runtime = 'nodejs';

type CommentRow = {
  id: string;
  post_id: string;
  user_id: string;
  parent_id: string | null;
  content: string;
  created_at: string;
};

type UserJoin = { first_name: string | null; last_name: string | null };

function fullName(u: UserJoin | null | undefined): string {
  const name = `${u?.first_name ?? ''} ${u?.last_name ?? ''}`.trim();
  return name || 'Buddy Member';
}

type CommentResponse = CommentRow & {
  author: string;
  liked: boolean;
  like_count: number;
  likers: Array<{ user_id: string; first_name: string | null; last_name: string | null }>;
};

export async function GET(request: Request) {
  try {
    const supabase = getUserSupabase(request);
    const userId = getUserId(request);
    const { searchParams } = new URL(request.url);
    const postId = searchParams.get('post_id');
    const parentId = searchParams.get('parent_id');
    const cursor = decodeCursor(searchParams.get('cursor'));

    if (!postId) {
      return NextResponse.json({ error: 'post_id is required' }, { status: 400 });
    }

    let query = supabase
      .from('comments')
      .select('id, post_id, user_id, parent_id, content, created_at')
      .eq('post_id', postId);

    if (parentId) {
      query = query.eq('parent_id', parentId);
    }

    if (cursor) {
      query = query.or(
        `created_at.gt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.gt.${cursor.id})`
      );
    }

    const { data, error } = await query
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(COMMENT_PAGE_SIZE + 1);

    if (error) {
      console.error('Comments query error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = (data || []) as CommentRow[];
    const hasMore = rows.length > COMMENT_PAGE_SIZE;
    const pageRows = hasMore ? rows.slice(0, COMMENT_PAGE_SIZE) : rows;

    const commentIds = pageRows.map((c) => c.id);
    const commentUserIds = Array.from(new Set(pageRows.map((c) => c.user_id)));

    let likedByUser = new Set<string>();
    let likersMap: Record<string, Array<{ user_id: string; first_name: string | null; last_name: string | null }>> = {};
    let likeCounts: Record<string, number> = {};
    let usersMap: Record<string, { first_name: string | null; last_name: string | null }> = {};

    if (commentUserIds.length > 0) {
      const { data: users, error: usersError } = await supabase
        .from('users')
        .select('id, first_name, last_name')
        .in('id', commentUserIds);

      if (usersError) {
        console.error('Users query error:', usersError);
      }

      for (const u of (users || []) as { id: string; first_name: string | null; last_name: string | null }[]) {
        usersMap[u.id] = { first_name: u.first_name, last_name: u.last_name };
      }
    }

    if (commentIds.length > 0) {
      const { data: likeRows, error: likesError } = await supabase
        .from('comment_likes')
        .select('comment_id, user_id')
        .in('comment_id', commentIds);

      if (likesError) {
        console.error('Comment likes query error:', likesError);
      }

      const likeUserIds = Array.from(new Set((likeRows || []).map((r) => r.user_id)));
      if (likeUserIds.length > 0) {
        const { data: likerUsers } = await supabase
          .from('users')
          .select('id, first_name, last_name')
          .in('id', likeUserIds);

        const likerUsersMap: Record<string, { first_name: string | null; last_name: string | null }> = {};
        for (const u of (likerUsers || []) as { id: string; first_name: string | null; last_name: string | null }[]) {
          likerUsersMap[u.id] = { first_name: u.first_name, last_name: u.last_name };
        }

        for (const row of (likeRows || []) as { comment_id: string; user_id: string }[]) {
          likeCounts[row.comment_id] = (likeCounts[row.comment_id] || 0) + 1;
          if (userId && row.user_id === userId) likedByUser.add(row.comment_id);

          if (!likersMap[row.comment_id]) likersMap[row.comment_id] = [];
          likersMap[row.comment_id].push({
            user_id: row.user_id,
            first_name: likerUsersMap[row.user_id]?.first_name ?? null,
            last_name: likerUsersMap[row.user_id]?.last_name ?? null,
          });
        }
      }
    }

    const comments: CommentResponse[] = pageRows.map((row) => {
      const author = fullName(usersMap[row.user_id] || null);
      return {
        ...row,
        author,
        liked: likedByUser.has(row.id),
        like_count: likeCounts[row.id] || 0,
        likers: likersMap[row.id] || [],
      };
    });

    const last = pageRows[pageRows.length - 1];
    const nextCursor = hasMore && last ? encodeCursor(last.created_at, last.id) : null;

    return NextResponse.json({ comments, nextCursor }, { status: 200 });
  } catch (err) {
    console.error('Comments GET handler error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = getUserSupabase(request);
    const userId = getUserId(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const parsed = await validateJson(createCommentSchema, request);
    if ('response' in parsed) {
      return parsed.response;
    }
    const { post_id, content, parent_id } = parsed.data;

    if (parent_id) {
      const { data: parent, error: parentError } = await supabase
        .from('comments')
        .select('post_id')
        .eq('id', parent_id)
        .single();

      if (parentError || !parent || parent.post_id !== post_id) {
        return NextResponse.json({ error: 'Invalid parent_id for this post' }, { status: 400 });
      }
    }

    const { data: comment, error } = await supabase
      .from('comments')
      .insert({
        post_id,
        user_id: userId,
        content,
        parent_id: parent_id ?? null,
      })
      .select('id, post_id, user_id, parent_id, content, created_at')
      .single();

    if (error || !comment) {
      console.error('Comment insert error:', error);
      return NextResponse.json({ error: error?.message || 'Failed to create comment' }, { status: 500 });
    }

    const { data: authorUser } = await supabase
      .from('users')
      .select('first_name, last_name')
      .eq('id', comment.user_id)
      .single();

    const result: CommentResponse = {
      ...comment,
      author: fullName(authorUser),
      liked: false,
      like_count: 0,
      likers: [],
    };

    return NextResponse.json({ comment: result }, { status: 201 });
  } catch (err) {
    console.error('Comments POST handler error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
