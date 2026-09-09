import type OpenAI from 'openai';
import { callDeepSeek } from './client';
import { parseDeepSeekJson } from './parser';
import { buildAnalysisPrompt } from './prompts/analysis';
import { buildIntroductionPrompt } from './prompts/introduction';
import { buildIngredientsPrompt } from './prompts/ingredients';
import { buildCookingPrompt } from './prompts/cooking';
import { buildTipsPrompt } from './prompts/tips';
import { buildVariationsPrompt } from './prompts/variations';
import { buildServingPrompt } from './prompts/serving';
import { buildStoragePrompt } from './prompts/storage';
import { buildFaqPrompt } from './prompts/faq';
import { buildSeoPrompt } from './prompts/seo';
import { buildAssemblyPrompt } from './prompts/assembly';
import { buildMasterSystemPrompt, PROMPT_VERSION } from './prompts/master-rules';
import {
  validateAnalysisOutput,
  validateIntroductionOutput,
  validateSeoOutput
} from './validator';
import type { FactSheet, GeneratedContent } from '../normalization/types';

export interface EditorialAnalysis {
  recipePositioning: string;
  readerIntent: string;
  keyTechniques: string[];
  importantIngredients: string[];
  commonMistakes: string[];
  usefulSections: string[];
  likelyQuestions: string[];
}

export interface ProgressCallback {
  (stage: string, stageIndex: number, totalStages: number, data?: any): Promise<void> | void;
}

// STAGE 1: Editorial Analysis
export async function analyzeRecipe(client: OpenAI, factSheet: FactSheet): Promise<EditorialAnalysis> {
  const p = buildAnalysisPrompt(factSheet);
  const raw = await callDeepSeek(client, p.system, p.user, { temperature: 0.5 });
  const parsed = parseDeepSeekJson<EditorialAnalysis>(raw);
  validateAnalysisOutput(parsed);
  return {
    recipePositioning: parsed.recipePositioning || 'A reliable and delicious homemade recipe.',
    readerIntent: parsed.readerIntent || 'Seeking a tested, easy-to-follow recipe with great texture.',
    keyTechniques: Array.isArray(parsed.keyTechniques) ? parsed.keyTechniques : [],
    importantIngredients: Array.isArray(parsed.importantIngredients) ? parsed.importantIngredients : [],
    commonMistakes: Array.isArray(parsed.commonMistakes) ? parsed.commonMistakes : [],
    usefulSections: Array.isArray(parsed.usefulSections) ? parsed.usefulSections : [],
    likelyQuestions: Array.isArray(parsed.likelyQuestions) ? parsed.likelyQuestions : [],
  };
}

// STAGE 2: Introduction
export async function generateIntroduction(client: OpenAI, factSheet: FactSheet, analysis: EditorialAnalysis): Promise<{ introduction: string; whyThisRecipe: string }> {
  const p = buildIntroductionPrompt(factSheet, analysis);
  const raw = await callDeepSeek(client, p.system, p.user, { temperature: 0.7 });
  const parsed = parseDeepSeekJson<{ introduction: string; whyThisRecipe: string }>(raw);
  validateIntroductionOutput(parsed);
  return {
    introduction: parsed.introduction || '',
    whyThisRecipe: parsed.whyThisRecipe || ''
  };
}

// STAGE 3: Ingredient Guidance
export async function generateIngredientGuidance(client: OpenAI, factSheet: FactSheet, analysis: EditorialAnalysis): Promise<{ ingredientGuidance: { ingredient: string; guidance: string }[] }> {
  const p = buildIngredientsPrompt(factSheet, analysis);
  const raw = await callDeepSeek(client, p.system, p.user, { temperature: 0.6 });
  const parsed = parseDeepSeekJson<{ ingredientGuidance: { ingredient: string; guidance: string }[] }>(raw);
  return {
    ingredientGuidance: Array.isArray(parsed.ingredientGuidance) ? parsed.ingredientGuidance : []
  };
}

