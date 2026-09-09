import type { APIRoute } from 'astro';
import { getRecipeById, upsertRecipeSeo, updateRecipe } from '../../../lib/db/recipes';
import { markRecipeContentChanged } from '../../../lib/editorial/workflow';
import { logger, sanitizeClientError } from '../../../lib/utils/logger';

export const prerender = false;

export const POST: APIRoute = async (context) => {
  try {
    const body = await context.request.json().catch(() => null);
    const { recipeId, seo_title, meta_description, canonical_url, slug } = body || {};

    if (!recipeId) {
      return new Response(JSON.stringify({ success: false, error: 'recipeId is required.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const env = context.locals.runtime.env;
    const db = env.DB;
    const id = parseInt(recipeId, 10);

    const recipe = await getRecipeById(db, id);
    if (!recipe) {
      return new Response(JSON.stringify({ success: false, error: 'Recipe not found.' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Update SEO table
    await upsertRecipeSeo(db, id, {
      seo_title: seo_title ? String(seo_title).trim() : recipe.title,
      meta_description: meta_description ? String(meta_description).trim() : (recipe.description || ''),
      canonical_url: canonical_url ? String(canonical_url).trim() : undefined
    });

    // Update recipe slug or description if changed
    const updates: Record<string, any> = {};
    if (meta_description) updates.description = String(meta_description).trim();
    if (slug) {
      const cleanSlug = String(slug).toLowerCase().trim().replace(/[^a-z0-9\-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
      if (cleanSlug && cleanSlug !== recipe.slug) {
        updates.slug = cleanSlug;
      }
    }

    if (Object.keys(updates).length > 0) {
      await updateRecipe(db, id, updates);
    }

    // Mark approval invalidated
    await markRecipeContentChanged(db, id, 'SEO_EDIT', 'admin', 'SEO metadata updated');

    logger.info(`[Workflow] SEO metadata updated for recipe ${id}. Status reset to REVIEW_REQUIRED.`);

    return new Response(JSON.stringify({
      success: true,
      message: 'SEO metadata updated successfully.',
      status: 'REVIEW_REQUIRED'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    logger.error('[/api/editorial/update-seo] Error:', err);
    return new Response(JSON.stringify({
      success: false,
      error: sanitizeClientError(err, 'Failed to update SEO metadata.')
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
