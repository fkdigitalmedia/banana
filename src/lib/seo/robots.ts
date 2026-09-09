import { getSiteConfig } from './config';

export function generateRobotsTxt(siteUrl: string): string {
  const config = getSiteConfig({ SITE_URL: siteUrl });

  return `User-agent: *
Allow: /
Disallow: /admin/
Disallow: /api/
Disallow: /search/

Sitemap: ${config.siteUrl}/sitemap.xml
`;
}
