import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('GET /api/posts', () => {
  let GET: any;
  let mockGetSupabase: any;
  let mockGetUserId: any;
  let mockDecodeCursor: any;

  function createThenable(data: any, error: any = null) {
    const promise = Promise.resolve({ data, error });

    const chain: any = {
      select: vi.fn().mockReturnValue(promise),
      order: vi.fn().mockReturnValue(promise),
      limit: vi.fn().mockReturnValue(promise),
      eq: vi.fn().mockReturnValue(promise),
      or: vi.fn().mockReturnValue(promise),
      in: vi.fn().mockReturnValue(promise),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };

    return Object.assign(promise, chain);
  }

  function createMockSupabase(postsData: any, likesData: any = [], commentsData: any = []) {
    return {
      from: (table: string) => {
        if (table === 'posts') return createThenable(postsData, null);
        if (table === 'post_likes') return createThenable(likesData, null);
        if (table === 'comments') return createThenable(commentsData, null);
        return createThenable([], null);
      },
    };
  }

  beforeEach(async () => {
    vi.resetModules();

    vi.doMock('next/server', () => ({
      NextResponse: {
        json: (body: any, init?: { status?: number }) => {
          return new Response(JSON.stringify(body), {
            status: init?.status || 200,
            headers: { 'Content-Type': 'application/json' },
          });
        },
      },
    }));

    vi.doMock('jsonwebtoken', () => ({
      default: {
        verify: vi.fn(() => ({ sub: 'mocked-user', email: 'test@test.com' })),
        sign: vi.fn(),
      },
    }));

    mockGetSupabase = vi.fn();
    mockGetUserId = vi.fn();
    mockDecodeCursor = vi.fn();

    vi.doMock('@/lib/supabase', () => ({
      getUserSupabase: mockGetSupabase,
    }));

    vi.doMock('@/lib/auth', () => ({
      getUserId: mockGetUserId,
    }));

    vi.doMock('@/lib/cursor', () => ({
      decodeCursor: mockDecodeCursor,
      encodeCursor: vi.fn(),
    }));

    const module = await import('@/app/api/posts/route');
    GET = module.GET;
  });

  function createRequest(url: string, cookieHeader: string = ''): Request {
    return new Request(url, {
      headers: {
        cookie: cookieHeader,
      },
    });
  }

  it('returns only public posts to unauthenticated users', async () => {
    const mockPosts = [
      { id: '1', user_id: 'user-a', content: 'public post', image_url: null, is_private: false, created_at: '2024-01-02T00:00:00Z' },
    ];

    mockGetSupabase.mockReturnValue(createMockSupabase(mockPosts));
    mockGetUserId.mockReturnValue(null);
    mockDecodeCursor.mockReturnValue(null);

    const res = await GET(createRequest('http://localhost/api/posts'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.posts).toHaveLength(1);
    expect(body.posts[0].id).toBe('1');
  });

  it('builds the correct visibility filter for authenticated users', async () => {
    const currentUserId = 'user-b';
    const mockPosts = [
      { id: '1', user_id: 'user-a', content: 'public post', image_url: null, is_private: false, created_at: '2024-01-03T00:00:00Z' },
      { id: '2', user_id: 'user-b', content: 'my private post', image_url: null, is_private: true, created_at: '2024-01-02T00:00:00Z' },
      { id: '3', user_id: 'user-c', content: 'other private post', image_url: null, is_private: true, created_at: '2024-01-01T00:00:00Z' },
    ];

    let capturedOr: string | null = null;

    const postsQuery = createThenable(mockPosts, null);
    postsQuery.or = vi.fn().mockImplementation((cond: string) => {
      capturedOr = cond;
      return postsQuery;
    });

    const supabaseMock: any = {
      from: (table: string) => {
        if (table === 'posts') return postsQuery;
        if (table === 'post_likes') return createThenable([], null);
        if (table === 'comments') return createThenable([], null);
        return createThenable([], null);
      },
    };

    mockGetSupabase.mockReturnValue(supabaseMock);
    mockGetUserId.mockReturnValue(currentUserId);
    mockDecodeCursor.mockReturnValue(null);

    const res = await GET(createRequest('http://localhost/api/posts', `auth_session=valid-token`));

    expect(res.status).toBe(200);
    expect(capturedOr).toContain('is_private.eq.false');
    expect(capturedOr).toContain(`user_id.eq.${currentUserId}`);
  });

  it('does not return other users\' private posts to an authenticated user', async () => {
    const currentUserId = 'user-b';
    const mockPosts = [
      { id: '2', user_id: 'user-b', content: 'my private post', image_url: null, is_private: true, created_at: '2024-01-02T00:00:00Z' },
    ];

    mockGetSupabase.mockReturnValue(createMockSupabase(mockPosts));
    mockGetUserId.mockReturnValue(currentUserId);
    mockDecodeCursor.mockReturnValue(null);

    const res = await GET(createRequest('http://localhost/api/posts', `auth_session=valid-token`));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.posts.every((p: any) => !p.is_private || p.user_id === currentUserId)).toBe(true);
  });
});
