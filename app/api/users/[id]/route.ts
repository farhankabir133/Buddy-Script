import { NextResponse } from 'next/server';
import { getUserSupabase } from '@/lib/supabase';
import { getUserId } from '@/lib/auth';

export const runtime = 'nodejs';

/**
 * GET /api/users/[id]
 *
 * Public profile read. Returns the identity fields a social feed needs to
 * render a Facebook/LinkedIn-style profile (name, avatar, cover, headline,
 * bio, location, join date) plus a `post_count`.
 *
 * Visibility of the post count is enforced by RLS on `posts`: the query runs
 * as the caller via the user-scoped client, so the `posts_select` policy
 * (`is_private = false OR auth.uid() = user_id`) automatically counts only the
 * posts the caller is allowed to see. The password hash is never selected.
 */
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = getUserSupabase(request);
    const viewerId = getUserId(request);
    const { id } = params;

    if (!id) {
      return NextResponse.json({ error: 'User id is required' }, { status: 400 });
    }

    const { data: user, error } = await supabase
      .from('users')
      .select('id, first_name, last_name, avatar_url, cover_url, headline, bio, location, created_at')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // RLS-driven count: only visible posts are counted for the caller.
    const { count, error: countError } = await supabase
      .from('posts')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', id);

    const postCount = countError ? 0 : (count ?? 0);

    return NextResponse.json(
      {
        user: {
          id: user.id,
          first_name: user.first_name,
          last_name: user.last_name,
          avatar_url: user.avatar_url,
          cover_url: user.cover_url,
          headline: user.headline,
          bio: user.bio,
          location: user.location,
          created_at: user.created_at,
          post_count: postCount,
          is_self: viewerId === id,
        },
      },
      { status: 200 }
    );
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
