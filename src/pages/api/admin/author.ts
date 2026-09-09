import type { APIRoute } from 'astro';
import { getDefaultAuthor, updateAuthor } from '../../../lib/db/author';
import { logger } from '../../../lib/utils/logger';

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const env = context.locals.runtime?.env;
  if (!env?.DB) {
    return new Response(JSON.stringify({ success: false, error: 'Database binding unavailable' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const author = await getDefaultAuthor(env.DB);
    return new Response(JSON.stringify({ success: true, author }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    logger.error('[API /api/admin/author GET] Error:', err);
    return new Response(JSON.stringify({ success: false, error: err.message || 'Failed to fetch author' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

export const POST: APIRoute = async (context) => {
  const env = context.locals.runtime?.env;
  if (!env?.DB) {
    return new Response(JSON.stringify({ success: false, error: 'Database binding unavailable' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const body = await context.request.json().catch(() => null);
    if (!body) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid JSON payload' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const author = await getDefaultAuthor(env.DB);
    const authorId = body.id || author.id;

    const updated = await updateAuthor(env.DB, authorId, {
      name: body.name,
      role_title: body.role_title,
      bio: body.bio,
      avatar_url: body.avatar_url,
      avatar_r2_key: body.avatar_r2_key,
      social_instagram: body.social_instagram,
      social_pinterest: body.social_pinterest,
      social_youtube: body.social_youtube,
      social_facebook: body.social_facebook,
      social_twitter: body.social_twitter,
      website_url: body.website_url,
      email: body.email
    });

    logger.info(`[API /api/admin/author POST] Successfully updated author profile #${authorId}`);

    return new Response(JSON.stringify({ success: true, author: updated }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    logger.error('[API /api/admin/author POST] Error:', err);
    return new Response(JSON.stringify({ success: false, error: err.message || 'Failed to update author' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
