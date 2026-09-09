import type { APIRoute } from 'astro';
import { retryFailedBulkItems, processBulkQueueTick } from '../../../lib/pipeline/bulk';

export const prerender = false;

export const POST: APIRoute = async (context) => {
  try {
    const body = await context.request.json().catch(() => null);
    const { bulkJobId, itemId } = body || {};

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
    const ctx = (context.locals.runtime as any)?.ctx;
    if (ctx) {
      (env as any).ctx = ctx;
    }
    const db = env.DB;

    const ok = await retryFailedBulkItems(
      db,
      parseInt(bulkJobId, 10),
      itemId ? parseInt(itemId, 10) : undefined
    );

    // Kick off queue tick
    const tickPromise = processBulkQueueTick(env, parseInt(bulkJobId, 10));
    if (ctx && typeof ctx.waitUntil === 'function') {
      ctx.waitUntil(tickPromise);
    } else if (typeof env?.ctx?.waitUntil === 'function') {
      env.ctx.waitUntil(tickPromise);
    }

    return new Response(JSON.stringify({
      success: ok,
      message: itemId ? `Item #${itemId} re-queued for retry.` : 'All failed items re-queued.'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    console.error('[/api/bulk/retry] Error:', err);
    return new Response(JSON.stringify({
      success: false,
      error: err.message || 'Failed to retry bulk items.'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
