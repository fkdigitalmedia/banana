import type { APIRoute } from 'astro';
import { getRecipeRevisions } from '../../../lib/editorial/workflow';
import { logger, sanitizeClientError } from '../../../lib/utils/logger';

export const prerender = false;

export const GET: APIRoute = async (context) => {
  try {
    const url = new URL(context.request.url);
    const recipeId = url.searchParams.get('recipeId');

    if (!recipeId) {
      return new Response(JSON.stringify({ success: false, error: 'recipeId query parameter is required.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const db = context.locals.runtime.env.DB;
    const revisions = await getRecipeRevisions(db, parseInt(recipeId, 10), 30);

    return new Response(JSON.stringify({
      success: true,
      revisions
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    logger.error('[/api/editorial/revisions] Error:', err);
    return new Response(JSON.stringify({
      success: false,
      error: sanitizeClientError(err, 'Failed to fetch revisions.')
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
