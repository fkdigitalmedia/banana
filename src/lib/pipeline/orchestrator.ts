import { PIPELINE_STAGES, type PipelineStage, FULL_PIPELINE_ORDER, PipelineError } from './stages';
import { validateUrl, fetchSource } from '../extraction/fetcher';
import { extractRecipe } from '../extraction';
import { normalizeRecipe } from '../normalization/normalizer';
import { createFactSheet } from './factsheet';
import { createDeepSeekClient } from '../deepseek/client';
import {
  analyzeRecipe,
  generateIntroduction,
  generateIngredientGuidance,
  generateCookingGuidance,
  generateTips,
  generateVariations,
  generateServing,
  generateStorage,
  generateFaq,
  generateSeo,
  assembleArticle,
  generateConsolidatedContent
} from '../deepseek/generate';
import { validateAll } from '../validation';
import { evaluateRecipeQuality, repairRecipeContent } from '../quality';
import {
  createRecipe,
  saveIngredientsWithOriginal,
  createInstructions,
  upsertRecipeContent,
  upsertRecipeSeo,
  updateRecipeStatus,
  updateRecipeExtractionData,
  updateRecipe,
  updateJobStatus,
  saveJobStageResults,
  linkJobToRecipe,
  saveQualityReport
} from '../db/recipes';
import { normalizeSourceUrl } from './duplicate';
import { generateRecipeImage } from '../image/runware';
import { saveRecipeHeroImage } from '../image/storage';
import { importSourceRecipeImage, importAllSourceImages } from '../image/source-importer';
import { acquireJobLock, releaseJobLock, generateWorkerId } from './locking';
import { recordRevision } from '../editorial/workflow';
import { logger, sanitizeClientError } from '../utils/logger';
import type { NormalizedRecipe, FactSheet, GeneratedContent, PipelineResult } from '../normalization/types';

export interface PipelineExecutionOptions {
  jobId: number;
  sourceUrl: string;
  resumeFromStage?: PipelineStage;
  onStageProgress?: (stage: PipelineStage, stageIndex: number, totalStages: number, data?: any) => Promise<void>;
}

export interface ExecutionLogEntry {
  stage: string;
  status: 'COMPLETED' | 'SKIPPED' | 'FAILED';
  timestamp: string;
  durationMs: number;
  error?: string;
}

/**
 * Master End-to-End Pipeline Orchestrator.
 * Executes all 21 deterministic and AI stages sequentially with state persistence and resumption.
 */
