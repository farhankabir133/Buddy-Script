import { NextResponse } from 'next/server';
import { getUserSupabase } from '@/lib/supabase';
import { getUserId } from '@/lib/auth';
import { likeSchema, validateJson } from '@/lib/validation';

export const runtime = 'nodejs';

function resolveTarget(targetType: string | null): { table: string; idColumn: string } | null {
  if (targetType === 'post') return { table: 'post_likes', idColumn: 'post_id' };
  if (targetType === 'comment') return { table: 'comment_likes', idColumn: 'comment_id' };
  return null;
}

type Liker = {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
};

export async function GET(request: Request) {
  try {
    const supabase = getUserSupabase(request);
    const userId = getUserId(request);
    const { searchParams } = new URL(request.url);
    const target_type = searchParams.get('target_type');
    const target_id = searchParams.get('target_id');

    const query = likeSchema.safeParse({ target_type, target_id });
    if (!query.success) {
      const issues = query.error.issues.map((i) => ({ path: i.path.join('.') || '(root)', message: i.message }));
      return NextResponse.json({ error: 'Validation failed', issues }, { status: 400 });
    }

    const target = resolveTarget(query.data.target_type);
    if (!target) {
      return NextResponse.json(
        { error: 'Validation failed', issues: [{ path: 'target_type', message: 'Invalid target_type' }] },
        { status: 400 }
      );
    }
    const targetId = query.data.target_id;

    const { data, error } = await supabase
      .from(target.table)
      .select('user_id, users(first_name, last_name)')
      .eq(target.idColumn, targetId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = (data || []) as { user_id: string; users: { first_name: string | null; last_name: string | null } | { first_name: string | null; last_name: string | null }[] | null }[];
    const liked = userId ? rows.some((r) => r.user_id === userId) : false;

    const likers: Liker[] = rows.map((r) => {
      const userMeta = Array.isArray(r.users) ? r.users[0] : r.users;
      return {
        user_id: r.user_id,
        first_name: userMeta?.first_name ?? null,
        last_name: userMeta?.last_name ?? null,
      };
    });

    return NextResponse.json({ liked, count: rows.length, likers }, { status: 200 });
  } catch {
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

    const parsed = await validateJson(likeSchema, request);
    if ('response' in parsed) {
      return parsed.response;
    }
    const { target_type, target_id } = parsed.data;

    const target = resolveTarget(target_type);
    if (!target) {
      return NextResponse.json({ error: 'Valid target_type is required' }, { status: 400 });
    }

    const { table, idColumn } = target;

    const { data: existing } = await supabase
      .from(table)
      .select('user_id')
      .eq(idColumn, target_id)
      .eq('user_id', userId)
      .maybeSingle();

    let liked: boolean;

    if (existing) {
      await supabase.from(table).delete().eq(idColumn, target_id).eq('user_id', userId);
      liked = false;
    } else {
      await supabase.from(table).insert({ user_id: userId, [idColumn]: target_id });
      liked = true;
    }

    const { data: users } = await supabase
      .from(table)
      .select('user_id, users(first_name, last_name)')
      .eq(idColumn, target_id);

    const rows = (users || []) as { user_id: string; users: { first_name: string | null; last_name: string | null } | { first_name: string | null; last_name: string | null }[] | null }[];
    const count = rows.length;
    const likers: Liker[] = rows.map((r) => {
      const userMeta = Array.isArray(r.users) ? r.users[0] : r.users;
      return {
        user_id: r.user_id,
        first_name: userMeta?.first_name ?? null,
        last_name: userMeta?.last_name ?? null,
      };
    });

    return NextResponse.json({ liked, count, likers }, { status: 200 });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
