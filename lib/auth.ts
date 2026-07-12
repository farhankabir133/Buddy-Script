import type { NextResponse } from 'next/server';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import { validateEnv } from './env';

validateEnv();

const JWT_SECRET = process.env.JWT_SECRET!;
const SESSION_COOKIE = 'auth_session';
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days

/**
 * The only data placed in the signed session token is the user's id
 * (`sub`). We deliberately keep the payload free of any sensitive data:
 * no email, no password hash, no role. Anyone can decode the JWT client/
 * network-side, so the payload must never carry secrets or PII beyond the
 * opaque identifier needed to look the user up server-side.
 */
export type SessionPayload = {
  userId: string;
};

export function getSession(request: Request): SessionPayload | null {
  const cookie = request.headers.get('cookie') || '';
  const match = cookie.match(/auth_session=([^;]+)/);
  if (!match) return null;
  try {
    const decoded = jwt.verify(match[1], JWT_SECRET) as JwtPayload;
    const userId = decoded.sub;
    if (typeof userId !== 'string' || userId.length === 0) return null;
    return { userId };
  } catch {
    return null;
  }
}

/** Convenience wrapper returning only the userId (or null). */
export function getUserId(request: Request): string | null {
  return getSession(request)?.userId ?? null;
}

/** Sign a session token and attach it as an httpOnly cookie on the response. */
export function setSessionCookie(response: NextResponse, payload: SessionPayload): void {
  const token = jwt.sign(
    {
      sub: payload.userId,
      role: 'authenticated',
      iss: 'buddy-script',
      aud: 'authenticated',
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE,
  });
}

/** Clear the session cookie on the response. */
export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
}
