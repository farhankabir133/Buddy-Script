/**
 * In-memory fixed-window rate limiter.
 *
 * Used to throttle /api/auth/login and /api/auth/register (5 attempts per 15
 * minutes per IP) as a brute-force defense. The store is a module-level Map,
 * so it is per-server-instance: it works for a single node and is a reasonable
 * first line of defense, but on a horizontally-scaled / serverless deployment
 * each instance keeps its own counters. For production with multiple instances,
 * back this with a shared store (e.g. Redis) — see RLS/security notes.
 */
import { NextResponse } from 'next/server';

type Window = { count: number; resetAt: number };

const windows = new Map<string, Window>();

export type RateLimitResult = {
  success: boolean;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
};

export function rateLimit(
  key: string,
  opts: { limit: number; windowMs: number }
): RateLimitResult {
  const now = Date.now();
  const existing = windows.get(key);

  if (!existing || existing.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + opts.windowMs });
    return { success: true, remaining: opts.limit - 1, resetAt: now + opts.windowMs, retryAfterSeconds: 0 };
  }

  if (existing.count >= opts.limit) {
    return {
      success: false,
      remaining: 0,
      resetAt: existing.resetAt,
      retryAfterSeconds: Math.ceil((existing.resetAt - now) / 1000),
    };
  }

  existing.count += 1;
  return { success: true, remaining: opts.limit - existing.count, resetAt: existing.resetAt, retryAfterSeconds: 0 };
}

/** Best-effort client IP from proxied or direct request headers. */
export function getClientIp(request: Request): string {
  let clientIdentifier = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip');

  if (!clientIdentifier || clientIdentifier === 'unknown') {
    clientIdentifier = process.env.NODE_ENV === 'development' ? '127.0.0.1' : 'unresolved_client_ip';
  }

  return clientIdentifier;
}

/** 5 auth attempts per 15 minutes per IP. */
export function authRateLimit(request: Request): RateLimitResult {
  return rateLimit(`auth:${getClientIp(request)}`, { limit: 5, windowMs: 15 * 60 * 1000 });
}

/** Returns a 429 response when the caller has exceeded the auth rate limit. */
export function rateLimitedResponse(result: RateLimitResult): NextResponse {
  const retryAfter = Math.max(1, result.retryAfterSeconds);
  return new NextResponse(
    JSON.stringify({
      error: 'Too many attempts. Please try again later.',
      retryAfterSeconds: retryAfter,
    }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(retryAfter),
      },
    }
  );
}
