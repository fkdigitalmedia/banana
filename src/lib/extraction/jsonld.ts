/**
 * Robust JSON-LD Recipe Extractor
 * 
 * Supports:
 * - Single Recipe objects
 * - Array of objects
 * - @graph containers
 * - Multiple JSON-LD script blocks
 * - Graceful skipping of malformed scripts
 * - Deterministic multi-recipe candidate scoring & selection
 */

import type { RawRecipeData } from '../normalization/types';
import { parseInstructions } from './instructions';
import { extractTemperatureFromInstructions, parseTemperature } from './temperature';

export interface JsonLdExtractResult {
  data: RawRecipeData;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  foundFields: string[];
  rawRecipeObject: any;
  isAmbiguous?: boolean;
  totalRecipesFound?: number;
}

/**
 * Recursively extracts all Recipe objects from a parsed JSON structure.
 * Flattens @graph, nested arrays, and sub-objects.
 */
export function findAllRecipeObjects(obj: any): any[] {
  if (!obj || typeof obj !== 'object') return [];

  const found: any[] = [];

  const type = obj['@type'];
  const isRecipe = type === 'Recipe' || 
                   type === 'http://schema.org/Recipe' || 
                   type === 'https://schema.org/Recipe' ||
                   (Array.isArray(type) && type.some(t => String(t).toLowerCase().includes('recipe')));

  if (isRecipe) {
    found.push(obj);
  }

  // Handle @graph
  if (Array.isArray(obj['@graph'])) {
    for (const item of obj['@graph']) {
      found.push(...findAllRecipeObjects(item));
    }
  }

  // Handle top-level arrays
  if (Array.isArray(obj)) {
    for (const item of obj) {
      found.push(...findAllRecipeObjects(item));
    }
  } else {
    // Traverse object properties
    for (const key of Object.keys(obj)) {
      if (key !== '@graph') {
        const val = obj[key];
        if (typeof val === 'object' && val !== null) {
          found.push(...findAllRecipeObjects(val));
        }
      }
    }
  }

  return found;
}

/**
 * Deterministically scores a candidate Recipe object against page context.
 */
function scoreCandidateRecipe(recipe: any, pageUrl?: string): number {
  let score = 0;

  const title = String(recipe.name || '').trim();
  if (title) score += 20;

  // URL context match
  if (pageUrl && title) {
    try {
      const parsedUrl = new URL(pageUrl);
      const slugParts = parsedUrl.pathname.toLowerCase().split(/[\/\-_]/).filter(p => p.length > 2);
      const titleLower = title.toLowerCase();
      let matchCount = 0;
      for (const part of slugParts) {
        if (titleLower.includes(part)) {
          matchCount++;
        }
      }
      score += Math.min(30, matchCount * 10);
    } catch {}
  }

  // Ingredients completeness
  const ingCount = Array.isArray(recipe.recipeIngredient) ? recipe.recipeIngredient.length : 0;
  if (ingCount >= 4) score += 25;
  else if (ingCount >= 2) score += 15;

  // Instructions completeness
  const inst = recipe.recipeInstructions;
  const instCount = Array.isArray(inst) ? inst.length : (inst ? 1 : 0);
  if (instCount >= 3) score += 25;
  else if (instCount >= 1) score += 15;

  // Times present
  if (recipe.totalTime || recipe.cookTime || recipe.prepTime) score += 10;

  // Image present
  if (recipe.image) score += 10;

  // Description present
  if (recipe.description) score += 5;

  return score;
}

