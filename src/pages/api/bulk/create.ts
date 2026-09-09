import type { APIRoute } from 'astro';
import { validateBulkUrls, createBulkJob, processBulkQueueTick } from '../../../lib/pipeline/bulk';
import { checkRateLimit, getClientIp } from '../../../lib/utils/rate-limiter';
import { logger, sanitizeClientError } from '../../../lib/utils/logger';

export const prerender = false;

export const POST: APIRoute = async (context) => {
  const ip = getClientIp(context.request);
  const rateLimit = checkRateLimit(`bulk_create:${ip}`, 10, 60 * 1000); // 10 bulk submissions per minute
  if (!rateLimit.allowed) {
    logger.warn(`Bulk import rate limit exceeded for IP: ${ip}`);
    return new Response(JSON.stringify({
      success: false,
      error: `Too many submissions. Please wait ${rateLimit.resetSeconds} seconds.`
    }), {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(rateLimit.resetSeconds)
      }
    });
  }

  try {
    const body = await context.request.json().catch(() => null);
    const { urls, concurrency } = body || {};

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Please provide at least one valid recipe URL.'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (urls.length > 100) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Maximum 100 URLs permitted per bulk submission.'
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

    // Validate and deduplicate
    const validation = await validateBulkUrls(db, urls);
    const validUrls = validation.items.filter(i => i.status === 'VALID').map(i => i.url);

    if (validUrls.length === 0) {
      return new Response(JSON.stringify({
        success: false,
        error: 'No valid or non-duplicate URLs to import.',
        validation
      }), {
        status: 422,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const concurrencyLimit = Math.max(1, Math.min(5, parseInt(concurrency || '3', 10)));
    const bulkJobId = await createBulkJob(db, validUrls, concurrencyLimit);

    // Start processing first batch
    const tickPromise = processBulkQueueTick(env, bulkJobId);
    if (typeof env?.ctx?.waitUntil === 'function') {
      env.ctx.waitUntil(tickPromise);
    }

    return new Response(JSON.stringify({
      success: true,
      bulkJobId,
      totalQueued: validUrls.length,
      skippedCount: validation.totalDetected - validUrls.length,
      validationSummary: {
        invalid: validation.invalidCount,
        duplicate: validation.duplicateCount,
        alreadyImported: validation.alreadyImportedCount,
        alreadyQueued: validation.alreadyQueuedCount
      }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    logger.error('[/api/bulk/create] Error:', err);
    return new Response(JSON.stringify({
      success: false,
      error: sanitizeClientError(err, 'Failed to create bulk import job.')
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
