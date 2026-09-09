import type { APIRoute } from 'astro';
import { generateRobotsTxt } from '../lib/seo';

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const env = context.locals.runtime?.env;
  const siteUrl = env?.SITE_URL || 'https://yoursite.com';
  const robotsTxt = generateRobotsTxt(siteUrl);

  return new Response(robotsTxt, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=86400'
    }
  });
};
