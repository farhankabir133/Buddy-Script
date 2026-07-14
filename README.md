# Buddy Script

A full-stack social feed built with **Next.js 14 (App Router, TypeScript)** and **Supabase (PostgreSQL + Storage)**.  
Implements authentication, post creation with media, threaded comments with likes, public/private visibility, and a responsive UI inspired by Facebook/LinkedIn.

> Security and RLS details are documented in [`SECURITY.md`](./SECURITY.md).

## Recent updates

- **Post button:** composer action row now wraps cleanly on narrow screens, and the Post button stays fully visible without cutting edges.
- **Profile name editing:** users can update their first and last name anytime from the Edit Profile modal.
- **Feed avatars:** posts now show the author's profile photo when available; otherwise the existing initials fallback is used.
- **Unified image aspect ratio:** feed post images, composer previews, and profile photo grid images use a consistent aspect ratio. Images are displayed with `object-fit: contain` so details are not cropped.
- **Multi-image posts:** the composer now accepts multiple images (up to 10) with per-image previews and remove controls; posts render as a structured grid gallery (1, 2, 3 or  ­2×2 layout with a `+N` overflow) and open in a full-screen lightbox. Images are stored in a new `image_urls TEXT[]` column.
- **Nested comment replies:** comments now support multi-level threaded replies. Any comment or reply can be replied to, and the full thread renders recursively under its parent.

---

## Table of contents

