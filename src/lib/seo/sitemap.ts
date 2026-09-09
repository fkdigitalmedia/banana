import { getSiteConfig } from './config';
import { getCanonicalUrl } from './canonical';
import { getAllPublishedSlugs } from '../db/recipes';

export interface SitemapEntry {
  url: string;
  lastmod?: string;
  changefreq: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  priority: string;
}

export async function generateSitemapXml(db: any, siteUrl: string): Promise<string> {
  const config = getSiteConfig({ SITE_URL: siteUrl });
  const { recipes, categories } = db ? await getAllPublishedSlugs(db) : { recipes: [], categories: [] };

  const staticEntries: SitemapEntry[] = [
    { url: getCanonicalUrl('/', config.siteUrl), priority: '1.0', changefreq: 'daily' },
    { url: getCanonicalUrl('/recipes/', config.siteUrl), priority: '0.9', changefreq: 'daily' },
    { url: getCanonicalUrl('/about/', config.siteUrl), priority: '0.6', changefreq: 'monthly' },
    { url: getCanonicalUrl('/contact/', config.siteUrl), priority: '0.5', changefreq: 'monthly' },
    { url: getCanonicalUrl('/privacy-policy/', config.siteUrl), priority: '0.3', changefreq: 'yearly' },
    { url: getCanonicalUrl('/terms/', config.siteUrl), priority: '0.3', changefreq: 'yearly' },
    { url: getCanonicalUrl('/disclaimer/', config.siteUrl), priority: '0.3', changefreq: 'yearly' }
  ];

  const categoryEntries: SitemapEntry[] = (categories || []).map((cat: any) => ({
    url: getCanonicalUrl(`recipes/${cat.slug}/`, config.siteUrl),
    priority: '0.8',
    changefreq: 'weekly',
    lastmod: new Date().toISOString().split('T')[0]
  }));

  const recipeEntries: SitemapEntry[] = (recipes || []).map((r: any) => {
    let lastmod: string | undefined = undefined;
    if (r.updated_at) {
      try {
        lastmod = new Date(r.updated_at).toISOString().split('T')[0];
      } catch {
        lastmod = undefined;
      }
    }

    return {
      url: getCanonicalUrl(r.slug, config.siteUrl),
      priority: '0.9',
      changefreq: 'weekly',
      lastmod
    };
  });

  const allEntries = [...staticEntries, ...categoryEntries, ...recipeEntries];

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allEntries.map((item) => `  <url>
    <loc>${item.url}</loc>
    ${item.lastmod ? `<lastmod>${item.lastmod}</lastmod>` : ''}
    <changefreq>${item.changefreq}</changefreq>
    <priority>${item.priority}</priority>
  </url>`).join('\n')}
</urlset>`;
}
