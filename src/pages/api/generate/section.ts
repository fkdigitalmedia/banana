import type { APIRoute } from 'astro';
import { createDeepSeekClient } from '../../../lib/deepseek/client';
import { regenerateSection } from '../../../lib/deepseek/generate';
import { reconstructFactSheet } from '../../../lib/pipeline/runner';
import { getRecipeWithAllDetails, upsertRecipeContent, upsertRecipeSeo } from '../../../lib/db/recipes';

export const prerender = false;

export const POST: APIRoute = async (context) => {
  try {
    const body = await context.request.json().catch(() => null);
    const { recipeId, section } = body || {};

    if (!recipeId || !section) {
      return new Response(JSON.stringify({ success: false, error: 'Missing recipeId or section in request.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const env = context.locals.runtime.env;
    const db = env.DB;

    if (!env.DEEPSEEK_API_KEY || env.DEEPSEEK_API_KEY === 'your_deepseek_api_key_here') {
      return new Response(JSON.stringify({ success: false, error: 'DeepSeek API Key is not configured.' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const recipeData = await getRecipeWithAllDetails(db, parseInt(recipeId, 10));
    if (!recipeData) {
      return new Response(JSON.stringify({ success: false, error: 'Recipe not found.' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const factSheet = reconstructFactSheet(recipeData);
    const aiClient = createDeepSeekClient(env.DEEPSEEK_API_KEY);

    // Existing content
    const existingContent = recipeData.content || {};

    const updatedData = await regenerateSection(aiClient, section, factSheet, existingContent);

    // Persist regenerated section to D1
    if (section === 'seo') {
      await upsertRecipeSeo(db, recipeData.id, {
        seo_title: updatedData.title,
        meta_description: updatedData.metaDescription,
        canonical_url: recipeData.source_url || `/recipes/${updatedData.slug}/`
      });
    } else {
      const mergedContent = { ...existingContent };
      if (section === 'introduction') {
        mergedContent.introduction = updatedData.introduction;
        mergedContent.why_this_recipe = updatedData.whyThisRecipe;
      } else if (section === 'ingredientGuidance' || section === 'guidance') {
        mergedContent.ingredient_guidance = updatedData.ingredientGuidance;
      } else if (section === 'cookingGuidance' || section === 'cooking') {
        mergedContent.cooking_guidance = updatedData.cookingGuidance;
      } else if (section === 'tips') {
        mergedContent.tips = updatedData.tips;
      } else if (section === 'variations') {
        mergedContent.variations = updatedData.variations;
      } else if (section === 'serving' || section === 'servingSuggestions') {
        mergedContent.serving_suggestions = updatedData.servingSuggestions;
      } else if (section === 'storage') {
        mergedContent.storage = updatedData.storage;
      } else if (section === 'faq') {
        mergedContent.faq = updatedData.faq;
      } else if (section === 'assembly' || section === 'fullArticle') {
        mergedContent.full_article = updatedData.fullArticle;
      }

      await upsertRecipeContent(db, recipeData.id, mergedContent);
    }

    return new Response(JSON.stringify({
      success: true,
      section,
      data: updatedData
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    console.error('[/api/generate/section] Error:', err);
    return new Response(JSON.stringify({
      success: false,
      error: err?.message || 'Failed to regenerate section.'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
