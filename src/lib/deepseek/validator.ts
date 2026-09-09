/**
 * Validates DeepSeek generation outputs against structural and factual constraints.
 */

// Blacklisted AI filler cliches and generic marketing hooks (Prompt 17 hardened)
export const BANNED_AI_OPENERS = [
  "if you're looking for",
  "there's nothing better than",
  "look no further",
  "in this fast-paced world",
  "whether you're a beginner or",
  "whether you're",
  "perfect for",
  "this delicious recipe",
  "the best part is",
  "#1 recipe",
  "world's best",
  "guaranteed to",
  "award-winning",
  "delve into",
  "testament to",
  "game changer",
  "elevate your baking",
  "culinary journey",
  "bursting with flavor",
  "mouthwatering aroma",
  "baked to perfection",
  "without further ado",
  "dive right in",
  "in this article",
  "take your baking to the next level"
];

// Patterns that indicate formulaic, low-effort SEO titles
export const FORMULAIC_TITLE_PATTERNS = [
  /^best\s+[\w\s]+\s+recipe$/i,
  /^the\s+best\s+[\w\s]+\s+recipe$/i,
  /^easy\s+[\w\s]+\s+recipe$/i,
  /^#1\s+/i,
  /world'?s\s+best/i
];

export interface ValidationIssue {
  level: 'error' | 'warning';
  stage: string;
  field?: string;
  message: string;
}

/**
 * Checks text for banned generic AI filler phrases.
 */
export function findBannedAiPhrases(text: string): string[] {
  if (!text) return [];
  const lower = text.toLowerCase();
  return BANNED_AI_OPENERS.filter(phrase => lower.includes(phrase));
}

/**
 * Validates the editorial analysis output.
 */
export function validateAnalysisOutput(data: any): { valid: boolean; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = [];
  if (!data || typeof data !== 'object') {
    return { valid: false, issues: [{ level: 'error', stage: 'ANALYSIS', message: 'Analysis response is not an object.' }] };
  }

  if (!data.recipePositioning || typeof data.recipePositioning !== 'string') {
    issues.push({ level: 'warning', stage: 'ANALYSIS', field: 'recipePositioning', message: 'Missing recipe positioning.' });
  }
  if (!Array.isArray(data.keyTechniques) || data.keyTechniques.length === 0) {
    issues.push({ level: 'warning', stage: 'ANALYSIS', field: 'keyTechniques', message: 'Key techniques array is empty.' });
  }

  return { valid: issues.filter(i => i.level === 'error').length === 0, issues };
}

/**
 * Validates introduction text.
 */
export function validateIntroductionOutput(data: any): { valid: boolean; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = [];
  if (!data || typeof data !== 'object') {
    return { valid: false, issues: [{ level: 'error', stage: 'INTRODUCTION', message: 'Intro response is not an object.' }] };
  }

  const intro = data.introduction || '';
  if (typeof intro !== 'string' || intro.trim().length < 80) {
    issues.push({ level: 'error', stage: 'INTRODUCTION', field: 'introduction', message: 'Introduction is too short (< 80 chars).' });
  }

  const banned = findBannedAiPhrases(intro);
  if (banned.length > 0) {
    issues.push({ level: 'warning', stage: 'INTRODUCTION', field: 'introduction', message: `Intro contains generic AI cliches: ${banned.join(', ')}` });
  }

  return { valid: issues.filter(i => i.level === 'error').length === 0, issues };
}

/**
 * Validates SEO output.
 */
export function validateSeoOutput(data: any): { valid: boolean; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = [];
  if (!data || typeof data !== 'object') {
    return { valid: false, issues: [{ level: 'error', stage: 'SEO', message: 'SEO response is not an object.' }] };
  }

  if (!data.title || typeof data.title !== 'string') {
    issues.push({ level: 'error', stage: 'SEO', field: 'title', message: 'SEO title is missing.' });
  } else {
    if (data.title.length > 70) {
      issues.push({ level: 'warning', stage: 'SEO', field: 'title', message: `SEO title is longer than recommended (${data.title.length} > 70 chars).` });
    }
    for (const pattern of FORMULAIC_TITLE_PATTERNS) {
      if (pattern.test(data.title.trim())) {
        issues.push({ level: 'warning', stage: 'SEO', field: 'title', message: `Title "${data.title}" matches repetitive formulaic pattern. Use descriptive, unique culinary attributes.` });
        break;
      }
    }
  }

  if (!data.metaDescription || typeof data.metaDescription !== 'string') {
    issues.push({ level: 'error', stage: 'SEO', field: 'metaDescription', message: 'Meta description is missing.' });
  } else {
    if (data.metaDescription.length > 175) {
      issues.push({ level: 'warning', stage: 'SEO', field: 'metaDescription', message: `Meta description is longer than recommended (${data.metaDescription.length} > 175 chars).` });
    }
    const bannedClaims = ['#1 recipe', "world's best", 'guaranteed', 'award-winning'];
    const descLower = data.metaDescription.toLowerCase();
    for (const claim of bannedClaims) {
      if (descLower.includes(claim)) {
        issues.push({ level: 'warning', stage: 'SEO', field: 'metaDescription', message: `Meta description contains unsubstantiated promotional claim: "${claim}".` });
      }
    }
  }

  if (!data.slug || typeof data.slug !== 'string') {
    issues.push({ level: 'error', stage: 'SEO', field: 'slug', message: 'Slug is missing.' });
  }

  return { valid: issues.filter(i => i.level === 'error').length === 0, issues };
}