// STAGE 4: Cooking Guidance
export async function generateCookingGuidance(client: OpenAI, factSheet: FactSheet, analysis: EditorialAnalysis): Promise<{ cookingGuidance: string[] }> {
  const p = buildCookingPrompt(factSheet, analysis);
  const raw = await callDeepSeek(client, p.system, p.user, { temperature: 0.6 });
  const parsed = parseDeepSeekJson<{ cookingGuidance: string[] }>(raw);
  return {
    cookingGuidance: Array.isArray(parsed.cookingGuidance) ? parsed.cookingGuidance : []
  };
}

// STAGE 5: Pro Tips
export async function generateTips(client: OpenAI, factSheet: FactSheet): Promise<{ tips: string[] }> {
  const p = buildTipsPrompt(factSheet);
  const raw = await callDeepSeek(client, p.system, p.user, { temperature: 0.6 });
  const parsed = parseDeepSeekJson<{ tips: string[] }>(raw);
  return {
    tips: Array.isArray(parsed.tips) ? parsed.tips : []
  };
}

// STAGE 6: Variations
export async function generateVariations(client: OpenAI, factSheet: FactSheet): Promise<{ variations: { name: string; description: string }[] }> {
  const p = buildVariationsPrompt(factSheet);
  const raw = await callDeepSeek(client, p.system, p.user, { temperature: 0.7 });
  const parsed = parseDeepSeekJson<{ variations: { name: string; description: string }[] }>(raw);
  return {
    variations: Array.isArray(parsed.variations) ? parsed.variations : []
  };
}

// STAGE 7: Serving Suggestions
export async function generateServing(client: OpenAI, factSheet: FactSheet): Promise<{ servingSuggestions: string }> {
  const p = buildServingPrompt(factSheet);
  const raw = await callDeepSeek(client, p.system, p.user, { temperature: 0.7 });
  const parsed = parseDeepSeekJson<{ servingSuggestions: string }>(raw);
  return {
    servingSuggestions: parsed.servingSuggestions || ''
  };
}

// STAGE 8: Storage
export async function generateStorage(client: OpenAI, factSheet: FactSheet): Promise<{ storage: string }> {
  const p = buildStoragePrompt(factSheet);
  const raw = await callDeepSeek(client, p.system, p.user, { temperature: 0.5 });
  const parsed = parseDeepSeekJson<{ storage: string }>(raw);
  return {
    storage: parsed.storage || ''
  };
}

// STAGE 9: FAQ
export async function generateFaq(client: OpenAI, factSheet: FactSheet, likelyQuestions: string[]): Promise<{ faq: { question: string; answer: string }[] }> {
  const p = buildFaqPrompt(factSheet, likelyQuestions);
  const raw = await callDeepSeek(client, p.system, p.user, { temperature: 0.6 });
  const parsed = parseDeepSeekJson<{ faq: { question: string; answer: string }[] }>(raw);
  return {
    faq: Array.isArray(parsed.faq) ? parsed.faq : []
  };
}

// STAGE 10: SEO
export async function generateSeo(client: OpenAI, factSheet: FactSheet, primaryKeyword?: string): Promise<GeneratedContent['seo'] & { secondaryKeywords?: string[] }> {
  const keyword = primaryKeyword || (factSheet.lockedFacts.title.toLowerCase().includes('banana bread') ? 'banana bread recipe' : factSheet.lockedFacts.title);
  const p = buildSeoPrompt(factSheet, keyword);
  const raw = await callDeepSeek(client, p.system, p.user, { temperature: 0.6 });
  const parsed = parseDeepSeekJson<GeneratedContent['seo'] & { secondaryKeywords?: string[] }>(raw);
  validateSeoOutput(parsed);
  return {
    title: parsed.title || factSheet.lockedFacts.title,
    metaDescription: parsed.metaDescription || `Learn how to make the ultimate ${factSheet.lockedFacts.title} with simple ingredients and tested techniques.`,
    slug: (parsed.slug || factSheet.recipe.slug).toLowerCase().replace(/[^a-z0-9\-]/g, '-'),
    secondaryKeywords: Array.isArray(parsed.secondaryKeywords) ? parsed.secondaryKeywords : []
  };
}

