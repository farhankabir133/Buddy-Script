import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { validateEnv } from './env';
import { getSession } from './auth';

validateEnv();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

let serviceCached: SupabaseClient | null = null;

/**
 * Service-role client. Bypasses Row Level Security entirely and has full DB
 * access. Use ONLY for operations RLS cannot express — see the security notes:
 * user registration (inserting the users row) and login (reading
 * password_hash). Never import this into client code.
 */
export function getServiceSupabase(): SupabaseClient {
  if (!serviceCached) {
    serviceCached = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  }
  return serviceCached;
}

/**
 * Per-request client authenticated as the end user. It uses the anon key but
 * forwards the caller's session JWT in the Authorization header, so Supabase
 * enforces Row Level Security against `auth.uid()` (= the JWT `sub` claim).
 *
 * This is what makes the RLS policies in the migration actually apply: queries
 * run *as the user*, not as the service role. For this to work, Supabase must
 * accept our session JWT — i.e. the project's JWT secret must equal JWT_SECRET
 * (see security notes). Requests without a session run as the anon role.
 */
export function getUserSupabase(request: Request): SupabaseClient {
  const session = getSession(request);
  const headers: Record<string, string> = {};

  if (session) {
    const cookie = request.headers.get('cookie') || '';
    const match = cookie.match(/auth_session=([^;]+)/);
    if (match) {
      headers.Authorization = `Bearer ${match[1]}`;
    }
  }

  return createClient(SUPABASE_URL, ANON_KEY, { global: { headers } });
}
