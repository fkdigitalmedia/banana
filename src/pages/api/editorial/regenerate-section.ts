import type { APIRoute } from 'astro';
import { getRecipeWithAllDetails, upsertRecipeContent, saveQualityReport } from '../../../lib/db/recipes';
import { markRecipeContentChanged } from '../../../lib/editorial/workflow';
import { reconstructFactSheet } from '../../../lib/pipeline/runner';
import { createDeepSeekClient } from '../../../lib/deepseek/client';
import { regenerateSection } from '../../../lib/deepseek/generate';
import { evaluateRecipeQuality } from '../../../lib/quality/engine';
import { logger, sanitizeClientError } from '../../../lib/utils/logger';

export const prerender = false;

export const POST: APIRoute = async (context) => {
  try {
    const body = await context.request.json().catch(() => null);
    const { recipeId, section } = body || {};

    if (!recipeId || !section) {
      return new Response(JSON.stringify({ success: false, error: 'recipeId and section are required.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const env = context.locals.runtime.env;
    const db = env.DB;
    const id = parseInt(recipeId, 10);

    if (!env.DEEPSEEK_API_KEY) {
      return new Response(JSON.stringify({ success: false, error: 'DeepSeek API key is not configured.' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const recipe = await getRecipeWithAllDetails(db, id);
    if (!recipe) {
      return new Response(JSON.stringify({ success: false, error: 'Recipe not found.' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const factSheet = reconstructFactSheet(recipe);
    const currentContent = recipe.content || {};
    const parseIfJson = (v: any) => typeof v === 'string' && (v.startsWith('[') || v.startsWith('{')) ? JSON.parse(v) : v;

    const existingContent = {
      introduction: currentContent.introduction || '',
      whyThisRecipe: currentContent.why_this_recipe || '',
      ingredientGuidance: parseIfJson(currentContent.ingredient_guidance) || [],
      cookingGuidance: parseIfJson(currentContent.cooking_guidance) || [],
      tips: parseIfJson(currentContent.tips) || [],
      variations: parseIfJson(currentContent.variations) || [],
      servingSuggestions: currentContent.serving_suggestions || '',
      storage: currentContent.storage || '',
      faq: parseIfJson(currentContent.faq) || []
    };

    const aiClient = createDeepSeekClient(env.DEEPSEEK_API_KEY);

    logger.info(`[Workflow] Regenerating section "${section}" for recipe ${id}...`);
    const generatedData = await regenerateSection(aiClient, section, factSheet, existingContent);

    // Map regenerated data to DB columns
    const updatePayload: Record<string, any> = { ...currentContent };

    if (section === 'introduction') {
      updatePayload.introduction = generatedData.introduction || generatedData;
      if (generatedData.whyThisRecipe) updatePayload.why_this_recipe = generatedData.whyThisRecipe;
    } else if (section === 'ingredientGuidance' || section === 'guidance') {
      updatePayload.ingredient_guidance = JSON.stringify(generatedData.ingredientGuidance || generatedData);
    } else if (section === 'cookingGuidance' || section === 'cooking') {
      updatePayload.cooking_guidance = JSON.stringify(generatedData.cookingGuidance || generatedData);
    } else if (section === 'tips') {
      updatePayload.tips = JSON.stringify(generatedData.tips || generatedData);
    } else if (section === 'variations') {
      updatePayload.variations = JSON.stringify(generatedData.variations || generatedData);
    } else if (section === 'serving' || section === 'servingSuggestions') {
      updatePayload.serving_suggestions = generatedData.servingSuggestions || generatedData.serving || generatedData;
    } else if (section === 'storage') {
      updatePayload.storage = generatedData.storage || generatedData;
    } else if (section === 'faq') {
      updatePayload.faq = JSON.stringify(generatedData.faq || generatedData);
    }

    await upsertRecipeContent(db, id, updatePayload);

    // Invalidate approval
    await markRecipeContentChanged(
      db, 
      id, 
      'SECTION_REGENERATED', 
      'admin', 
      `Regenerated section "${section}" via DeepSeek`
    );

    // Re-evaluate quality
    const updatedEvalContent = {
      introduction: updatePayload.introduction,
      whyThisRecipe: updatePayload.why_this_recipe,
      ingredientGuidance: parseIfJson(updatePayload.ingredient_guidance) || [],
      cookingGuidance: parseIfJson(updatePayload.cooking_guidance) || [],
      tips: parseIfJson(updatePayload.tips) || [],
      variations: parseIfJson(updatePayload.variations) || [],
      servingSuggestions: updatePayload.serving_suggestions,
      storage: updatePayload.storage,
      faq: parseIfJson(updatePayload.faq) || [],
      seo: {
        title: recipe.seo?.seo_title || recipe.title,
        metaDescription: recipe.seo?.meta_description || recipe.description || '',
        slug: recipe.slug
      }
    };

    const qualityReport = evaluateRecipeQuality(factSheet.lockedFacts, updatedEvalContent);
    await saveQualityReport(db, id, qualityReport);

    logger.info(`[Workflow] Section "${section}" regenerated for recipe ${id}. New quality score: ${qualityReport.score}/100.`);

    return new Response(JSON.stringify({
      success: true,
      section,
      generatedData,
      status: 'REVIEW_REQUIRED',
      qualityReport
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    logger.error('[/api/editorial/regenerate-section] Error:', err);
    return new Response(JSON.stringify({
      success: false,
      error: sanitizeClientError(err, 'Failed to regenerate section.')
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