- [Tech stack](#tech-stack)
- [Features](#features)
- [Project structure](#project-structure)
- [API routes](#api-routes)
- [Database schema](#database-schema)
- [Setup](#setup)
- [Environment variables](#environment-variables)
- [Architecture decisions](#architecture-decisions)
- [Deployment](#deployment)
- [Scripts](#scripts)
- [Testing](#testing)

---

## Tech stack

| Layer             | Choice                                              |
| ----------------- | --------------------------------------------------- |
| Framework         | Next.js 14 App Router, React 18, TypeScript         |
| API               | Next.js Route Handlers (`app/api/**`)               |
| Database          | PostgreSQL via Supabase                             |
| Auth              | Custom JWT sessions (`HttpOnly`, `SameSite=Strict`) |
| Storage           | Supabase Storage (`post-images`, `avatars`)          |
| Validation        | Zod                                                 |
| Testing           | Vitest                                              |
| Styling           | Bootstrap 5 + custom CSS with design tokens         |
| Icons             | Lucide React                                        |
| Dark mode         | `next-themes` (`data-theme` attribute)              |

---

## Features

### Authentication & Authorization
- Registration with first name, last name, email, password
- Login with email/password, session persisted via signed JWT in an `HttpOnly` cookie
- Logout and protected feed/profile routes
- Rate-limited auth endpoints (in-memory fixed window per IP)

### Feed
- Cursor-paginated public feed ordered by newest first
- Create posts with text and up to 10 optional image uploads (client-side compression), rendered as a structured grid gallery
- Public / private post visibility (private visible only to author)
- Optimistic post creation with rollback on failure
- Loading skeletons and error retry UI
- Post author avatar shown when available; initials used as fallback
- Feed images maintain a unified aspect ratio without cropping content

### Posts, Comments & Likes
- Like / unlike posts and comments (optimistic UI)
- Multi-level threaded comments and replies via `parent_id`; any comment or reply can be replied to, with the full thread rendered recursively
- Cursor-paginated comments per post
- Show who liked a post, comment, or reply with expandable likers list

### Profile
- View own or any user's profile (avatar, cover, headline, bio, location)
- Post count, Posts / About / Photos tabs
- Edit profile modal with image upload for avatar and cover
- Update first and last name anytime from Edit Profile modal
- Profile not-found state

### UI/UX
- Responsive layout: desktop 3-column feed, mobile bottom tab bar + slide-out drawer
- Right sidebar on desktop: Trending, Who to follow, Active friends
- Dark mode toggle with system-preference support, persists user choice
- Unified design tokens for color, typography, spacing
- Accessible focus rings and reduced-motion support
- Composer Post button stays fully visible on all screen sizes
- Images use consistent aspect ratios with `object-fit: contain` to preserve full content
- Multi-image posts render as a premium grid gallery with hover zoom and a full-screen lightbox (keyboard navigable)

---

## Project structure

```
app/
  api/
    auth/
      login/route.ts
      logout/route.ts
      me/route.ts
      register/route.ts
    comments/route.ts
    likes/route.ts
    posts/route.ts
    upload/route.ts
    users/
      [id]/route.ts
      me/route.ts
  context/
    AuthContext.tsx
  feed/page.tsx
  login/page.tsx
  profile/
    [id]/page.tsx
    page.tsx
  register/page.tsx
  layout.tsx
  globals.css
assets/
  css/
    bootstrap.min.css
    common.css
    main.css
    profile.css
    responsive.css
  images/...
components/
  Avatar.tsx
  CommentComposer.tsx
  CommentItem.tsx
  MobileBottomNav.tsx
  PostCard.tsx
  PostContent.tsx
  PostHeader.tsx
  ProfileEditModal.tsx
  ProfileView.tsx
  ProtectedRoute.tsx
  ReactionBar.tsx
  RightSidebar.tsx
  SideDrawer.tsx
  ThemeProvider.tsx
  ThemeToggle.tsx
lib/
  auth.ts
  cursor.ts
  env.ts
  rate-limit.ts
  supabase.ts
  validation.ts
public/
  assets/images/...
supabase/
  migrations/
    migration.sql
    0002_rls_counters.sql
    0003_profile_fields.sql
    0004_post_image_gallery.sql
tests/
  api/
    posts.test.ts
    users.test.ts
```

---

## API routes

| Method | Route | Description |
| ------ | ----- | ----------- |
| `POST` | `/api/auth/register` | Create account, return user + session cookie |
| `POST` | `/api/auth/login` | Verify credentials, return user + session cookie |
| `POST` | `/api/auth/logout` | Clear session cookie |
| `GET` | `/api/auth/me` | Return current user from session |
| `GET` | `/api/posts` | Cursor-paginated feed (public + own private posts) |
| `POST` | `/api/posts` | Create post; accepts `image_urls` (array, up to 10) and visibility flag |
| `GET` | `/api/comments` | Cursor-paginated comments/replies for a post |
| `POST` | `/api/comments` | Create comment or reply |
| `GET` | `/api/likes` | List likers for a post or comment |
| `POST` | `/api/likes` | Toggle like on a post or comment |
| `POST` | `/api/upload` | Upload image (post image or avatar/cover) |
| `GET` | `/api/users/[id]` | Public profile with post count |
| `PATCH` | `/api/users/me` | Update profile fields |

---

## Database schema

```sql
users(
  id UUID PK,
  first_name VARCHAR(50),
  last_name VARCHAR(50),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  avatar_url TEXT,
  cover_url TEXT,
  headline TEXT,
  bio TEXT,
  location TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
)

posts(
  id UUID PK,
  user_id UUID FK -> users(id),
  content TEXT,
  image_url TEXT,            -- first gallery image (convenience alias)
  image_urls TEXT[] NOT NULL DEFAULT '{}',  -- multi-image gallery
  is_private BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  like_count INTEGER NOT NULL DEFAULT 0,
  comment_count INTEGER NOT NULL DEFAULT 0
)

comments(
  id UUID PK,
  post_id UUID FK -> posts(id),
  user_id UUID FK -> users(id),
  parent_id UUID FK -> comments(id),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
)

post_likes(user_id UUID, post_id UUID, PK(user_id, post_id))
comment_likes(user_id UUID, comment_id UUID, PK(user_id, comment_id))
```

### Key indexes
- `posts`: `(is_private, created_at DESC)`, `(user_id, created_at DESC, id DESC)`, `(created_at DESC, id DESC)`
- `comments`: `(post_id, created_at ASC, id ASC)`
- `post_likes`: `(post_id)`
- `comment_likes`: `(comment_id)`

---

## Setup

### Local (Node)

Requires **Node 20 LTS**.

```bash
npm install
cp .env.example .env.local
# Apply all files in supabase/migrations/ in order (migration.sql, then 0002..0004) in the Supabase SQL editor
npm run dev
```

### Docker

```bash
cp .env.example .env        # fill in real values
docker compose --env-file .env up --build
```

---

## Environment variables

| Variable                        | Purpose |
| ------------------------------- | ------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key for RLS-authenticated queries |
| `SUPABASE_SERVICE_ROLE_KEY`     | Server-only; bypasses RLS for register/login |
| `JWT_SECRET`                    | Signs session JWTs; must equal Supabase JWT secret |

---

## Architecture decisions

### Auth & sessions
- Passwords hashed with `bcrypt`.
- Session JWT carries only `sub` (user id); no PII or secrets in the token.
- Stored in an `HttpOnly`, `SameSite=Strict`, `Secure` (production) cookie.

### RLS vs service-role
- All tables have Row Level Security enabled.
- `getServiceSupabase()` is used **only** for register (inserting `users`) and login (reading `password_hash`).
- All data routes use `getUserSupabase(request)`, which forwards the caller's session JWT so Supabase evaluates policies as the end user.

### Public vs private posts
- `posts` SELECT policy: `is_private = false OR auth.uid() = user_id`.
- Mirrored in application code as defense-in-depth.
- Comments and likes inherit visibility via `EXISTS` subqueries on the parent post.

### Input validation & rate limiting
- Zod schemas on every mutating route.
- Auth endpoints rate-limited to 5 attempts per 15 minutes per IP.

### Denormalized counters & pagination
- `like_count` and `comment_count` maintained by `SECURITY DEFINER` triggers.
- Feed and comments use **cursor (keyset) pagination** on `(created_at, id)`.

---

## Deployment

### Supabase
1. Create a project and apply every file in `supabase/migrations/` in numeric order (incl. `0004_post_image_gallery.sql` for the multi-image gallery).
2. Create public buckets: `post-images` and `avatars`.
3. Set **JWT Secret** to the same value as `JWT_SECRET`.
4. Copy `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.

### Vercel
1. Import repo, framework auto-detected as Next.js.
2. Set Node `20.x`, build command `npm run build`.
3. Add the four environment variables above.
4. Deploy.

---

## Scripts

| Command | Description |
| ------- | ----------- |
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm start` | Start production server |
| `npm test` | Run Vitest unit tests |

---

## Testing

Vitest covers API route behavior with mocked Supabase clients.

```bash
npm test
```

Current test files:
- `tests/api/posts.test.ts`
- `tests/api/users.test.ts`
