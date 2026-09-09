import { getSiteConfig } from './config';
import { getCanonicalUrl } from './canonical';

/**
 * Generates Schema.org Recipe JSON-LD for rich Google recipe search results.
 * Strictly adheres to locked D1 recipe facts.
 * Never fabricates ratings, reviews, fake authors, or artificial timestamps.
 */
export function generateRecipeSchema(
  recipe: any,
  ingredients: any[],
  instructions: any[],
  content: any,
  seo: any,
  siteUrl: string
): any {
  const config = getSiteConfig({ SITE_URL: siteUrl });
  const recipeUrl = getCanonicalUrl(recipe.slug, config.siteUrl);

  const schema: Record<string, any> = {
    '@context': 'https://schema.org',
    '@type': 'Recipe',
    name: seo?.seo_title || recipe.title,
    headline: seo?.seo_title || recipe.title,
    description: seo?.meta_description || recipe.description,
    url: recipeUrl,
    mainEntityOfPage: recipeUrl,
    author: {
      '@type': config.defaultAuthor.type,
      name: config.defaultAuthor.name,
      url: config.defaultAuthor.url
    },
    publisher: {
      '@type': 'Organization',
      name: config.publisher.name,
      url: config.publisher.url,
      logo: {
        '@type': 'ImageObject',
        url: config.publisher.logoUrl
      }
    },
    datePublished: recipe.published_at || recipe.created_at,
    dateModified: recipe.updated_at || recipe.created_at,
    recipeIngredient: (ingredients || []).map((i) => {
      if (i.original_text) return i.original_text;
      const parts = [i.quantity, i.unit, i.name].filter(Boolean);
      return parts.join(' ').trim() + (i.notes ? ` (${i.notes})` : '');
    }),
    recipeInstructions: (instructions || []).map((i) => ({
      '@type': 'HowToStep',
      name: `Step ${i.step_number}`,
      text: i.instruction,
      url: `${recipeUrl}#step-${i.step_number}`
    }))
  };

  // Image URL
  if (recipe.hero_image_key) {
    schema.image = `${config.siteUrl}/api/image/${recipe.hero_image_key}`;
  } else if (recipe.original_image_url) {
    schema.image = recipe.original_image_url;
  }

  // Durations (ISO 8601)
  if (recipe.prep_time && recipe.prep_time > 0) {
    schema.prepTime = `PT${recipe.prep_time}M`;
  }
  if (recipe.cook_time && recipe.cook_time > 0) {
    schema.cookTime = `PT${recipe.cook_time}M`;
  }
  if (recipe.total_time && recipe.total_time > 0) {
    schema.totalTime = `PT${recipe.total_time}M`;
  } else if (recipe.prep_time && recipe.cook_time) {
    schema.totalTime = `PT${recipe.prep_time + recipe.cook_time}M`;
  }

  // Yield & Servings
  if (recipe.servings || recipe.yield_text) {
    schema.recipeYield = recipe.yield_text || String(recipe.servings);
  }

  // Category & Cuisine
  if (recipe.category_name) {
    schema.recipeCategory = recipe.category_name;
  }
  if (recipe.cuisine) {
    schema.recipeCuisine = recipe.cuisine;
  }

  // Keywords
  if (recipe.keywords) {
    try {
      const kw = typeof recipe.keywords === 'string' && recipe.keywords.startsWith('[')
        ? JSON.parse(recipe.keywords)
        : recipe.keywords;
      if (Array.isArray(kw) && kw.length > 0) {
        schema.keywords = kw.join(', ');
      } else if (typeof kw === 'string') {
        schema.keywords = kw;
      }
    } catch {
      schema.keywords = String(recipe.keywords);
    }
  }

  // Nutrition (only if real extracted data exists)
  if (recipe.nutrition) {
    try {
      const nut = typeof recipe.nutrition === 'string' ? JSON.parse(recipe.nutrition) : recipe.nutrition;
      if (nut && typeof nut === 'object' && Object.keys(nut).length > 0) {
        schema.nutrition = {
          '@type': 'NutritionInformation',
          ...nut
        };
      }
    } catch {}
  }

  return schema;
}

/**
 * Generates Schema.org BreadcrumbList JSON-LD.
 */
export function generateBreadcrumbSchema(items: { name: string; url: string }[]): any {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url
    }))
  };
}

/**
 * Generates Schema.org WebSite JSON-LD with Sitelinks SearchBox.
 */
export function generateWebSiteSchema(siteUrl: string): any {
  const config = getSiteConfig({ SITE_URL: siteUrl });
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: config.siteName,
    url: `${config.siteUrl}/`,
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${config.siteUrl}/search/?q={search_term_string}`
      },
      'query-input': 'required name=search_term_string'
    }
  };
}

/**
 * Generates Schema.org Organization JSON-LD.
 */
export function generateOrganizationSchema(siteUrl: string): any {
  const config = getSiteConfig({ SITE_URL: siteUrl });
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: config.siteName,
    url: `${config.siteUrl}/`,
    logo: config.publisher.logoUrl
  };
}
