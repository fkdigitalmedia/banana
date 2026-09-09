import type { APIRoute } from 'astro';
import { deleteRecipe, getRecipeById } from '../../../lib/db/recipes';

export const prerender = false;

export const POST: APIRoute = async (context) => {
  try {
    const body = await context.request.json().catch(() => null);
    const { recipeId } = body || {};

    if (!recipeId) {
      return new Response(JSON.stringify({ success: false, error: 'Missing recipeId in request body.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const env = context.locals.runtime.env;
    const db = env.DB;
    const id = parseInt(recipeId, 10);

    const recipe = await getRecipeById(db, id);
    if (!recipe) {
      return new Response(JSON.stringify({ success: false, error: 'Recipe not found.' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    await deleteRecipe(db, id);

    return new Response(JSON.stringify({
      success: true,
      recipeId: id,
      message: 'Recipe and associated records deleted successfully.'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    console.error('[/api/recipes/delete] Error:', err);
    return new Response(JSON.stringify({
      success: false,
      error: err?.message || 'Failed to delete recipe.'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
