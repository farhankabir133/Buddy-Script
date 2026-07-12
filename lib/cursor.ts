/**
 * Keyset (cursor) pagination helpers.
 *
 * A feed cursor encodes the last-seen post's (created_at, id) pair so the next
 * page can resolve a stable boundary:
 *   created_at < ts OR (created_at = ts AND id < id)
 * This avoids the skip/duplicate bug that occurs when ordering on created_at
 * alone (posts sharing a timestamp) and prevents infinite "Load more" loops.
 */

export type Cursor = {
  createdAt: string;
  id: string;
};

export function encodeCursor(createdAt: string, id: string): string {
  return Buffer.from(`${createdAt}|${id}`, 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string | null): Cursor | null {
  if (!cursor) return null;
  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
    const sep = decoded.lastIndexOf('|');
    if (sep === -1) return null;
    const createdAt = decoded.slice(0, sep);
    const id = decoded.slice(sep + 1);
    if (!createdAt || !id) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}
