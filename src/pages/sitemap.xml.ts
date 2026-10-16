import { getCollection } from 'astro:content';

export const prerender = true;

const SITE_URL = 'https://bananabreadrecipe.xyz';

export async function GET() {
  const recipes = await getCollection('recipes');

  const staticPages = [
    { loc: '/', changefreq: 'daily', priority: '1.0' },
    { loc: '/recipes/', changefreq: 'daily', priority: '0.9' },
    { loc: '/about/', changefreq: 'monthly', priority: '0.6' },
    { loc: '/contact/', changefreq: 'monthly', priority: '0.5' },
    { loc: '/privacy-policy/', changefreq: 'yearly', priority: '0.3' },
    { loc: '/terms/', changefreq: 'yearly', priority: '0.3' },
    { loc: '/disclaimer/', changefreq: 'yearly', priority: '0.3' },
  ];

  const categories = [...new Set(recipes.map((r) => r.data.category))].map((c) => ({
    loc: `/recipes/${c}/`,
    changefreq: 'weekly',
    priority: '0.8',
  }));

  const recipeUrls = recipes.map((r) => ({
    loc: `/${r.slug}/`,
    lastmod: r.data.pubDate.toISOString().split('T')[0],
    changefreq: 'weekly',
    priority: '0.9',
  }));

  const urls = [...staticPages, ...categories, ...recipeUrls];
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls
      .map(
        (u) =>
          `  <url><loc>${SITE_URL}${u.loc}</loc>` +
          (u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : '') +
          `<changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority></url>`
      )
      .join('\n') +
    `\n</urlset>`;

  return new Response(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