// STAGE 11: Final Article Assembly
export async function assembleArticle(client: OpenAI, factSheet: FactSheet, content: Partial<GeneratedContent>): Promise<string> {
  const p = buildAssemblyPrompt(factSheet, content);
  const raw = await callDeepSeek(client, p.system, p.user, { temperature: 0.5 });
  const parsed = parseDeepSeekJson<{ fullArticle: string }>(raw, { fullArticle: '' });
  return parsed.fullArticle || '';
}

/**
 * Executes full sequential content generation pipeline with step-by-step progress callbacks.
 * Supports resuming by passing existing partial results.
 */
export async function generateFullContent(
  client: OpenAI,
  factSheet: FactSheet,
  options?: {
    primaryKeyword?: string;
    existingResults?: Partial<GeneratedContent & { analysis?: EditorialAnalysis }>;
    onProgress?: ProgressCallback;
  }
): Promise<{ content: GeneratedContent; analysis: EditorialAnalysis; fullArticle: string }> {
  const onProgress = options?.onProgress || (async () => {});
  const existing = options?.existingResults || {};
  const totalStages = 11;

  // 1. Analysis
  let analysis: EditorialAnalysis = existing.analysis as EditorialAnalysis;
  if (!analysis) {
    await onProgress('ANALYSIS', 1, totalStages);
    analysis = await analyzeRecipe(client, factSheet);
  }

  // 2. Introduction
  let introData = { introduction: existing.introduction || '', whyThisRecipe: existing.whyThisRecipe || '' };
  if (!introData.introduction) {
    await onProgress('INTRODUCTION', 2, totalStages, analysis);
    introData = await generateIntroduction(client, factSheet, analysis);
  }

  // 3. Ingredient Guidance
  let ingData = { ingredientGuidance: existing.ingredientGuidance || [] };
  if (ingData.ingredientGuidance.length === 0) {
    await onProgress('INGREDIENT_GUIDANCE', 3, totalStages);
    ingData = await generateIngredientGuidance(client, factSheet, analysis);
  }

  // 4. Cooking Guidance
  let cookData = { cookingGuidance: existing.cookingGuidance || [] };
  if (cookData.cookingGuidance.length === 0) {
    await onProgress('COOKING_GUIDANCE', 4, totalStages);
    cookData = await generateCookingGuidance(client, factSheet, analysis);
  }

  // 5. Tips
  let tipsData = { tips: existing.tips || [] };
  if (tipsData.tips.length === 0) {
    await onProgress('TIPS', 5, totalStages);
    tipsData = await generateTips(client, factSheet);
  }

  // 6. Variations
  let variationsData = { variations: existing.variations || [] };
  if (variationsData.variations.length === 0) {
    await onProgress('VARIATIONS', 6, totalStages);
    variationsData = await generateVariations(client, factSheet);
  }

  // 7. Serving Suggestions
  let servingData = { servingSuggestions: existing.servingSuggestions || '' };
  if (!servingData.servingSuggestions) {
    await onProgress('SERVING', 7, totalStages);
    servingData = await generateServing(client, factSheet);
  }

  // 8. Storage
  let storageData = { storage: existing.storage || '' };
  if (!storageData.storage) {
    await onProgress('STORAGE', 8, totalStages);
    storageData = await generateStorage(client, factSheet);
  }

  // 9. FAQ
  let faqData = { faq: existing.faq || [] };
  if (faqData.faq.length === 0) {
    await onProgress('FAQ', 9, totalStages);
    faqData = await generateFaq(client, factSheet, analysis.likelyQuestions);
  }

  // 10. SEO
  let seoData = existing.seo || { title: '', metaDescription: '', slug: '' };
  if (!seoData.title) {
    await onProgress('SEO', 10, totalStages);
    seoData = await generateSeo(client, factSheet, options?.primaryKeyword);
  }

  const generatedContent: GeneratedContent = {
    introduction: introData.introduction,
    whyThisRecipe: introData.whyThisRecipe,
    ingredientGuidance: ingData.ingredientGuidance,
    cookingGuidance: cookData.cookingGuidance,
    tips: tipsData.tips,
    variations: variationsData.variations,
    servingSuggestions: servingData.servingSuggestions,
    storage: storageData.storage,
    faq: faqData.faq,
    seo: seoData,
    contentPromptVersion: PROMPT_VERSION
  };

  // 11. Article Assembly
  await onProgress('ASSEMBLY', 11, totalStages);
  const fullArticle = await assembleArticle(client, factSheet, generatedContent);

  return {
    content: generatedContent,
    analysis,
    fullArticle
  };
}

