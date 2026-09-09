import { getSiteConfig } from './config';
import { getCanonicalUrl } from './canonical';

export interface PageMetadata {
  title: string;
  description: string;
  canonical: string;
  robots: string;
  og: {
    title: string;
    description: string;
    url: string;
    type: 'website' | 'article';
    image?: string;
    siteName: string;
  };
  twitter: {
    card: 'summary' | 'summary_large_image';
    title: string;
    description: string;
    image?: string;
    site?: string;
  };
}

export function generateRecipeMetadata(recipe: any, seo: any, siteUrl: string): PageMetadata {
  const config = getSiteConfig({ SITE_URL: siteUrl });
  const canonical = getCanonicalUrl(recipe.slug, config.siteUrl);

  const title = seo?.seo_title || `${recipe.title} Recipe`;
  const description = seo?.meta_description || recipe.description || `Make delicious ${recipe.title} with this tested homemade recipe.`;

  let image = config.defaultOgImage;
  if (recipe.hero_image_key) {
    image = `${config.siteUrl}/api/image/${recipe.hero_image_key}`;
  } else if (recipe.original_image_url) {
    image = recipe.original_image_url;
  }

  const isIndexable = recipe.status === 'PUBLISHED';

  return {
    title,
    description,
    canonical,
    robots: isIndexable ? 'index, follow' : 'noindex, nofollow',
    og: {
      title: seo?.og_title || title,
      description: seo?.og_description || description,
      url: canonical,
      type: 'article',
      image,
      siteName: config.siteName
    },
    twitter: {
      card: image ? 'summary_large_image' : 'summary',
      title: seo?.og_title || title,
      description: seo?.og_description || description,
      image,
      site: config.twitterHandle
    }
  };
}

export function generateCategoryMetadata(category: any, siteUrl: string, recipeCount = 0): PageMetadata {
  const config = getSiteConfig({ SITE_URL: siteUrl });
  const canonical = getCanonicalUrl(`recipes/${category.slug}`, config.siteUrl);

  const title = `${category.name} Recipes`;
  const description = category.description || `Explore our tested collection of delicious homemade ${category.name.toLowerCase()} recipes.`;

  // Protect thin categories from indexing if they have zero recipes
  const isIndexable = recipeCount > 0;

  return {
    title,
    description,
    canonical,
    robots: isIndexable ? 'index, follow' : 'noindex, follow',
    og: {
      title,
      description,
      url: canonical,
      type: 'website',
      image: config.defaultOgImage,
      siteName: config.siteName
    },
    twitter: {
      card: 'summary',
      title,
      description,
      image: config.defaultOgImage,
      site: config.twitterHandle
    }
  };
}

export function generatePageMetadata(
  opts: {
    title: string;
    description: string;
    path: string;
    noindex?: boolean;
    image?: string;
  },
  siteUrl: string
): PageMetadata {
  const config = getSiteConfig({ SITE_URL: siteUrl });
  const canonical = getCanonicalUrl(opts.path, config.siteUrl);

  return {
    title: opts.title,
    description: opts.description || config.defaultDescription,
    canonical,
    robots: opts.noindex ? 'noindex, nofollow' : 'index, follow',
    og: {
      title: opts.title,
      description: opts.description || config.defaultDescription,
      url: canonical,
      type: 'website',
      image: opts.image || config.defaultOgImage,
      siteName: config.siteName
    },
    twitter: {
      card: opts.image ? 'summary_large_image' : 'summary',
      title: opts.title,
      description: opts.description || config.defaultDescription,
      image: opts.image || config.defaultOgImage,
      site: config.twitterHandle
    }
  };
}
