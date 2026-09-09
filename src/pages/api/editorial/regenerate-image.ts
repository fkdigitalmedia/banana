import type { APIRoute } from 'astro';
import { getRecipeWithAllDetails, updateRecipe } from '../../../lib/db/recipes';
import { generateRecipeImage } from '../../../lib/image/runware';
import { saveRecipeHeroImage } from '../../../lib/image/storage';
import { recordRevision } from '../../../lib/editorial/workflow';
import { logger, sanitizeClientError } from '../../../lib/utils/logger';

export const prerender = false;

export const POST: APIRoute = async (context) => {
  try {
    const body = await context.request.json().catch(() => null);
    const { recipeId, customPrompt } = body || {};

    if (!recipeId) {
      return new Response(JSON.stringify({ success: false, error: 'recipeId is required.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const env = context.locals.runtime.env;
    const db = env.DB;
    const bucket = env.RECIPE_IMAGES;
    const id = parseInt(recipeId, 10);

    if (!env.RUNWARE_API_KEY) {
      return new Response(JSON.stringify({ success: false, error: 'Runware API key is not configured.' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const recipe = await getRecipeWithAllDetails(db, id);
    if (!recipe) {
      return new Response(JSON.stringify({ success: false, error: 'Recipe not found.' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    logger.info(`[Workflow] Regenerating hero image for recipe ${id} using FLUX.1 Schnell...`);

    const imgResult = await generateRecipeImage(env.RUNWARE_API_KEY, {
      title: recipe.title,
      description: recipe.description,
      ingredients: (recipe.ingredients || []).map((i: any) => i.name),
      cuisine: recipe.cuisine,
      customPrompt
    });

    const heroKey = await saveRecipeHeroImage({
      db,
      bucket,
      recipeId: id,
      slug: recipe.slug,
      imageBuffer: imgResult.imageBuffer,
      prompt: imgResult.prompt,
      provider: imgResult.provider,
      model: imgResult.model,
      width: imgResult.width,
      height: imgResult.height
    });

    await recordRevision(db, id, 'IMAGE_REGENERATED', 'admin', 'Hero image regenerated with Runware FLUX.1 Schnell');

    logger.info(`[Workflow] Hero image regenerated for recipe ${id}. Key: ${heroKey}`);

    return new Response(JSON.stringify({
      success: true,
      hero_image_key: heroKey,
      image_status: 'READY',
      prompt: imgResult.prompt
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    logger.error('[/api/editorial/regenerate-image] Error:', err);
    return new Response(JSON.stringify({
      success: false,
      error: sanitizeClientError(err, 'Failed to regenerate recipe image.')
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
