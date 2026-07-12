import { NextResponse } from 'next/server';
import { getUserSupabase } from '@/lib/supabase';
import { getSession } from '@/lib/auth';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ user: null }, { status: 200 });
  }

  const supabase = getUserSupabase(request);

  const { data, error } = await supabase
    .from('users')
    .select('id, email, first_name, last_name')
    .eq('id', session.userId)
    .single();

  if (error || !data) {
    return NextResponse.json({ user: null }, { status: 200 });
  }

  return NextResponse.json({
    user: {
      id: data.id,
      email: data.email,
      first_name: data.first_name,
      last_name: data.last_name,
    },
  });
}
