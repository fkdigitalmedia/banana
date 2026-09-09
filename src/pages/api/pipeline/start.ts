import type { APIRoute } from 'astro';
import { validateUrl } from '../../../lib/extraction/fetcher';
import { normalizeSourceUrl, getActiveJobForUrl, checkForDuplicate } from '../../../lib/pipeline/duplicate';
import { createGenerationJob, updateJobStatus, getJob } from '../../../lib/db/recipes';
import { runMasterPipeline } from '../../../lib/pipeline/orchestrator';
import { PIPELINE_STAGES } from '../../../lib/pipeline/stages';

export const prerender = false;

export const POST: APIRoute = async (context) => {
  try {
    const body = await context.request.json().catch(() => null);
    const rawUrl = body?.url || body?.sourceUrl;

    if (!rawUrl || typeof rawUrl !== 'string' || rawUrl.trim().length === 0) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Please enter a valid recipe URL.',
        errorCode: 'MISSING_URL'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    let cleanInputUrl = rawUrl.trim();
    if (!cleanInputUrl.startsWith('http://') && !cleanInputUrl.startsWith('https://')) {
      cleanInputUrl = 'https://' + cleanInputUrl;
    }

    const urlCheck = validateUrl(cleanInputUrl);
    if (!urlCheck.valid) {
      return new Response(JSON.stringify({
        success: false,
        error: urlCheck.reason,
        errorCode: 'INVALID_URL'
      }), {
        status: 422,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const env = context.locals.runtime.env;
    const db = env.DB;
    const normalizedUrl = normalizeSourceUrl(cleanInputUrl);

    // 1. Idempotency Check: Active processing job
    const activeJob = await getActiveJobForUrl(db, normalizedUrl);
    if (activeJob) {
      return new Response(JSON.stringify({
        success: true,
        jobId: activeJob.id,
        recipeId: activeJob.recipe_id,
        status: activeJob.status,
        currentStage: activeJob.current_stage,
        isExistingJob: true,
        message: 'This recipe is already being processed.'
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 2. Deduplication Check: Already imported / published recipe
    const duplicate = await checkForDuplicate(db, normalizedUrl);
    if (duplicate.isDuplicate && duplicate.existingId) {
      return new Response(JSON.stringify({
        success: false,
        error: 'This recipe URL has already been imported into the database.',
        errorCode: 'DUPLICATE',
        existingRecipeId: duplicate.existingId
      }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 3. Create new master pipeline job in D1
    const jobId = await createGenerationJob(db, normalizedUrl);
    if (!jobId) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Failed to initialize pipeline job in database.'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    await updateJobStatus(db, jobId, 'RUNNING', PIPELINE_STAGES.VALIDATE_URL);

    // 4. Attach runtime ctx to env for downstream operations
    const ctx = (context.locals.runtime as any)?.ctx;
    if (ctx) {
      (env as any).ctx = ctx;
    }

    // Trigger master pipeline
    const pipelinePromise = runMasterPipeline(env, {
      jobId,
      sourceUrl: normalizedUrl
    });

    // Register with Cloudflare ExecutionContext so worker isolate stays alive
    if (ctx && typeof ctx.waitUntil === 'function') {
      ctx.waitUntil(pipelinePromise);
    } else if (typeof (context.locals.runtime as any)?.waitUntil === 'function') {
      (context.locals.runtime as any).waitUntil(pipelinePromise);
    } else {
      pipelinePromise.catch(err => console.error(`[Pipeline Background Error] Job ${jobId}:`, err));
    }

    // Wait up to 2.5 seconds for the deterministic extraction burst to complete
    await Promise.race([
      pipelinePromise,
      new Promise(resolve => setTimeout(resolve, 2500))
    ]);

    // Check latest state after initial burst
    const jobState = await getJob(db, jobId);
    const recipeId = jobState?.recipe_id || null;
    const isFinished = jobState?.status === 'COMPLETED' || jobState?.status === 'DRAFT_READY';

    // 5. Return Job ID and real-time state to caller
    return new Response(JSON.stringify({
      success: true,
      jobId,
      recipeId,
      recipe_id: recipeId,
      status: isFinished ? 'COMPLETED' : (jobState?.status || 'PROCESSING'),
      currentStage: jobState?.current_stage || PIPELINE_STAGES.VALIDATE_URL,
      current_stage: jobState?.current_stage || PIPELINE_STAGES.VALIDATE_URL,
      normalizedUrl,
      message: isFinished 
        ? 'Recipe imported successfully and saved to drafts.' 
        : 'Recipe extraction started and running in background.'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    console.error('[/api/pipeline/start] Error:', err);
    return new Response(JSON.stringify({
      success: false,
      error: err?.message || 'Failed to start automated pipeline.'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
