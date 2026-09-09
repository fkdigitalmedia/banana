export interface MetaResult {
  title: string;
  description: string;
  canonical: string;
  og: {
    title: string;
    description: string;
    url: string;
    type: string;
    image?: string;
  };
  twitter: {
    card: string;
    title: string;
    description: string;
    image?: string;
  };
}

export function generateMeta(recipe: any, seo: any, siteUrl: string): MetaResult {
  const cleanBase = siteUrl.replace(/\/+$/, '');
  const title = seo?.seo_title || `${recipe.title} - BananaBread`;
  const description = seo?.meta_description || recipe.description || `Make delicious ${recipe.title} with this easy, tested recipe.`;
  const canonical = seo?.canonical_url || `${cleanBase}/${recipe.slug}/`;

  let image: string | undefined = undefined;
  if (recipe.hero_image_key) {
    image = `${cleanBase}/api/image/${recipe.hero_image_key}`;
  } else if (recipe.original_image_url) {
    image = recipe.original_image_url;
  }

  return {
    title,
    description,
    canonical,
    og: {
      title: seo?.og_title || title,
      description: seo?.og_description || description,
      url: canonical,
      type: 'article',
      image
    },
    twitter: {
      card: image ? 'summary_large_image' : 'summary',
      title: seo?.og_title || title,
      description: seo?.og_description || description,
      image
    }
  };
}