/**
 * Regenerates an individual section of the recipe editorial content.
 */
export async function regenerateSection(
  client: OpenAI,
  section: string,
  factSheet: FactSheet,
  existingContent: Partial<GeneratedContent>,
  analysisContext?: EditorialAnalysis
): Promise<any> {
  const analysis = analysisContext || await analyzeRecipe(client, factSheet).catch(() => ({
    recipePositioning: '',
    readerIntent: '',
    keyTechniques: [],
    importantIngredients: [],
    commonMistakes: [],
    usefulSections: [],
    likelyQuestions: []
  }));

  switch (section) {
    case 'introduction':
      return await generateIntroduction(client, factSheet, analysis);

    case 'ingredientGuidance':
    case 'guidance':
      return await generateIngredientGuidance(client, factSheet, analysis);

    case 'cookingGuidance':
    case 'cooking':
      return await generateCookingGuidance(client, factSheet, analysis);

    case 'tips':
      return await generateTips(client, factSheet);

    case 'variations':
      return await generateVariations(client, factSheet);

    case 'serving':
    case 'servingSuggestions':
      return await generateServing(client, factSheet);

    case 'storage':
      return await generateStorage(client, factSheet);

    case 'faq':
      return await generateFaq(client, factSheet, analysis.likelyQuestions);

    case 'seo':
      return await generateSeo(client, factSheet);

    case 'assembly':
    case 'fullArticle':
      return { fullArticle: await assembleArticle(client, factSheet, existingContent) };

    default:
      throw new Error(`Unsupported section regeneration requested: ${section}`);
  }
}

/**
 * High-performance single-pass editorial generator for Cloudflare serverless environments.
 * Generates all editorial sections in one coherent API request within 5-8 seconds.
 */
