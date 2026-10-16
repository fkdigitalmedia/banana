export const prerender = false;

const SITE_URL = 'https://bananabreadrecipe.xyz';

export async function GET(context: any) {
  const url = new URL(context.request.url);
  const isPagesDev = url.hostname.includes('pages.dev');

  // Disallow all crawling on *.pages.dev preview domains to protect primary domain SEO
  if (isPagesDev) {
    return new Response(`User-agent: *\nDisallow: /\n`, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Robots-Tag': 'noindex, nofollow',
        'Cache-Control': 'public, max-age=86400',
      },
    });
  }

  const body = `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`;
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
