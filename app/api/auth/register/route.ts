import { NextResponse } from 'next/server';
import bcrypt from 'bcrypt';
import { getServiceSupabase } from '@/lib/supabase';
import { setSessionCookie } from '@/lib/auth';
import { registerSchema, validateJson } from '@/lib/validation';
import { authRateLimit, rateLimitedResponse } from '@/lib/rate-limit';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const limit = authRateLimit(request);
  if (!limit.success) {
    return rateLimitedResponse(limit);
  }

  try {
    const parsed = await validateJson(registerSchema, request);
    if ('response' in parsed) {
      return parsed.response;
    }
    const { email, password, first_name, last_name } = parsed.data;

    const supabase = getServiceSupabase();

    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (existingUser) {
      return NextResponse.json({ error: 'User already exists' }, { status: 409 });
    }

    const password_hash = await bcrypt.hash(password, 10);

    const { data: user, error: insertError } = await supabase
      .from('users')
      .insert({
        email,
        password_hash,
        first_name,
        last_name,
      })
      .select('id, email, first_name, last_name, avatar_url, cover_url, headline, bio, location, created_at')
      .single();

    if (insertError || !user) {
      return NextResponse.json(
        { error: insertError?.message || 'Failed to create user' },
        { status: 500 }
      );
    }

    const response = NextResponse.json(
      {
        user: {
          id: user.id,
          email: user.email,
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
      { status: 201 }
    );
    setSessionCookie(response, { userId: user.id });
    return response;
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
