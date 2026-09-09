import * as cheerio from 'cheerio';

export interface ExtractedImageResult {
  url: string;
  source: 'json-ld' | 'og' | 'html';
  placement?: 'HERO' | 'STEP' | 'ARTICLE';
  alt?: string;
  caption?: string;
  width?: number;
  height?: number;
  stepNumber?: number;
}

export interface AllExtractedImagesResult {
  hero: ExtractedImageResult | null;
  inArticle: ExtractedImageResult[];
}

const REJECT_URL_PATTERNS = [
  /logo/i,
  /favicon/i,
  /avatar/i,
  /gravatar/i,
  /profile/i,
  /author/i,
  /tracking/i,
  /pixel/i,
  /analytics/i,
  /doubleclick/i,
  /googleads/i,
  /ad[_\-]?server/i,
  /[\/._\-]ads?[\/._\-]/i,
  /\bbanners?\b/i,
  /badge/i,
  /icon/i,
  /spinner/i,
  /button/i,
  /placeholder/i,
  /\.svg(?:\?.*)?$/i,
  /\.ico(?:\?.*)?$/i,
  /\.gif(?:\?.*)?$/i,
  /\b1x1\b/i,
  /\b50x50\b/i,
  /\b100x100\b/i,
  /\b150x150\b/i,
  /wp-includes/i,
  /pinterest/i,
  /facebook/i,
  /twitter/i,
  /instagram/i
];

/**
 * Normalizes an extracted image URL against the source page origin.
 * Resolves relative and protocol-relative URLs, unescapes entities.
 */
export function normalizeImageUrl(rawUrl: string, pageUrl: string): string | null {
  if (!rawUrl || typeof rawUrl !== 'string') return null;

  let cleaned = rawUrl.trim().replace(/&amp;/g, '&');
  if (!cleaned || cleaned.startsWith('data:')) return null;

  try {
    if (cleaned.startsWith('//')) {
      const pageProto = pageUrl.startsWith('http:') ? 'http:' : 'https:';
      cleaned = `${pageProto}${cleaned}`;
    }

    const resolved = new URL(cleaned, pageUrl);
    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') {
      return null;
    }

    return resolved.href;
  } catch {
    return null;
  }
}

/**
 * Tests whether a URL is a valid, high-confidence recipe food image.
 */
export function isValidRecipeImageUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  if (!url.startsWith('http://') && !url.startsWith('https://')) return false;

  for (const pattern of REJECT_URL_PATTERNS) {
    if (pattern.test(url)) {
      return false;
    }
  }

  return true;
}

/**
 * Extracts candidate image URLs from JSON-LD Recipe data.
 * Supports string, array, ImageObject, and array of ImageObjects.
 */
function extractJsonLdImages(jsonLdRecipe: any, pageUrl: string): ExtractedImageResult[] {
  if (!jsonLdRecipe || !jsonLdRecipe.image) return [];

  const candidates: ExtractedImageResult[] = [];
  const rawImage = jsonLdRecipe.image;

  const processItem = (item: any) => {
    if (!item) return;

    if (typeof item === 'string') {
      const norm = normalizeImageUrl(item, pageUrl);
      if (norm && isValidRecipeImageUrl(norm)) {
        candidates.push({ url: norm, source: 'json-ld' });
      }
    } else if (typeof item === 'object') {
      const url = item.url || item.contentUrl;
      if (url && typeof url === 'string') {
        const norm = normalizeImageUrl(url, pageUrl);
        if (norm && isValidRecipeImageUrl(norm)) {
          candidates.push({
            url: norm,
            source: 'json-ld',
            width: typeof item.width === 'number' ? item.width : parseInt(item.width, 10) || undefined,
            height: typeof item.height === 'number' ? item.height : parseInt(item.height, 10) || undefined,
            alt: item.caption || item.description || undefined
          });
        }
      }
    }
  };

  if (Array.isArray(rawImage)) {
    for (const img of rawImage) {
      processItem(img);
    }
  } else {
    processItem(rawImage);
  }

  return candidates;
}

/**
 * Extracts OpenGraph image tag.
 */
function extractOgImage($: cheerio.CheerioAPI, pageUrl: string): ExtractedImageResult | null {
  const ogUrl = $('meta[property="og:image"]').attr('content') ||
                $('meta[name="og:image"]').attr('content') ||
                $('meta[property="og:image:url"]').attr('content');

  if (ogUrl) {
    const norm = normalizeImageUrl(ogUrl, pageUrl);
    if (norm && isValidRecipeImageUrl(norm)) {
      const alt = $('meta[property="og:image:alt"]').attr('content') || undefined;
      return { url: norm, source: 'og', alt };
    }
  }

  return null;
}

