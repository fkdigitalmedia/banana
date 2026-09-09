/**
 * Deterministic Related Recipes & Internal Linking Scoring Engine
 * 
 * Uses structured recipe data (categories, cuisine, distinctive ingredients, title keywords)
 * to score relevance without AI hallucinations or heavy graph databases.
 */

import type { D1Database } from '@cloudflare/workers-types';

export interface RelatedRecipeResult {
  id: number;
  title: string;
  slug: string;
  description: string | null;
  hero_image_key: string | null;
  original_image_url: string | null;
  prep_time: number | null;
  cook_time: number | null;
  total_time: number | null;
  servings: string | null;
  category_id: number | null;
  category_name?: string | null;
  category_slug?: string | null;
  score?: number;
}

export interface OrphanRecipeReport {
  id: number;
  title: string;
  slug: string;
  category_name: string;
  category_slug: string;
  inbound_count: number;
  outbound_count: number;
  status: 'HEALTHY' | 'ORPHAN';
  inbound_from: { id: number; title: string; slug: string }[];
  suggested_fix_sources: { id: number; title: string; slug: string; score: number }[];
}

// 1. Generic pantry stopwords that should NOT bias recipe recommendations
export const PANTRY_STOPWORDS = new Set([
  'salt', 'table salt', 'kosher salt', 'sea salt', 'fine salt', 'coarse salt',
  'sugar', 'white sugar', 'granulated sugar', 'brown sugar', 'light brown sugar', 'dark brown sugar', 'powdered sugar', 'confectioners sugar',
  'flour', 'all-purpose flour', 'all purpose flour', 'plain flour', 'wheat flour', 'white flour', 'self-rising flour',
  'water', 'warm water', 'cold water', 'tap water', 'hot water', 'boiling water', 'ice water',
  'oil', 'vegetable oil', 'canola oil', 'olive oil', 'cooking oil', 'sunflower oil', 'neutral oil', 'cooking spray',
  'butter', 'unsalted butter', 'salted butter', 'melted butter', 'softened butter',
  'baking powder', 'baking soda', 'bicarbonate of soda', 'yeast', 'active dry yeast',
  'egg', 'eggs', 'large egg', 'large eggs', 'egg yolk', 'egg white', 'egg whites',
  'milk', 'whole milk', 'low-fat milk', 'skim milk',
  'black pepper', 'pepper', 'ground black pepper',
  'vanilla', 'vanilla extract', 'pure vanilla extract', 'vanilla bean paste', 'vanilla essence'
]);

// Title stop words to ignore when comparing titles
export const TITLE_STOPWORDS = new Set([
  'recipe', 'recipes', 'the', 'a', 'an', 'and', 'or', 'with', 'for', 'in', 'at', 'to', 'from',
  'best', 'easy', 'quick', 'simple', 'homemade', 'classic', 'how', 'make', 'perfect', 'favorite',
  'bread', 'muffin', 'muffins', 'cake', 'cakes', 'cookie', 'cookies', 'loaf', 'bakes', 'bake', 'dish'
]);

/**
 * Normalizes an ingredient name and returns null if it's a generic pantry stopword.
 */
export function extractDistinctiveIngredient(rawName: string): string | null {
  if (!rawName) return null;
  const cleaned = rawName
    .toLowerCase()
    .replace(/[0-9\/\.,\(\)\-\*]/g, ' ')
    .replace(/\b(teaspoon|tablespoon|cup|cups|tbsp|tsp|oz|ounce|ounces|lb|pound|pounds|gram|grams|g|kg|ml|pinch|dash|clove|cloves|slice|slices)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned || cleaned.length < 3) return null;

  // Check against pantry stopwords
  if (PANTRY_STOPWORDS.has(cleaned)) return null;
  for (const stopword of PANTRY_STOPWORDS) {
    if (cleaned === stopword || cleaned === `${stopword}s` || cleaned.startsWith(`${stopword} `)) {
      return null;
    }
  }

  return cleaned;
}

/**
 * Extracts distinctive words from a recipe title.
 */
export function extractTitleKeywords(title: string): Set<string> {
  const words = title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !TITLE_STOPWORDS.has(w));
  return new Set(words);
}

/**
 * Deterministic scoring between a target recipe and a candidate recipe.
 */
