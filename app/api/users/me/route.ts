import { NextResponse } from 'next/server';
import { getUserSupabase } from '@/lib/supabase';
import { getUserId } from '@/lib/auth';
import { updateProfileSchema, validateJson } from '@/lib/validation';

export const runtime = 'nodejs';

/**
 * PATCH /api/users/me
 *
 * Updates the caller's own profile (avatar_url, cover_url, headline, bio,
 * location). The update runs as the user via the RLS-authenticated client, so
 * the `users_update` policy (`auth.uid() = id`) is the enforced boundary — a
 * caller can never modify another row. Body fields are optional; only provided
 * keys are written.
 */
export async function PATCH(request: Request) {
  try {
    const userId = getUserId(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const parsed = await validateJson(updateProfileSchema, request);
    if ('response' in parsed) {
      return parsed.response;
    }

    const data = parsed.data;
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const supabase = getUserSupabase(request);
    const { data: user, error } = await supabase
      .from('users')
      .update(data)
      .eq('id', userId)
      .select('id, first_name, last_name, avatar_url, cover_url, headline, bio, location, created_at')
      .single();

    if (error || !user) {
      return NextResponse.json(
        { error: error?.message || 'Failed to update profile' },
        { status: 500 }
      );
    }

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
        },
      },
      { status: 200 }
    );
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
