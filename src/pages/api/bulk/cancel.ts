import type { APIRoute } from 'astro';
import { cancelBulkJob } from '../../../lib/pipeline/bulk';

export const prerender = false;

export const POST: APIRoute = async (context) => {
  try {
    const body = await context.request.json().catch(() => null);
    const { bulkJobId } = body || {};

    if (!bulkJobId) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Missing bulkJobId parameter.'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const env = context.locals.runtime.env;
    const db = env.DB;

    const ok = await cancelBulkJob(db, parseInt(bulkJobId, 10));

    return new Response(JSON.stringify({
      success: ok,
      message: 'Bulk queue cancelled. Any active jobs will finish safely and remaining queued items have been cancelled.'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    console.error('[/api/bulk/cancel] Error:', err);
    return new Response(JSON.stringify({
      success: false,
      error: err.message || 'Failed to cancel bulk job.'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