export function calculateRelatedScore(target: any, candidate: any): number {
  let score = 0;

  // 1. Shared distinctive ingredients (+25 each, max 50) - Highest weight
  const targetIngredients = (target.ingredients || [])
    .map((i: any) => extractDistinctiveIngredient(typeof i === 'string' ? i : (i.name || '')))
    .filter(Boolean) as string[];

  const candidateIngredients = (candidate.ingredients || [])
    .map((i: any) => extractDistinctiveIngredient(typeof i === 'string' ? i : (i.name || '')))
    .filter(Boolean) as string[];

  let ingredientMatches = 0;
  for (const tIng of targetIngredients) {
    for (const cIng of candidateIngredients) {
      if (tIng === cIng || tIng.includes(cIng) || cIng.includes(tIng)) {
        ingredientMatches++;
        break;
      }
    }
  }
  score += Math.min(50, ingredientMatches * 25);

  // 2. Same category (+25)
  if (target.category_id && candidate.category_id && target.category_id === candidate.category_id) {
    score += 25;
  }

  // 3. Similar cuisine (+10)
  if (target.cuisine && candidate.cuisine && 
      target.cuisine.trim().toLowerCase() === candidate.cuisine.trim().toLowerCase()) {
    score += 10;
  }

  // 4. Shared keywords/tags (+5 each, max 15)
  const targetKeywords = parseKeywords(target.keywords);
  const candidateKeywords = parseKeywords(candidate.keywords);
  let keywordMatches = 0;
  for (const kw of targetKeywords) {
    if (candidateKeywords.has(kw)) {
      keywordMatches++;
    }
  }
  score += Math.min(15, keywordMatches * 5);

  // 5. Title distinctive word overlap (+10 each, max 30)
  const targetTitleWords = extractTitleKeywords(target.title || '');
  const candidateTitleWords = extractTitleKeywords(candidate.title || '');
  let titleMatches = 0;
  for (const word of targetTitleWords) {
    if (candidateTitleWords.has(word)) {
      titleMatches++;
    }
  }
  score += Math.min(30, titleMatches * 10);

  return score;
}

function parseKeywords(kwInput: any): Set<string> {
  if (!kwInput) return new Set();
  let arr: string[] = [];
  if (Array.isArray(kwInput)) {
    arr = kwInput;
  } else if (typeof kwInput === 'string') {
    try {
      const parsed = JSON.parse(kwInput);
      if (Array.isArray(parsed)) arr = parsed;
      else arr = kwInput.split(',').map(s => s.trim());
    } catch {
      arr = kwInput.split(',').map(s => s.trim());
    }
  }
  return new Set(arr.map(k => k.toLowerCase().trim()).filter(Boolean));
}

/**
 * Returns 4–6 deterministic related recipes for a given published recipe.
 * Strictly filters by status = 'PUBLISHED' and excludes current recipe.
 */
