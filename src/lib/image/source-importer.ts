import type { D1Database, R2Bucket } from '@cloudflare/workers-types';
import { uploadImage } from '../r2/client';
import { parseImageHeader } from './dimensions';
import { logger } from '../utils/logger';
import type { ExtractedImageInfo } from '../normalization/types';

export interface ImportSourceImageOptions {
  db: D1Database;
  bucket?: R2Bucket | null;
  recipeId: number;
  slug: string;
  sourceImageUrl: string;
  pageUrl: string;
  recipeTitle?: string;
  force?: boolean;
}

export interface ImportSourceImageResult {
  success: boolean;
  r2Key?: string;
  r2Url?: string;
  mimeType?: string;
  width?: number;
  height?: number;
  fileSize?: number;
  rightsStatus: 'REVIEW_REQUIRED' | 'APPROVED' | 'UNKNOWN';
  errorCode?: string;
  errorMessage?: string;
}

const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB limit
const DOWNLOAD_TIMEOUT_MS = 12000; // 12 seconds
const MIN_DIMENSION = 200; // Minimum width & height

/**
 * Validates whether the target image URL is safe against SSRF attacks.
 */
export function isSafeImageUrl(rawUrl: string): { safe: boolean; reason?: string } {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { safe: false, reason: `Invalid protocol: ${parsed.protocol}` };
    }

    const hostname = parsed.hostname.toLowerCase();

    // Reject localhost and IP loopback
    if (
      hostname === 'localhost' ||
      hostname === '0.0.0.0' ||
      hostname === '::1' ||
      hostname === '[::1]' ||
      hostname.startsWith('127.')
    ) {
      return { safe: false, reason: 'Localhost and loopback addresses are prohibited' };
    }

    // Reject private network CIDR blocks
    if (
      hostname.startsWith('10.') ||
      hostname.startsWith('192.168.') ||
      hostname.endsWith('.local') ||
      hostname.endsWith('.internal') ||
      hostname.endsWith('.lan') ||
      hostname.endsWith('.corp') ||
      hostname.endsWith('.home')
    ) {
      return { safe: false, reason: 'Private network hostnames are prohibited' };
    }

    // 172.16.0.0/12 check
    const parts = hostname.split('.');
    if (parts.length === 4 && parts.every(p => /^\d+$/.test(p))) {
      const p0 = parseInt(parts[0], 10);
      const p1 = parseInt(parts[1], 10);
      if (p0 === 172 && p1 >= 16 && p1 <= 31) {
        return { safe: false, reason: 'Private 172.16.0.0/12 IP addresses are prohibited' };
      }
      if (p0 === 169 && p1 === 254) {
        return { safe: false, reason: 'Link-local addresses are prohibited' };
      }
    }

    // Disallow single-label hostnames (internal network machine names)
    if (!hostname.includes('.')) {
      return { safe: false, reason: 'Single-label hostnames are prohibited' };
    }

    return { safe: true };
  } catch {
    return { safe: false, reason: 'Malformed URL' };
  }
}

/**
 * Downloads a source recipe image on the server side, validates dimensions and MIME type,
 * saves it directly to Cloudflare R2 under `recipes/{slug}/source/hero.{ext}`,
 * and records provenance & copyright status in D1.
 */
