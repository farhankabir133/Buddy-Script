/**
 * Zod validation schemas for every API route.
 *
 * Each schema is the single source of truth for request shape. Route handlers
 * call `validateJson` and, on failure, return 400 with a structured
 * `issues` array (path + message) so clients can surface field-level errors.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email('Invalid email format'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  first_name: z
    .string()
    .trim()
    .min(1, 'First name is required')
    .max(50, 'Name must not exceed 50 characters'),
  last_name: z
    .string()
    .trim()
    .min(1, 'Last name is required')
    .max(50, 'Name must not exceed 50 characters'),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
});

export const createPostSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, 'Content is required')
    .max(5000, 'Content must not exceed 5000 characters'),
  image_url: z
    .preprocess((v) => (v === '' || v === null ? undefined : v), z.string().url('Invalid image URL'))
    .optional(),
  image_urls: z
    .array(z.string().url('Invalid image URL'))
    .max(10, 'You can attach up to 10 images')
    .optional(),
  is_private: z.boolean().optional().default(false),
});

export const updateProfileSchema = z.object({
  first_name: z
    .preprocess((v) => (v === '' ? undefined : v), z.string().trim().max(50, 'First name must not exceed 50 characters'))
    .optional(),
  last_name: z
    .preprocess((v) => (v === '' ? undefined : v), z.string().trim().max(50, 'Last name must not exceed 50 characters'))
    .optional(),
  avatar_url: z
    .preprocess((v) => (v === '' || v === null ? undefined : v), z.string().url('Invalid avatar URL'))
    .optional(),
  cover_url: z
    .preprocess((v) => (v === '' || v === null ? undefined : v), z.string().url('Invalid cover URL'))
    .optional(),
  headline: z
    .preprocess((v) => (v === '' ? undefined : v), z.string().trim().max(120, 'Headline must not exceed 120 characters'))
    .optional(),
  bio: z
    .preprocess((v) => (v === '' ? undefined : v), z.string().trim().max(500, 'Bio must not exceed 500 characters'))
    .optional(),
  location: z
    .preprocess((v) => (v === '' ? undefined : v), z.string().trim().max(120, 'Location must not exceed 120 characters'))
    .optional(),
});

export const createCommentSchema = z.object({
  post_id: z.string().uuid('Invalid post_id'),
  content: z
    .string()
    .trim()
    .min(1, 'Content is required')
    .max(5000, 'Content must not exceed 5000 characters'),
  parent_id: z.string().uuid('Invalid parent_id').optional(),
});

export const likeSchema = z.object({
  target_type: z.enum(['post', 'comment']),
  target_id: z.string().uuid('Invalid target_id'),
});

export type FieldIssue = { path: string; message: string };

export function validationError(issues: FieldIssue[]) {
  return NextResponse.json({ error: 'Validation failed', issues }, { status: 400 });
}

/**
 * Parse a JSON request body against `schema`. On success returns `{ data }`;
 * on malformed JSON or schema failure returns `{ response }` (a 400).
 */
export async function validateJson<T extends z.ZodTypeAny>(
  schema: T,
  request: Request
): Promise<{ data: z.infer<T> } | { response: NextResponse }> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { response: validationError([{ path: '(body)', message: 'Request body must be valid JSON' }]) };
  }

  const result = schema.safeParse(body);
  if (!result.success) {
    const issues: FieldIssue[] = result.error.issues.map((issue) => ({
      path: issue.path.join('.') || '(root)',
      message: issue.message,
    }));
    return { response: validationError(issues) };
  }

  return { data: result.data };
}
