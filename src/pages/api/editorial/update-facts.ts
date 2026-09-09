import type { APIRoute } from 'astro';
import { 
  getRecipeWithAllDetails, 
  updateRecipe, 
  replaceRecipeIngredients, 
  createInstructions, 
  saveQualityReport 
} from '../../../lib/db/recipes';
import { markRecipeFactsChanged } from '../../../lib/editorial/workflow';
import { reconstructFactSheet } from '../../../lib/pipeline/runner';
import { evaluateRecipeQuality } from '../../../lib/quality/engine';
import { logger, sanitizeClientError } from '../../../lib/utils/logger';

export const prerender = false;

export const POST: APIRoute = async (context) => {
  try {
    const body = await context.request.json().catch(() => null);
    const { 
      recipeId, 
      title, 
      prep_time, 
      cook_time, 
      total_time, 
      servings, 
      yield_text,
      cuisine,
      ingredients, 
      instructions 
    } = body || {};

    if (!recipeId) {
      return new Response(JSON.stringify({ success: false, error: 'recipeId is required.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const env = context.locals.runtime.env;
    const db = env.DB;
    const id = parseInt(recipeId, 10);

    // 1. Update recipe core facts
    const recipeData: Record<string, any> = {};
    if (title) recipeData.title = String(title).trim();
    if (prep_time !== undefined) recipeData.prep_time = parseInt(prep_time, 10) || 0;
    if (cook_time !== undefined) recipeData.cook_time = parseInt(cook_time, 10) || 0;
    if (total_time !== undefined) recipeData.total_time = parseInt(total_time, 10) || 0;
    if (servings !== undefined) recipeData.servings = String(servings).trim();
    if (yield_text !== undefined) recipeData.yield_text = String(yield_text).trim();
    if (cuisine !== undefined) recipeData.cuisine = String(cuisine).trim();

    await updateRecipe(db, id, recipeData);

    // 2. Update structured ingredients if provided
    if (Array.isArray(ingredients)) {
      await replaceRecipeIngredients(db, id, ingredients);
    }

    // 3. Update instructions if provided
    if (Array.isArray(instructions)) {
      await db.prepare('DELETE FROM instructions WHERE recipe_id = ?').bind(id).run();
      await createInstructions(db, id, instructions);
    }

    // 4. Mark content stale & invalidate approval (REVIEW_REQUIRED)
    await markRecipeFactsChanged(db, id, 'admin', 'Locked recipe facts manually updated by admin');

    // 5. Re-run Quality Engine to reflect new facts
    const updatedRecipe = await getRecipeWithAllDetails(db, id);
    let qualityReport = null;

    if (updatedRecipe && updatedRecipe.content) {
      const factSheet = reconstructFactSheet(updatedRecipe);
      const generatedContent = {
        introduction: updatedRecipe.content.introduction || '',
        whyThisRecipe: updatedRecipe.content.why_this_recipe || '',
        ingredientGuidance: typeof updatedRecipe.content.ingredient_guidance === 'string' ? JSON.parse(updatedRecipe.content.ingredient_guidance) : (updatedRecipe.content.ingredient_guidance || []),
        cookingGuidance: typeof updatedRecipe.content.cooking_guidance === 'string' ? JSON.parse(updatedRecipe.content.cooking_guidance) : (updatedRecipe.content.cooking_guidance || []),
        tips: typeof updatedRecipe.content.tips === 'string' ? JSON.parse(updatedRecipe.content.tips) : (updatedRecipe.content.tips || []),
        variations: typeof updatedRecipe.content.variations === 'string' ? JSON.parse(updatedRecipe.content.variations) : (updatedRecipe.content.variations || []),
        servingSuggestions: updatedRecipe.content.serving_suggestions || '',
        storage: updatedRecipe.content.storage || '',
        faq: typeof updatedRecipe.content.faq === 'string' ? JSON.parse(updatedRecipe.content.faq) : (updatedRecipe.content.faq || []),
        seo: {
          title: updatedRecipe.seo?.seo_title || updatedRecipe.title,
          metaDescription: updatedRecipe.seo?.meta_description || updatedRecipe.description || '',
          slug: updatedRecipe.slug
        }
      };

      qualityReport = evaluateRecipeQuality(factSheet.lockedFacts, generatedContent);
      await saveQualityReport(db, id, qualityReport);
    }

    logger.info(`[Workflow] Locked facts updated for recipe ${id}. Content flagged as STALE. Status: REVIEW_REQUIRED.`);

    return new Response(JSON.stringify({
      success: true,
      message: 'Locked recipe facts updated. Dependent content marked stale for review.',
      status: 'REVIEW_REQUIRED',
      contentStale: true,
      qualityReport
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    logger.error('[/api/editorial/update-facts] Error:', err);
    return new Response(JSON.stringify({
      success: false,
      error: sanitizeClientError(err, 'Failed to update recipe facts.')
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
