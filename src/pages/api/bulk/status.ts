import type { APIRoute } from 'astro';
import { getBulkJobDetails, processBulkQueueTick } from '../../../lib/pipeline/bulk';

export const prerender = false;

export const GET: APIRoute = async (context) => {
  try {
    const url = new URL(context.request.url);
    const bulkJobId = parseInt(url.searchParams.get('bulkJobId') || '0', 10);

    if (!bulkJobId) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Missing or invalid bulkJobId query parameter.'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const env = context.locals.runtime.env;
    const ctx = (context.locals.runtime as any)?.ctx;
    if (ctx) {
      (env as any).ctx = ctx;
    }
    const db = env.DB;

    // Trigger queue tick to ensure any free slots pick up queued items
    const tickPromise = processBulkQueueTick(env, bulkJobId);
    if (ctx && typeof ctx.waitUntil === 'function') {
      ctx.waitUntil(tickPromise);
    } else if (typeof env?.ctx?.waitUntil === 'function') {
      env.ctx.waitUntil(tickPromise);
    }

    const { job, items } = await getBulkJobDetails(db, bulkJobId);

    if (!job) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Bulk job not found.'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Calculate percentage
    const finishedCount = (job.completed_count || 0) + (job.failed_count || 0);
    const progressPercent = job.total_count > 0 
      ? Math.round((finishedCount / job.total_count) * 100) 
      : 0;

    return new Response(JSON.stringify({
      success: true,
      job,
      items,
      progressPercent,
      isFinished: job.status === 'COMPLETED' || job.status === 'COMPLETED_WITH_ERRORS' || job.status === 'FAILED' || job.status === 'CANCELLED'
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store'
      }
    });
  } catch (err: any) {
    console.error('[/api/bulk/status] Error:', err);
    return new Response(JSON.stringify({
      success: false,
      error: err.message || 'Failed to fetch bulk job status.'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
