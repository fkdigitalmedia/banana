import type { GeneratedContent, ValidationResult } from '../normalization/types';
import { findBannedAiPhrases } from '../deepseek/validator';

/**
 * Calculates keyword density as percentage of total words.
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
 * Validates editorial content quality, lengths, AI cliches, and keyword density.
 */
export function validateContent(content: GeneratedContent, primaryKeyword = 'banana bread recipe'): ValidationResult {
  const issues: ValidationResult['issues'] = [];

  // 1. Introduction Check
  const introStr = typeof content.introduction === 'string'
    ? content.introduction
    : (content.introduction && typeof (content.introduction as any).introduction === 'string'
        ? (content.introduction as any).introduction
        : String(content.introduction || ''));

  if (!introStr || introStr.trim().length < 80) {
    issues.push({ level: 'error', message: 'Introduction is missing or too short (< 80 characters).' });
  }

  // 2. Ingredient Guidance Check
  if (!content.ingredientGuidance || content.ingredientGuidance.length === 0) {
    issues.push({ level: 'warning', message: 'No ingredient guidance generated.' });
  }

  // 3. Cooking Guidance Check
  if (!content.cookingGuidance || content.cookingGuidance.length === 0) {
    issues.push({ level: 'warning', message: 'No cooking technique guidance generated.' });
  }

  // 4. Pro Tips Check
  if (!content.tips || content.tips.length === 0) {
    issues.push({ level: 'warning', message: 'No pro baking tips were generated.' });
  } else if (content.tips.length < 3) {
    issues.push({ level: 'warning', message: `Only ${content.tips.length} tips generated (recommended at least 3).` });
  }

  // 5. FAQ Check
  if (!content.faq || content.faq.length === 0) {
    issues.push({ level: 'warning', message: 'No FAQ items were generated.' });
  } else if (content.faq.length < 3) {
    issues.push({ level: 'warning', message: `Only ${content.faq.length} FAQ items generated (recommended at least 3).` });
  }

  // 6. SEO Check
  if (!content.seo?.title || content.seo.title.trim().length === 0) {
    issues.push({ level: 'error', message: 'SEO Title is missing.' });
  }
  if (!content.seo?.metaDescription || content.seo.metaDescription.trim().length === 0) {
    issues.push({ level: 'error', message: 'Meta Description is missing.' });
  }
  if (!content.seo?.slug || content.seo.slug.trim().length === 0) {
    issues.push({ level: 'error', message: 'SEO Slug is missing.' });
  }

  // 7. Check for Banned AI Cliches in Introduction & Tips
  const allProse = [
    content.introduction,
    content.whyThisRecipe,
    ...(content.tips || []),
    ...(content.cookingGuidance || []),
    content.servingSuggestions,
    content.storage
  ].join(' ');

  const bannedFound = findBannedAiPhrases(allProse);
  if (bannedFound.length > 0) {
    issues.push({
      level: 'warning',
      message: `Detected generic AI cliches: "${bannedFound.join('", "')}". Consider editing or regenerating.`
    });
  }

  // 8. Keyword Stuffing Check (> 3.5% density)
  const density = calculateKeywordDensity(allProse, primaryKeyword);
  if (density > 3.5) {
    issues.push({
      level: 'warning',
      message: `Keyword density for "${primaryKeyword}" is high (${density.toFixed(1)}% > 3.5%). Avoid keyword stuffing.`
    });
  }

  return {
    passed: issues.filter(i => i.level === 'error').length === 0,
    issues
  };
}
