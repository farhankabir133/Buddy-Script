import { NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase';
import { getUserId } from '@/lib/auth';
import { rateLimit, getClientIp, rateLimitedResponse } from '@/lib/rate-limit';

export const runtime = 'nodejs';

const BUCKET = 'post-images';
const MAX_BYTES = 5 * 1024 * 1024; // 5MB

// Map a handful of image mime types to file extensions. Client uploads are
// re-encoded to JPEG, but keep this generic so raw types still work.
const EXT_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/**
 * Authenticated image upload.
 *
 * The browser Supabase client runs as the anon role and cannot forward our
 * httpOnly session JWT, so it is blocked by Storage RLS. Instead we upload here
 * on the server using the service-role client (which bypasses RLS) after
 * verifying the caller's session. The service key never leaves the server.
 */
export async function POST(request: Request) {
  try {
    const userId = getUserId(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Light abuse protection: 30 uploads / 15 min per IP.
    const limit = rateLimit(`upload:${getClientIp(request)}`, {
      limit: 30,
      windowMs: 15 * 60 * 1000,
    });
    if (!limit.success) {
      return rateLimitedResponse(limit);
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 });
    }

    const file = formData.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'Only image files are allowed' }, { status: 400 });
    }
    if (file.size === 0) {
      return NextResponse.json({ error: 'File is empty' }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'Image must be less than 5MB' }, { status: 400 });
    }

    const ext = EXT_BY_TYPE[file.type] ?? 'jpg';
    // Namespace by user id so objects are organized and non-guessable.
    const fileName = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const buffer = Buffer.from(await file.arrayBuffer());
    const supabase = getServiceSupabase();

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(fileName, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(fileName);

    return NextResponse.json({ url: data.publicUrl }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
