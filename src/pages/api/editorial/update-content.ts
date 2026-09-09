import type { APIRoute } from 'astro';
import { getRecipeWithAllDetails, upsertRecipeContent, saveQualityReport } from '../../../lib/db/recipes';
import { markRecipeContentChanged } from '../../../lib/editorial/workflow';
import { reconstructFactSheet } from '../../../lib/pipeline/runner';
import { evaluateRecipeQuality } from '../../../lib/quality/engine';
import { logger, sanitizeClientError } from '../../../lib/utils/logger';

export const prerender = false;

export const POST: APIRoute = async (context) => {
  try {
    const body = await context.request.json().catch(() => null);
    const { recipeId, section, value, fullContent } = body || {};

    if (!recipeId) {
      return new Response(JSON.stringify({ success: false, error: 'recipeId is required.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const env = context.locals.runtime.env;
    const db = env.DB;
    const id = parseInt(recipeId, 10);

    const recipe = await getRecipeWithAllDetails(db, id);
    if (!recipe) {
      return new Response(JSON.stringify({ success: false, error: 'Recipe not found.' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const currentContent = recipe.content || {};
    const updatedContentData: Record<string, any> = {
      introduction: currentContent.introduction || '',
      why_this_recipe: currentContent.why_this_recipe || '',
      ingredient_guidance: currentContent.ingredient_guidance || '[]',
      cooking_guidance: currentContent.cooking_guidance || '[]',
      tips: currentContent.tips || '[]',
      variations: currentContent.variations || '[]',
      serving_suggestions: currentContent.serving_suggestions || '',
      storage: currentContent.storage || '',
      faq: currentContent.faq || '[]',
      full_article: currentContent.full_article || ''
    };

    if (fullContent && typeof fullContent === 'object') {
      Object.assign(updatedContentData, fullContent);
    } else if (section && value !== undefined) {
      const dbColMap: Record<string, string> = {
        introduction: 'introduction',
        whyThisRecipe: 'why_this_recipe',
        ingredientGuidance: 'ingredient_guidance',
        cookingGuidance: 'cooking_guidance',
        tips: 'tips',
        variations: 'variations',
        serving: 'serving_suggestions',
        servingSuggestions: 'serving_suggestions',
        storage: 'storage',
        faq: 'faq',
        fullArticle: 'full_article'
      };
      const col = dbColMap[section] || section;
      updatedContentData[col] = typeof value === 'string' ? value : JSON.stringify(value);
    }

    await upsertRecipeContent(db, id, updatedContentData);

    // Invalidate approval if was APPROVED
    await markRecipeContentChanged(
      db, 
      id, 
      'CONTENT_EDIT', 
      'admin', 
      section ? `Updated section: ${section}` : 'Edited editorial content'
    );

    // Re-run quality check
    const factSheet = reconstructFactSheet(recipe);
    const parseIfJson = (v: any) => typeof v === 'string' && (v.startsWith('[') || v.startsWith('{')) ? JSON.parse(v) : v;

    const evalContent = {
      introduction: updatedContentData.introduction,
      whyThisRecipe: updatedContentData.why_this_recipe,
      ingredientGuidance: parseIfJson(updatedContentData.ingredient_guidance) || [],
      cookingGuidance: parseIfJson(updatedContentData.cooking_guidance) || [],
      tips: parseIfJson(updatedContentData.tips) || [],
      variations: parseIfJson(updatedContentData.variations) || [],
      servingSuggestions: updatedContentData.serving_suggestions,
      storage: updatedContentData.storage,
      faq: parseIfJson(updatedContentData.faq) || [],
      seo: {
        title: recipe.seo?.seo_title || recipe.title,
        metaDescription: recipe.seo?.meta_description || recipe.description || '',
        slug: recipe.slug
      }
    };

    const qualityReport = evaluateRecipeQuality(factSheet.lockedFacts, evalContent);
    await saveQualityReport(db, id, qualityReport);

    logger.info(`[Workflow] Content updated for recipe ${id}. Quality score: ${qualityReport.score}/100.`);

    return new Response(JSON.stringify({
      success: true,
      message: 'Content updated successfully.',
      status: 'REVIEW_REQUIRED',
      qualityReport
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    logger.error('[/api/editorial/update-content] Error:', err);
    return new Response(JSON.stringify({
      success: false,
      error: sanitizeClientError(err, 'Failed to update recipe content.')
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