export function extractJsonLd(html: string, pageUrl?: string): JsonLdExtractResult | null {
  if (!html) return null;

  const scriptRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  const allCandidates: any[] = [];

  while ((match = scriptRegex.exec(html)) !== null) {
    const rawContent = match[1].trim();
    if (!rawContent) continue;

    try {
      const parsed = JSON.parse(rawContent);
      const recipes = findAllRecipeObjects(parsed);
      allCandidates.push(...recipes);
    } catch {
      // Gracefully skip malformed JSON-LD scripts without failing the import
      continue;
    }
  }

  if (allCandidates.length === 0) return null;

  // Deduplicate candidates by name and instructions length
  const uniqueCandidates: any[] = [];
  const seenSignatures = new Set<string>();
  for (const cand of allCandidates) {
    const sig = `${cand.name || ''}|${Array.isArray(cand.recipeIngredient) ? cand.recipeIngredient.length : 0}`;
    if (!seenSignatures.has(sig)) {
      seenSignatures.add(sig);
      uniqueCandidates.push(cand);
    }
  }

  // Score all candidates
  const scored = uniqueCandidates.map(cand => ({
    recipe: cand,
    score: scoreCandidateRecipe(cand, pageUrl)
  }));

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  const topMatch = scored[0];
  const recipe = topMatch.recipe;

  // Check for ambiguity: if multiple candidates have high scores that are very close and differ in title
  let isAmbiguous = false;
  if (scored.length > 1) {
    const second = scored[1];
    if (second.score >= 50 && (topMatch.score - second.score <= 5)) {
      const title1 = String(topMatch.recipe.name || '').toLowerCase().trim();
      const title2 = String(second.recipe.name || '').toLowerCase().trim();
      if (title1 !== title2) {
        isAmbiguous = true;
      }
    }
  }

  const data: RawRecipeData = {};
  const foundFields: string[] = [];

  if (recipe.name) {
    data.title = String(recipe.name).trim();
    foundFields.push('title');
  }

  if (recipe.description) {
    data.description = String(recipe.description).trim();
    foundFields.push('description');
  }

  if (recipe.recipeIngredient) {
    data.ingredients = Array.isArray(recipe.recipeIngredient)
      ? recipe.recipeIngredient.map((i: any) => String(i).trim())
      : [String(recipe.recipeIngredient).trim()];
    foundFields.push('ingredients');
  }

  if (recipe.recipeInstructions) {
    const inst = parseInstructions(Array.isArray(recipe.recipeInstructions) ? recipe.recipeInstructions : [recipe.recipeInstructions]);
    data.instructions = inst.map(i => i.text);
    foundFields.push('instructions');
  }

  if (recipe.prepTime) {
    data.prepTime = recipe.prepTime;
    foundFields.push('prepTime');
  }

  if (recipe.cookTime) {
    data.cookTime = recipe.cookTime;
    foundFields.push('cookTime');
  }

  if (recipe.totalTime) {
    data.totalTime = recipe.totalTime;
    foundFields.push('totalTime');
  }

  if (recipe.recipeYield) {
    const rawYield = Array.isArray(recipe.recipeYield) ? recipe.recipeYield : [recipe.recipeYield];
    const yieldStrings = rawYield.map((y: any) => String(y).trim()).filter(Boolean);
    
    let yieldVal = yieldStrings[0] || '';
    let servingsVal = '';

    for (const str of yieldStrings) {
      if (/\b(?:slices?|servings?|portions?)\b/i.test(str)) {
        servingsVal = str;
      } else if (/\b(?:loaf|loaves|muffins?|cookies?|bars?|batch|pan|pie|cake)\b/i.test(str)) {
        yieldVal = str;
      }
    }

    data.yieldText = yieldVal || yieldStrings[0] || '';
    data.servings = servingsVal || data.yieldText;
    foundFields.push('servings');
  }

  if (recipe.keywords) {
    data.keywords = typeof recipe.keywords === 'string'
      ? recipe.keywords.split(',').map(s => s.trim())
      : Array.isArray(recipe.keywords) ? recipe.keywords : [];
    foundFields.push('keywords');
  }

  if (recipe.recipeCategory) {
    data.category = Array.isArray(recipe.recipeCategory) ? recipe.recipeCategory[0] : String(recipe.recipeCategory).trim();
    foundFields.push('category');
  }

  if (recipe.recipeCuisine) {
    data.cuisine = Array.isArray(recipe.recipeCuisine) ? recipe.recipeCuisine[0] : String(recipe.recipeCuisine).trim();
    foundFields.push('cuisine');
  }

  if (recipe.image) {
    if (typeof recipe.image === 'string') {
      data.image = recipe.image;
    } else if (Array.isArray(recipe.image) && recipe.image.length > 0) {
      const first = recipe.image[0];
      data.image = typeof first === 'string' ? first : first.url;
    } else if (recipe.image.url) {
      data.image = recipe.image.url;
    }
    if (data.image) foundFields.push('image');
  }

  if (recipe.nutrition) {
    const { '@type': _type, ...rest } = recipe.nutrition;
    data.nutrition = {};
    for (const [k, v] of Object.entries(rest)) {
      if (typeof v === 'string' || typeof v === 'number') {
        data.nutrition[k] = String(v);
      }
    }
    foundFields.push('nutrition');
  }

  // Check for temperature in recipe metadata or instructions
  const tempFromInst = extractTemperatureFromInstructions(data.instructions || []);
  if (tempFromInst) {
    data.temperature = tempFromInst.displayText;
    foundFields.push('temperature');
  } else if (recipe.cookingMethod && typeof recipe.cookingMethod === 'string') {
    const t = parseTemperature(recipe.cookingMethod);
    if (t) {
      data.temperature = t.displayText;
      foundFields.push('temperature');
    }
  }

  // Calculate confidence level
  let confidence: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';
  const hasTitle = Boolean(data.title && data.title.length >= 3);
  const ingCount = data.ingredients?.length || 0;
  const instCount = data.instructions?.length || 0;

  if (isAmbiguous) {
    confidence = 'LOW';
  } else if (hasTitle && ingCount >= 3 && instCount >= 2) {
    confidence = 'HIGH';
  } else if (hasTitle && (ingCount >= 2 || instCount >= 1)) {
    confidence = 'MEDIUM';
  }

  return {
    data,
    confidence,
    foundFields,
    rawRecipeObject: recipe,
    isAmbiguous,
    totalRecipesFound: uniqueCandidates.length
  };
}
