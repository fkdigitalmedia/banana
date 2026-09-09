/**
 * Slug Change Protection & Redirect Resolution System.
 * Prevents broken URLs and resolves redirect chains (A -> B -> C becomes A -> C).
 */

export interface RedirectRecord {
  id: number;
  old_slug: string;
  target_slug: string;
  recipe_id?: number;
  http_status: number;
  created_at: string;
}

export async function recordSlugChange(
  db: any,
  oldSlug: string,
  newSlug: string,
  recipeId: number
): Promise<void> {
  if (!db || !oldSlug || !newSlug || oldSlug === newSlug) return;

  try {
    // 1. Insert or replace the new redirect for oldSlug -> newSlug
    await db.prepare(`
      INSERT INTO recipe_redirects (old_slug, target_slug, recipe_id, http_status, created_at)
      VALUES (?, ?, ?, 301, datetime('now'))
      ON CONFLICT(old_slug) DO UPDATE SET
        target_slug = excluded.target_slug,
        recipe_id = excluded.recipe_id,
        created_at = datetime('now')
    `).bind(oldSlug, newSlug, recipeId).run();

    // 2. Resolve any existing chains: If any previous redirect pointed to oldSlug, update them to point directly to newSlug
    await db.prepare(`
      UPDATE recipe_redirects
      SET target_slug = ?
      WHERE target_slug = ?
    `).bind(newSlug, oldSlug).run();
  } catch (err) {
    console.error('Failed to record slug redirect:', err);
  }
}

export async function resolveRedirect(
  db: any,
  requestedSlug: string
): Promise<{ targetSlug: string; httpStatus: number } | null> {
  if (!db || !requestedSlug) return null;

  try {
    const row = await db.prepare(`
      SELECT target_slug, http_status
      FROM recipe_redirects
      WHERE old_slug = ?
      LIMIT 1
    `).bind(requestedSlug).first();

    if (row && row.target_slug) {
      return {
        targetSlug: row.target_slug as string,
        httpStatus: (row.http_status as number) || 301
      };
    }
    return null;
  } catch (err) {
    console.error('Error resolving slug redirect:', err);
    return null;
  }
}

export async function getRedirectHistory(
  db: any,
  recipeId: number
): Promise<RedirectRecord[]> {
  if (!db || !recipeId) return [];

  try {
    const { results } = await db.prepare(`
      SELECT *
      FROM recipe_redirects
      WHERE recipe_id = ?
      ORDER BY created_at DESC
    `).bind(recipeId).all();

    return (results || []) as RedirectRecord[];
  } catch (err) {
    console.error('Error fetching redirect history:', err);
    return [];
  }
}
