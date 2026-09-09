import { parseIngredients } from '../extraction/ingredients';
import { cleanInstructions } from '../extraction/instructions';
import { parseTime, formatMinutes as formatMins } from '../extraction/time';
import type { RawRecipeData, NormalizedRecipe, NutritionInfo, SourceMetadata } from './types';

export function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
}

export function formatMinutes(minutes: number | null): string {
  return formatMins(minutes);
}

export function sanitizeRecipeDescription(desc?: string): string {
  if (!desc) return '';
  return desc
    .replace(/,\s*and\s*\d{1,3}(?:,\d{3})*\+?\s*(?:reviews|ratings|stars)[^,\.]*/gi, '')
    .replace(/\b\d{1,3}(?:,\d{3})*\+?\s*(?:reviews|ratings|stars)[^,\.]*/gi, '')
    .replace(/\b(?:This recipe is also in my cookbook|featured in my cookbook)[^\.]*\.?/gi, '')
    .replace(/\b(?:in my cookbook|my debut cookbook|my cookbook)[^\.]*\.?/gi, '')
    .replace(/\b(?:Sally's Baking 101|Sally's Baking Addiction)[^\.]*\.?/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+\./g, '.')
    .replace(/\s+,/g, ',')
    .trim();
}

export function normalizeRecipe(raw: RawRecipeData, sourceMetadata: SourceMetadata): NormalizedRecipe {
  const ingredients = parseIngredients(raw.ingredients || []);
  const instructions = cleanInstructions(raw.instructions || []);
  
  const prep = parseTime(raw.prepTime);
  const cook = parseTime(raw.cookTime);
  const total = parseTime(raw.totalTime);

  let category = '';
  if (Array.isArray(raw.category)) {
    category = raw.category[0] || '';
  } else if (raw.category) {
    category = raw.category;
  }

  let cuisine = '';
  if (Array.isArray(raw.cuisine)) {
    cuisine = raw.cuisine[0] || '';
  } else if (raw.cuisine) {
    cuisine = raw.cuisine;
  }

  const nutrition: NutritionInfo = {};
  if (raw.nutrition) {
    for (const [k, v] of Object.entries(raw.nutrition)) {
      nutrition[k] = String(v);
    }
  }

  const slug = slugify(raw.title || 'untitled-recipe');
  
  // Cleanly distinguish yieldText (e.g. "1 loaf") from servings (e.g. "10-12 slices")
  let yieldText = (raw.yieldText || raw.servings || '').trim();
  let servings = (raw.servings || '').trim();

  // If yield is "1 loaf" and servings is just "1" or "1 loaf", derive realistic slice servings
  const titleLower = (raw.title || '').toLowerCase();
  const isBreadLoaf = titleLower.includes('bread') || titleLower.includes('loaf') || /\bloaf\b/i.test(yieldText);
  const isMuffin = titleLower.includes('muffin') || /\bmuffins?\b/i.test(yieldText);
  const isCookie = titleLower.includes('cookie') || /\bcookies?\b/i.test(yieldText);
  const isCake = titleLower.includes('cake') || /\bcake\b/i.test(yieldText);

  if (isBreadLoaf) {
    if (!yieldText || yieldText === '1' || /^\d+$/.test(yieldText)) {
      yieldText = '1 loaf (9x5-inch)';
    }
    if (!servings || servings === '1' || servings === '1 loaf' || /^\s*1\s*$/.test(servings)) {
      servings = '10–12 slices';
    }
  } else if (isMuffin && (/^\d+$/.test(yieldText) || yieldText.includes('muffin'))) {
    const num = yieldText.match(/\d+/)?.[0] || '12';
    yieldText = `${num} muffins`;
    if (!servings || servings === '1') servings = `${num} servings`;
  } else if (isCookie && (/^\d+$/.test(yieldText) || yieldText.includes('cookie'))) {
    const num = yieldText.match(/\d+/)?.[0] || '24';
    yieldText = `${num} cookies`;
    if (!servings || servings === '1') servings = `${num} servings`;
  } else if (isCake && (yieldText === '1' || yieldText === '1 cake')) {
    yieldText = '1 9-inch cake';
    if (!servings || servings === '1') servings = '8–10 slices';
  } else if (!yieldText) {
    yieldText = servings || '1 batch';
  }

  // Calculate cooling / resting time if totalTime includes inactive resting
  let coolingTime: number | null = null;
  const prepMins = prep.minutes || 0;
  const cookMins = cook.minutes || 0;
  const totalMins = total.minutes || 0;

  if (totalMins > (prepMins + cookMins + 20)) {
    coolingTime = totalMins - (prepMins + cookMins);
  }

  return {
    title: raw.title || '',
    slug,
    description: sanitizeRecipeDescription(raw.description),
    ingredients,
    instructions,
    prepTime: prep.minutes,
    cookTime: cook.minutes,
    coolingTime,
    restingTime: coolingTime,
    totalTime: total.minutes,
    servings: servings || yieldText,
    yieldText,
    category,
    cuisine,
    keywords: raw.keywords || [],
    equipment: raw.equipment || [],
    notes: raw.notes || [],
    nutrition,
    image: raw.image || null,
    additionalImages: raw.additionalImages || [],
    sourceMetadata
  };
}
