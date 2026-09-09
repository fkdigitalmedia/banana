import type { D1Database } from '@cloudflare/workers-types';

export interface CannibalizationMatch {
  existingRecipeId: number;
  existingTitle: string;
  existingSlug: string;
  similarityScore: number;
  reason: string;
}

export interface CannibalizationCheckResult {
  hasConflict: boolean;
  matches: CannibalizationMatch[];
}

/**
 * Tokenizes a string into normalized alphanumeric keyword tokens.
 * Ignores common culinary filler words (recipe, easy, best, how, make, to, the, a, and, with).
 */
const CANNIBALIZATION_STOPWORDS = new Set([
  'recipe', 'recipes', 'easy', 'best', 'simple', 'homemade', 'quick',
  'how', 'to', 'make', 'the', 'a', 'an', 'and', 'with', 'in', 'for', 'of'
]);

function tokenizeIntent(text: string): Set<string> {
  if (!text) return new Set();
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/-/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !CANNIBALIZATION_STOPWORDS.has(w));
  return new Set(words);
}

/**
 * Computes Jaccard similarity coefficient between two token sets.
 */
function computeJaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) {
      intersection++;
    }
  }
  const union = new Set([...setA, ...setB]).size;
  return union > 0 ? intersection / union : 0;
}

/**
 * Checks whether a candidate recipe shares substantial search/recipe intent
 * with any existing recipe in the database.
 * 
 * Flags `POTENTIAL_CANNIBALIZATION` if high intent overlap (> 0.70) is detected.
 */
export async function detectCannibalization(
  db: D1Database,
  candidate: { title: string; slug: string; excludeRecipeId?: number }
): Promise<CannibalizationCheckResult> {
  const candidateSlugTokens = tokenizeIntent(candidate.slug);
  const candidateTitleTokens = tokenizeIntent(candidate.title);

  // If there are no distinctive culinary tokens (e.g. only stopwords), skip check
  if (candidateSlugTokens.size === 0 && candidateTitleTokens.size === 0) {
    return { hasConflict: false, matches: [] };
  }

  // Query existing published or reviewed recipes
  const excludeId = candidate.excludeRecipeId || 0;
  const existingRecipes = await db.prepare(`
    SELECT id, title, slug, status 
    FROM recipes 
    WHERE id != ? AND status IN ('PUBLISHED', 'APPROVED', 'REVIEW_REQUIRED', 'DRAFT')
    LIMIT 200
  `).bind(excludeId).all<{ id: number; title: string; slug: string; status: string }>();

  const matches: CannibalizationMatch[] = [];

  for (const recipe of existingRecipes.results || []) {
    const existingSlugTokens = tokenizeIntent(recipe.slug);
    const existingTitleTokens = tokenizeIntent(recipe.title);

    const slugSimilarity = computeJaccardSimilarity(candidateSlugTokens, existingSlugTokens);
    const titleSimilarity = computeJaccardSimilarity(candidateTitleTokens, existingTitleTokens);

    const maxSimilarity = Math.max(slugSimilarity, titleSimilarity);

    // If distinctive keywords are 100% identical or similarity >= 0.75
    if (maxSimilarity >= 0.75) {
      matches.push({
        existingRecipeId: recipe.id,
        existingTitle: recipe.title,
        existingSlug: recipe.slug,
        similarityScore: Number(maxSimilarity.toFixed(2)),
        reason: `Shares identical core intent tokens: [${[...candidateSlugTokens].filter(t => existingSlugTokens.has(t)).join(', ')}] with existing recipe "${recipe.title}" (/recipes/${recipe.slug}/)`
      });
    }
  }

  return {
    hasConflict: matches.length > 0,
    matches
  };
}