/**
 * Normalizes a URL to a canonical key by removing resolution suffixes (-300x200) and query parameters.
 */
function getBaseImageKey(url: string): string {
  try {
    const u = new URL(url);
    return (u.origin + u.pathname).replace(/-\d+x\d+(?=\.[a-z]+$)/i, '').toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

/**
 * Extracts step images from JSON-LD recipe instructions.
 */
function extractJsonLdStepImages(jsonLdRecipe: any, pageUrl: string): ExtractedImageResult[] {
  if (!jsonLdRecipe) return [];
  const candidates: ExtractedImageResult[] = [];
  const instructions = jsonLdRecipe.recipeInstructions;
  if (!Array.isArray(instructions)) return candidates;

  const processStep = (step: any, stepIndex: number) => {
    if (!step) return;
    if (step['@type'] === 'HowToSection' && Array.isArray(step.itemListElement)) {
      step.itemListElement.forEach((s: any, idx: number) => processStep(s, idx + 1));
      return;
    }
    const rawImg = step.image;
    if (!rawImg) return;

    let imgUrl: string | undefined;
    if (typeof rawImg === 'string') {
      imgUrl = rawImg;
    } else if (typeof rawImg === 'object' && rawImg !== null) {
      imgUrl = rawImg.url || rawImg.contentUrl;
    } else if (Array.isArray(rawImg) && rawImg[0]) {
      const first = rawImg[0];
      imgUrl = typeof first === 'string' ? first : (first.url || first.contentUrl);
    }

    if (imgUrl && typeof imgUrl === 'string') {
      const norm = normalizeImageUrl(imgUrl, pageUrl);
      if (norm && isValidRecipeImageUrl(norm)) {
        candidates.push({
          url: norm,
          source: 'json-ld',
          placement: 'STEP',
          stepNumber: stepIndex,
          alt: step.name || (typeof step.text === 'string' ? step.text.slice(0, 120) : `Step ${stepIndex}`)
        });
      }
    }
  };

  instructions.forEach((step, idx) => processStep(step, idx + 1));
  return candidates;
}

/**
 * Extracts all relevant recipe images:
 * - 1 Hero image
 * - Up to 8 high-quality in-article process / step photos
 */
export function extractAllRecipeImages(
  html: string,
  jsonLdRecipe: any,
  pageUrl: string
): AllExtractedImagesResult {
  const hero = extractBestRecipeImage(html, jsonLdRecipe, pageUrl);
  if (hero) {
    hero.placement = 'HERO';
  }

  const inArticle: ExtractedImageResult[] = [];
  const seenKeys = new Set<string>();

  if (hero) {
    seenKeys.add(getBaseImageKey(hero.url));
  }

  // 1. Check JSON-LD Step Images
  const jsonLdSteps = extractJsonLdStepImages(jsonLdRecipe, pageUrl);
  for (const stepImg of jsonLdSteps) {
    const key = getBaseImageKey(stepImg.url);
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      inArticle.push(stepImg);
    }
  }

  // 2. Check additional JSON-LD images (if recipe.image is an array)
  if (jsonLdRecipe && Array.isArray(jsonLdRecipe.image)) {
    const extraJsonLd = extractJsonLdImages(jsonLdRecipe, pageUrl);
    for (const extra of extraJsonLd) {
      const key = getBaseImageKey(extra.url);
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        inArticle.push({
          ...extra,
          placement: 'ARTICLE',
          alt: extra.alt || 'Recipe photo'
        });
      }
    }
  }

  // 3. Extract In-Article Process Images from HTML
  if (html) {
    const $ = cheerio.load(html);

    const contentSelectors = [
      '.entry-content',
      '.post-content',
      'article .content',
      '.recipe-content',
      'article'
    ];

    let $content: cheerio.Cheerio<cheerio.Element> | null = null;
    for (const sel of contentSelectors) {
      const found = $(sel);
      if (found.length > 0) {
        $content = found.first();
        break;
      }
    }

    if (!$content) $content = $('body');

    const ignoreSelectors = [
      'header', 'footer', 'nav', '.sidebar', '.widget', '.author-box', '.author-bio',
      '#comments', '.comments', '.comment-list', '.social-share', '.sharedaddy',
      '.jp-relatedposts', '.wp-block-latest-posts', '.advertisement', '.ad-container',
      'aside', '.tasty-recipes-image', '.wprm-recipe-image'
    ];

    $content.find('img').each((_, el) => {
      if (inArticle.length >= 8) return; // Cap at 8 process images

      const $el = $(el);

      // Skip ignored container contents
      if ($el.closest(ignoreSelectors.join(', ')).length > 0) {
        return;
      }

      const rawSrc = $el.attr('data-orig-file') ||
                     $el.attr('data-full-url') ||
                     $el.attr('data-lazy-src') ||
                     $el.attr('data-src') ||
                     $el.attr('src');

      if (!rawSrc) return;

      const norm = normalizeImageUrl(rawSrc, pageUrl);
      if (!norm || !isValidRecipeImageUrl(norm)) return;

      const alt = ($el.attr('alt') || '').trim();
      if (/avatar|headshot|author|profile|logo|pinterest|pin it/i.test(alt)) return;

      const width = parseInt($el.attr('width') || '0', 10) || undefined;
      const height = parseInt($el.attr('height') || '0', 10) || undefined;
      if (width && height && (width < 250 || height < 200)) return;

      const key = getBaseImageKey(norm);
      if (seenKeys.has(key)) return;
      seenKeys.add(key);

      const caption = $el.closest('figure').find('figcaption').text().trim() ||
                      $el.siblings('.wp-caption-text').text().trim() || undefined;

      let stepNumber: number | undefined;
      const parentText = $el.closest('li, .wprm-recipe-instruction, .instruction-step').text();
      const stepMatch = (alt + ' ' + (caption || '') + ' ' + parentText).match(/\bstep\s*(\d+)\b/i);
      if (stepMatch) {
        stepNumber = parseInt(stepMatch[1], 10);
      }

      inArticle.push({
        url: norm,
        source: 'html',
        placement: stepNumber ? 'STEP' : 'ARTICLE',
        stepNumber,
        alt: alt || caption || 'Recipe process photo',
        caption,
        width,
        height
      });
    });
  }

  return {
    hero,
    inArticle: inArticle.slice(0, 8)
  };
}

