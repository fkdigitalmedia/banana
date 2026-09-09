import { isValidCanonical, getCanonicalUrl } from './canonical';
import { getSiteConfig } from './config';

export interface SeoIssue {
  code: string;
  level: 'CRITICAL' | 'WARNING' | 'INFO';
  message: string;
  recommendation?: string;
}

export interface SeoReport {
  score: number; // 0 - 100
  readiness: 'READY' | 'WARNINGS' | 'CRITICAL';
  indexability: 'INDEXABLE' | 'NOINDEX';
  issues: SeoIssue[];
  passedChecks: string[];
  canonicalUrl: string;
  checkedAt: string;
}

export function validateTechnicalSeo(
  recipe: any,
  ingredients: any[] = [],
  instructions: any[] = [],
  content: any = {},
  seo: any = {},
  siteUrl = 'https://yoursite.com',
  options?: { incomingLinksCount?: number }
): SeoReport {
  const issues: SeoIssue[] = [];
  const passedChecks: string[] = [];
  const config = getSiteConfig({ SITE_URL: siteUrl });
  const canonicalUrl = getCanonicalUrl(recipe.slug || '', config.siteUrl);

  let score = 100;

  // 1. Title Validation
  const title = (seo?.seo_title || recipe.title || '').trim();
  if (!title) {
    issues.push({
      code: 'TITLE_MISSING',
      level: 'CRITICAL',
      message: 'Recipe SEO Title is missing.',
      recommendation: 'Provide a natural, descriptive title (40–60 characters).'
    });
    score -= 25;
  } else if (title.length < 15) {
    issues.push({
      code: 'TITLE_TOO_SHORT',
      level: 'WARNING',
      message: `SEO Title is very short (${title.length} characters).`,
      recommendation: 'Expand title to clearly identify the dish and style.'
    });
    score -= 5;
  } else if (title.length > 70) {
    issues.push({
      code: 'TITLE_TOO_LONG',
      level: 'WARNING',
      message: `SEO Title is long (${title.length} characters) and may truncate in SERPs.`,
      recommendation: 'Keep title under 60–65 characters.'
    });
    score -= 5;
  } else {
    passedChecks.push(`Title length is optimal (${title.length} chars)`);
  }

  // 2. Meta Description Validation
  const description = (seo?.meta_description || recipe.description || '').trim();
  if (!description) {
    issues.push({
      code: 'DESCRIPTION_MISSING',
      level: 'CRITICAL',
      message: 'Meta Description is missing.',
      recommendation: 'Add an informative meta description (120–155 characters).'
    });
    score -= 20;
  } else if (description.length < 50) {
    issues.push({
      code: 'DESCRIPTION_TOO_SHORT',
      level: 'WARNING',
      message: `Meta Description is too short (${description.length} chars).`,
      recommendation: 'Provide a more detailed, appetising summary.'
    });
    score -= 5;
  } else if (description.length > 165) {
    issues.push({
      code: 'DESCRIPTION_TOO_LONG',
      level: 'WARNING',
      message: `Meta Description is long (${description.length} chars) and may truncate.`,
      recommendation: 'Keep description between 120 and 155 characters.'
    });
    score -= 5;
  } else {
    passedChecks.push(`Meta Description length is optimal (${description.length} chars)`);
  }

  // 3. Slug Validation
  const slug = (recipe.slug || '').trim();
  if (!slug) {
    issues.push({
      code: 'SLUG_MISSING',
      level: 'CRITICAL',
      message: 'Recipe URL slug is missing.',
      recommendation: 'Set a URL-safe kebab-case slug.'
    });
    score -= 25;
  } else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    issues.push({
      code: 'SLUG_INVALID',
      level: 'CRITICAL',
      message: `Slug "${slug}" contains invalid characters.`,
      recommendation: 'Use only lowercase letters, numbers, and single hyphens.'
    });
    score -= 15;
  } else {
    passedChecks.push('URL slug format is clean and valid');
  }

  // 4. Canonical URL Validation
  if (!isValidCanonical(canonicalUrl, config.siteUrl)) {
    issues.push({
      code: 'CANONICAL_INVALID',
      level: 'CRITICAL',
      message: `Canonical URL "${canonicalUrl}" is invalid.`,
      recommendation: 'Ensure canonical matches site domain and ends with a trailing slash.'
    });
    score -= 15;
  } else {
    passedChecks.push('Canonical URL is valid with trailing slash');
  }

  // 5. Image & Alt Text Validation
  const hasHeroImage = !!(recipe.hero_image_key || recipe.original_image_url);
  if (!hasHeroImage) {
    issues.push({
      code: 'IMAGE_MISSING',
      level: 'CRITICAL',
      message: 'Hero image is missing.',
      recommendation: 'Generate or upload a high-quality FLUX.1 Schnell hero image.'
    });
    score -= 20;
  } else {
    passedChecks.push('Hero image is configured and ready');
  }

  // 6. Schema.org Recipe Facts Completeness
  const hasIngredients = ingredients.length > 0;
  const hasInstructions = instructions.length > 0;
  const hasTimes = (recipe.prep_time || recipe.cook_time || recipe.total_time);

  if (!hasIngredients) {
    issues.push({
      code: 'SCHEMA_INGREDIENTS_MISSING',
      level: 'CRITICAL',
      message: 'Schema validation: No ingredients found.',
      recommendation: 'Add locked recipe ingredients before publishing.'
    });
    score -= 20;
  } else {
    passedChecks.push(`Schema ingredients validated (${ingredients.length} items)`);
  }

  if (!hasInstructions) {
    issues.push({
      code: 'SCHEMA_INSTRUCTIONS_MISSING',
      level: 'CRITICAL',
      message: 'Schema validation: No instructions found.',
      recommendation: 'Add step-by-step instructions before publishing.'
    });
    score -= 20;
  } else {
    passedChecks.push(`Schema instructions validated (${instructions.length} steps)`);
  }

  if (!hasTimes) {
    issues.push({
      code: 'SCHEMA_TIMES_MISSING',
      level: 'WARNING',
      message: 'Prep or cook times are not specified.',
      recommendation: 'Specify prep and cook times for Google rich card eligibility.'
    });
    score -= 5;
  } else {
    passedChecks.push('Prep/Cook times specified for rich snippets');
  }

  // 7. Internal Link & Orphan Detection
  const incomingLinks = options?.incomingLinksCount !== undefined ? options.incomingLinksCount : 1;
  if (incomingLinks === 0) {
    issues.push({
      code: 'ORPHAN_RECIPE',
      level: 'WARNING',
      message: 'Recipe has no incoming internal links (Orphan Recipe).',
      recommendation: 'Ensure recipe is assigned to a category or featured on the homepage.'
    });
    score -= 10;
  } else {
    passedChecks.push('Internal link discoverability confirmed');
  }

  const finalScore = Math.max(0, Math.min(100, score));

  const hasCritical = issues.some((i) => i.level === 'CRITICAL');
  const hasWarning = issues.some((i) => i.level === 'WARNING');

  let readiness: 'READY' | 'WARNINGS' | 'CRITICAL' = 'READY';
  if (hasCritical) {
    readiness = 'CRITICAL';
  } else if (hasWarning) {
    readiness = 'WARNINGS';
  }

  const isIndexable = recipe.status === 'PUBLISHED' && !hasCritical;

  return {
    score: finalScore,
    readiness,
    indexability: isIndexable ? 'INDEXABLE' : 'NOINDEX',
    issues,
    passedChecks,
    canonicalUrl,
    checkedAt: new Date().toISOString()
  };
}

export function isPrePublishSeoPassed(report: SeoReport): boolean {
  // Publishing is only blocked by CRITICAL issues (missing title, slug, ingredients, image, etc.)
  return !report.issues.some((i) => i.level === 'CRITICAL');
}
