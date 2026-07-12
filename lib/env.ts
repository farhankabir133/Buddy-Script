/**
 * Fail-fast environment variable validation.
 *
 * Importing this module runs `validateEnv()` at load time, so any missing
 * required server variable aborts startup (build or first request) instead of
 * failing later with a cryptic "Cannot read properties of undefined" deep in a
 * request. The routes that touch Supabase/JWT import lib/supabase or lib/auth,
 * both of which import this file, so coverage is automatic.
 */

const REQUIRED: Record<string, string | undefined> = {
  JWT_SECRET: process.env.JWT_SECRET,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
};

export function validateEnv(): void {
  const missing = Object.entries(REQUIRED)
    .filter(([, value]) => !value || value.trim() === '')
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(', ')}. ` +
        'Set them in .env.local (or your deployment environment) and restart.'
    );
  }
}

validateEnv();
