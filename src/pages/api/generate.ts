import type { APIRoute } from 'astro';
import { runGenerationPipeline } from '../../lib/pipeline/runner';

export const prerender = false;

export const POST: APIRoute = async (context) => {
  try {
    const body = await context.request.json().catch(() => null);
    if (!body || !body.recipeId) {
      return new Response(JSON.stringify({ success: false, error: 'Missing recipeId in request body.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const recipeId = parseInt(String(body.recipeId), 10);
    if (isNaN(recipeId)) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid recipeId.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const env = context.locals.runtime.env;

    // Check if DEEPSEEK_API_KEY is configured
    if (!env.DEEPSEEK_API_KEY || env.DEEPSEEK_API_KEY === 'your_deepseek_api_key_here') {
      return new Response(JSON.stringify({
        success: false,
        error: 'DeepSeek API Key is not configured. Please set DEEPSEEK_API_KEY in your environment.'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Execute generation pipeline
    const result = await runGenerationPipeline(env, recipeId);

    return new Response(JSON.stringify(result), {
      status: result.status === 'success' ? 200 : 500,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    console.error('[/api/generate] Error:', err);
    return new Response(JSON.stringify({
      success: false,
      error: err?.message || 'An unexpected error occurred during generation.'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
