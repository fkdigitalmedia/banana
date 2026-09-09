/**
 * Authoritative Locked Recipe Fact Sheet Creator
 * 
 * Generates the immutable fact sheet that acts as the sole source of truth
 * for all downstream AI editorial and SEO generation.
 */

import type { NormalizedRecipe, FactSheet, LockedFacts, EditorialOpportunity } from '../normalization/types';
import { extractTemperatureFromInstructions, parseTemperature } from '../extraction/temperature';

export function createFactSheet(recipe: NormalizedRecipe): FactSheet {
  let temperatureText: string | null = null;

  // 1. Try to extract temperature from instructions or existing metadata
  const parsedTemp = extractTemperatureFromInstructions(recipe.instructions || []);
  if (parsedTemp) {
    temperatureText = parsedTemp.displayText;
  } else if ((recipe as any).temperature) {
    const fromMeta = parseTemperature((recipe as any).temperature);
    if (fromMeta) temperatureText = fromMeta.displayText;
  }

  // 2. Detect bowl count and vessel requirements from instructions
  let bowlCount = 1;
  const allInstructionsText = (recipe.instructions || []).map(i => i.text.toLowerCase()).join(' ');
  
  const bowlMatches = [
    /\b(?:medium|separate|another|second|dry|small)\s+bowl\b/gi,
    /\b(?:large|stand mixer|mixer|main)\s+bowl\b/gi
  ];
  
  let distinctBowls = 0;
  if (/\b(?:medium|separate|another|second|dry|small)\s+bowl\b/i.test(allInstructionsText)) distinctBowls++;
  if (/\b(?:large|stand mixer|mixer|main)\s+bowl\b/i.test(allInstructionsText)) distinctBowls++;
  if (/\b(?:whisk|mix|combine)\s+(?:the\s+)?(?:dry|flour)\s+.*?\s+in\s+a\s+(?:separate|medium|small)?\s*bowl\b/i.test(allInstructionsText)) distinctBowls = Math.max(distinctBowls, 2);
  
  bowlCount = distinctBowls > 0 ? distinctBowls : 1;
  const isOneBowl = bowlCount === 1 && !/\bseparate\s+bowl\b/i.test(allInstructionsText);

  // 3. Establish Canonical Storage Facts
  // Derive from recipe notes/instructions if present, otherwise set canonical safe limits
  const isBreadOrLoaf = recipe.title.toLowerCase().includes('bread') || recipe.title.toLowerCase().includes('loaf');
  const isCookieOrMuffin = recipe.title.toLowerCase().includes('cookie') || recipe.title.toLowerCase().includes('muffin');

  const storageFacts = {
    roomTempDays: isCookieOrMuffin ? 'up to 4–5 days' : 'up to 3–4 days',
    fridgeDays: 'up to 1 week',
    freezerMonths: 'up to 3 months',
    container: 'airtight container or wrapped tightly in foil/plastic wrap',
    isSourceProvided: false
  };

  const lockedFacts: LockedFacts = {
    title: recipe.title,
    ingredients: recipe.ingredients,
    instructions: recipe.instructions,
    prepTimeMinutes: recipe.prepTime,
    cookTimeMinutes: recipe.cookTime,
    coolingTimeMinutes: recipe.coolingTime ?? null,
    restingTimeMinutes: recipe.restingTime ?? null,
    totalTimeMinutes: recipe.totalTime,
    servings: recipe.servings,
    yieldText: recipe.yieldText,
    temperature: temperatureText,
    storageFacts,
    bowlCount,
    isOneBowl
  };

  const opportunities: EditorialOpportunity[] = [];
  const ingNames = recipe.ingredients.map(i => i.name.toLowerCase());
  const instTexts = recipe.instructions.map(i => i.text.toLowerCase());
  const titleLower = recipe.title.toLowerCase();

  if (ingNames.some(n => n.includes('banana')) || titleLower.includes('banana')) {
    opportunities.push({ section: 'ingredientGuidance', suggestion: 'Explain how banana ripeness affects flavor and sweetness.' });
  }
  if (ingNames.some(n => n.includes('butter'))) {
    opportunities.push({ section: 'ingredientGuidance', suggestion: 'Explain room temperature vs melted butter if applicable.' });
  }
  if (ingNames.some(n => n.includes('egg'))) {
    opportunities.push({ section: 'ingredientGuidance', suggestion: 'Explain how eggs affect moisture and binding.' });
  }
  if (ingNames.some(n => n.includes('baking soda') || n.includes('baking powder'))) {
    opportunities.push({ section: 'ingredientGuidance', suggestion: 'Explain the role of leavening agents.' });
  }
  if (instTexts.some(t => t.includes('overmix'))) {
    opportunities.push({ section: 'tips', suggestion: 'Add a tip about stopping at just combined to avoid tough textures.' });
  }
  if (instTexts.some(t => t.includes('toothpick'))) {
    opportunities.push({ section: 'tips', suggestion: 'Add a tip about the toothpick doneness test.' });
  }
  if (instTexts.some(t => t.includes('let cool') || t.includes('cooling rack'))) {
    opportunities.push({ section: 'tips', suggestion: 'Add a tip about letting it cool completely before slicing.' });
  }
  if (recipe.cookTime && recipe.cookTime > 45) {
    opportunities.push({ section: 'tips', suggestion: 'Suggest checking for doneness 5-10 minutes early as ovens vary.' });
  }
  if (Object.keys(recipe.nutrition).length === 0) {
    opportunities.push({ section: 'faq', suggestion: 'Note that nutrition varies by specific ingredients used.' });
  }

  return {
    lockedFacts,
    editorialOpportunities: opportunities,
    recipe,
    createdAt: new Date().toISOString(),
    contentPromptVersion: 'v2'
  };
}
