import type { APIRoute } from 'astro';
import { updateRecipe, upsertRecipeContent, upsertRecipeSeo } from '../../../lib/db/recipes';

export const prerender = false;

export const POST: APIRoute = async (context) => {
  try {
    const body = await context.request.json().catch(() => null);
    const { recipeId, title, slug, description, category_id, cuisine, servings, prep_time, cook_time, total_time, content, seo } = body || {};

    if (!recipeId) {
      return new Response(JSON.stringify({ success: false, error: 'Missing recipeId in request body.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const env = context.locals.runtime.env;
    const db = env.DB;
    const id = parseInt(recipeId, 10);

    // Update basic recipe fields
    const recipeUpdateData: any = {};
    if (title !== undefined) recipeUpdateData.title = title;
    if (slug !== undefined) recipeUpdateData.slug = slug;
    if (description !== undefined) recipeUpdateData.description = description;
    if (category_id !== undefined) recipeUpdateData.category_id = category_id ? parseInt(category_id, 10) : null;
    if (cuisine !== undefined) recipeUpdateData.cuisine = cuisine;
    if (servings !== undefined) recipeUpdateData.servings = String(servings);
    if (prep_time !== undefined) recipeUpdateData.prep_time = prep_time ? parseInt(prep_time, 10) : null;
    if (cook_time !== undefined) recipeUpdateData.cook_time = cook_time ? parseInt(cook_time, 10) : null;
    if (total_time !== undefined) recipeUpdateData.total_time = total_time ? parseInt(total_time, 10) : null;

    if (Object.keys(recipeUpdateData).length > 0) {
      await updateRecipe(db, id, recipeUpdateData);
    }

    // Update editorial content if provided
    if (content) {
      await upsertRecipeContent(db, id, content);
    }

    // Update SEO metadata if provided
    if (seo) {
      await upsertRecipeSeo(db, id, {
        seo_title: seo.seo_title || title,
        meta_description: seo.meta_description || description,
        canonical_url: seo.canonical_url || `/recipes/${slug || ''}/`
      });
    }

    return new Response(JSON.stringify({
      success: true,
      recipeId: id,
      message: 'Draft saved successfully.'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    console.error('[/api/recipes/save] Error:', err);
    return new Response(JSON.stringify({
      success: false,
      error: err?.message || 'Failed to save recipe draft.'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