export async function generateConsolidatedContent(
  client: OpenAI,
  factSheet: FactSheet,
  primaryKeyword?: string
): Promise<{ content: GeneratedContent; analysis: any; fullArticle: string }> {
  const isBananaBread = factSheet.lockedFacts.title.toLowerCase().includes('banana bread');
  const targetKeyword = primaryKeyword || (isBananaBread ? 'banana bread recipe' : factSheet.lockedFacts.title);

  const { lockedFacts } = factSheet;
  const canonicalStorage = lockedFacts.storageFacts || {
    roomTempDays: 'up to 3–4 days',
    fridgeDays: 'up to 5–7 days',
    freezerMonths: 'up to 3 months',
    container: 'airtight container',
    isSourceProvided: false
  };

  const system = buildMasterSystemPrompt(factSheet);

  const user = `RECIPE TO EXPAND (LOCKED RECIPE FACT SHEET):
Title: ${lockedFacts.title}
Yield: ${lockedFacts.yieldText || 'N/A'}
Servings: ${lockedFacts.servings || 'N/A'}
Prep Time: ${lockedFacts.prepTimeMinutes || lockedFacts.prepTime || 'N/A'} mins
Cook Time: ${lockedFacts.cookTimeMinutes || lockedFacts.cookTime || 'N/A'} mins
Cooling/Resting Time: ${lockedFacts.coolingTimeMinutes || '10–15'} mins
Total Time: ${lockedFacts.totalTimeMinutes || lockedFacts.totalTime || 'N/A'} mins
Oven Temperature: ${lockedFacts.temperature || '350°F'}
Preparation Method: ${lockedFacts.isOneBowl ? 'Single-bowl method (verified)' : `${lockedFacts.bowlCount} mixing bowls (e.g. separate bowls for dry and wet ingredients) - DO NOT claim this is a one-bowl recipe`}

CANONICAL STORAGE REQUIREMENTS (MUST MATCH EXACTLY):
- Room Temperature: ${canonicalStorage.roomTempDays} in an ${canonicalStorage.container}
- Refrigerator: ${canonicalStorage.fridgeDays} (optional if chilled)
- Freezer: ${canonicalStorage.freezerMonths}
- Reheating: Toast slices or warm gently to restore fresh-baked crumb.

Ingredients:
${lockedFacts.ingredients.map(i => `- ${i.quantity} ${i.unit} ${i.name}${i.notes ? ` (${i.notes})` : ''}`).join('\n')}

Instructions:
${lockedFacts.instructions.map(i => `${i.stepNumber}. ${i.text}`).join('\n')}

Primary SEO Keyword: "${targetKeyword}"

Generate a complete editorial package formatted as this exact JSON object:
{
  "analysis": {
    "recipePositioning": "1-sentence editorial positioning",
    "readerIntent": "Why readers want this recipe",
    "keyTechniques": ["technique 1", "technique 2"]
  },
  "introduction": "2-3 paragraphs warm, authoritative culinary introduction without clichés or author claims",
  "whyThisRecipe": "3 bullet points on why this recipe succeeds (baking science and texture)",
  "ingredientGuidance": [
    {"ingredient": "ingredient name", "guidance": "practical advice on selection or handling"}
  ],
  "cookingGuidance": ["critical technique tip 1", "critical technique tip 2"],
  "tips": ["tested baker tip 1", "tested baker tip 2", "tested baker tip 3"],
  "variations": [
    {"name": "variation title", "description": "how to adapt cleanly without breaking baking chemistry"}
  ],
  "servingSuggestions": "how to serve, slice, and pair",
  "storage": "precise room temp, fridge, and freezing instructions matching the canonical durations above",
  "faq": [
    {"question": "practical baking question?", "answer": "direct, helpful answer adhering to locked ingredients"}
  ],
  "seo": {
    "title": "SEO title under 60 chars including keyword",
    "metaDescription": "compelling meta description under 155 chars",
    "slug": "url-friendly-slug",
    "secondaryKeywords": ["related keyword 1", "related keyword 2"]
  },
  "fullArticle": "Complete markdown editorial text combining all sections in a beautiful, cohesive narrative"
}`;

  const raw = await callDeepSeek(client, system, user, { temperature: 0.6 });
  const parsed = parseDeepSeekJson<any>(raw);

  const content: GeneratedContent = {
    introduction: parsed.introduction || `This tested ${factSheet.lockedFacts.title} delivers exceptional flavor and a tender crumb.`,
    whyThisRecipe: parsed.whyThisRecipe || 'Simple pantry ingredients, proven baking chemistry, and reliable results.',
    ingredientGuidance: Array.isArray(parsed.ingredientGuidance) ? parsed.ingredientGuidance : [],
    cookingGuidance: Array.isArray(parsed.cookingGuidance) ? parsed.cookingGuidance : [],
    tips: Array.isArray(parsed.tips) ? parsed.tips : ['Do not overmix the batter to keep the texture soft.'],
    variations: Array.isArray(parsed.variations) ? parsed.variations : [],
    servingSuggestions: parsed.servingSuggestions || 'Slice and serve warm with salted butter.',
    storage: parsed.storage || `Store in an ${canonicalStorage.container} at room temperature for ${canonicalStorage.roomTempDays} or freeze for ${canonicalStorage.freezerMonths}.`,
    faq: Array.isArray(parsed.faq) ? parsed.faq : [],
    seo: {
      title: parsed.seo?.title || factSheet.lockedFacts.title,
      metaDescription: parsed.seo?.metaDescription || `Learn how to make the ultimate ${factSheet.lockedFacts.title} with simple ingredients and tested techniques.`,
      slug: (parsed.seo?.slug || factSheet.recipe.slug).toLowerCase().replace(/[^a-z0-9\-]/g, '-')
    },
    contentPromptVersion: PROMPT_VERSION
  };

  return {
    content,
    analysis: parsed.analysis || { recipePositioning: 'Homemade quality', readerIntent: 'Reliable baking' },
    fullArticle: parsed.fullArticle || ''
  };
}

