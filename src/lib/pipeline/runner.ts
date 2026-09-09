import { STAGES, type Stage, PipelineError } from './stages';
import { createDeepSeekClient } from '../deepseek/client';
import { generateFullContent, regenerateSection, analyzeRecipe } from '../deepseek/generate';
import { validateAll } from '../validation';
import { createFactSheet } from './factsheet';
import {
  getRecipeWithAllDetails,
  updateJobStatus,
  saveJobStageResults,
  upsertRecipeContent,
  upsertRecipeSeo,
  updateRecipeStatus,
  updateRecipe,
  createGenerationJob,
  linkJobToRecipe
} from '../db/recipes';
import type { FactSheet, GeneratedContent, PipelineResult } from '../normalization/types';

/**
 * Reconstructs or parses a FactSheet for an existing recipe in D1.
 */
export function reconstructFactSheet(recipeData: any): FactSheet {
  if (recipeData.fact_sheet) {
    try {
      const parsed = typeof recipeData.fact_sheet === 'string' ? JSON.parse(recipeData.fact_sheet) : recipeData.fact_sheet;
      if (parsed.lockedFacts && parsed.recipe && parsed.lockedFacts.storageFacts && parsed.lockedFacts.bowlCount !== undefined) {
        return parsed;
      }
    } catch {
      // Fallback to manual reconstruction
    }
  }

  // Manual reconstruction from structured DB tables
  const ingredients = (recipeData.ingredients || []).map((ing: any) => ({
    originalText: ing.original_text || `${ing.quantity || ''} ${ing.unit || ''} ${ing.name}`.trim(),
    quantity: ing.quantity || '',
    unit: ing.unit || '',
    name: ing.name,
    notes: ing.notes || ''
  }));

  const instructions = (recipeData.instructions || []).map((inst: any) => ({
    stepNumber: inst.step_number,
    text: inst.instruction
  }));

  const titleLower = (recipeData.title || '').toLowerCase();
  let servings = recipeData.servings || '';
  let yieldText = recipeData.yield_text || '';

  if (titleLower.includes('bread') || titleLower.includes('loaf')) {
    if (!yieldText || yieldText === '1') yieldText = '1 loaf';
    if (!servings || servings === '1') servings = '10–12 slices';
  } else if (!servings) {
    servings = yieldText || '4–6 servings';
  }

  const normalizedRecipe = {
    title: recipeData.title,
    slug: recipeData.slug,
    description: recipeData.description || '',
    ingredients,
    instructions,
    prepTime: recipeData.prep_time,
    cookTime: recipeData.cook_time,
    totalTime: recipeData.total_time,
    servings,
    yieldText,
    category: '',
    cuisine: recipeData.cuisine || '',
    keywords: [],
    equipment: [],
    notes: [],
    nutrition: {},
    image: recipeData.original_image_url || null,
    sourceMetadata: {
      sourceUrl: recipeData.source_url || '',
      sourceDomain: recipeData.source_domain || '',
      importedAt: recipeData.created_at || new Date().toISOString(),
      extractionMethod: (recipeData.extraction_method || 'json-ld') as any,
      extractionConfidence: (recipeData.extraction_confidence || 'HIGH') as any,
      originalImageUrl: recipeData.original_image_url || null,
      yieldText
    }
  };

  return createFactSheet(normalizedRecipe);
}

/**
 * Runs the DeepSeek editorial content generation pipeline for an imported recipe.
 */
