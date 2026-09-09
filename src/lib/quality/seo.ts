import type { GeneratedContent } from '../normalization/types.ts';
import type { QualityIssue } from './types.ts';

/**
 * Calculates exact keyword density in editorial prose.
 */
function calculateKeywordDensity(text: string, keyword: string): number {
  if (!text || !keyword) return 0;
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 0;

  const kw = keyword.toLowerCase().trim();
  const kwWordsCount = kw.split(/\s+/).length;

  let matches = 0;
  for (let i = 0; i <= words.length - kwWordsCount; i++) {
    const slice = words.slice(i, i + kwWordsCount).join(' ');
    if (slice.includes(kw)) {
      matches++;
    }
  }

  return (matches * kwWordsCount / words.length) * 100;
}

/**
 * Evaluates SEO metadata quality, title cleanliness, and keyword stuffing.
 */
export function checkSeoQuality(
  content: GeneratedContent,
  primaryKeyword = 'banana bread recipe'
): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const seo = content.seo;

  if (!seo) {
    issues.push({
      type: 'SEO_QUALITY',
      severity: 'HIGH',
      message: 'SEO metadata object is missing.',
      expected: 'Valid SEO Title, Meta Description, and Slug',
      found: 'null'
    });
    return issues;
  }

  // 1. SEO Title Length & Cleanliness
  if (!seo.title || seo.title.trim().length === 0) {
    issues.push({
      type: 'SEO_QUALITY',
      severity: 'HIGH',
      message: 'SEO Title is missing.',
      expected: 'Clean SEO title (30-60 characters)',
      found: 'empty'
    });
  } else {
    if (seo.title.length > 65) {
      issues.push({
        type: 'SEO_QUALITY',
        severity: 'LOW',
        message: `SEO Title is slightly long (${seo.title.length} chars). Keep under 60 characters for optimal SERP display.`,
        expected: '<= 60 characters',
        found: `${seo.title.length} characters`
      });
    }

    // Title word repetition check (e.g. "Recipe Recipe" or "Banana Bread Recipe Banana Bread")
    const titleWords = seo.title.toLowerCase().split(/\s+/);
    for (let i = 0; i < titleWords.length - 1; i++) {
      if (titleWords[i].length > 3 && titleWords[i] === titleWords[i + 1]) {
        issues.push({
          type: 'SEO_QUALITY',
          severity: 'MEDIUM',
          message: `SEO Title contains duplicated word: "${titleWords[i]} ${titleWords[i]}".`,
          expected: 'Natural title phrasing without duplicate words',
          found: seo.title
        });
      }
    }
  }

  // 2. Meta Description Length
  if (!seo.metaDescription || seo.metaDescription.trim().length === 0) {
    issues.push({
      type: 'SEO_QUALITY',
      severity: 'HIGH',
      message: 'Meta description is missing.',
      expected: 'Compelling meta description (120-155 characters)',
      found: 'empty'
    });
  } else if (seo.metaDescription.length > 165) {
    issues.push({
      type: 'SEO_QUALITY',
      severity: 'LOW',
      message: `Meta description is long (${seo.metaDescription.length} chars). Search engines truncate over 155 characters.`,
      expected: '<= 155 characters',
      found: `${seo.metaDescription.length} characters`
    });
  }

  // 3. Keyword Stuffing Check in Article Prose
  const toSafeStr = (val: any) => {
    if (!val) return '';
    if (typeof val === 'string') return val;
    if (Array.isArray(val)) return val.map(String).join(' ');
    if (typeof val === 'object') return Object.values(val).map(String).join(' ');
    return String(val);
  };

  const allProse = [
    toSafeStr(content.introduction),
    toSafeStr(content.whyThisRecipe),
    toSafeStr(content.tips),
    toSafeStr(content.cookingGuidance),
    toSafeStr(content.servingSuggestions),
    toSafeStr(content.storage)
  ].join(' ');

  const density = calculateKeywordDensity(allProse, primaryKeyword);
  if (density > 3.5) {
    issues.push({
      type: 'KEYWORD_STUFFING',
      severity: 'MEDIUM',
      message: `Keyword density for "${primaryKeyword}" is high (${density.toFixed(1)}%). Optimal keyword density is 1.0% - 2.5%.`,
      expected: '<= 2.5% keyword density',
      found: `${density.toFixed(1)}%`
    });
  }

  return issues;
}
