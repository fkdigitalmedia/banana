import type { APIRoute } from 'astro';
import { approveRecipe } from '../../../lib/editorial/workflow';
import { logger, sanitizeClientError } from '../../../lib/utils/logger';

export const prerender = false;

export const POST: APIRoute = async (context) => {
  try {
    const body = await context.request.json().catch(() => null);
    const { recipeId } = body || {};

    if (!recipeId) {
      return new Response(JSON.stringify({ success: false, error: 'recipeId is required.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const env = context.locals.runtime.env;
    const result = await approveRecipe(env, parseInt(recipeId, 10), 'admin');

    if (!result.success) {
      return new Response(JSON.stringify({
        success: false,
        error: result.error,
        outcome: result.outcome
      }), {
        status: 422,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    logger.info(`[Workflow] Recipe ${recipeId} successfully APPROVED for publication.`);

    return new Response(JSON.stringify({
      success: true,
      recipeId,
      status: 'APPROVED',
      outcome: result.outcome
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    logger.error('[/api/editorial/approve] Error:', err);
    return new Response(JSON.stringify({
      success: false,
      error: sanitizeClientError(err, 'Failed to approve recipe.')
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
