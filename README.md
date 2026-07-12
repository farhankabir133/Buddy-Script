# Buddy Script

A minimal social feed (posts, comments, likes, auth) built with **Next.js (App
Router)** and **Supabase (Postgres + Storage)**. This README covers setup,
architecture decisions, known limitations, and how the schema is designed to
scale.

> Security and RLS details are documented further in [`SECURITY.md`](./SECURITY.md).

---

## Table of contents

- [Tech stack](#tech-stack)
- [Project overview](#project-overview)
- [Setup](#setup)
  - [Local (Node)](#local-node)
  - [Docker (one command)](#docker-one-command)
- [Environment variables](#environment-variables)
- [Architecture decisions](#architecture-decisions)
  - [Auth & sessions](#auth--sessions)
  - [RLS vs service-role](#rls-vs-service-role)
  - [Public vs private posts enforcement](#public-vs-private-posts-enforcement)
  - [Input validation & rate limiting](#input-validation--rate-limiting)
  - [Denormalized counters & pagination](#denormalized-counters--pagination)
- [Schema & scaling to millions of posts](#schema--scaling-to-millions-of-posts)
- [Known limitations](#known-limitations)
- [Deployment (Vercel + Supabase)](#deployment-vercel--supabase)

---

## Tech stack

| Layer        | Choice                                              |
| ------------ | --------------------------------------------------- |
| Framework    | Next.js 14 (App Router, React 18, TypeScript)      |
| API          | Next.js Route Handlers (`app/api/**`)               |
| Database     | PostgreSQL via Supabase                             |
| Auth         | Custom JWT sessions (signed with `JWT_SECRET`)      |
| Storage      | Supabase Storage (`post-images` bucket)            |
| Validation   | Zod                                                |
| Testing      | Vitest                                             |
| Styling      | Bootstrap 5 + custom CSS (`assets/css/*`)           |

No third-party auth provider is used; sessions are signed JWTs stored in an
`HttpOnly` cookie. Supabase is used purely as a Postgres + Storage backend with
Row Level Security enabled.

---

## Project overview

- **Auth**: `POST /api/auth/register`, `/api/auth/login`, `/api/auth/logout`,
  `/api/auth/me`.
- **Feed**: `GET /api/posts` (cursor-paginated, public + own private posts).
- **Posts**: `POST /api/posts` (content, optional image, public/private flag).
- **Comments**: `GET/POST /api/comments` (cursor-paginated, threaded via
  `parent_id`).
- **Likes**: `POST /api/likes` (toggle like on a post or comment).
- **Frontend**: feed page with optimistic likes/posts, loading skeletons, inline
  form validation, and error toasts.

---

## Setup

### Local (Node)

> **Requires Node 20 LTS.** The app's toolchain and native binaries target Node 20;
> a newer/bleeding-edge `node` (e.g. v25) can fail to load Next's native SWC
> binary on macOS. Use `nvm use 20` (or your version manager) before the commands
> below.

```bash
# 1. Install dependencies (Node 20)
npm install

# 2. Configure environment
cp .env.example .env.local
#    Edit .env.local with your Supabase + JWT values (see below)

# 3. Apply the database schema
#    Run supabase/migrations/migration.sql in the Supabase SQL editor
#    (or `supabase db push` if using the Supabase CLI).

# 4. Run the dev server
npm run dev
#    Open http://localhost:3000
```

### Docker (one command)

```bash
cp .env.example .env        # fill in real values
docker compose --env-file .env up --build
#    App available at http://localhost:3000
```

The `Dockerfile` builds a production image using Next.js standalone output;
`docker-compose.yml` passes your `.env` to both the build (so `next build` has
the required variables) and the running container.

---

## Environment variables

All four are **required** — the app calls `validateEnv()` at startup and throws
if any are missing (`lib/env.ts`).

| Variable                        | Used by (client/server) | Purpose                                                        |
| ------------------------------- | ----------------------- | -------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | both                    | Supabase project URL                                           |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client + server         | Anon key; used for RLS-authenticated data queries              |
| `SUPABASE_SERVICE_ROLE_KEY`     | server only             | Bypasses RLS; used only for register + login                   |
| `JWT_SECRET`                    | server only             | Signs session JWTs. **Must equal the Supabase JWT secret.**    |

See [`.env.example`](./.env.example).

> ⚠️ `SUPABASE_SERVICE_ROLE_KEY` and `JWT_SECRET` are secrets. Never commit them
> and never expose them to the client (no `NEXT_PUBLIC_` prefix).

---

## Architecture decisions

### Auth & sessions

- Passwords hashed with `bcrypt`.
- A session JWT is signed with `JWT_SECRET` and stored in an `HttpOnly`,
  `SameSite=Strict` cookie (and `Secure` in production). The JWT payload
  contains **only** the user id (`sub`) — no email, no password hash, no
  role/PII — so decoding it yields nothing sensitive.
- `lib/auth.ts` reads the cookie, verifies the JWT, and returns `{ userId }`.

### RLS vs service-role

Row Level Security is **enabled on every table**. The server talks to Supabase
through two clients (`lib/supabase.ts`):

- **`getServiceSupabase()`** — service-role key (bypasses RLS). Used **only**
  where RLS cannot express the rule:
  - `POST /api/auth/register` — inserts the `users` row (no INSERT policy/grant
    for API roles, by design).
  - `POST /api/auth/login` — reads `password_hash`, which is `REVOKE`d from API
    roles so only the service role can read it.
- **`getUserSupabase(request)`** — anon key + the caller's session JWT forwarded
  in the `Authorization` header, so Supabase evaluates policies against
  `auth.uid()`. Used by all **data** routes (posts, comments, likes, me).

This is the key decision: **data access runs as the end user, not as the service
role**, so RLS is the real enforcement boundary. Service-role is a deliberate,
narrow exception.

### Public vs private posts enforcement

`posts` RLS policy:

```sql
CREATE POLICY posts_select ON posts FOR SELECT
  USING (is_private = false OR auth.uid() = user_id);
```

A private post is visible **only** to its owner; public posts are visible to
everyone. The same rule is mirrored in application code as defense-in-depth, so
private posts stay hidden even if RLS is ever misconfigured. Comments and likes
inherit visibility from their parent post via `EXISTS (...)` subqueries.

> **Required deployment step for RLS to fire:** Supabase must accept our session
> JWT. Set the project's **JWT secret** (Settings → API) to the same value as
> `JWT_SECRET`. Our token is signed with `role: 'authenticated'` /
> `aud: 'authenticated'`, so Supabase treats forwarded requests as the
> `authenticated` role and `auth.uid()` resolves correctly.

### Input validation & rate limiting

- Zod schemas validate every mutating route; failures return `400` with
  structured `{ error, issues: [{ path, message }] }`.
- `POST /api/auth/login` and `/api/auth/register` are rate-limited to **5
  attempts / 15 minutes / IP** (in-memory fixed window; see limitations).

### Denormalized counters & pagination

- `posts.like_count` and `posts.comment_count` are maintained by `SECURITY
  DEFINER` triggers, so the feed reads counts directly from the post row and
  never `COUNT()`s per post on each read.
- The feed, comments, and replies all use **cursor (keyset) pagination** on
  `(created_at, id)` so a post with 10,000 comments never loads them all at
  once.

---

## Schema & scaling to millions of posts

```sql
posts(id uuid pk, user_id uuid fk, content text, image_url text,
      is_private bool, created_at timestamptz, like_count int, comment_count int)

comments(id uuid pk, post_id uuid fk, user_id uuid fk, parent_id uuid fk null,
         content text, created_at timestamptz)

post_likes(user_id uuid, post_id uuid, pk(user_id, post_id))
comment_likes(user_id uuid, comment_id uuid, pk(user_id, comment_id))
```

**Indexes (every filter/sort column is covered):**

| Table        | Index                                                              | Serves                                          |
| ------------ | ----------------------------------------------------------------- | ----------------------------------------------- |
| `posts`      | `(is_private, created_at DESC)`                                   | public-feed filter                              |
| `posts`      | `(user_id, created_at DESC, id DESC)`                             | "my posts"                                      |
| `posts`      | `(created_at DESC, id DESC)`                                      | feed cursor keyset (no OFFSET/sort scan)        |
| `comments`   | `(post_id, created_at ASC, id ASC)`                              | per-post list + pagination                      |
| `post_likes` | `(post_id)`                                                       | likes read by **target** id                     |
| `comment_likes` | `(comment_id)`                                                 | likes read by **target** id                     |

**Why it scales:**

1. **Keyset pagination** (`created_at < X OR (created_at = X AND id < Y)`) is
   O(log N) via the composite index and stable across inserts — unlike
   `OFFSET`, which degrades linearly as the page number grows.
2. **Denormalized counts** turn an O(feed size) `COUNT()` into a constant-time
   column read, eliminating the N+1 aggregation on the hot feed path.
3. **RLS `EXISTS` policies** on comments/likes are index-driven (they reuse the
   `post_id` indexes), so visibility checks stay cheap.
4. **Adjacency-list threading** (`parent_id`) keeps reply insertion O(1) and
   traversal O(depth), which is fine because threads are naturally shallow.
5. All hot indexes are B-tree and narrow; writes stay fast and replica
   scale-out (read replicas / pooling) is straightforward since queries are
   simple indexed lookups.

**Beyond millions (future work):** partition `posts` by time range, move
   like/comment counts to a materialized view or aggregate table for extreme
   fan-out, and add `created_at` clustering. The current schema is the correct
   foundation and will comfortably handle millions of rows on a single
   reasonably-sized Postgres instance.

---

## Known limitations

- **Rate limiter is in-memory.** It is per server instance and correct for a
  single node, but on multi-instance/serverless each instance keeps separate
  counters. Back it with Redis (key `auth:<ip>`) for production scale.
- **Register form sends empty `first_name`/`last_name`.** The server's Zod
  schema requires non-empty names (added in the validation pass), so registration
  currently fails at the API. The register UI needs `first_name`/`last_name`
  inputs to match the schema — left as-is because the task scope said not to
  change the provided form structure.
- **RLS requires matching JWT secrets.** If the Supabase JWT secret ≠
  `JWT_SECRET`, authenticated requests are rejected by Supabase (bad signature).
  This is a mandatory config, not optional.
- **Feed visibility filter is duplicated** in app code as defense-in-depth; keep
  them in sync if changed.
- **No automated DB migration runner** — `migration.sql` is applied manually
  (Supabase SQL editor or CLI). Add `supabase db push` / CI for team workflows.
- **No refresh-token / session expiry UX** beyond the 7-day JWT `maxAge`.
- **Image upload** relies on the `post-images` Supabase bucket existing and being
  public.

---

## Deployment (Vercel + Supabase)

### 1. Supabase (database)

1. Create a project at [supabase.com](https://supabase.com).
2. Apply the database schema in the **SQL Editor**:
   - **Fresh database:** run `supabase/migrations/migration.sql` (creates tables,
     indexes, RLS policies, triggers, counters).
  - **Base schema already applied:** run the idempotent
      `supabase/migrations/0002_rls_counters.sql` to add the RLS policies, indexes,
      denormalized `like_count`/`comment_count` columns, and sync triggers without
      touching the existing tables.
  - **Profile fields:** run the idempotent
      `supabase/migrations/0003_profile_fields.sql` to add `avatar_url`,
      `cover_url`, `headline`, `bio`, and `location` to `users`. Safe to re-run.
3. Create two **Public** Storage buckets:
   - `post-images` — post photos (used by `POST /api/upload` by default).
   - `avatars` — profile avatars and cover banners (used when the upload
     request includes `bucket=avatars`). The server uploads with the
     service-role key, so no Storage RLS policies are required.
4. In **Settings → API**:
   - Copy **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`.
   - Copy **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
   - Copy **service_role** key → `SUPABASE_SERVICE_ROLE_KEY`.
   - Set **JWT Secret** to the **same value** as your `JWT_SECRET` (required for
     RLS to accept forwarded session tokens).

### 2. Vercel (app)

1. Import the GitHub repo at [vercel.com](https://vercel.com) (framework auto-detected as **Next.js**).
2. **Build settings** (auto-detected; the included `vercel.json` pins them):
   - Framework: `Next.js`
   - Build command: `npm run build`
   - Install command: `npm install`
   - Output directory: `.next`
   - Node version: `20.x`
3. **Environment variables** — add all four under **Settings → Environment
   Variables** (set for Production, Preview, and Development):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `JWT_SECRET` (generate: `openssl rand -hex 32`; must match the Supabase
     JWT secret above)
4. Deploy. `npm run build` will run `next build` (standalone output) and Vercel
   serves it.

### Env var / build checklist

- [ ] `NEXT_PUBLIC_SUPABASE_URL` set (Production + Preview + Dev)
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY` set
- [ ] `SUPABASE_SERVICE_ROLE_KEY` set (server-only; never `NEXT_PUBLIC_`)
- [ ] `JWT_SECRET` set and **equal to the Supabase JWT Secret**
- [ ] Supabase SQL migration applied
- [ ] `post-images` bucket created + Public
- [ ] Build command `npm run build`, Node `20.x`

---

## Scripts

| Command         | Description                  |
| --------------- | ---------------------------- |
| `npm run dev`   | Dev server (Next.js)         |
| `npm run build` | Production build             |
| `npm start`     | Start production server      |
| `npm test`      | Run Vitest unit tests        |
