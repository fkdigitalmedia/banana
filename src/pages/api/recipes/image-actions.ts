import type { APIRoute } from 'astro';
import { getRecipeById } from '../../../lib/db/recipes';
import { importSourceRecipeImage, importAllSourceImages } from '../../../lib/image/source-importer';
import { fetchSource } from '../../../lib/extraction/fetcher';
import { extractAllRecipeImages } from '../../../lib/extraction/image';
import { generateRecipeImage } from '../../../lib/image/runware';
import { saveRecipeHeroImage } from '../../../lib/image/storage';
import { logger } from '../../../lib/utils/logger';

export const prerender = false;

export const POST: APIRoute = async (context) => {
  const env = context.locals.runtime?.env;
  if (!env?.DB) {
    return new Response(JSON.stringify({ error: 'Database unavailable' }), { status: 500 });
  }

  try {
    const body = await context.request.json();
    const { action, recipeId } = body;

    if (!recipeId) {
      return new Response(JSON.stringify({ error: 'Missing recipeId' }), { status: 400 });
    }

    const recipe = await getRecipeById(env.DB, recipeId);
    if (!recipe) {
      return new Response(JSON.stringify({ error: 'Recipe not found' }), { status: 404 });
    }

    // 1. SWITCH ACTIVE HERO IMAGE (SOURCE vs GENERATED)
    if (action === 'SET_ACTIVE_HERO') {
      const { heroType, heroKey } = body;
      let targetKey: string | null = heroKey || null;

      if (!targetKey) {
        if (heroType === 'SOURCE') {
          targetKey = (recipe as any).source_image_r2_key;
          if (!targetKey) {
            return new Response(JSON.stringify({ error: 'Source image is not available in R2' }), { status: 400 });
          }
        } else if (heroType === 'GENERATED') {
          targetKey = (recipe as any).generated_image_key;
          if (!targetKey) {
            return new Response(JSON.stringify({ error: 'Generated AI image is not available in R2' }), { status: 400 });
          }
        } else {
          return new Response(JSON.stringify({ error: 'Invalid heroType' }), { status: 400 });
        }
      }

      await env.DB.prepare(`
        UPDATE recipes 
        SET hero_image_key = ?, 
            hero_image_type = ?, 
            updated_at = datetime('now') 
        WHERE id = ?
      `).bind(targetKey, heroType || 'SOURCE', recipeId).run();

      logger.info(`[Image Actions] Switched active hero image for recipe #${recipeId} to ${heroType} (${targetKey})`);
      return new Response(JSON.stringify({ success: true, heroType, heroKey: targetKey }), { status: 200 });
    }

    // 2. UPDATE RIGHTS STATUS
    if (action === 'UPDATE_RIGHTS_STATUS') {
      const { rightsStatus } = body;
      if (!['APPROVED', 'REVIEW_REQUIRED', 'UNKNOWN'].includes(rightsStatus)) {
        return new Response(JSON.stringify({ error: 'Invalid rightsStatus' }), { status: 400 });
      }

      await env.DB.prepare(`
        UPDATE recipes 
        SET image_rights_status = ?, 
            updated_at = datetime('now') 
        WHERE id = ?
      `).bind(rightsStatus, recipeId).run();

      await env.DB.prepare(`
        UPDATE recipe_images 
        SET image_rights_status = ?, 
            updated_at = datetime('now') 
        WHERE recipe_id = ? AND type = 'SOURCE'
      `).bind(rightsStatus, recipeId).run();

      logger.info(`[Image Actions] Updated rights status for recipe #${recipeId} to ${rightsStatus}`);
      return new Response(JSON.stringify({ success: true, rightsStatus }), { status: 200 });
    }

    // 3. RETRY / RE-IMPORT ALL SOURCE IMAGES
    if (action === 'RETRY_SOURCE_IMPORT') {
      const pageUrl = recipe.source_url;
      if (pageUrl) {
        try {
          const fetchRes = await fetchSource(pageUrl);
          let rawData: any = null;
          if ((recipe as any).raw_extraction_data) {
            try { rawData = JSON.parse((recipe as any).raw_extraction_data); } catch {}
          }
          const extracted = extractAllRecipeImages(fetchRes.html, rawData, pageUrl);
          
          const multiResult = await importAllSourceImages({
            db: env.DB,
            bucket: env.RECIPE_IMAGES,
            recipeId,
            slug: recipe.slug,
            heroImageUrl: extracted.hero?.url || (recipe as any).original_image_url,
            additionalImages: extracted.inArticle,
            pageUrl,
            recipeTitle: recipe.title,
            force: true
          });

          return new Response(JSON.stringify({ 
            success: true, 
            totalImported: multiResult.totalImported,
            inArticleCount: multiResult.inArticle.length
          }), { status: 200 });
        } catch (e: any) {
          logger.warn(`[Image Actions] Full re-import fallback to single: ${e.message}`);
        }
      }

      const sourceUrl = body.sourceImageUrl || (recipe as any).original_image_url || recipe.source_url;
      if (!sourceUrl) {
        return new Response(JSON.stringify({ error: 'No source image URL found to import' }), { status: 400 });
      }

      const result = await importSourceRecipeImage({
        db: env.DB,
        bucket: env.RECIPE_IMAGES,
        recipeId,
        slug: recipe.slug,
        sourceImageUrl: sourceUrl,
        pageUrl: recipe.source_url || '',
        recipeTitle: recipe.title,
        force: true
      });

      if (!result.success) {
        return new Response(JSON.stringify({ error: result.errorMessage || 'Failed to import source image' }), { status: 500 });
      }

      return new Response(JSON.stringify({ success: true, ...result }), { status: 200 });
    }

    // 4. GENERATE NEW AI HERO IMAGE
    if (action === 'GENERATE_AI_IMAGE') {
      if (!env.RUNWARE_API_KEY) {
        return new Response(JSON.stringify({ error: 'RUNWARE_API_KEY is not configured' }), { status: 400 });
      }

      // Parse ingredients for prompt
      let ingredientsList: string[] = [];
      const ingredientsData = await env.DB.prepare(
        'SELECT name FROM ingredients WHERE recipe_id = ? ORDER BY sort_order ASC'
      ).bind(recipeId).all<{ name: string }>();
      if (ingredientsData?.results) {
        ingredientsList = ingredientsData.results.map(r => r.name);
      }

      const imgResult = await generateRecipeImage(env.RUNWARE_API_KEY, {
        title: recipe.title,
        description: recipe.description || '',
        ingredients: ingredientsList,
        cuisine: recipe.cuisine || undefined
      });

      const saveResult = await saveRecipeHeroImage({
        db: env.DB,
        bucket: env.RECIPE_IMAGES,
        recipeId,
        slug: recipe.slug,
        imageBuffer: imgResult.imageBuffer,
        prompt: imgResult.prompt,
        provider: imgResult.provider,
        model: imgResult.model,
        width: imgResult.width,
        height: imgResult.height,
        oldHeroKey: (recipe as any).generated_image_key
      });

      logger.info(`[Image Actions] Generated new AI image for recipe #${recipeId}: ${saveResult.imageKey}`);
      return new Response(JSON.stringify({ success: true, heroKey: saveResult.imageKey, heroUrl: saveResult.imageUrl }), { status: 200 });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400 });
  } catch (err: any) {
    logger.error('[Image Actions] API Error:', err);
    return new Response(JSON.stringify({ error: err.message || 'Internal server error' }), { status: 500 });
  }
};
