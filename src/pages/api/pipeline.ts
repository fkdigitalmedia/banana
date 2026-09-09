import type { APIRoute } from 'astro';
import { getJob, getJobByRecipeId, getRecipeById } from '../../lib/db/recipes';
import { FULL_PIPELINE_ORDER, type PipelineStage } from '../../lib/pipeline/stages';

export const prerender = false;

export const GET: APIRoute = async (context) => {
  try {
    const url = new URL(context.request.url);
    const jobIdParam = url.searchParams.get('jobId');
    const recipeIdParam = url.searchParams.get('recipeId');

    const env = context.locals.runtime.env;
    const db = env.DB;

    let job: any = null;

    if (jobIdParam) {
      const jobId = parseInt(jobIdParam, 10);
      if (jobId) {
        job = await getJob(db, jobId);
      }
    } else if (recipeIdParam) {
      const recipeId = parseInt(recipeIdParam, 10);
      if (recipeId) {
        job = await getJobByRecipeId(db, recipeId);
      }
    }

    if (!job) {
      return new Response(JSON.stringify({ success: false, error: 'Job not found.' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    let parsedResults: any = null;
    if (job.stage_results) {
      try {
        parsedResults = typeof job.stage_results === 'string' ? JSON.parse(job.stage_results) : job.stage_results;
      } catch {
        parsedResults = null;
      }
    }

    let recipe: any = null;
    const activeRecipeId = job.recipe_id || parsedResults?.recipeId;
    if (activeRecipeId) {
      recipe = await getRecipeById(db, activeRecipeId);
    }

    const currentStageName = job.current_stage as PipelineStage;
    const stageIndex = currentStageName ? FULL_PIPELINE_ORDER.indexOf(currentStageName) + 1 : 0;
    const totalStages = FULL_PIPELINE_ORDER.length;

    // Calculate completed stages list
    const completedStages: string[] = [];
    if (stageIndex > 0) {
      for (let i = 0; i < stageIndex - 1; i++) {
        completedStages.push(FULL_PIPELINE_ORDER[i]);
      }
    }
    if (job.status === 'COMPLETED') {
      completedStages.push(...FULL_PIPELINE_ORDER);
    }

    const isCompleted = job.status === 'COMPLETED' || job.status === 'DRAFT_READY';
    const activeStage = job.current_stage || 'VALIDATE_URL';
    const activeRecId = activeRecipeId || null;
    const errorMsg = job.error_message || null;

    return new Response(JSON.stringify({
      success: true,
      jobId: job.id,
      job_id: job.id,
      recipeId: activeRecId,
      recipe_id: activeRecId,
      recipeTitle: recipe?.title || null,
      recipe_title: recipe?.title || null,
      recipeSlug: recipe?.slug || null,
      recipe_slug: recipe?.slug || null,
      status: isCompleted ? 'COMPLETED' : job.status,
      rawStatus: job.status,
      isCompleted,
      currentStage: activeStage,
      current_stage: activeStage,
      stageIndex: isCompleted ? totalStages : Math.max(1, stageIndex),
      totalStages,
      completedStages: [...new Set(completedStages)],
      errorMessage: errorMsg,
      error_message: errorMsg,
      executionLog: parsedResults?.executionLog || [],
      updatedAt: job.updated_at
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store'
      }
    });
  } catch (err: any) {
    console.error('[/api/pipeline] Error:', err);
    return new Response(JSON.stringify({
      success: false,
      error: err?.message || 'Failed to fetch pipeline status.'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
