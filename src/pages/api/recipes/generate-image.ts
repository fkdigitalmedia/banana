import type { APIRoute } from 'astro';
import { getRecipeWithAllDetails } from '../../../lib/db/recipes';
import { generateRecipeImage } from '../../../lib/image/runware';
import { saveRecipeHeroImage } from '../../../lib/image/storage';

export const prerender = false;

export const POST: APIRoute = async (context) => {
  try {
    const body = await context.request.json().catch(() => null);
    const { recipeId, customPrompt } = body || {};

    if (!recipeId) {
      return new Response(JSON.stringify({ success: false, error: 'Missing recipeId in request body.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const env = context.locals.runtime.env;
    const db = env.DB;
    const bucket = env.RECIPE_IMAGES;
    const id = parseInt(recipeId, 10);

    const recipe = await getRecipeWithAllDetails(db, id);
    if (!recipe) {
      return new Response(JSON.stringify({ success: false, error: 'Recipe not found.' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!env.RUNWARE_API_KEY) {
      return new Response(JSON.stringify({
        success: false,
        error: 'RUNWARE_API_KEY is not configured in environment variables. Please configure your Runware API key to generate images.'
      }), {
        status: 422,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 1. Generate image using Runware FLUX.1 Schnell
    const generated = await generateRecipeImage(env.RUNWARE_API_KEY, {
      title: recipe.title,
      description: recipe.description,
      ingredients: recipe.ingredients,
      cuisine: recipe.cuisine
    }, {
      customPrompt
    });

    // 2. Persist to Cloudflare R2 and update D1
    const { imageKey, imageUrl } = await saveRecipeHeroImage({
      db,
      bucket,
      recipeId: id,
      slug: recipe.slug,
      imageBuffer: generated.imageBuffer,
      prompt: generated.prompt,
      provider: generated.provider,
      model: generated.model,
      width: generated.width,
      height: generated.height,
      oldHeroKey: recipe.hero_image_key
    });

    return new Response(JSON.stringify({
      success: true,
      recipeId: id,
      imageKey,
      imageUrl,
      prompt: generated.prompt,
      provider: generated.provider,
      model: generated.model,
      message: 'Recipe hero image generated and stored in R2 successfully.'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    console.error('[/api/recipes/generate-image] Error:', err);
    return new Response(JSON.stringify({
      success: false,
      error: err?.message || 'Failed to generate recipe image.'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
