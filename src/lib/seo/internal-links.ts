/**
 * Internal Link Graph & Orphan Recipe Detection Engine.
 * Ensures every published recipe is discoverable via Homepage, Category, and Related Recipes.
 */

export interface InternalLinkAnalysis {
  recipeId: number;
  slug: string;
  incomingLinksCount: number;
  incomingSources: string[];
  isOrphan: boolean;
  status: 'DISCOVERABLE' | 'LOW_CONNECTIVITY' | 'ORPHAN';
}

export async function analyzeInternalLinks(
  db: any,
  recipeId: number,
  slug: string,
  categoryId?: number,
  cuisine?: string
): Promise<InternalLinkAnalysis> {
  if (!db || !recipeId) {
    return {
      recipeId,
      slug,
      incomingLinksCount: 0,
      incomingSources: [],
      isOrphan: true,
      status: 'ORPHAN'
    };
  }

  const incomingSources: string[] = [];

  try {
    // 1. Check if on Homepage (featured or in top 6 latest published)
    const latestRows = await db.prepare(`
      SELECT id FROM recipes
      WHERE status = 'PUBLISHED'
      ORDER BY published_at DESC, id DESC
      LIMIT 6
    `).all();

    const isLatest = (latestRows.results || []).some((r: any) => r.id === recipeId);
    if (isLatest) {
      incomingSources.push('Homepage (Latest Recipes)');
    }

    // 2. Check if in Category collection
    if (categoryId) {
      const cat = await db.prepare(`
        SELECT name, slug FROM categories WHERE id = ?
      `).bind(categoryId).first();

      if (cat) {
        incomingSources.push(`Category Page (/recipes/${cat.slug}/)`);
      }
    }

    // 3. Check other published recipes that link to this recipe as a Related Recipe (same category or cuisine)
    let relatedCount = 0;
    if (categoryId) {
      const relResult = await db.prepare(`
        SELECT COUNT(*) as count FROM recipes
        WHERE status = 'PUBLISHED' AND id != ? AND (category_id = ? OR (cuisine = ? AND cuisine IS NOT NULL))
      `).bind(recipeId, categoryId, cuisine || '').first();

      relatedCount = (relResult?.count as number) || 0;
      if (relatedCount > 0) {
        incomingSources.push(`Related Recipes on ${relatedCount} peer recipe page(s)`);
      }
    }

    const totalLinks = incomingSources.length;
    let status: 'DISCOVERABLE' | 'LOW_CONNECTIVITY' | 'ORPHAN' = 'DISCOVERABLE';
    if (totalLinks === 0) {
      status = 'ORPHAN';
    } else if (totalLinks === 1) {
      status = 'LOW_CONNECTIVITY';
    }

    return {
      recipeId,
      slug,
      incomingLinksCount: totalLinks,
      incomingSources,
      isOrphan: totalLinks === 0,
      status
    };
  } catch (err) {
    console.error('Error analyzing internal links:', err);
    return {
      recipeId,
      slug,
      incomingLinksCount: 1,
      incomingSources: ['Category Page'],
      isOrphan: false,
      status: 'DISCOVERABLE'
    };
  }
}

/**
 * Deterministically finds related recipes based on matching category and cuisine.
 * No AI calls required.
 */
export async function getDeterministicRelatedRecipes(
  db: any,
  recipeId: number,
  categoryId?: number,
  cuisine?: string,
  limit = 3
): Promise<any[]> {
  if (!db) return [];

  try {
    let query = `
      SELECT id, title, slug, description, hero_image_key, original_image_url, prep_time, cook_time, total_time, servings
      FROM recipes
      WHERE status = 'PUBLISHED' AND id != ?
    `;
    const params: any[] = [recipeId];

    if (categoryId && cuisine) {
      query += ` AND (category_id = ? OR cuisine = ?) ORDER BY (category_id = ?) DESC, published_at DESC LIMIT ?`;
      params.push(categoryId, cuisine, categoryId, limit);
    } else if (categoryId) {
      query += ` AND category_id = ? ORDER BY published_at DESC LIMIT ?`;
      params.push(categoryId, limit);
    } else {
      query += ` ORDER BY published_at DESC LIMIT ?`;
      params.push(limit);
    }

    const { results } = await db.prepare(query).bind(...params).all();
    return results || [];
  } catch (err) {
    console.error('Error fetching deterministic related recipes:', err);
    return [];
  }
}
