import type { GeneratedContent, LockedFacts } from '../normalization/types.ts';
import type { QualityIssue } from './types.ts';

const BANNED_CLICHES = [
  "whether you're making this for",
  "whether you are baking this for",
  "you will love how",
  "this recipe is perfect for any occasion",
  "this recipe is perfect for",
  "it's a delicious and easy way to",
  "one of the best things about this recipe",
  "look no further",
  "tantalize your taste buds",
  "in this comprehensive guide",
  "a culinary delight",
  "dive into",
  "bursting with flavor",
  "mouthwatering aroma",
  "a true crowd-pleaser",
  "let's dive in",
  "without further ado",
  "game-changer",
  "elevate your baking"
];

function toSafeString(val: any): string {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string') return val;
  if (Array.isArray(val)) return val.map(toSafeString).filter(Boolean).join(' ');
  if (typeof val === 'object') return Object.values(val).map(toSafeString).filter(Boolean).join(' ');
  return String(val || '');
}

/**
 * Checks for generic AI filler phrases and evaluates recipe specificity.
 */
export function checkFillerAndSpecificity(
  locked: LockedFacts,
  content: GeneratedContent
): QualityIssue[] {
  const issues: QualityIssue[] = [];

  const allEditorialText = [
    toSafeString(content.introduction),
    toSafeString(content.whyThisRecipe),
    toSafeString(content.tips),
    toSafeString(content.cookingGuidance),
    toSafeString(content.servingSuggestions),
    toSafeString(content.storage)
  ].join(' ');

  const lowerText = allEditorialText.toLowerCase();

  // 1. Detect Cliché AI openers and filler phrases
  const detectedCliches: string[] = [];
  for (const cliche of BANNED_CLICHES) {
    if (lowerText.includes(cliche)) {
      detectedCliches.push(cliche);
    }
  }

  if (detectedCliches.length > 0) {
    issues.push({
      type: 'FILLER',
      severity: detectedCliches.length > 2 ? 'MEDIUM' : 'LOW',
      message: `Detected generic AI filler phrases: "${detectedCliches.slice(0, 3).join('", "')}". Replace with recipe-specific technique guidance.`,
      expected: 'Recipe-specific culinary descriptions',
      found: detectedCliches.join(', ')
    });
  }

  // 2. Recipe Specificity Check
  // Ensure the prose contains concrete culinary terms related to baking / cooking the recipe
  const titleNoun = locked.title.toLowerCase().split(/\s+/)[0] || 'recipe';
  const specificityTerms = [
    'crust', 'crumb', 'moisture', 'browning', 'texture', 'toothpick', 'golden',
    'overmixing', 'cooling', 'batter', 'pan', 'slice', 'ripeness', 'mash', 'whisk', 'folding', 'aroma'
  ];

  const foundTerms = specificityTerms.filter(term => lowerText.includes(term));
  if (foundTerms.length < 3) {
    issues.push({
      type: 'RECIPE_SPECIFICITY',
      severity: 'MEDIUM',
      message: 'Editorial content lacks concrete culinary and technique specificity (e.g. crumb structure, doneness cues, mixing technique).',
      expected: 'At least 3 practical sensory or technique cues',
      found: `${foundTerms.length} specificity cues found (${foundTerms.join(', ') || 'none'})`
    });
  }

  // 3. Content Completeness Checks
  const introStr = typeof content.introduction === 'string'
    ? content.introduction
    : (content.introduction && typeof (content.introduction as any).introduction === 'string'
        ? (content.introduction as any).introduction
        : String(content.introduction || ''));

  if (!introStr || introStr.trim().length < 80) {
    issues.push({
      type: 'CONTENT_COMPLETENESS',
      severity: 'HIGH',
      section: 'Introduction',
      message: 'Introduction is missing or critically short (< 80 characters).',
      expected: 'Engaging introduction (> 80 characters)',
      found: `${introStr.length} characters`
    });
  }

  if (!content.tips || content.tips.length < 2) {
    issues.push({
      type: 'CONTENT_COMPLETENESS',
      severity: 'MEDIUM',
      section: 'Tips',
      message: 'Less than 2 pro tips were generated.',
      expected: 'Minimum 2-3 actionable pro tips',
      found: `${content.tips?.length || 0} tips`
    });
  }

  return issues;
}
