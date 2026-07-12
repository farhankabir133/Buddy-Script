import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('GET /api/users/[id]', () => {
  let GET: any;
  let mockGetSupabase: any;
  let mockGetUserId: any;

  const userData = {
    id: 'user-1',
    first_name: 'Ada',
    last_name: 'Lovelace',
    avatar_url: null,
    cover_url: null,
    headline: 'Engineer',
    bio: 'Hello',
    location: 'London',
    created_at: '2024-01-01T00:00:00Z',
  };

  function chain(impl: Record<string, any>) {
    const c: any = {};
    for (const key of Object.keys(impl)) c[key] = impl[key];
    return c;
  }

  function makeSupabase(userResult: any, postCount: number) {
    const usersChain = chain({
      select: () => usersChain,
      eq: () => usersChain,
      maybeSingle: () => Promise.resolve(userResult),
    });
    const postsChain = chain({
      select: () => postsChain,
      eq: () => Promise.resolve({ count: postCount, error: null }),
    });
    return {
      from: (table: string) => (table === 'users' ? usersChain : postsChain),
    };
  }

  function createRequest(url: string, cookie = ''): Request {
    return new Request(url, { headers: { cookie } });
  }

  beforeEach(async () => {
    vi.resetModules();

    vi.doMock('next/server', () => ({
      NextResponse: {
        json: (body: any, init?: { status?: number }) =>
          new Response(JSON.stringify(body), {
            status: init?.status || 200,
            headers: { 'Content-Type': 'application/json' },
          }),
      },
    }));

    vi.doMock('jsonwebtoken', () => ({
      default: { verify: vi.fn(() => ({ sub: 'viewer' })), sign: vi.fn() },
    }));

    mockGetSupabase = vi.fn();
    mockGetUserId = vi.fn();

    vi.doMock('@/lib/supabase', () => ({ getUserSupabase: mockGetSupabase }));
    vi.doMock('@/lib/auth', () => ({ getUserId: mockGetUserId }));

    const module = await import('@/app/api/users/[id]/route');
    GET = module.GET;
  });

  it('returns the public profile with a post count', async () => {
    mockGetSupabase.mockReturnValue(makeSupabase({ data: userData, error: null }, 3));
    mockGetUserId.mockReturnValue('viewer');

    const res = await GET(createRequest('http://localhost/api/users/user-1'), {
      params: { id: 'user-1' },
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.user.id).toBe('user-1');
    expect(body.user.first_name).toBe('Ada');
    expect(body.user.post_count).toBe(3);
    expect(body.user.is_self).toBe(false);
    expect('email' in body.user).toBe(false);
  });

  it('marks is_self when the viewer is the owner', async () => {
    mockGetSupabase.mockReturnValue(makeSupabase({ data: userData, error: null }, 0));
    mockGetUserId.mockReturnValue('user-1');

    const res = await GET(createRequest('http://localhost/api/users/user-1'), {
      params: { id: 'user-1' },
    });
    const body = await res.json();
    expect(body.user.is_self).toBe(true);
  });

  it('returns 404 when the user does not exist', async () => {
    mockGetSupabase.mockReturnValue(makeSupabase({ data: null, error: null }, 0));
    mockGetUserId.mockReturnValue('viewer');

    const res = await GET(createRequest('http://localhost/api/users/missing'), {
      params: { id: 'missing' },
    });
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/users/me', () => {
  let PATCH: any;
  let mockGetSupabase: any;
  let mockGetUserId: any;

  function makeSupabase(updateResult: any) {
    const updateChain = {
      update: () => updateChain,
      eq: () => updateChain,
      select: () => updateChain,
      single: () => Promise.resolve(updateResult),
    };
    return { from: () => updateChain };
  }

  function createRequest(url: string, body: any, cookie = 'auth_session=valid'): Request {
    return new Request(url, {
      method: 'PATCH',
      headers: { cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  beforeEach(async () => {
    vi.resetModules();

    vi.doMock('next/server', () => ({
      NextResponse: {
        json: (b: any, init?: { status?: number }) =>
          new Response(JSON.stringify(b), {
            status: init?.status || 200,
            headers: { 'Content-Type': 'application/json' },
          }),
      },
    }));

    vi.doMock('jsonwebtoken', () => ({
      default: { verify: vi.fn(() => ({ sub: 'user-1' })), sign: vi.fn() },
    }));

    mockGetSupabase = vi.fn();
    mockGetUserId = vi.fn();

    vi.doMock('@/lib/supabase', () => ({ getUserSupabase: mockGetSupabase }));
    vi.doMock('@/lib/auth', () => ({ getUserId: mockGetUserId }));

    const module = await import('@/app/api/users/me/route');
    PATCH = module.PATCH;
  });

  it('updates profile fields for an authenticated user', async () => {
    mockGetUserId.mockReturnValue('user-1');
    mockGetSupabase.mockReturnValue(
      makeSupabase({
        data: { id: 'user-1', first_name: 'Ada', last_name: 'Lovelace', avatar_url: 'https://x/a.jpg', cover_url: null, headline: 'CTO', bio: 'hi', location: 'London' },
        error: null,
      })
    );

    const res = await PATCH(createRequest('http://localhost/api/users/me', { headline: 'CTO', location: 'London' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.user.headline).toBe('CTO');
    expect(body.user.location).toBe('London');
  });

  it('returns 401 when unauthenticated', async () => {
    mockGetUserId.mockReturnValue(null);
    const res = await PATCH(createRequest('http://localhost/api/users/me', { bio: 'x' }, ''));
    expect(res.status).toBe(401);
  });

  it('returns 400 when no fields are supplied', async () => {
    mockGetUserId.mockReturnValue('user-1');
    const res = await PATCH(createRequest('http://localhost/api/users/me', {}));
    expect(res.status).toBe(400);
  });

  it('rejects an over-long headline with a 400 validation error', async () => {
    mockGetUserId.mockReturnValue('user-1');
    const res = await PATCH(createRequest('http://localhost/api/users/me', { headline: 'x'.repeat(200) }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Validation failed/);
  });
});
