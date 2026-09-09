/**
 * Generates Schema.org Recipe JSON-LD for rich Google recipe cards.
 * Never fabricates ratings, reviews, author names, or fake dates.
 */
export function generateRecipeJsonLd(
  recipe: any,
  ingredients: any[],
  instructions: any[],
  content: any,
  seo: any,
  siteUrl = 'https://yoursite.com',
  author?: any
): string {
  const recipeUrl = `${siteUrl.replace(/\/+$/, '')}/${recipe.slug}/`;

  let authorSchema: any = {
    '@type': 'Organization',
    name: 'BananaBread Editorial Team',
    url: siteUrl
  };

  if (author && author.name) {
    const avatarFullUrl = author.avatar_url
      ? (author.avatar_url.startsWith('http') ? author.avatar_url : `${siteUrl.replace(/\/+$/, '')}${author.avatar_url}`)
      : undefined;

    const socials = [
      author.social_instagram,
      author.social_pinterest,
      author.social_youtube,
      author.social_facebook,
      author.social_twitter,
      author.website_url
    ].filter(Boolean);

    authorSchema = {
      '@type': 'Person',
      name: author.name,
      jobTitle: author.role_title || 'Recipe Developer',
      ...(avatarFullUrl ? { image: avatarFullUrl } : {}),
      ...(author.website_url ? { url: author.website_url } : { url: siteUrl }),
      ...(socials.length > 0 ? { sameAs: socials } : {})
    };
  }

  const jsonLd: any = {
    '@context': 'https://schema.org',
    '@type': 'Recipe',
    name: seo?.seo_title || recipe.title,
    description: seo?.meta_description || recipe.description,
    url: recipeUrl,
    mainEntityOfPage: recipeUrl,
    author: authorSchema,
    datePublished: recipe.published_at || recipe.created_at,
    dateModified: recipe.updated_at || recipe.created_at,
    recipeIngredient: (ingredients || []).map(i => {
      if (i.original_text) return i.original_text;
      const parts = [i.quantity, i.unit, i.name].filter(Boolean);
      return parts.join(' ').trim() + (i.notes ? ` (${i.notes})` : '');
    }),
    recipeInstructions: (instructions || []).map(i => ({
      '@type': 'HowToStep',
      name: `Step ${i.step_number}`,
      text: i.instruction,
      url: `${recipeUrl}#step-${i.step_number}`
    }))
  };

  // Image
  if (recipe.hero_image_key) {
    jsonLd.image = `${siteUrl}/api/image/${recipe.hero_image_key}`;
  } else if (recipe.original_image_url) {
    jsonLd.image = recipe.original_image_url;
  }

  // Durations (ISO 8601)
  if (recipe.prep_time && recipe.prep_time > 0) {
    jsonLd.prepTime = `PT${recipe.prep_time}M`;
  }
  if (recipe.cook_time && recipe.cook_time > 0) {
    jsonLd.cookTime = `PT${recipe.cook_time}M`;
  }
  if (recipe.total_time && recipe.total_time > 0) {
    jsonLd.totalTime = `PT${recipe.total_time}M`;
  } else if (recipe.prep_time && recipe.cook_time) {
    jsonLd.totalTime = `PT${recipe.prep_time + recipe.cook_time}M`;
  }

  // Yield & Servings
  if (recipe.servings || recipe.yield_text) {
    jsonLd.recipeYield = recipe.yield_text || String(recipe.servings);
  }

  // Category & Cuisine
  if (recipe.category_name) {
    jsonLd.recipeCategory = recipe.category_name;
  }
  if (recipe.cuisine) {
    jsonLd.recipeCuisine = recipe.cuisine;
  }

  // Keywords
  if (recipe.keywords) {
    try {
      const kw = typeof recipe.keywords === 'string' && recipe.keywords.startsWith('[')
        ? JSON.parse(recipe.keywords)
        : recipe.keywords;
      if (Array.isArray(kw) && kw.length > 0) {
        jsonLd.keywords = kw.join(', ');
      } else if (typeof kw === 'string') {
        jsonLd.keywords = kw;
      }
    } catch {
      jsonLd.keywords = String(recipe.keywords);
    }
  }

  // Nutrition (only if real extracted data exists)
  if (recipe.nutrition) {
    try {
      const nut = typeof recipe.nutrition === 'string' ? JSON.parse(recipe.nutrition) : recipe.nutrition;
      if (nut && typeof nut === 'object' && Object.keys(nut).length > 0) {
        jsonLd.nutrition = {
          '@type': 'NutritionInformation',
          ...nut
        };
      }
    } catch {}
  }

  return JSON.stringify(jsonLd);
}

/**
 * Generates Schema.org BreadcrumbList JSON-LD.
 */
export function generateBreadcrumbJsonLd(items: { name: string; url: string }[]): string {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url
    }))
  };
  return JSON.stringify(jsonLd);
}
