import type { APIRoute } from 'astro';
import { uploadImage } from '../../../../lib/r2/client';
import { parseImageHeader } from '../../../../lib/image/dimensions';
import { getDefaultAuthor, updateAuthor } from '../../../../lib/db/author';
import { logger } from '../../../../lib/utils/logger';

export const prerender = false;

const MAX_AVATAR_BYTES = 5 * 1024 * 1024; // 5 MB

export const POST: APIRoute = async (context) => {
  const env = context.locals.runtime?.env;
  if (!env?.DB) {
    return new Response(JSON.stringify({ success: false, error: 'Database binding unavailable' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const formData = await context.request.formData().catch(() => null);
    if (!formData) {
      return new Response(JSON.stringify({ success: false, error: 'No form data submitted' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const file = formData.get('avatar');
    if (!file || !(file instanceof File)) {
      return new Response(JSON.stringify({ success: false, error: 'No image file provided' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const arrayBuffer = await file.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_AVATAR_BYTES) {
      return new Response(JSON.stringify({ success: false, error: 'Avatar image must be under 5 MB' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Binary header analysis & validation
    const headerInfo = parseImageHeader(arrayBuffer);
    if (!headerInfo) {
      return new Response(JSON.stringify({ success: false, error: 'Unsupported image format. Please upload JPEG, PNG, WebP, or AVIF.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    let ext = 'webp';
    if (headerInfo.mimeType === 'image/jpeg') ext = 'jpg';
    else if (headerInfo.mimeType === 'image/png') ext = 'png';
    else if (headerInfo.mimeType === 'image/avif') ext = 'avif';

    const timestamp = Date.now();
    const r2Key = `author/avatar-${timestamp}.${ext}`;

    if (env.RECIPE_IMAGES) {
      await uploadImage(env.RECIPE_IMAGES, r2Key, arrayBuffer, headerInfo.mimeType);
      logger.info(`[Author Avatar Upload] Uploaded avatar to R2: ${r2Key}`);
    } else {
      logger.warn('[Author Avatar Upload] RECIPE_IMAGES bucket binding unavailable, saving reference path');
    }

    const avatarUrl = `/api/image/${r2Key}`;

    const author = await getDefaultAuthor(env.DB);
    const updated = await updateAuthor(env.DB, author.id, {
      avatar_url: avatarUrl,
      avatar_r2_key: r2Key
    });

    return new Response(JSON.stringify({
      success: true,
      avatarUrl,
      r2Key,
      width: headerInfo.width,
      height: headerInfo.height,
      author: updated
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    logger.error('[Author Avatar Upload] Error:', err);
    return new Response(JSON.stringify({ success: false, error: err.message || 'Failed to upload avatar' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
