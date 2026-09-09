import type { APIRoute } from 'astro';
import { getRecipeWithAllDetails } from '../../lib/db/recipes';
import { reconstructFactSheet } from '../../lib/pipeline/runner';
import { validateAll } from '../../lib/validation';

export const prerender = false;

export const POST: APIRoute = async (context) => {
  try {
    const body = await context.request.json().catch(() => null);
    const { recipeId } = body || {};

    if (!recipeId) {
      return new Response(JSON.stringify({ success: false, error: 'Missing recipeId parameter.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const env = context.locals.runtime.env;
    const db = env.DB;

    const recipeData = await getRecipeWithAllDetails(db, parseInt(recipeId, 10));
    if (!recipeData) {
      return new Response(JSON.stringify({ success: false, error: 'Recipe not found.' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const factSheet = reconstructFactSheet(recipeData);
    const content = recipeData.content || {};

    const generatedContent = {
      introduction: content.introduction || '',
      whyThisRecipe: content.why_this_recipe || '',
      ingredientGuidance: typeof content.ingredient_guidance === 'string' ? JSON.parse(content.ingredient_guidance) : (content.ingredient_guidance || []),
      cookingGuidance: typeof content.cooking_guidance === 'string' ? JSON.parse(content.cooking_guidance) : (content.cooking_guidance || []),
      tips: typeof content.tips === 'string' ? JSON.parse(content.tips) : (content.tips || []),
      variations: typeof content.variations === 'string' ? JSON.parse(content.variations) : (content.variations || []),
      servingSuggestions: content.serving_suggestions || '',
      storage: content.storage || '',
      faq: typeof content.faq === 'string' ? JSON.parse(content.faq) : (content.faq || []),
      seo: {
        title: recipeData.seo?.seo_title || '',
        metaDescription: recipeData.seo?.meta_description || '',
        slug: recipeData.slug || ''
      }
    };

    const primaryKeyword = recipeData.title.toLowerCase().includes('banana bread') ? 'banana bread recipe' : undefined;
    const result = validateAll(factSheet.lockedFacts, generatedContent, primaryKeyword);

    return new Response(JSON.stringify({
      success: true,
      passed: result.passed,
      issues: result.issues
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    console.error('[/api/validate] Error:', err);
    return new Response(JSON.stringify({
      success: false,
      error: err?.message || 'Validation execution failed.'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
