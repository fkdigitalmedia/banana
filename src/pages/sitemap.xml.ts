import type { APIRoute } from 'astro';
import { generateSitemapXml } from '../lib/seo';

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const env = context.locals.runtime?.env;
  const db = env?.DB;
  const siteUrl = env?.SITE_URL || 'https://yoursite.com';

  const sitemapXml = await generateSitemapXml(db, siteUrl);

  return new Response(sitemapXml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600'
    }
  });
};