export async function importSourceRecipeImage(
  options: ImportSourceImageOptions
): Promise<ImportSourceImageResult> {
  const { db, bucket, recipeId, slug, sourceImageUrl, pageUrl, recipeTitle, force = false } = options;

  logger.info(`[Source Image Import] Starting for recipe #${recipeId} (${slug}): ${sourceImageUrl}`);

  // 1. SSRF and URL validation
  const safety = isSafeImageUrl(sourceImageUrl);
  if (!safety.safe) {
    logger.warn(`[Source Image Import] Blocked unsafe URL: ${sourceImageUrl} (${safety.reason})`);
    await recordFailedImage(db, recipeId, sourceImageUrl, 'SSRF_BLOCKED');
    return {
      success: false,
      rightsStatus: 'REVIEW_REQUIRED',
      errorCode: 'SSRF_BLOCKED',
      errorMessage: safety.reason
    };
  }

  // 2. Idempotency check: Skip if already READY and not forced
  if (!force) {
    const existing = await db
      .prepare(
        `SELECT r2_key, mime_type, width, height, file_size, image_rights_status, status 
         FROM recipe_images 
         WHERE recipe_id = ? AND type = 'SOURCE' AND status = 'READY'
         ORDER BY id DESC LIMIT 1`
      )
      .bind(recipeId)
      .first<{
        r2_key: string;
        mime_type: string;
        width: number;
        height: number;
        file_size: number;
        image_rights_status: 'REVIEW_REQUIRED' | 'APPROVED' | 'UNKNOWN';
        status: string;
      }>();

    if (existing && existing.r2_key) {
      logger.info(`[Source Image Import] Recipe #${recipeId} already has READY source image: ${existing.r2_key}`);
      return {
        success: true,
        r2Key: existing.r2_key,
        r2Url: `/api/image/${existing.r2_key}`,
        mimeType: existing.mime_type,
        width: existing.width,
        height: existing.height,
        fileSize: existing.file_size,
        rightsStatus: existing.image_rights_status || 'REVIEW_REQUIRED'
      };
    }
  }

  // 3. Download image server-side with 12s timeout and size limit
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);

  let imageBuffer: ArrayBuffer;
  try {
    const response = await fetch(sourceImageUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; RecipeBot/1.0; +https://bananabreadrecipe.xyz)',
        'Accept': 'image/webp,image/avif,image/jpeg,image/png,*/*;q=0.8',
        'Referer': pageUrl
      }
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      logger.warn(`[Source Image Import] HTTP ${response.status} fetching source image: ${sourceImageUrl}`);
      await recordFailedImage(db, recipeId, sourceImageUrl, `HTTP_${response.status}`);
      return {
        success: false,
        rightsStatus: 'REVIEW_REQUIRED',
        errorCode: `HTTP_${response.status}`,
        errorMessage: `Server returned HTTP ${response.status}`
      };
    }

    // Check Content-Length header if provided
    const cl = response.headers.get('content-length');
    if (cl && parseInt(cl, 10) > MAX_IMAGE_BYTES) {
      logger.warn(`[Source Image Import] Image exceeds 8MB limit (${cl} bytes)`);
      await recordFailedImage(db, recipeId, sourceImageUrl, 'FILE_TOO_LARGE');
      return {
        success: false,
        rightsStatus: 'REVIEW_REQUIRED',
        errorCode: 'FILE_TOO_LARGE',
        errorMessage: 'Image exceeds 8MB limit'
      };
    }

    imageBuffer = await response.arrayBuffer();
  } catch (err: any) {
    clearTimeout(timeoutId);
    const isTimeout = err.name === 'AbortError';
    const code = isTimeout ? 'DOWNLOAD_TIMEOUT' : 'NETWORK_ERROR';
    logger.error(`[Source Image Import] Failed to download source image:`, err);
    await recordFailedImage(db, recipeId, sourceImageUrl, code);
    return {
      success: false,
      rightsStatus: 'REVIEW_REQUIRED',
      errorCode: code,
      errorMessage: err.message || 'Download failed'
    };
  }

  // Validate downloaded byte size
  if (imageBuffer.byteLength > MAX_IMAGE_BYTES) {
    logger.warn(`[Source Image Import] Image buffer exceeds 8MB (${imageBuffer.byteLength} bytes)`);
    await recordFailedImage(db, recipeId, sourceImageUrl, 'FILE_TOO_LARGE');
    return {
      success: false,
      rightsStatus: 'REVIEW_REQUIRED',
      errorCode: 'FILE_TOO_LARGE',
      errorMessage: 'Image exceeds 8MB limit'
    };
  }

  // 4. Binary Header Analysis: MIME detection and dimension extraction
  const headerInfo = parseImageHeader(imageBuffer);
  if (!headerInfo) {
    logger.warn(`[Source Image Import] Could not parse binary image header for: ${sourceImageUrl}`);
    await recordFailedImage(db, recipeId, sourceImageUrl, 'INVALID_IMAGE_DATA');
    return {
      success: false,
      rightsStatus: 'REVIEW_REQUIRED',
      errorCode: 'INVALID_IMAGE_DATA',
      errorMessage: 'Downloaded file is not a supported image format (JPEG, PNG, WebP, AVIF)'
    };
  }

  // Dimension validation: reject tiny icons / tracking pixels
  if (headerInfo.width < MIN_DIMENSION || headerInfo.height < MIN_DIMENSION) {
    logger.warn(`[Source Image Import] Image dimensions too small (${headerInfo.width}x${headerInfo.height})`);
    await recordFailedImage(db, recipeId, sourceImageUrl, 'IMAGE_TOO_SMALL');
    return {
      success: false,
      rightsStatus: 'REVIEW_REQUIRED',
      errorCode: 'IMAGE_TOO_SMALL',
      errorMessage: `Image too small (${headerInfo.width}x${headerInfo.height}px, min ${MIN_DIMENSION}px)`
    };
  }

  // 5. Determine R2 Key with matching extension
  let ext = 'webp';
  if (headerInfo.mimeType === 'image/jpeg') ext = 'jpg';
  else if (headerInfo.mimeType === 'image/png') ext = 'png';
  else if (headerInfo.mimeType === 'image/avif') ext = 'avif';

  const safeSlug = slug.replace(/[^a-z0-9-_]/gi, '-').toLowerCase();
  const r2Key = `recipes/${safeSlug}/source/hero.${ext}`;

  // 6. Upload to R2 Storage
  if (bucket) {
    try {
      await uploadImage(bucket, r2Key, imageBuffer, headerInfo.mimeType);
      logger.info(`[Source Image Import] Successfully uploaded source image to R2: ${r2Key}`);
    } catch (uploadErr: any) {
      logger.error(`[Source Image Import] Failed to upload to R2:`, uploadErr);
      await recordFailedImage(db, recipeId, sourceImageUrl, 'R2_UPLOAD_FAILED');
      return {
        success: false,
        rightsStatus: 'REVIEW_REQUIRED',
        errorCode: 'R2_UPLOAD_FAILED',
        errorMessage: uploadErr.message
      };
    }
  } else {
    logger.warn(`[Source Image Import] RECIPE_IMAGES bucket binding unavailable; storing reference key.`);
  }

  // 7. Record in recipe_images table and update recipes table
  const altText = recipeTitle ? `${recipeTitle} recipe` : 'Source recipe photo';

  try {
    await db
      .prepare(
        `INSERT INTO recipe_images (
          recipe_id, type, source_url, r2_key, status, mime_type, 
          width, height, file_size, alt_text, image_rights_status, error_code, placement, updated_at
        ) VALUES (?, 'SOURCE', ?, ?, 'READY', ?, ?, ?, ?, ?, 'REVIEW_REQUIRED', NULL, 'HERO', datetime('now'))`
      )
      .bind(
        recipeId,
        sourceImageUrl,
        r2Key,
        headerInfo.mimeType,
        headerInfo.width,
        headerInfo.height,
        imageBuffer.byteLength,
        altText
      )
      .run();

    await db
      .prepare(
        `UPDATE recipes 
         SET source_image_r2_key = ?,
             source_image_status = 'READY',
             image_rights_status = 'REVIEW_REQUIRED',
             original_image_url = ?,
             hero_image_key = COALESCE(hero_image_key, ?),
             hero_image_type = COALESCE(hero_image_type, 'SOURCE'),
             updated_at = datetime('now')
         WHERE id = ?`
      )
      .bind(r2Key, sourceImageUrl, r2Key, recipeId)
      .run();

    logger.info(`[Source Image Import] Successfully imported source image for recipe #${recipeId}`);

    return {
      success: true,
      r2Key,
      r2Url: `/api/image/${r2Key}`,
      mimeType: headerInfo.mimeType,
      width: headerInfo.width,
      height: headerInfo.height,
      fileSize: imageBuffer.byteLength,
      rightsStatus: 'REVIEW_REQUIRED'
    };
  } catch (dbErr: any) {
    logger.error(`[Source Image Import] Failed to update D1 records:`, dbErr);
    return {
      success: false,
      rightsStatus: 'REVIEW_REQUIRED',
      errorCode: 'DB_ERROR',
      errorMessage: dbErr.message
    };
  }
}

