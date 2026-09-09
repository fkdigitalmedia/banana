import type { APIRoute } from 'astro';
import { generateRobotsTxt } from '../lib/seo';

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const url = new URL(context.request.url);
  const isPagesDev = url.hostname.includes('pages.dev');

  // Disallow all crawling on *.pages.dev preview domains to protect primary domain SEO
  if (isPagesDev) {
    return new Response(`User-agent: *\nDisallow: /\n`, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Robots-Tag': 'noindex, nofollow',
        'Cache-Control': 'public, max-age=86400'
      }
    });
  }

  const env = context.locals.runtime?.env;
  const siteUrl = env?.SITE_URL || 'https://bananabreadrecipe.xyz';
  const robotsTxt = generateRobotsTxt(siteUrl);

  return new Response(robotsTxt, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=86400'
    }
  });
};
