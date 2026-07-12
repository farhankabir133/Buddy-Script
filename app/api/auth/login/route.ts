import { NextResponse } from 'next/server';
import bcrypt from 'bcrypt';
import { getServiceSupabase } from '@/lib/supabase';
import { setSessionCookie } from '@/lib/auth';
import { loginSchema, validateJson } from '@/lib/validation';
import { authRateLimit, rateLimitedResponse } from '@/lib/rate-limit';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const limit = authRateLimit(request);
  if (!limit.success) {
    return rateLimitedResponse(limit);
  }

  try {
    const parsed = await validateJson(loginSchema, request);
    if ('response' in parsed) {
      return parsed.response;
    }
    const { email, password } = parsed.data;

    const supabase = getServiceSupabase();

    const { data: user, error: fetchError } = await supabase
      .from('users')
      .select('id, email, password_hash, first_name, last_name, created_at')
      .eq('email', email)
      .single();

    if (fetchError || !user) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password_hash);

    if (!isPasswordValid) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    const response = NextResponse.json(
      {
        user: {
          id: user.id,
          email: user.email,
          first_name: user.first_name,
          last_name: user.last_name,
          created_at: user.created_at,
        },
      },
      { status: 200 }
    );

    setSessionCookie(response, { userId: user.id });

    return response;
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