async function recordFailedImage(
  db: D1Database,
  recipeId: number,
  sourceUrl: string,
  errorCode: string
): Promise<void> {
  try {
    await db
      .prepare(
        `INSERT INTO recipe_images (
          recipe_id, type, source_url, status, error_code, image_rights_status, updated_at
        ) VALUES (?, 'SOURCE', ?, 'FAILED', ?, 'REVIEW_REQUIRED', datetime('now'))`
      )
      .bind(recipeId, sourceUrl, errorCode)
      .run();

    await db
      .prepare(
        `UPDATE recipes 
         SET source_image_status = 'FAILED', 
             updated_at = datetime('now') 
         WHERE id = ?`
      )
      .bind(recipeId)
      .run();
  } catch (err) {
    logger.warn(`[Source Image Import] Failed to record error status in D1:`, err);
  }
}

export interface ImportAllSourceImagesOptions {
  db: D1Database;
  bucket?: R2Bucket | null;
  recipeId: number;
  slug: string;
  heroImageUrl?: string | null;
  additionalImages?: ExtractedImageInfo[];
  pageUrl: string;
  recipeTitle?: string;
  force?: boolean;
}

export interface ImportAllSourceImagesResult {
  hero?: ImportSourceImageResult;
  inArticle: ImportSourceImageResult[];
  totalImported: number;
}

