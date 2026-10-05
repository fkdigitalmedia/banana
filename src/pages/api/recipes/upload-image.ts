import type { APIRoute } from 'astro';
import { getRecipeById } from '../../../lib/db/recipes';
import { uploadImage, deleteImage } from '../../../lib/r2/client';
import { recordRevision } from '../../../lib/editorial/workflow';
import { logger } from '../../../lib/utils/logger';

export const prerender = false;

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

export const POST: APIRoute = async (context) => {
  try {
    const env = context.locals.runtime?.env;
    if (!env?.DB) {
      return new Response(JSON.stringify({ success: false, error: 'Database unavailable.' }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      });
    }

    const form = await context.request.formData().catch(() => null);
    const recipeIdRaw = form?.get('recipeId');
    const file = form?.get('image');

    const recipeId = parseInt(String(recipeIdRaw || ''), 10);
    if (!recipeId) {
      return new Response(JSON.stringify({ success: false, error: 'Missing recipeId.' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }
    if (!(file instanceof File) || file.size === 0) {
      return new Response(JSON.stringify({ success: false, error: 'No image file received.' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }
    if (!ALLOWED_MIME.has(file.type)) {
      return new Response(JSON.stringify({ success: false, error: 'Only JPG, PNG, WebP or GIF images are allowed.' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }
    if (file.size > MAX_BYTES) {
      return new Response(JSON.stringify({ success: false, error: 'Image must be smaller than 10 MB.' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    const recipe = await getRecipeById(env.DB, recipeId);
    if (!recipe) {
      return new Response(JSON.stringify({ success: false, error: 'Recipe not found.' }), {
        status: 404, headers: { 'Content-Type': 'application/json' },
      });
    }

    const bucket = env.RECIPE_IMAGES;
    if (!bucket) {
      return new Response(JSON.stringify({ success: false, error: 'Image storage (R2) is not configured on this deployment.' }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      });
    }

    const safeSlug = String(recipe.slug || `recipe-${recipeId}`).replace(/[^a-z0-9-_]/gi, '-').toLowerCase();
    const ext = EXT_BY_MIME[file.type] || 'jpg';
    const newKey = `recipes/${safeSlug}/uploaded/hero.${ext}`;
    const buffer = await file.arrayBuffer();

    await uploadImage(bucket, newKey, buffer, file.type);
    logger.info(`[Upload] Stored uploaded hero image for recipe #${recipeId} at ${newKey}`);

    // Log in recipe_images as a SOURCE-type photo (admin-provided)
    const altText = `${recipe.title} — uploaded photo`;
    await env.DB.prepare(`
      INSERT INTO recipe_images (
        recipe_id, type, source_url, r2_key, status, mime_type,
        width, height, file_size, alt_text, image_rights_status, error_code, updated_at
      ) VALUES (?, 'SOURCE', NULL, ?, 'READY', ?, NULL, NULL, ?, ?, 'APPROVED', NULL, datetime('now'))
    `).bind(recipeId, newKey, file.type, file.size, altText).run();

    // Make it the active hero + source photo
    await env.DB.prepare(`
      UPDATE recipes
      SET hero_image_key = ?,
          hero_image_type = 'SOURCE',
          source_image_r2_key = ?,
          source_image_status = 'READY',
          image_status = 'READY',
          image_rights_status = 'APPROVED',
          image_error = NULL,
          updated_at = datetime('now')
      WHERE id = ?
    `).bind(newKey, newKey, recipeId).run();

    // Clean up a previous *uploaded* hero (never touch generated/source-pipeline keys)
    const oldKey = recipe.hero_image_key as string | null;
    const uploadedPrefix = `recipes/${safeSlug}/uploaded/`;
    if (oldKey && oldKey !== newKey && oldKey.startsWith(uploadedPrefix)) {
      try { await deleteImage(bucket, oldKey); } catch (e) { /* non-fatal */ }
    }

    await recordRevision(env.DB, recipeId, 'CONTENT_EDIT', 'admin', 'Hero photo uploaded manually via admin panel');

    return new Response(JSON.stringify({
      success: true,
      recipeId,
      imageKey: newKey,
      imageUrl: `/api/image/${newKey}`,
      message: 'Photo uploaded and set as hero image.',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err: any) {
    console.error('[/api/recipes/upload-image] Error:', err);
    return new Response(JSON.stringify({ success: false, error: err?.message || 'Image upload failed.' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
};
