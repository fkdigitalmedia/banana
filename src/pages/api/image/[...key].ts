import type { APIRoute } from 'astro';
import { logger } from '../../../lib/utils/logger';

export const prerender = false;

const ALLOWED_MIME_TYPES = new Set([
  'image/webp',
  'image/jpeg',
  'image/png',
  'image/avif'
]);

export const GET: APIRoute = async (context) => {
  const { key } = context.params;
  if (!key) {
    return new Response('Missing image key', { status: 400 });
  }

  // Prevent directory traversal attacks
  if (key.includes('..') || key.includes('\0') || key.startsWith('/') || key.startsWith('\\')) {
    logger.warn(`Suspicious image key access attempted: ${key}`);
    return new Response('Invalid image key', { status: 400 });
  }

  const env = context.locals.runtime?.env;
  const bucket = env?.RECIPE_IMAGES;

  if (!bucket) {
    logger.error('R2 bucket RECIPE_IMAGES binding not available');
    return new Response('Image storage not configured', { status: 503 });
  }

  try {
    const object = await bucket.get(key);
    if (!object) {
      return new Response('Image not found', { 
        status: 404,
        headers: {
          'Cache-Control': 'public, max-age=60'
        }
      });
    }

    const rawContentType = object.httpMetadata?.contentType || 'image/webp';
    const contentType = ALLOWED_MIME_TYPES.has(rawContentType) ? rawContentType : 'image/webp';

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    headers.set('Content-Type', contentType);
    headers.set('X-Content-Type-Options', 'nosniff');

    return new Response(object.body as any, {
      status: 200,
      headers
    });
  } catch (err: any) {
    logger.error(`[/api/image] Error retrieving key "${key}":`, err);
    return new Response('Failed to load image', { status: 500 });
  }
};
