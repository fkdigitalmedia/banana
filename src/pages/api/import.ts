import type { APIRoute } from 'astro';
import { importRecipe } from '../../lib/pipeline/importer';
import { checkRateLimit, getClientIp } from '../../lib/utils/rate-limiter';
import { logger, sanitizeClientError } from '../../lib/utils/logger';

export const prerender = false;

export const POST: APIRoute = async (context) => {
  const ip = getClientIp(context.request);
  const rateLimit = checkRateLimit(`import:${ip}`, 15, 60 * 1000); // 15 imports per minute

  if (!rateLimit.allowed) {
    logger.warn(`Single import rate limit exceeded for IP: ${ip}`);
    return new Response(JSON.stringify({
      success: false,
      error: `Too many import requests. Please wait ${rateLimit.resetSeconds} seconds.`
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
    const rawUrl = body?.url || body?.sourceUrl;
    if (!rawUrl || typeof rawUrl !== 'string' || !rawUrl.trim()) {
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

    const result = await importRecipe(context.locals.runtime.env, cleanInputUrl);

    return new Response(JSON.stringify(result), {
      status: result.success ? 200 : (result.errorCode === 'DUPLICATE' ? 409 : 422),
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    logger.error('[/api/import] Unexpected error:', err);
    return new Response(JSON.stringify({ 
      success: false, 
      error: sanitizeClientError(err, 'An unexpected error occurred. Please try again.') 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