export async function getDeterministicRelatedRecipes(
  db: D1Database,
  recipeId: number,
  limit: number = 6
): Promise<RelatedRecipeResult[]> {
  const boundedLimit = Math.max(4, Math.min(6, limit));

  // 1. Check cache table first
  try {
    const cached = await db.prepare(`
      SELECT related_ids FROM recipe_related_cache WHERE recipe_id = ?
    `).bind(recipeId).first<{ related_ids: string }>();

    if (cached && cached.related_ids) {
      const ids: number[] = JSON.parse(cached.related_ids);
      if (ids.length > 0) {
        // Query current status to ensure ALL cached recipes are still PUBLISHED
        const placeholders = ids.map(() => '?').join(',');
        const rows = await db.prepare(`
          SELECT r.id, r.title, r.slug, r.description, r.hero_image_key, r.original_image_url,
                 r.prep_time, r.cook_time, r.total_time, r.servings, r.category_id,
                 c.name as category_name, c.slug as category_slug
          FROM recipes r
          LEFT JOIN categories c ON r.category_id = c.id
          WHERE r.id IN (${placeholders}) AND r.status = 'PUBLISHED'
        `).bind(...ids).all<RelatedRecipeResult>();

        const validResults = rows.results || [];
        // If all cached entries are still valid published recipes, preserve cached rank order
        if (validResults.length >= Math.min(boundedLimit, ids.length)) {
          const lookup = new Map(validResults.map(r => [r.id, r]));
          const ordered: RelatedRecipeResult[] = [];
          for (const id of ids) {
            const item = lookup.get(id);
            if (item) ordered.push(item);
            if (ordered.length >= boundedLimit) break;
          }
          if (ordered.length >= 4 || ordered.length === validResults.length) {
            return ordered;
          }
        }
      }
    }
  } catch (err) {
    // If cache read fails, seamlessly fall through to dynamic calculation
  }

  // 2. Fetch target recipe details
  const targetRecipe = await db.prepare(`
    SELECT id, title, slug, category_id, cuisine, keywords FROM recipes WHERE id = ?
  `).bind(recipeId).first<any>();

  if (!targetRecipe) return [];

  // Fetch target ingredients
  const targetIngRows = await db.prepare(`
    SELECT name FROM ingredients WHERE recipe_id = ?
  `).bind(recipeId).all<{ name: string }>();
  targetRecipe.ingredients = targetIngRows.results || [];

  // 3. Fetch all other PUBLISHED recipes
  const candidates = await db.prepare(`
    SELECT r.id, r.title, r.slug, r.description, r.hero_image_key, r.original_image_url,
           r.prep_time, r.cook_time, r.total_time, r.servings, r.category_id, r.cuisine, r.keywords,
           r.published_at,
           c.name as category_name, c.slug as category_slug
    FROM recipes r
    LEFT JOIN categories c ON r.category_id = c.id
    WHERE r.status = 'PUBLISHED' AND r.id != ?
    ORDER BY r.published_at DESC
  `).bind(recipeId).all<any>();

  const candidateList = candidates.results || [];
  if (candidateList.length === 0) return [];

  // Fetch ingredients for candidate recipes in batch
  const candidateIds = candidateList.map(c => c.id);
  const candIngPlaceholders = candidateIds.map(() => '?').join(',');
  const candIngRows = await db.prepare(`
    SELECT recipe_id, name FROM ingredients WHERE recipe_id IN (${candIngPlaceholders})
  `).bind(...candidateIds).all<{ recipe_id: number; name: string }>();

  const ingMap = new Map<number, string[]>();
  for (const row of (candIngRows.results || [])) {
    if (!ingMap.has(row.recipe_id)) ingMap.set(row.recipe_id, []);
    ingMap.get(row.recipe_id)!.push(row.name);
  }

  // 4. Score all candidates
  const scored = candidateList.map(cand => {
    cand.ingredients = ingMap.get(cand.id) || [];
    const score = calculateRelatedScore(targetRecipe, cand);
    return {
      ...cand,
      score
    };
  });

  // Sort by score DESC, then tiebreak by published_at DESC
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const dateA = a.published_at ? new Date(a.published_at).getTime() : 0;
    const dateB = b.published_at ? new Date(b.published_at).getTime() : 0;
    return dateB - dateA;
  });

  const selected = scored.slice(0, boundedLimit);
  const selectedIds = selected.map(s => s.id);

  // 5. Update cache table
  try {
    await db.prepare(`
      INSERT INTO recipe_related_cache (recipe_id, related_ids, updated_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(recipe_id) DO UPDATE SET
        related_ids = excluded.related_ids,
        updated_at = datetime('now')
    `).bind(recipeId, JSON.stringify(selectedIds)).run();
  } catch (err) {
    // Cache write error should not prevent returning results
  }

  return selected.map(s => ({
    id: s.id,
    title: s.title,
    slug: s.slug,
    description: s.description,
    hero_image_key: s.hero_image_key,
    original_image_url: s.original_image_url,
    prep_time: s.prep_time,
    cook_time: s.cook_time,
    total_time: s.total_time,
    servings: s.servings,
    category_id: s.category_id,
    category_name: s.category_name,
    category_slug: s.category_slug,
    score: s.score
  }));
}

/**
 * Invalidates related recipe cache. Called when recipes are published, unpublished, or modified.
 */
export async function invalidateRelatedCache(db: D1Database, recipeId?: number): Promise<void> {
  try {
    if (recipeId) {
      // Invalidate target recipe and all cache entries containing this recipe ID
      await db.prepare('DELETE FROM recipe_related_cache WHERE recipe_id = ?').bind(recipeId).run();
      await db.prepare('DELETE FROM recipe_related_cache WHERE related_ids LIKE ?').bind(`%${recipeId}%`).run();
    } else {
      // Clear entire cache
      await db.prepare('DELETE FROM recipe_related_cache').run();
    }
  } catch (err) {
    // Ignore cache clear error
  }
}