export async function runGenerationPipeline(
  env: Env,
  recipeId: number,
  options?: { jobId?: number; resumeStage?: string }
): Promise<PipelineResult> {
  const db = env.DB;
  const aiClient = createDeepSeekClient(env.DEEPSEEK_API_KEY);

  // 1. Fetch recipe and its details
  const recipeData = await getRecipeWithAllDetails(db, recipeId);
  if (!recipeData) {
    throw new Error(`Recipe with ID ${recipeId} not found in database.`);
  }

  // 2. Resolve or create generation job
  let jobId = options?.jobId || (recipeData.job ? recipeData.job.id : null);
  if (!jobId) {
    jobId = await createGenerationJob(db, recipeData.source_url || `recipe-${recipeId}`);
    if (jobId) {
      await linkJobToRecipe(db, jobId, recipeId);
    }
  }

  if (!jobId) throw new Error('Could not create or locate generation job.');

  // 3. Load existing partial results for resumption if available
  let existingResults: Partial<GeneratedContent & { analysis?: any }> = {};
  if (recipeData.job?.stage_results) {
    try {
      existingResults = typeof recipeData.job.stage_results === 'string'
        ? JSON.parse(recipeData.job.stage_results)
        : recipeData.job.stage_results;
    } catch {
      existingResults = {};
    }
  }

  try {
    console.log(`[Job ${jobId}] Starting DeepSeek Editorial Generation for recipe ${recipeId} ("${recipeData.title}")`);
    await updateJobStatus(db, jobId, 'RUNNING', STAGES.ANALYSIS);
    await updateRecipeStatus(db, recipeId, 'PROCESSING');

    const factSheet = reconstructFactSheet(recipeData);

    // Track state progressively
    const intermediateState: any = { ...existingResults };

    // 4. Run full multi-stage generation with progressive D1 saving
    const { content, analysis, fullArticle } = await generateFullContent(
      aiClient,
      factSheet,
      {
        primaryKeyword: factSheet.lockedFacts.title.toLowerCase().includes('banana bread') ? 'banana bread recipe' : undefined,
        existingResults,
        onProgress: async (stageName, stageIdx, totalStages, stageData) => {
          console.log(`[Job ${jobId}] Stage ${stageIdx}/${totalStages}: ${stageName}`);
          if (stageData) {
            intermediateState[stageName.toLowerCase()] = stageData;
          }
          await updateJobStatus(db, jobId, 'RUNNING', stageName);
          await saveJobStageResults(db, jobId, stageName, intermediateState);
        }
      }
    );

    // 5. Stage: VALIDATION
    await updateJobStatus(db, jobId, 'RUNNING', STAGES.VALIDATION);
    const validation = validateAll(factSheet.lockedFacts, content);
    console.log(`[Job ${jobId}] Validation completed. Passed: ${validation.passed}, Issues: ${validation.issues.length}`);

    // 6. Save generated content and SEO to D1
    await upsertRecipeContent(db, recipeId, {
      introduction: content.introduction,
      why_this_recipe: content.whyThisRecipe,
      ingredient_guidance: content.ingredientGuidance,
      cooking_guidance: content.cookingGuidance,
      tips: content.tips,
      variations: content.variations,
      serving_suggestions: content.servingSuggestions,
      storage: content.storage,
      faq: content.faq,
      full_article: fullArticle
    });

    await upsertRecipeSeo(db, recipeId, {
      seo_title: content.seo.title,
      meta_description: content.seo.metaDescription,
      canonical_url: recipeData.source_url || `/recipes/${content.seo.slug}/`
    });

    // Update recipe slug and description if improved by SEO
    if (content.seo.slug && recipeData.slug.startsWith('untitled') || recipeData.slug === 'mock-recipe') {
      await updateRecipe(db, recipeId, { slug: content.seo.slug, description: content.seo.metaDescription });
    }

    // 7. Update status to DRAFT (never auto-publish)
    await updateRecipeStatus(db, recipeId, 'DRAFT');
    await updateJobStatus(db, jobId, 'COMPLETED', STAGES.DRAFT);
    await saveJobStageResults(db, jobId, STAGES.DRAFT, { content, analysis, validation });

    console.log(`[Job ${jobId}] Recipe ${recipeId} generation completed successfully. Status: DRAFT`);

    return {
      jobId,
      recipeId,
      stage: STAGES.DRAFT,
      status: 'success'
    };
  } catch (error: any) {
    console.error(`[Job ${jobId}] Generation failed:`, error);
    const errorMsg = error?.message || 'Unknown generation error occurred.';
    await updateJobStatus(db, jobId, 'FAILED', undefined, errorMsg);
    await updateRecipeStatus(db, recipeId, 'FAILED');

    return {
      jobId,
      recipeId,
      stage: STAGES.FAILED,
      status: 'failed',
      error: errorMsg
    };
  }
}
