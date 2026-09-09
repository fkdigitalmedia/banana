import type { APIRoute } from 'astro';
import { validateBulkUrls } from '../../../lib/pipeline/bulk';

export const prerender = false;

export const POST: APIRoute = async (context) => {
  try {
    const body = await context.request.json().catch(() => null);
    const { urls } = body || {};

    if (!urls || !Array.isArray(urls)) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Please provide an array of URLs to validate.'
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
    const db = env.DB;

    const result = await validateBulkUrls(db, urls);

    return new Response(JSON.stringify({
      success: true,
      ...result
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    console.error('[/api/bulk/validate] Error:', err);
    return new Response(JSON.stringify({
      success: false,
      error: err.message || 'Validation failed.'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
