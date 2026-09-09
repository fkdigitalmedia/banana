/**
 * Central Site Configuration for Technical SEO and Structured Data.
 * Avoids hardcoding site names and domain URLs across individual files.
 */

export interface SiteConfig {
  siteName: string;
  siteUrl: string;
  defaultDescription: string;
  defaultOgImage: string;
  defaultAuthor: {
    name: string;
    url: string;
    type: 'Organization' | 'Person';
  };
  publisher: {
    name: string;
    url: string;
    logoUrl: string;
  };
  locale: string;
  twitterHandle?: string;
  trailingSlash: boolean;
}

export function getSiteConfig(env?: any): SiteConfig {
  const rawUrl = env?.SITE_URL || 'https://yoursite.com';
  const siteUrl = rawUrl.replace(/\/+$/, '');

  return {
    siteName: 'BananaBread',
    siteUrl,
    defaultDescription: 'Tested homemade recipes, artisan loaves, sweet bakes, and foolproof kitchen favorites crafted for the home kitchen.',
    defaultOgImage: `${siteUrl}/favicon.svg`,
    defaultAuthor: {
      name: 'BananaBread Kitchen',
      url: siteUrl,
      type: 'Organization'
    },
    publisher: {
      name: 'BananaBread Culinary Publication',
      url: siteUrl,
      logoUrl: `${siteUrl}/favicon.svg`
    },
    locale: 'en_US',
    twitterHandle: '@bananabread',
    trailingSlash: true
  };
}
