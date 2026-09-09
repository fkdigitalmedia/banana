import type { D1Database, R2Bucket } from '@cloudflare/workers-types';
import { uploadImage, deleteImage } from '../r2/client';

export interface SaveRecipeImageOptions {
  db: D1Database;
  bucket?: R2Bucket | null;
  recipeId: number;
  slug: string;
  imageBuffer: ArrayBuffer;
  prompt: string;
  provider?: string;
  model?: string;
  width?: number;
  height?: number;
  oldHeroKey?: string | null;
}

/**
 * Persists a generated image to Cloudflare R2 and updates recipe metadata in D1.
 * Generated images are stored under `recipes/${safeSlug}/generated/hero.webp`.
 * Safely cleans up the previous R2 key only after the new image is successfully saved.
 */
export async function saveRecipeHeroImage(options: SaveRecipeImageOptions): Promise<{ imageKey: string; imageUrl: string }> {
  const { db, bucket, recipeId, slug, imageBuffer, prompt, provider = 'Runware', model = 'FLUX.1 Schnell', width = 1024, height = 576, oldHeroKey } = options;

  const safeSlug = slug.replace(/[^a-z0-9-_]/gi, '-').toLowerCase();
  const newKey = `recipes/${safeSlug}/generated/hero.webp`;

  // 1. Upload to Cloudflare R2 if bucket binding is active
  if (bucket) {
    try {
      await uploadImage(bucket, newKey, imageBuffer, 'image/webp');
      console.log(`[R2 Storage] Stored generated image at key: ${newKey}`);
    } catch (err: any) {
      console.error(`[R2 Storage] Upload failed:`, err);
      throw new Error(`Cloudflare R2 image upload failed: ${err.message}`);
    }
  } else {
    console.warn(`[R2 Storage] RECIPE_IMAGES bucket binding not active. Storing reference key.`);
  }

  // 2. Update D1 database record with new image status and metadata
  await db.prepare(`
    UPDATE recipes 
    SET hero_image_key = ?,
        hero_image_type = 'GENERATED',
        generated_image_key = ?,
        image_status = 'READY',
        image_prompt = ?,
        image_provider = ?,
        image_model = ?,
        image_width = ?,
        image_height = ?,
        image_generated_at = datetime('now'),
        image_rights_status = 'APPROVED',
        image_error = NULL,
        updated_at = datetime('now')
    WHERE id = ?
  `).bind(newKey, newKey, prompt, provider, model, width, height, recipeId).run();

  // 3. Record in recipe_images table
  try {
    await db.prepare(`
      INSERT INTO recipe_images (
        recipe_id, type, source_url, r2_key, status, mime_type, 
        width, height, file_size, alt_text, image_rights_status, error_code, updated_at
      ) VALUES (?, 'GENERATED', NULL, ?, 'READY', 'image/webp', ?, ?, ?, ?, 'APPROVED', NULL, datetime('now'))
    `).bind(recipeId, newKey, width, height, imageBuffer.byteLength, `${prompt.slice(0, 100)}`).run();
  } catch (logErr) {
    console.warn(`[R2 Storage] Could not log to recipe_images:`, logErr);
  }

  // 4. Safe Cleanup of old R2 object if different
  if (bucket && oldHeroKey && oldHeroKey !== newKey && oldHeroKey.startsWith('recipes/')) {
    try {
      await deleteImage(bucket, oldHeroKey);
      console.log(`[R2 Storage] Cleaned up obsolete hero image key: ${oldHeroKey}`);
    } catch (err) {
      console.warn(`[R2 Storage] Failed to delete old key ${oldHeroKey}:`, err);
    }
  }

  return {
    imageKey: newKey,
    imageUrl: `/api/image/${newKey}`
  };
}

/**
 * Centralized recipe image URL resolver for public pages.
 * ZERO HOTLINKING: Never returns an unhosted external URL to client browsers.
 * Resolves to R2 public CDN, local `/api/image/`, or SVG placeholder.
 */
export function getRecipeImageUrl(
  recipe: { hero_image_key?: string | null; original_image_url?: string | null },
  r2BaseUrl?: string,
  siteUrl = ''
): string {
  if (recipe.hero_image_key) {
    if (r2BaseUrl && r2BaseUrl.startsWith('http')) {
      const cleanBase = r2BaseUrl.replace(/\/+$/, '');
      const cleanKey = recipe.hero_image_key.replace(/^\/+/, '');
      return `${cleanBase}/${cleanKey}`;
    }
    const cleanSite = siteUrl.replace(/\/+$/, '');
    return `${cleanSite}/api/image/${recipe.hero_image_key}`;
  }

  // Never hotlink external URL on public recipe pages
  return '/placeholder-recipe.svg';
}
