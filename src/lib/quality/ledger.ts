import type { LockedFacts, GeneratedContent, ClaimLedgerEntry } from '../normalization/types.ts';
import type { QualityIssue } from './types.ts';

export interface ClaimLedgerResult {
  ledger: ClaimLedgerEntry[];
  issues: QualityIssue[];
  metrics: {
    totalClaims: number;
    supportedClaims: number;
    unsupportedClaims: number;
    sourceAuthorClaims: number;
    methodContradictions: number;
  };
}

function toSafeString(val: any): string {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string') return val;
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  if (Array.isArray(val)) {
    return val.map(toSafeString).filter(Boolean).join(' ');
  }
  if (typeof val === 'object') {
    if (typeof val.text === 'string') return val.text;
    if (typeof val.content === 'string') return val.content;
    if (typeof val.description === 'string') return val.description;
    return Object.values(val).map(toSafeString).filter(Boolean).join(' ');
  }
  return String(val || '');
}

/**
 * Deterministic Claim Ledger & Fact Boundary Verifier (v2).
 * Verifies that all method, dietary, storage, and social proof claims
 * in AI-generated editorial content are strictly supported by the Locked Recipe Facts.
 */
export function extractClaimLedger(
  locked: LockedFacts,
  content: GeneratedContent
): ClaimLedgerResult {
  const ledger: ClaimLedgerEntry[] = [];
  const issues: QualityIssue[] = [];

  const sections: Array<{ name: string; text: string }> = [
    { name: 'Introduction', text: toSafeString(content.introduction) },
    { name: 'Why You\'ll Love It', text: toSafeString(content.whyThisRecipe) },
    { name: 'Cooking Guidance', text: toSafeString(content.cookingGuidance) },
    { name: 'Tips', text: toSafeString(content.tips) },
    { name: 'Variations', text: Array.isArray(content.variations) ? content.variations.map(v => `${toSafeString(v?.name)}: ${toSafeString(v?.description)}`).join(' ') : toSafeString(content.variations) },
    { name: 'Serving Suggestions', text: toSafeString(content.servingSuggestions) },
    { name: 'Storage', text: toSafeString(content.storage) },
    { name: 'FAQ', text: Array.isArray(content.faq) ? content.faq.map(f => `${toSafeString(f?.question)} ${toSafeString(f?.answer)}`).join(' ') : toSafeString(content.faq) },
    { name: 'Full Article', text: toSafeString((content as any).fullArticle) }
  ];

  // 1. METHOD CLAIMS: Single-bowl vs Multi-bowl
  const oneBowlRegex = /\b(?:one[\s\-]bowl|single[\s\-]bowl|one[\s\-]pot)\b/i;
  for (const sec of sections) {
    const text = toSafeString(sec.text);
    if (!text || typeof text.match !== 'function') continue;
    const match = text.match(oneBowlRegex);
    if (match) {
      if (!locked.isOneBowl && locked.bowlCount > 1) {
        ledger.push({
          claim: match[0],
          type: 'METHOD_CLAIM',
          supported: false,
          evidence: `Recipe instructions require ${locked.bowlCount} mixing vessels (e.g. separate dry and wet ingredient bowls).`,
          section: sec.name
        });
        issues.push({
          type: 'METHOD_CONTRADICTION',
          severity: 'HIGH',
          section: sec.name,
          message: `Generated prose claims "${match[0]}", but recipe instructions use ${locked.bowlCount} mixing bowls.`,
          expected: `Multi-bowl preparation (${locked.bowlCount} vessels)`,
          found: match[0]
        });
      } else {
        ledger.push({
          claim: match[0],
          type: 'METHOD_CLAIM',
          supported: true,
          evidence: 'Verified single mixing vessel used in recipe instructions.',
          section: sec.name
        });
      }
    }
  }

  // 2. FORBIDDEN SOURCE-AUTHOR PROSE & SOCIAL PROOF
  const socialProofPatterns = [
    { pattern: /\b\d{1,3}(?:,\d{3})*\+?\s*(?:reviews?|ratings?|stars?|five[\s\-]star\s+reviews?)\b/i, name: 'Review/Rating claim' },
    { pattern: /\b(?:featured\s+in\s+(?:my|our)\s+cookbook|in\s+(?:my|our)\s+(?:debut\s+)?cookbook|(?:my|our)\s+cookbook|published\s+cookbook|bestselling\s+cookbook)\b/i, name: 'Cookbook reference' },
    { pattern: /\b(?:went\s+viral|viral\s+hit|viral\s+recipe|internet\s+famous|readers?'?\s+favorite|most\s+popular\s+recipe\s+on\s+(?:my|our)\s+blog)\b/i, name: 'Viral/Popularity claim' },
    { pattern: /\b(?:world'?s\s+best(?:\s+recipe)?|absolute\s+best\s+recipe\s+on\s+the\s+internet)\b/i, name: 'Unsubstantiated superlative' },
    { pattern: /\b(?:my\s+husband|my\s+kids|my\s+grandma|my\s+grandmother|my\s+mother's\s+secret|in\s+my\s+kitchen\s+for\s+years|when\s+I\s+was\s+growing\s+up)\b/i, name: 'Source author personal narrative' }
  ];

  for (const sec of sections) {
    const text = toSafeString(sec.text);
    if (!text || typeof text.match !== 'function') continue;
    for (const rule of socialProofPatterns) {
      const match = text.match(rule.pattern);
      if (match) {
        ledger.push({
          claim: match[0],
          type: 'SOURCE_SOCIAL_PROOF',
          supported: false,
          evidence: `Forbidden claim category (${rule.name}): DeepSeek transferred source-author narrative or fabricated social proof.`,
          section: sec.name
        });
        issues.push({
          type: 'SOURCE_CLAIM_TRANSFER',
          severity: 'HIGH',
          section: sec.name,
          message: `Forbidden source-author or social proof claim: "${match[0]}" (${rule.name}).`,
          expected: 'Author-neutral editorial tone based solely on locked recipe facts.',
          found: match[0]
        });
      }
    }
  }

  // 3. DIETARY & ALLERGEN CLAIMS
  const lockedIngNames = (locked.ingredients || []).map(i => (i.name || '').toLowerCase());
  const hasGlutenFlour = lockedIngNames.some(name =>
    (name.includes('flour') || name.includes('wheat') || name.includes('bread flour') || name.includes('all-purpose')) &&
    !name.includes('gluten-free') && !name.includes('almond flour') && !name.includes('coconut flour') && !name.includes('oat flour')
  );
  const hasDairy = lockedIngNames.some(name =>
    (name.includes('butter') || name.includes('milk') || name.includes('sour cream') || name.includes('cream cheese') || name.includes('yogurt') || name.includes('heavy cream')) &&
    !name.includes('dairy-free') && !name.includes('vegan') && !name.includes('plant-based')
  );
  const hasEggsOrAnimal = lockedIngNames.some(name =>
    name.includes('egg') || name.includes('honey') || hasDairy
  );

  for (const sec of sections) {
    const text = toSafeString(sec.text);
    const lower = text.toLowerCase();

    // Gluten-free claim check (excluding optional variation suggestions, FAQ, and composite full article)
    if (/\b(?:gluten[\s\-]free)\b/.test(lower) && hasGlutenFlour && !sec.name.includes('Variation') && !sec.name.includes('FAQ') && !sec.name.includes('Full Article')) {
      const isContextualizedOptional = 
        lower.includes('for a gluten-free') ||
        lower.includes('gluten-free option') ||
        lower.includes('gluten-free variation') ||
        lower.includes('gluten-free version') ||
        lower.includes('to make it gluten-free') ||
        lower.includes('substitute gluten-free') ||
        lower.includes('1:1 gluten-free') ||
        lower.includes('gluten-free flour blend') ||
        lower.includes('measure-for-measure');
      if (!isContextualizedOptional) {
        ledger.push({
          claim: 'Gluten-free',
          type: 'DIETARY_CLAIM',
          supported: false,
          evidence: 'Recipe contains wheat/all-purpose flour.',
          section: sec.name
        });
        issues.push({
          type: 'UNSUPPORTED_DIETARY_CLAIM',
          severity: 'HIGH',
          section: sec.name,
          message: `Content claims recipe is gluten-free, but locked ingredients contain wheat flour.`,
          expected: 'Standard wheat-based recipe',
          found: 'gluten-free'
        });
      }
    }

    // Vegan claim check (excluding optional variation suggestions, FAQ, and composite full article)
    if (/\b(?:vegan)\b/.test(lower) && hasEggsOrAnimal && !sec.name.includes('Variation') && !sec.name.includes('FAQ') && !sec.name.includes('Full Article')) {
      const isContextualizedOptional = 
        lower.includes('for a vegan') ||
        lower.includes('vegan option') ||
        lower.includes('vegan variation') ||
        lower.includes('vegan version') ||
        lower.includes('to make it vegan') ||
        lower.includes('substitute');
      if (!isContextualizedOptional) {
        ledger.push({
          claim: 'Vegan',
          type: 'DIETARY_CLAIM',
          supported: false,
          evidence: 'Recipe contains dairy or eggs.',
          section: sec.name
        });
        issues.push({
          type: 'UNSUPPORTED_DIETARY_CLAIM',
          severity: 'HIGH',
          section: sec.name,
          message: `Content claims recipe is vegan, but locked ingredients contain eggs/dairy.`,
          expected: 'Standard non-vegan recipe',
          found: 'vegan'
        });
      }
    }
  }

  // 4. CANONICAL STORAGE DURATION CONSISTENCY
  if (locked.storageFacts) {
    const canonicalRoom = toSafeString(locked.storageFacts.roomTempDays); // e.g. "up to 3–4 days" or "3-4 days"
    const canonicalRoomNum = canonicalRoom.match(/(\d+)/)?.[1];

    const storageText = toSafeString(content.storage) + ' ' + toSafeString(content.tips);
    if (storageText && typeof storageText.matchAll === 'function') {
      // Find room temperature day claims like "for up to 1-2 days", "lasts 5 days"
      const roomMatches = storageText.matchAll(/(?:room\s+temp(?:erature)?|counter|countertop)[^\.]{0,40}?(?:for\s+)?(?:up\s+to\s+)?(\d+)(?:\s*[–\-]\s*(\d+))?\s*days/gi);
      for (const m of roomMatches) {
        const foundDays1 = m[1];
        const foundDays2 = m[2];
        if (canonicalRoomNum && foundDays1 !== canonicalRoomNum && (!foundDays2 || foundDays2 !== canonicalRoomNum)) {
          // Flag duration conflict if significantly different (e.g. 1-2 days vs 3-4 days)
          const diff = Math.abs(parseInt(foundDays1, 10) - parseInt(canonicalRoomNum, 10));
          if (diff >= 2) {
            ledger.push({
              claim: m[0],
              type: 'STORAGE_CLAIM',
              supported: false,
              evidence: `Contradicts canonical room temperature storage of ${canonicalRoom}.`,
              section: 'Storage'
            });
            issues.push({
              type: 'STORAGE_INCONSISTENCY',
              severity: 'MEDIUM',
              section: 'Storage',
              message: `Storage text states "${m[0]}", which contradicts canonical duration of ${canonicalRoom}.`,
              expected: canonicalRoom,
              found: m[0]
            });
          }
        }
      }
    }
  }

  const supportedClaims = ledger.filter(l => l.supported).length;
  const unsupportedClaims = ledger.filter(l => !l.supported).length;
  const sourceAuthorClaims = ledger.filter(l => l.type === 'SOURCE_SOCIAL_PROOF').length;
  const methodContradictions = ledger.filter(l => l.type === 'METHOD_CLAIM' && !l.supported).length;

  return {
    ledger,
    issues,
    metrics: {
      totalClaims: ledger.length,
      supportedClaims,
      unsupportedClaims,
      sourceAuthorClaims,
      methodContradictions
    }
  };
}