/**
 * Imports both the hero image and in-article process photos to Cloudflare R2,
 * recording them in the recipe_images table.
 */
export async function importAllSourceImages(
  options: ImportAllSourceImagesOptions
): Promise<ImportAllSourceImagesResult> {
  const { db, bucket, recipeId, slug, heroImageUrl, additionalImages = [], pageUrl, recipeTitle, force = false } = options;

  let heroResult: ImportSourceImageResult | undefined;
  const inArticleResults: ImportSourceImageResult[] = [];
  let totalImported = 0;

  // 1. Import Hero Image if provided
  if (heroImageUrl) {
    try {
      heroResult = await importSourceRecipeImage({
        db,
        bucket,
        recipeId,
        slug,
        sourceImageUrl: heroImageUrl,
        pageUrl,
        recipeTitle,
        force
      });
      if (heroResult.success) {
        totalImported++;
      }
    } catch (err: any) {
      logger.warn(`[Multi-Image Import] Failed to import hero image for recipe #${recipeId}:`, err);
    }
  }

  // Helper to normalize base url for deduplication
  const getBaseKey = (url: string) => {
    try {
      const u = new URL(url);
      return (u.origin + u.pathname).replace(/-\d+x\d+(?=\.[a-z]+$)/i, '').toLowerCase();
    } catch {
      return url.toLowerCase();
    }
  };

  const heroBaseKey = heroImageUrl ? getBaseKey(heroImageUrl) : null;
  const processedKeys = new Set<string>();
  if (heroBaseKey) processedKeys.add(heroBaseKey);

  // 2. Import In-Article Process Images
  const safeSlug = slug.replace(/[^a-z0-9-_]/gi, '-').toLowerCase();

  for (let idx = 0; idx < additionalImages.length; idx++) {
    const img = additionalImages[idx];
    if (!img.url) continue;

    const baseKey = getBaseKey(img.url);
    if (processedKeys.has(baseKey)) {
      continue;
    }
    processedKeys.add(baseKey);

    // Validate SSRF
    const safety = isSafeImageUrl(img.url);
    if (!safety.safe) {
      logger.warn(`[Multi-Image Import] Skipping unsafe image URL: ${img.url}`);
      continue;
    }

    // Check if already imported
    if (!force) {
      const existing = await db
        .prepare(
          `SELECT r2_key, mime_type, width, height, file_size, image_rights_status, status
           FROM recipe_images
           WHERE recipe_id = ? AND source_url = ? AND status = 'READY'
           LIMIT 1`
        )
        .bind(recipeId, img.url)
        .first<any>();

      if (existing && existing.r2_key) {
        inArticleResults.push({
          success: true,
          r2Key: existing.r2_key,
          r2Url: `/api/image/${existing.r2_key}`,
          mimeType: existing.mime_type,
          width: existing.width,
          height: existing.height,
          fileSize: existing.file_size,
          rightsStatus: existing.image_rights_status || 'REVIEW_REQUIRED'
        });
        totalImported++;
        continue;
      }
    }

    // Fetch server-side
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);

    try {
      const response = await fetch(img.url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; RecipeBot/1.0; +https://bananabreadrecipe.xyz)',
          'Accept': 'image/webp,image/avif,image/jpeg,image/png,*/*;q=0.8',
          'Referer': pageUrl
        }
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        logger.warn(`[Multi-Image Import] HTTP ${response.status} fetching in-article image: ${img.url}`);
        continue;
      }

      const cl = response.headers.get('content-length');
      if (cl && parseInt(cl, 10) > MAX_IMAGE_BYTES) {
        continue;
      }

      const buffer = await response.arrayBuffer();
      if (buffer.byteLength > MAX_IMAGE_BYTES) continue;

      const headerInfo = parseImageHeader(buffer);
      if (!headerInfo || headerInfo.width < MIN_DIMENSION || headerInfo.height < MIN_DIMENSION) {
        continue;
      }

      let ext = 'webp';
      if (headerInfo.mimeType === 'image/jpeg') ext = 'jpg';
      else if (headerInfo.mimeType === 'image/png') ext = 'png';
      else if (headerInfo.mimeType === 'image/avif') ext = 'avif';

      const prefix = img.placement === 'STEP' ? 'step' : 'article';
      const num = img.stepNumber || (idx + 1);
      const r2Key = `recipes/${safeSlug}/source/${prefix}-${num}.${ext}`;

      if (bucket) {
        await uploadImage(bucket, r2Key, buffer, headerInfo.mimeType);
      }

      const altText = img.alt || (recipeTitle ? `${recipeTitle} process photo` : 'Recipe process photo');
      const placement = img.placement || 'ARTICLE';
      const stepNumber = img.stepNumber || null;
      const caption = img.caption || null;

      await db
        .prepare(
          `INSERT INTO recipe_images (
            recipe_id, type, source_url, r2_key, status, mime_type,
            width, height, file_size, alt_text, caption, placement, step_number,
            image_rights_status, error_code, updated_at
          ) VALUES (?, 'SOURCE', ?, ?, 'READY', ?, ?, ?, ?, ?, ?, ?, ?, 'REVIEW_REQUIRED', NULL, datetime('now'))`
        )
        .bind(
          recipeId,
          img.url,
          r2Key,
          headerInfo.mimeType,
          headerInfo.width,
          headerInfo.height,
          buffer.byteLength,
          altText,
          caption,
          placement,
          stepNumber
        )
        .run();

      inArticleResults.push({
        success: true,
        r2Key,
        r2Url: `/api/image/${r2Key}`,
        mimeType: headerInfo.mimeType,
        width: headerInfo.width,
        height: headerInfo.height,
        fileSize: buffer.byteLength,
        rightsStatus: 'REVIEW_REQUIRED'
      });
      totalImported++;
      logger.info(`[Multi-Image Import] Imported in-article image to R2: ${r2Key}`);
    } catch (fetchErr: any) {
      clearTimeout(timeoutId);
      logger.warn(`[Multi-Image Import] Error importing image ${img.url}:`, fetchErr.message);
    }
  }

  logger.info(`[Multi-Image Import] Completed for recipe #${recipeId}. Total imported: ${totalImported}`);

  return {
    hero: heroResult,
    inArticle: inArticleResults,
    totalImported
  };
}
