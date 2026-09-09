import type { APIRoute } from 'astro';
import { runGenerationPipeline } from '../../../lib/pipeline/runner';
import { getJob } from '../../../lib/db/recipes';

export const prerender = false;

export const POST: APIRoute = async (context) => {
  try {
    const body = await context.request.json().catch(() => null);
    const { jobId, recipeId } = body || {};

    if (!jobId && !recipeId) {
      return new Response(JSON.stringify({ success: false, error: 'Missing jobId or recipeId in request.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const env = context.locals.runtime.env;
    const db = env.DB;

    let targetRecipeId = recipeId ? parseInt(recipeId, 10) : null;
    let targetJobId = jobId ? parseInt(jobId, 10) : undefined;

    if (!targetRecipeId && targetJobId) {
      const job = await getJob(db, targetJobId);
      if (job && job.recipe_id) {
        targetRecipeId = job.recipe_id;
      }
    }

    if (!targetRecipeId) {
      return new Response(JSON.stringify({ success: false, error: 'Could not identify recipe associated with this job.' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const result = await runGenerationPipeline(env, targetRecipeId, { jobId: targetJobId });

    return new Response(JSON.stringify(result), {
      status: result.status === 'success' ? 200 : 500,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    console.error('[/api/generate/retry] Error:', err);
    return new Response(JSON.stringify({
      success: false,
      error: err?.message || 'Failed to retry generation job.'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
