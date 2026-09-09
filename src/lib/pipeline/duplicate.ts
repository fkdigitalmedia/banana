import type { D1Database } from '@cloudflare/workers-types';
import { checkDuplicate, getRecipeBySourceUrl } from '../db/recipes';
import { canonicalizeUrl } from '../extraction/canonical';

/**
 * Normalizes a recipe source URL for idempotent deduplication.
 * Strips tracking parameters, lowercases host, and standardizes trailing slash.
 */
export function normalizeSourceUrl(rawUrl: string): string {
  return canonicalizeUrl(rawUrl);
}

/**
 * Checks for duplicate source URLs or existing recipes.
 */
export async function checkForDuplicate(
  db: D1Database,
  sourceUrl: string,
  slug?: string,
  title?: string
): Promise<{ isDuplicate: boolean; existingId?: number; reason?: string }> {
  const normalizedUrl = normalizeSourceUrl(sourceUrl);
  
  // 1. Direct URL match with normalized URL
  const byUrl = await getRecipeBySourceUrl(db, normalizedUrl);
  if (byUrl) {
    return { isDuplicate: true, existingId: byUrl.id, reason: 'source_url' };
  }

  // Also check unnormalized URL in case it was stored previously
  if (normalizedUrl !== sourceUrl) {
    const byRawUrl = await getRecipeBySourceUrl(db, sourceUrl.trim());
    if (byRawUrl) {
      return { isDuplicate: true, existingId: byRawUrl.id, reason: 'source_url' };
    }
  }

  // 2. Only check slug/title if provided and non-empty
  if ((slug && slug.trim().length > 0) || (title && title.trim().length >= 3)) {
    return await checkDuplicate(db, normalizedUrl, slug, title);
  }

  return { isDuplicate: false };
}

/**
 * Checks if there is an active job currently processing this source URL.
 */
export async function getActiveJobForUrl(db: D1Database, sourceUrl: string): Promise<any | null> {
  const normalizedUrl = normalizeSourceUrl(sourceUrl);
  const activeJob = await db.prepare(`
    SELECT * FROM generation_jobs 
    WHERE (source_url = ? OR source_url = ?) 
      AND status = 'RUNNING' 
      AND updated_at > datetime('now', '-5 minutes')
    ORDER BY created_at DESC LIMIT 1
  `).bind(normalizedUrl, sourceUrl.trim()).first<any>();

  return activeJob || null;
}