/**
 * Extracts recipe image from semantic HTML elements.
 */
function extractHtmlImages($: cheerio.CheerioAPI, pageUrl: string): ExtractedImageResult[] {
  const candidates: ExtractedImageResult[] = [];

  const selectors = [
    '.wprm-recipe-image img',
    '.tasty-recipes-image img',
    '[itemprop="image"]',
    '.recipe-image img',
    '.featured-image img',
    '.post-thumbnail img',
    'article img.entry-thumb',
    '.entry-content img'
  ];

  for (const sel of selectors) {
    const els = $(sel);
    els.each((_, el) => {
      const $el = $(el);
      const rawSrc = $el.attr('data-orig-file') ||
                     $el.attr('data-lazy-src') ||
                     $el.attr('data-src') ||
                     $el.attr('src');

      if (rawSrc) {
        const norm = normalizeImageUrl(rawSrc, pageUrl);
        if (norm && isValidRecipeImageUrl(norm)) {
          const width = parseInt($el.attr('width') || '0', 10) || undefined;
          const height = parseInt($el.attr('height') || '0', 10) || undefined;
          const alt = $el.attr('alt') || undefined;

          // Reject tiny images if dimensions specified
          if (width && height && (width < 200 || height < 200)) {
            return;
          }

          candidates.push({
            url: norm,
            source: 'html',
            width,
            height,
            alt
          });
        }
      }
    });
  }

  return candidates;
}

/**
 * Main Image Extractor.
 * Strictly adheres to source priority:
 * 1. Recipe JSON-LD image
 * 2. OpenGraph image
 * 3. Semantic HTML recipe image
 * 4. General on-page food image
 */
export function extractBestRecipeImage(
  html: string,
  jsonLdRecipe: any,
  pageUrl: string
): ExtractedImageResult | null {
  // 1. Check Recipe JSON-LD images
  const jsonLdImages = extractJsonLdImages(jsonLdRecipe, pageUrl);
  if (jsonLdImages.length > 0) {
    // Prefer the largest or 16:9 image if multiple available
    const scored = jsonLdImages.map(img => {
      let score = 50;
      if (img.width && img.height) {
        score += Math.min(30, Math.floor(img.width / 50));
        const ratio = img.width / img.height;
        if (ratio >= 1.3 && ratio <= 1.8) score += 20; // Preferred landscape ratio
      }
      return { img, score };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored[0].img;
  }

  if (!html) return null;
  const $ = cheerio.load(html);

  // 2. Check OpenGraph image
  const ogImage = extractOgImage($, pageUrl);
  if (ogImage) {
    return ogImage;
  }

  // 3. Check Semantic HTML images
  const htmlImages = extractHtmlImages($, pageUrl);
  if (htmlImages.length > 0) {
    return htmlImages[0];
  }

  return null;
}
