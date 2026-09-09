import type { APIRoute } from 'astro';
import { submitToIndexNow, INDEXNOW_KEY } from '../../../../lib/seo/indexnow';
import { listRecipes } from '../../../../lib/db/recipes';
import { logger } from '../../../../lib/utils/logger';

export const prerender = false;

export const POST: APIRoute = async (context) => {
  const env = context.locals.runtime?.env;
  if (!env?.DB) {
    return new Response(JSON.stringify({ success: false, error: 'Database unavailable' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const siteUrl = env.SITE_URL || 'https://banana-recipe-blog.pages.dev';
  const cleanSiteUrl = siteUrl.replace(/\/$/, '');

  try {
    const body = await context.request.json().catch(() => ({}));
    const { url, all } = body;

    let urlsToSubmit: string[] = [];

    if (all) {
      // Fetch all published recipes
      const published = await listRecipes(env.DB, { status: 'PUBLISHED', limit: 100 });
      urlsToSubmit = [
        `${cleanSiteUrl}/`,
        ...published.map((r: any) => `${cleanSiteUrl}/recipes/${r.slug}/`)
      ];
    } else if (url) {
      urlsToSubmit = [url.startsWith('http') ? url : `${cleanSiteUrl}${url.startsWith('/') ? '' : '/'}${url}`];
    } else {
      // Default: submit homepage and sitemap
      urlsToSubmit = [`${cleanSiteUrl}/`, `${cleanSiteUrl}/sitemap.xml`];
    }

    const result = await submitToIndexNow(cleanSiteUrl, urlsToSubmit);

    return new Response(JSON.stringify({
      success: result.success,
      key: INDEXNOW_KEY,
      statusCode: result.statusCode,
      message: result.message,
      submittedUrls: result.submittedUrls
    }), {
      status: result.success ? 200 : 502,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    logger.error('[API /api/admin/seo/indexnow] Error:', err);
    return new Response(JSON.stringify({ success: false, error: err.message || 'IndexNow submission failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