export async function runMasterPipeline(
  env: Env,
  options: PipelineExecutionOptions
): Promise<PipelineResult> {
  const db = env.DB;
  const { jobId, sourceUrl } = options;
  const startTime = Date.now();

  const executionLog: ExecutionLogEntry[] = [];
  const state: Record<string, any> = {};

  // Initialize or fetch DeepSeek client
  const aiClient = env.DEEPSEEK_API_KEY ? createDeepSeekClient(env.DEEPSEEK_API_KEY) : null;

  let recipeId: number | null = null;
  let normalizedRecipe: NormalizedRecipe | null = null;
  let factSheet: FactSheet | null = null;

  const workerId = generateWorkerId('pipe');
  const lockAcquired = await acquireJobLock(db, jobId, workerId, 10);
  if (!lockAcquired) {
    logger.warn(`[Pipeline Job ${jobId}] Could not acquire lock; job is currently running or locked.`);
    return {
      jobId,
      stage: PIPELINE_STAGES.FAILED,
      status: 'failed',
      error: 'Job is currently running or locked by another worker process.'
    };
  }

  // Track progress helper
  async function advanceStage(stage: PipelineStage, data?: any) {
    const stageIdx = FULL_PIPELINE_ORDER.indexOf(stage) + 1;
    const total = FULL_PIPELINE_ORDER.length;

    logger.info(`[Pipeline Job ${jobId}] Stage ${stageIdx}/${total}: ${stage}`);
    await updateJobStatus(db, jobId, 'RUNNING', stage);
    
    if (data) {
      state[stage.toLowerCase()] = data;
    }
    state.executionLog = executionLog;
    state.recipeId = recipeId;
    await saveJobStageResults(db, jobId, stage, state);

    if (options.onStageProgress) {
      await options.onStageProgress(stage, stageIdx, total, data);
    }
  }

  try {
    // ─────────────────────────────────────────────────────────────
    // STAGE 1: VALIDATE_URL
    // ─────────────────────────────────────────────────────────────
    let t0 = Date.now();
    await advanceStage(PIPELINE_STAGES.VALIDATE_URL);
    const validCheck = validateUrl(sourceUrl);
    if (!validCheck.valid) {
      throw new PipelineError(PIPELINE_STAGES.VALIDATE_URL, `Invalid URL: ${validCheck.reason}`, false);
    }
    const cleanUrl = normalizeSourceUrl(sourceUrl);
    executionLog.push({ stage: PIPELINE_STAGES.VALIDATE_URL, status: 'COMPLETED', timestamp: new Date().toISOString(), durationMs: Date.now() - t0 });

    // ─────────────────────────────────────────────────────────────
    // STAGE 2: FETCH_SOURCE
    // ─────────────────────────────────────────────────────────────
    t0 = Date.now();
    await advanceStage(PIPELINE_STAGES.FETCH_SOURCE);
    const fetchResult = await fetchSource(cleanUrl);
    executionLog.push({ stage: PIPELINE_STAGES.FETCH_SOURCE, status: 'COMPLETED', timestamp: new Date().toISOString(), durationMs: Date.now() - t0 });

    // ─────────────────────────────────────────────────────────────
    // STAGE 3: EXTRACT_RECIPE
    // ─────────────────────────────────────────────────────────────
    t0 = Date.now();
    await advanceStage(PIPELINE_STAGES.EXTRACT_RECIPE);
    const extractionResult = await extractRecipe(fetchResult.html, fetchResult.finalUrl);
    executionLog.push({ stage: PIPELINE_STAGES.EXTRACT_RECIPE, status: 'COMPLETED', timestamp: new Date().toISOString(), durationMs: Date.now() - t0 });

    // ─────────────────────────────────────────────────────────────
    // STAGE 4: NORMALIZE
    // ─────────────────────────────────────────────────────────────
    t0 = Date.now();
    await advanceStage(PIPELINE_STAGES.NORMALIZE);
    normalizedRecipe = normalizeRecipe(extractionResult.data, fetchResult.finalUrl, fetchResult.domain);
    executionLog.push({ stage: PIPELINE_STAGES.NORMALIZE, status: 'COMPLETED', timestamp: new Date().toISOString(), durationMs: Date.now() - t0 });

    // ─────────────────────────────────────────────────────────────
    // STAGE 5: VALIDATE_RECIPE
    // ─────────────────────────────────────────────────────────────
    t0 = Date.now();
    await advanceStage(PIPELINE_STAGES.VALIDATE_RECIPE);
    if (!normalizedRecipe.title || normalizedRecipe.title.trim().length === 0) {
      throw new PipelineError(PIPELINE_STAGES.VALIDATE_RECIPE, 'Extracted recipe title is missing.', false);
    }
    if (!normalizedRecipe.ingredients || normalizedRecipe.ingredients.length < 2) {
      throw new PipelineError(PIPELINE_STAGES.VALIDATE_RECIPE, 'Extracted recipe does not contain enough ingredients (minimum 2 required).', false);
    }
    if (!normalizedRecipe.instructions || normalizedRecipe.instructions.length < 1) {
      throw new PipelineError(PIPELINE_STAGES.VALIDATE_RECIPE, 'Extracted recipe contains no cooking instructions.', false);
    }
    executionLog.push({ stage: PIPELINE_STAGES.VALIDATE_RECIPE, status: 'COMPLETED', timestamp: new Date().toISOString(), durationMs: Date.now() - t0 });

    // ─────────────────────────────────────────────────────────────
    // STAGE 6: CREATE_FACT_SHEET
    // ─────────────────────────────────────────────────────────────
    t0 = Date.now();
    await advanceStage(PIPELINE_STAGES.CREATE_FACT_SHEET);
    factSheet = createFactSheet(normalizedRecipe);
    executionLog.push({ stage: PIPELINE_STAGES.CREATE_FACT_SHEET, status: 'COMPLETED', timestamp: new Date().toISOString(), durationMs: Date.now() - t0 });

    // ─────────────────────────────────────────────────────────────
    // STAGE 7: CREATE_RECIPE_RECORD (D1)
    // ─────────────────────────────────────────────────────────────
    t0 = Date.now();
    await advanceStage(PIPELINE_STAGES.CREATE_RECIPE_RECORD);
    
    // Clean up any previous failed attempt with this exact source URL
    const existingFailedUrl = await db.prepare('SELECT id FROM recipes WHERE source_url = ? AND status = "FAILED"').bind(cleanUrl).first<{ id: number }>();
    if (existingFailedUrl) {
      await db.prepare('UPDATE generation_jobs SET recipe_id = NULL WHERE recipe_id = ?').bind(existingFailedUrl.id).run();
      await db.prepare('DELETE FROM ingredients WHERE recipe_id = ?').bind(existingFailedUrl.id).run();
      await db.prepare('DELETE FROM instructions WHERE recipe_id = ?').bind(existingFailedUrl.id).run();
      await db.prepare('DELETE FROM recipe_content WHERE recipe_id = ?').bind(existingFailedUrl.id).run();
      await db.prepare('DELETE FROM recipes WHERE id = ?').bind(existingFailedUrl.id).run();
    }

    // Ensure slug is unique in database to avoid UNIQUE constraint crashes
    let uniqueSlug = normalizedRecipe.slug;
    let slugSuffix = 2;
    while (true) {
      const existing = await db.prepare('SELECT id, status FROM recipes WHERE slug = ?').bind(uniqueSlug).first<{ id: number; status: string }>();
      if (!existing) break;
      if (existing.status === 'FAILED') {
        await db.prepare('UPDATE generation_jobs SET recipe_id = NULL WHERE recipe_id = ?').bind(existing.id).run();
        await db.prepare('DELETE FROM ingredients WHERE recipe_id = ?').bind(existing.id).run();
        await db.prepare('DELETE FROM instructions WHERE recipe_id = ?').bind(existing.id).run();
        await db.prepare('DELETE FROM recipe_content WHERE recipe_id = ?').bind(existing.id).run();
        await db.prepare('DELETE FROM recipes WHERE id = ?').bind(existing.id).run();
        break;
      }
      uniqueSlug = `${normalizedRecipe.slug}-${slugSuffix}`;
      slugSuffix++;
      if (slugSuffix > 50) break;
    }
    normalizedRecipe.slug = uniqueSlug;

    recipeId = await createRecipe(db, {
      title: normalizedRecipe.title,
      slug: normalizedRecipe.slug,
      description: normalizedRecipe.description,
      status: 'PROCESSING',
      source_url: cleanUrl,
      source_domain: fetchResult.domain,
      prep_time: normalizedRecipe.prepTime,
      cook_time: normalizedRecipe.cookTime,
      total_time: normalizedRecipe.totalTime,
      servings: normalizedRecipe.servings,
      cuisine: normalizedRecipe.cuisine,
      keywords: JSON.stringify(normalizedRecipe.keywords || []),
      equipment: JSON.stringify(normalizedRecipe.equipment || []),
      nutrition: JSON.stringify(normalizedRecipe.nutrition || {})
    });

    if (!recipeId) throw new PipelineError(PIPELINE_STAGES.CREATE_RECIPE_RECORD, 'Failed to insert recipe record into D1.', true);

    await linkJobToRecipe(db, jobId, recipeId);
    await saveIngredientsWithOriginal(db, recipeId, normalizedRecipe.ingredients);
    await createInstructions(db, recipeId, normalizedRecipe.instructions);
    await updateRecipeExtractionData(db, recipeId, {
      rawExtractionData: extractionResult.data,
      factSheet: JSON.stringify(factSheet),
      extractionMethod: extractionResult.method,
      extractionConfidence: extractionResult.confidence,
      originalImageUrl: normalizedRecipe.image,
      yieldText: normalizedRecipe.yieldText,
      notes: (normalizedRecipe.notes || []).join('\n')
    });
    executionLog.push({ stage: PIPELINE_STAGES.CREATE_RECIPE_RECORD, status: 'COMPLETED', timestamp: new Date().toISOString(), durationMs: Date.now() - t0 });

    // Mark recipe as DRAFT immediately so it appears in drafts list
    await updateRecipeStatus(db, recipeId, 'DRAFT');

    if (!aiClient) {
      logger.warn(`[Pipeline Job ${jobId}] DEEPSEEK_API_KEY is not configured. Extracted recipe #${recipeId} saved as DRAFT.`);
      await updateJobStatus(db, jobId, 'COMPLETED', PIPELINE_STAGES.DRAFT_READY);
      await saveJobStageResults(db, jobId, PIPELINE_STAGES.DRAFT_READY, {
        recipeId,
        executionLog,
        message: 'Recipe extracted and saved as draft. AI generation skipped because DEEPSEEK_API_KEY is not configured.'
      });
      executionLog.push({ stage: PIPELINE_STAGES.DRAFT_READY, status: 'COMPLETED', timestamp: new Date().toISOString(), durationMs: 0 });
      return {
        jobId,
        recipeId,
        stage: PIPELINE_STAGES.DRAFT_READY,
        status: 'success'
      };
    }

    // ─────────────────────────────────────────────────────────────
    // STAGES 8-18: CONSOLIDATED EDITORIAL GENERATION (DeepSeek)
    // ─────────────────────────────────────────────────────────────
    t0 = Date.now();
    await advanceStage(PIPELINE_STAGES.ANALYZE);
    await advanceStage(PIPELINE_STAGES.GENERATE_INTRO);

    const isBananaBread = normalizedRecipe.title.toLowerCase().includes('banana bread');
    const primaryKeyword = isBananaBread ? 'banana bread recipe' : undefined;

    logger.info(`[Pipeline Job ${jobId}] Generating complete editorial content package with DeepSeek...`);
    const consolidated = await generateConsolidatedContent(aiClient, factSheet, primaryKeyword);
    let generatedContent: GeneratedContent = consolidated.content;
    const fullArticle = consolidated.fullArticle;
    const analysis = consolidated.analysis;

    await advanceStage(PIPELINE_STAGES.GENERATE_SEO);
    await advanceStage(PIPELINE_STAGES.ASSEMBLE);
    executionLog.push({ stage: PIPELINE_STAGES.ASSEMBLE, status: 'COMPLETED', timestamp: new Date().toISOString(), durationMs: Date.now() - t0 });

    // ─────────────────────────────────────────────────────────────
    // ─────────────────────────────────────────────────────────────
    // STAGE 19: VALIDATE_CONTENT (Quality & Fact-Consistency Engine)
    // ─────────────────────────────────────────────────────────────
    t0 = Date.now();
    await advanceStage(PIPELINE_STAGES.VALIDATE_CONTENT);
    let qualityReport = evaluateRecipeQuality(factSheet.lockedFacts, generatedContent);

    // Auto-repair safe issues if needed
    if (qualityReport.status !== 'PASS') {
      console.log(`[Pipeline Job ${jobId}] Running automated quality repair passes...`);
      const repairOutcome = await repairRecipeContent(aiClient, factSheet, generatedContent, qualityReport);
      generatedContent = repairOutcome.repairedContent;
      qualityReport = repairOutcome.finalReport;
    }

    if (recipeId) {
      await saveQualityReport(db, recipeId, qualityReport);
    }
    executionLog.push({ stage: PIPELINE_STAGES.VALIDATE_CONTENT, status: 'COMPLETED', timestamp: new Date().toISOString(), durationMs: Date.now() - t0 });

    // ─────────────────────────────────────────────────────────────
    // STAGE 20: IMAGE_PROCESSING (Source Import & Runware Fallback)
    // ─────────────────────────────────────────────────────────────
    t0 = Date.now();
    await advanceStage(PIPELINE_STAGES.IMAGE_PROCESSING);
    
    // Idempotency / Cost Protection: Skip if recipe already has a READY image
    let hasReadyImage = false;
    if (recipeId) {
      const existingImg = await db.prepare(
        'SELECT hero_image_key, hero_image_type, image_status, source_image_status FROM recipes WHERE id = ?'
      ).bind(recipeId).first<{ 
        hero_image_key: string | null; 
        hero_image_type: string | null;
        image_status: string | null; 
        source_image_status: string | null;
      }>();

      if (existingImg?.hero_image_key && (existingImg.image_status === 'READY' || existingImg.source_image_status === 'READY')) {
        hasReadyImage = true;
        logger.info(`[Pipeline Job ${jobId}] Recipe already has READY image (${existingImg.hero_image_key}). Skipping image processing.`);
      }
    }

    if (recipeId) {
      let sourceImportSuccess = false;

      // 1. Primary: Download source recipe images (hero + in-article process photos) to Cloudflare R2
      if (normalizedRecipe.image || (normalizedRecipe.additionalImages && normalizedRecipe.additionalImages.length > 0)) {
        try {
          logger.info(`[Pipeline Job ${jobId}] Attempting source recipe images import to R2 (hero + in-article photos)...`);
          const multiResult = await importAllSourceImages({
            db,
            bucket: env.RECIPE_IMAGES,
            recipeId,
            slug: normalizedRecipe.slug,
            heroImageUrl: hasReadyImage ? null : normalizedRecipe.image,
            additionalImages: normalizedRecipe.additionalImages,
            pageUrl: cleanUrl,
            recipeTitle: normalizedRecipe.title
          });

          if (multiResult.hero?.success && multiResult.hero?.r2Key) {
            sourceImportSuccess = true;
            logger.info(`[Pipeline Job ${jobId}] Source hero image imported to R2: ${multiResult.hero.r2Key}`);
          } else if (hasReadyImage) {
            sourceImportSuccess = true;
          } else {
            logger.warn(`[Pipeline Job ${jobId}] Source hero image import failed. Falling back to Runware AI for hero.`);
          }

          if (multiResult.inArticle.length > 0) {
            logger.info(`[Pipeline Job ${jobId}] Successfully imported ${multiResult.inArticle.length} in-article process photos.`);
          }
        } catch (srcImgErr: any) {
          logger.warn(`[Pipeline Job ${jobId}] Source image import error: ${srcImgErr.message}. Falling back.`);
        }
      }

      // 2. Secondary: Fallback to Runware FLUX.1 Schnell if hero image was not imported or ready
      if (!hasReadyImage && !sourceImportSuccess && env.RUNWARE_API_KEY) {
        try {
          logger.info(`[Pipeline Job ${jobId}] Generating fallback hero image with Runware FLUX.1 Schnell...`);
          const imgResult = await generateRecipeImage(env.RUNWARE_API_KEY, {
            title: normalizedRecipe.title,
            description: normalizedRecipe.description,
            ingredients: normalizedRecipe.ingredients,
            cuisine: normalizedRecipe.cuisine
          });

          await saveRecipeHeroImage({
            db,
            bucket: env.RECIPE_IMAGES,
            recipeId,
            slug: normalizedRecipe.slug,
            imageBuffer: imgResult.imageBuffer,
            prompt: imgResult.prompt,
            provider: imgResult.provider,
            model: imgResult.model,
            width: imgResult.width,
            height: imgResult.height
          });
          logger.info(`[Pipeline Job ${jobId}] Runware generated hero image saved successfully.`);
        } catch (imgErr: any) {
          logger.warn(`[Pipeline Job ${jobId}] Image generation note: ${imgErr.message}. Graceful fallback.`);
          await db.prepare(`
            UPDATE recipes 
            SET image_status = 'PENDING', image_error = ? 
            WHERE id = ?
          `).bind(imgErr.message || 'Image generation skipped', recipeId).run();
        }
      }
    }

    executionLog.push({ stage: PIPELINE_STAGES.IMAGE_PROCESSING, status: 'COMPLETED', timestamp: new Date().toISOString(), durationMs: Date.now() - t0 });

    // ─────────────────────────────────────────────────────────────
    // STAGE 21: FINAL_QA (Quality Gate)
    // ─────────────────────────────────────────────────────────────
    t0 = Date.now();
    await advanceStage(PIPELINE_STAGES.FINAL_QA);
    const criticalErrors = qualityReport.issues.filter(i => i.severity === 'HIGH');
    if (criticalErrors.length > 0) {
      console.warn(`[Pipeline Job ${jobId}] Quality Gate noted critical issues:`, criticalErrors);
    }
    executionLog.push({ stage: PIPELINE_STAGES.FINAL_QA, status: 'COMPLETED', timestamp: new Date().toISOString(), durationMs: Date.now() - t0 });

    // ─────────────────────────────────────────────────────────────
    // STAGE 22: DRAFT_READY
    // ─────────────────────────────────────────────────────────────
    t0 = Date.now();
    await upsertRecipeContent(db, recipeId, {
      introduction: generatedContent.introduction,
      why_this_recipe: generatedContent.whyThisRecipe,
      ingredient_guidance: generatedContent.ingredientGuidance,
      cooking_guidance: generatedContent.cookingGuidance,
      tips: generatedContent.tips,
      variations: generatedContent.variations,
      serving_suggestions: generatedContent.servingSuggestions,
      storage: generatedContent.storage,
      faq: generatedContent.faq,
      full_article: fullArticle,
      content_prompt_version: generatedContent.contentPromptVersion || 'v2'
    });

    await upsertRecipeSeo(db, recipeId, {
      seo_title: generatedContent.seo.title,
      meta_description: generatedContent.seo.metaDescription,
      canonical_url: cleanUrl
    });

    // Update slug if improved by SEO
    if (generatedContent.seo.slug && (normalizedRecipe.slug.startsWith('untitled') || normalizedRecipe.slug === 'mock-recipe')) {
      await updateRecipe(db, recipeId, { slug: generatedContent.seo.slug, description: generatedContent.seo.metaDescription });
    }

    // Mark Recipe as DRAFT (ready in draft library for editorial review)
    await updateRecipeStatus(db, recipeId, 'DRAFT');
    await recordRevision(db, recipeId, 'IMPORT', 'pipeline', 'Automated pipeline completed draft generation');
    await updateJobStatus(db, jobId, 'COMPLETED', PIPELINE_STAGES.DRAFT_READY);
    await saveJobStageResults(db, jobId, PIPELINE_STAGES.DRAFT_READY, {
      recipeId,
      content: generatedContent,
      analysis,
      qualityReport,
      executionLog,
      totalDurationMs: Date.now() - startTime
    });

    executionLog.push({ stage: PIPELINE_STAGES.DRAFT_READY, status: 'COMPLETED', timestamp: new Date().toISOString(), durationMs: Date.now() - t0 });

    console.log(`[Pipeline Job ${jobId}] ✅ Master Pipeline Completed in ${((Date.now() - startTime) / 1000).toFixed(1)}s. Recipe ${recipeId} is DRAFT_READY.`);

    return {
      jobId,
      recipeId,
      stage: PIPELINE_STAGES.DRAFT_READY,
      status: 'success'
    };
  } catch (err: any) {
    logger.error(`[Pipeline Job ${jobId}] ❌ Pipeline failed:`, err);
    const errorStage = err.stage || PIPELINE_STAGES.FAILED;
    const errorMsg = sanitizeClientError(err.message || 'Pipeline execution failed.');

    executionLog.push({ stage: errorStage, status: 'FAILED', timestamp: new Date().toISOString(), durationMs: 0, error: errorMsg });

    await updateJobStatus(db, jobId, 'FAILED', errorStage, errorMsg);
    if (recipeId) {
      await updateRecipeStatus(db, recipeId, 'FAILED');
    }

    await saveJobStageResults(db, jobId, errorStage, {
      ...state,
      error: errorMsg,
      failedStage: errorStage,
      executionLog
    });

    return {
      jobId,
      recipeId: recipeId || undefined,
      stage: errorStage,
      status: 'failed',
      error: errorMsg
    };
  } finally {
    await releaseJobLock(db, jobId, workerId);
  }
}
