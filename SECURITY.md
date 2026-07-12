# Security & RLS Decision Record

This document records the security controls added in the API hardening pass and,
importantly, **where the service-role key is still used and why**. It is meant to
support the architecture write-up.

## 1. Authentication & session token (lib/auth.ts)

- **JWT payload contains no sensitive data.** The signed session token carries
  only the user id via the `sub` claim (`{ sub, role, iss, aud }`). No
  `password_hash`, no `email`, no role/permission flags. Anyone who decodes the
  token (it is sent in an `HttpOnly` cookie, but the secret is server-side) sees
  only an opaque user id, which must still be looked up server-side.
- **Cookie flags are hardened:**
  - `httpOnly: true` — not readable by client JS (mitigates XSS token theft).
  - `sameSite: 'strict'` — CSRF protection.
  - `secure: process.env.NODE_ENV === 'production'` — only sent over HTTPS in
    production. (Set to always-secure once HTTPS is enforced end-to-end.)
  - `path: '/'` with a 7-day `maxAge`.
- **Startup env validation (lib/env.ts):** `JWT_SECRET`,
  `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and
  `SUPABASE_SERVICE_ROLE_KEY` are validated at module load. Missing values throw
  immediately on startup/build rather than failing mid-request with an opaque
  error.

## 2. Row Level Security (supabase/migrations/migration.sql)

Private posts (and all owner-scoped data) are now enforced **at the database
level** via RLS, evaluated against `auth.uid()`. Key policies:

- `posts_select`: `is_private = false OR auth.uid() = user_id` — private posts
  visible only to their owner; this is the rule that previously lived only in
  app code (`app/api/posts/route.ts`).
- `posts_insert`: `WITH CHECK (auth.uid() = user_id)` — a user can only create
  posts owned by themselves (defense against spoofing `user_id`).
- `comments_*` / `post_likes_*` / `comment_likes_*`: visibility is gated by the
  parent post's visibility via `EXISTS (...)` subqueries, so replies/likes on a
  private post are never leaked.

### Where service-role is still used, and why

RLS only applies to queries made **as the end user**. The service-role key
bypasses RLS entirely, so it must be restricted to operations RLS genuinely
cannot express:

| Operation            | Client used        | Why service-role is (or isn't) needed                          |
| -------------------- | ------------------ | ------------------------------------------------------------- |
| `POST /api/auth/register` | **service role** | Inserts the `users` row. There is no `INSERT` policy / grant for `anon`/`authenticated` on `users`, so registration *must* run as service role. This is intentional. |
| `POST /api/auth/login`    | **service role** | Must read `password_hash` to verify the password. `password_hash` is explicitly `REVOKE`d from the API roles (see §3), so only service role can read it. |
| `GET /api/auth/me`       | user-scoped       | Reads the caller's own row; RLS `users_select` (public) + `WHERE id = auth.uid()` applies. |
| `GET/POST /api/posts`    | user-scoped       | RLS enforces private-post visibility and ownership on insert. |
| `GET/POST /api/comments` | user-scoped       | RLS gates comment visibility to the parent post's visibility. |
| `GET/POST /api/likes`    | user-scoped       | RLS gates like visibility/ownership. |

`lib/supabase.ts` exposes:
- `getServiceSupabase()` — service role; **only** register + login import it.
- `getUserSupabase(request)` — anon key + the caller's session JWT forwarded in
  the `Authorization` header, so Supabase runs the query as the `authenticated`
  role and RLS applies. All data routes use this.

### Required deployment step for RLS to actually fire

`getUserSupabase` forwards our application JWT. For Supabase to accept it and
populate `auth.uid()`, **the Supabase project JWT secret must equal the app's
`JWT_SECRET`** (Supabase dashboard → Settings → API → JWT Secret). Our token is
signed with `role: 'authenticated'` and `aud: 'authenticated'`, matching
Supabase's expected claims. Until this is configured, authenticated requests
would be rejected by Supabase (bad signature) — this is a mandatory config, not
optional.

As defense-in-depth, `app/api/posts/route.ts` keeps its application-level
visibility filter (`is_private = false OR user_id = :me`); if RLS is ever
misconfigured, the app still hides private posts.

## 3. Column-level protection of secrets

`REVOKE SELECT (password_hash) ON users FROM anon, authenticated;` ensures the
API roles can never read credential material even if a query selects it. The
login path reads `password_hash` exclusively through `getServiceSupabase()`,
which bypasses these grants.

## 4. Input validation (lib/validation.ts)

Every mutating route is validated with Zod schemas
(`registerSchema`, `loginSchema`, `createPostSchema`, `createCommentSchema`,
`likeSchema`). On failure the API returns `400` with a structured body:

```json
{ "error": "Validation failed", "issues": [ { "path": "email", "message": "Invalid email format" } ] }
```

This replaces the previous ad-hoc `if (!field)` checks with a single, typed,
consistent contract.

## 5. Rate limiting (lib/rate-limit.ts)

`POST /api/auth/login` and `POST /api/auth/register` are throttled to **5
attempts per 15 minutes per IP** using a fixed-window limiter. Exceeded requests
receive `429` with a `Retry-After` header.

> **Scaling note:** the limiter is an in-memory `Map` (per server instance). It
> is correct for a single node and a good first line of defense, but on a
> multi-instance / serverless deployment each instance keeps separate counters.
> For production scale, back it with a shared store (e.g. Redis) keyed the same
> way (`auth:<ip>`).

## 6. Query performance, indexes & denormalized counters (tasks 9–11)

### Indexes (confirm every filter/sort column is indexed)
- `posts`: `idx_posts_feed_lookup (is_private, created_at DESC)` for the public
  feed filter; `idx_posts_user_created (user_id, created_at DESC, id DESC)` for
  "my posts"; `idx_posts_created_at_id (created_at DESC, id DESC)` so the feed
  cursor (keyset on `created_at, id`) walks the index instead of sorting + OFFSET.
- `comments`: `idx_comments_post_created (post_id, created_at ASC, id ASC)` for
  the per-post list + pagination; retained `idx_comments_user_id`,
  `idx_comments_parent_id`.
- `post_likes`: `idx_post_likes_post_id (post_id)` — likes are read by **target**
  id, which is not the leading column of the `(user_id, post_id)` PK, so the PK
  alone couldn't serve those queries.
- `comment_likes`: `idx_comment_likes_comment_id (comment_id)` — same reasoning.

### Denormalized like/comment counts (task 11)
`posts` gained `like_count` and `comment_count` (INTEGER NOT NULL DEFAULT 0),
maintained by `SECURITY DEFINER` triggers (`trg_post_like_count`,
`trg_post_comment_count`) on `INSERT`/`DELETE` of `post_likes` and `comments`.
SECURITY DEFINER is required so the counter `UPDATE` is not blocked by the posts
RLS `UPDATE` policy (a like on post Y is written by user X, who does not own Y).
The feed now reads the counts straight from the post row and no longer runs a
`COUNT()` per post on every read. A one-time `UPDATE` backfills existing rows.

### Comment pagination (task 10)
`GET /api/comments` now uses cursor (keyset) pagination over
`(created_at, id)` with a page size of 50, returning `{ comments, nextCursor }`.
An optional `parent_id` filter paginates replies to a specific comment, so a post
with 10,000 comments/replies is never loaded in a single request.

