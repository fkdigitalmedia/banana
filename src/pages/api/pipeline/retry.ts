import type { APIRoute } from 'astro';
import { getJob, updateJobStatus } from '../../../lib/db/recipes';
import { runMasterPipeline } from '../../../lib/pipeline/orchestrator';

export const prerender = false;

export const POST: APIRoute = async (context) => {
  try {
    const body = await context.request.json().catch(() => null);
    const { jobId } = body || {};

    if (!jobId) {
      return new Response(JSON.stringify({ success: false, error: 'Missing jobId parameter.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const env = context.locals.runtime.env;
    const db = env.DB;
    const id = parseInt(jobId, 10);

    const job = await getJob(db, id);
    if (!job) {
      return new Response(JSON.stringify({ success: false, error: 'Job not found.' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    await updateJobStatus(db, id, 'RUNNING', job.current_stage || 'VALIDATE_URL');

    const ctx = (context.locals.runtime as any)?.ctx;
    if (ctx) {
      (env as any).ctx = ctx;
    }

    const pipelinePromise = runMasterPipeline(env, {
      jobId: id,
      sourceUrl: job.source_url
    });

    if (ctx && typeof ctx.waitUntil === 'function') {
      ctx.waitUntil(pipelinePromise);
    } else if (typeof (context.locals.runtime as any)?.waitUntil === 'function') {
      (context.locals.runtime as any).waitUntil(pipelinePromise);
    } else {
      pipelinePromise.catch(err => console.error(`[Pipeline Retry Error] Job ${id}:`, err));
    }

    return new Response(JSON.stringify({
      success: true,
      jobId: id,
      status: 'PROCESSING',
      message: 'Pipeline resumed.'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    console.error('[/api/pipeline/retry] Error:', err);
    return new Response(JSON.stringify({
      success: false,
      error: err?.message || 'Failed to retry pipeline job.'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