/**
 * Detects orphan recipes (published recipes with 0 inbound links).
 * Calculates inbound connections from both related recipes and contextual internal links.
 */
export async function detectOrphanRecipes(db: D1Database): Promise<{
  total_published: number;
  orphan_count: number;
  healthy_count: number;
  average_inbound_links: number;
  recipes: OrphanRecipeReport[];
}> {
  // Fetch all published recipes
  const rows = await db.prepare(`
    SELECT r.id, r.title, r.slug, r.category_id, r.cuisine, r.keywords,
           c.name as category_name, c.slug as category_slug
    FROM recipes r
    LEFT JOIN categories c ON r.category_id = c.id
    WHERE r.status = 'PUBLISHED'
    ORDER BY r.title ASC
  `).all<any>();

  const publishedRecipes = rows.results || [];
  if (publishedRecipes.length === 0) {
    return {
      total_published: 0,
      orphan_count: 0,
      healthy_count: 0,
      average_inbound_links: 0,
      recipes: []
    };
  }

  // Load ingredients for all published recipes
  const allIds = publishedRecipes.map(r => r.id);
  const placeholders = allIds.map(() => '?').join(',');
  const ingRows = await db.prepare(`
    SELECT recipe_id, name FROM ingredients WHERE recipe_id IN (${placeholders})
  `).bind(...allIds).all<{ recipe_id: number; name: string }>();

  const ingMap = new Map<number, string[]>();
  for (const row of (ingRows.results || [])) {
    if (!ingMap.has(row.recipe_id)) ingMap.set(row.recipe_id, []);
    ingMap.get(row.recipe_id)!.push(row.name);
  }
  for (const r of publishedRecipes) {
    r.ingredients = ingMap.get(r.id) || [];
  }

  // Track inbound relationships
  const inboundMap = new Map<number, { id: number; title: string; slug: string }[]>();
  const outboundCountMap = new Map<number, number>();

  for (const r of publishedRecipes) {
    inboundMap.set(r.id, []);
    outboundCountMap.set(r.id, 0);
  }

  // Compute related recommendations for each recipe
  for (const recipe of publishedRecipes) {
    const candidates = publishedRecipes
      .filter(c => c.id !== recipe.id)
      .map(candidate => ({
        id: candidate.id,
        title: candidate.title,
        slug: candidate.slug,
        score: calculateRelatedScore(recipe, candidate)
      }))
      .filter(cand => cand.score >= 10)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);

    outboundCountMap.set(recipe.id, candidates.length);

    for (const target of candidates) {
      if (inboundMap.has(target.id)) {
        inboundMap.get(target.id)!.push({
          id: recipe.id,
          title: recipe.title,
          slug: recipe.slug
        });
      }
    }
  }

  // Build report
  let totalInbound = 0;
  let orphanCount = 0;

  const report: OrphanRecipeReport[] = publishedRecipes.map(r => {
    const inbound = inboundMap.get(r.id) || [];
    const inboundCount = inbound.length;
    totalInbound += inboundCount;

    const isOrphan = inboundCount === 0;
    if (isOrphan) orphanCount++;

    // Find suggested fix sources (published recipes with highest compatibility to recommend this orphan)
    const suggestedFixes = publishedRecipes
      .filter(cand => cand.id !== r.id)
      .map(cand => ({
        id: cand.id,
        title: cand.title,
        slug: cand.slug,
        score: calculateRelatedScore(cand, r)
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    return {
      id: r.id,
      title: r.title,
      slug: r.slug,
      category_name: r.category_name || 'Uncategorized',
      category_slug: r.category_slug || 'recipes',
      inbound_count: inboundCount,
      outbound_count: outboundCountMap.get(r.id) || 0,
      status: isOrphan ? 'ORPHAN' : 'HEALTHY',
      inbound_from: inbound,
      suggested_fix_sources: suggestedFixes
    };
  });

  const healthyCount = publishedRecipes.length - orphanCount;
  const avgInbound = publishedRecipes.length > 0 
    ? Number((totalInbound / publishedRecipes.length).toFixed(1)) 
    : 0;

  return {
    total_published: publishedRecipes.length,
    orphan_count: orphanCount,
    healthy_count: healthyCount,
    average_inbound_links: avgInbound,
    recipes: report
  };
}
