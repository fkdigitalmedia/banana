import type { APIRoute } from 'astro';
import { getRecipeById } from '../../lib/db/recipes';
import { unpublishRecipeToWorkflow } from '../../lib/editorial/workflow';
import { invalidateRelatedCache } from '../../lib/seo/linking';
import { logger, sanitizeClientError } from '../../lib/utils/logger';

export const prerender = false;

export const POST: APIRoute = async (context) => {
  try {
    const body = await context.request.json().catch(() => null);
    const { recipeId } = body || {};

    if (!recipeId) {
      return new Response(JSON.stringify({ success: false, error: 'Missing recipeId in request.' }), {
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

    const result = await unpublishRecipeToWorkflow(db, id, 'admin');
    if (!result.success) {
      return new Response(JSON.stringify({ success: false, error: result.error }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    await invalidateRelatedCache(db);
    logger.info(`[Workflow] Recipe ${id} set to UNPUBLISHED.`);

    return new Response(JSON.stringify({
      success: true,
      recipeId: id,
      status: 'UNPUBLISHED',
      message: 'Recipe unpublished successfully.'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    logger.error('[/api/unpublish] Error:', err);
    return new Response(JSON.stringify({
      success: false,
      error: sanitizeClientError(err, 'Failed to unpublish recipe.')
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
