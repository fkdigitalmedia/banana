import type { LockedFacts, GeneratedContent } from '../normalization/types.ts';
import type { QualityIssue } from './types.ts';

/**
 * Common ingredients dictionary to identify food nouns.
 */
const COMMON_FOOD_NOUNS = [
  'walnut', 'walnuts', 'pecan', 'pecans', 'chocolate', 'cocoa', 'cinnamon', 'nutmeg',
  'raisin', 'raisins', 'blueberry', 'blueberries', 'strawberry', 'strawberries',
  'apple', 'apples', 'banana', 'bananas', 'cream cheese', 'sour cream', 'yogurt',
  'milk', 'almond', 'almonds', 'honey', 'maple syrup', 'coconut', 'oats', 'oatmeal',
  'peanut butter', 'brown sugar', 'white sugar', 'flour', 'butter', 'egg', 'eggs', 'vanilla'
];

/**
 * Checks if a Celsius temperature is mathematically equivalent to Fahrenheit within ±5 degrees.
 */
function isEquivalentCelsius(fahrenheit: number, celsius: number): boolean {
  const converted = (fahrenheit - 32) * 5 / 9;
  return Math.abs(converted - celsius) <= 5;
}

/**
 * Factual Consistency Checker.
 * Strictly verifies AI-generated editorial prose against the authoritative Locked Facts.
 */
export function checkFactConsistency(
  locked: LockedFacts,
  content: GeneratedContent
): QualityIssue[] {
  const issues: QualityIssue[] = [];

  const lockedIngNames = locked.ingredients.map(i => i.name.toLowerCase());
  const lockedIngText = locked.ingredients.map(i => `${i.quantity || ''} ${i.unit || ''} ${i.name}`.toLowerCase()).join(' ');

  // ─────────────────────────────────────────────────────────────
  // 1. INGREDIENT CONTRADICTION CHECK
  // ─────────────────────────────────────────────────────────────
  // Sections where core recipe procedure is described (must not invent ingredients)
  const coreSections: Array<{ name: string; text: string; isServingSec: boolean }> = [
    { name: 'Introduction', text: typeof content.introduction === 'string' ? content.introduction : String(content.introduction || ''), isServingSec: false },
    { name: 'Cooking Guidance', text: Array.isArray(content.cookingGuidance) ? content.cookingGuidance.join(' ') : String(content.cookingGuidance || ''), isServingSec: false },
    { name: 'Tips', text: Array.isArray(content.tips) ? content.tips.join(' ') : String(content.tips || ''), isServingSec: false },
    { name: 'Serving Suggestions', text: typeof content.servingSuggestions === 'string' ? content.servingSuggestions : String(content.servingSuggestions || ''), isServingSec: true },
    { name: 'Storage', text: typeof content.storage === 'string' ? content.storage : String(content.storage || ''), isServingSec: false }
  ];

  const SERVING_ACCOMPANIMENTS = new Set([
    'honey', 'butter', 'jam', 'powdered sugar', 'cream', 'ice cream', 'coffee', 'tea',
    'maple syrup', 'whipped cream', 'cream cheese', 'milk', 'cold milk', 'warm milk', 'espresso'
  ]);

  for (const sec of coreSections) {
    const lowerText = String(sec.text || '').toLowerCase();

    for (const food of COMMON_FOOD_NOUNS) {
      // If in serving suggestions and it's a common accompaniment, skip
      if (sec.isServingSec && (SERVING_ACCOMPANIMENTS.has(food) || food === 'milk')) {
        continue;
      }

      // Check if food appears in the section text
      const regex = new RegExp(`\\b${food}\\b`, 'i');
      if (regex.test(lowerText)) {
        // Special case: butter chemistry references (e.g. "browning butter until milk solids turn amber")
        if (food === 'milk' && (lowerText.includes('milk solids') || lowerText.includes('milk solid'))) {
          continue;
        }

        // Is this food present in the locked recipe ingredients?
        const isPresentInLocked = lockedIngNames.some(name => name.includes(food) || food.includes(name));

        if (!isPresentInLocked) {
          // Check if it's explicitly contextualized as optional, serving, or variation
          const isContextualizedAsOptional = 
            lowerText.includes(`optional ${food}`) ||
            lowerText.includes(`if adding ${food}`) ||
            lowerText.includes(`if using ${food}`) ||
            lowerText.includes(`optional mix-in`) ||
            lowerText.includes(`pair with`) ||
            lowerText.includes(`pairs with`) ||
            lowerText.includes(`pairs beautifully with`) ||
            lowerText.includes(`serve with`) ||
            lowerText.includes(`serve warm with`) ||
            lowerText.includes(`serve slices with`) ||
            lowerText.includes(`glass of ${food}`) ||
            lowerText.includes(`cup of ${food}`) ||
            lowerText.includes(`alongside`) ||
            lowerText.includes(`variations`) ||
            lowerText.includes(`substitute`);

          if (!isContextualizedAsOptional) {
            issues.push({
              type: 'INGREDIENT_CONTRADICTION',
              severity: 'HIGH',
              message: `Section "${sec.name}" introduces "${food}" which is not in the locked recipe ingredients and not marked as an optional variation/accompaniment.`,
              found: food,
              expected: 'Locked ingredients only'
            });
            break; // One contradiction per section is sufficient
          }
        }
      }
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 2. TEMPERATURE CONTRADICTION CHECK
  // ─────────────────────────────────────────────────────────────
  if (locked.temperature) {
    const tempMatch = locked.temperature.match(/(\d{2,3})\s*(?:°|degrees?\s*(?:Fahrenheit|Celsius|F|C)?)/i);
    if (tempMatch) {
      const lockedTemp = parseInt(tempMatch[1], 10);
      const editorialSections: Array<{ name: string; text: string }> = [
        { name: 'Introduction', text: typeof content.introduction === 'string' ? content.introduction : String(content.introduction || '') },
        { name: 'Why You\'ll Love It', text: typeof content.whyThisRecipe === 'string' ? content.whyThisRecipe : String(content.whyThisRecipe || '') },
        { name: 'Cooking Guidance', text: Array.isArray(content.cookingGuidance) ? content.cookingGuidance.join(' ') : String(content.cookingGuidance || '') },
        { name: 'Tips', text: Array.isArray(content.tips) ? content.tips.join(' ') : String(content.tips || '') },
        { name: 'Full Article', text: typeof content.fullArticle === 'string' ? content.fullArticle : String(content.fullArticle || '') }
      ];

      for (const sec of editorialSections) {
        const text = String(sec.text || '');
        if (!text || typeof text.matchAll !== 'function') continue;

        // Find any temperature expressions like "350°F", "350 degrees F", "175°C", "375 F", "200°"
        const foundTemps = text.matchAll(/(\d{2,3})\s*(?:°|degrees?\s*(?:Fahrenheit|Celsius|F|C)?)/gi);
        for (const match of foundTemps) {
          const foundVal = parseInt(match[1], 10);
          const matchIndex = match.index ?? 0;
          const matchStr = match[0];
          const isExplicitF = /[°\s]F\b|fahrenheit/i.test(matchStr);

          // Check surrounding context for internal food thermometer testing (195°F - 210°F is standard bread doneness)
          const startCtx = Math.max(0, matchIndex - 50);
          const endCtx = Math.min(text.length, matchIndex + matchStr.length + 50);
          const contextSnippet = text.substring(startCtx, endCtx).toLowerCase();
          const isInternalDoneness = 
            contextSnippet.includes('internal') ||
            contextSnippet.includes('thermometer') ||
            contextSnippet.includes('probe') ||
            contextSnippet.includes('doneness') ||
            contextSnippet.includes('registers') ||
            contextSnippet.includes('center of the loaf') ||
            contextSnippet.includes('read about');

          if (isInternalDoneness) {
            // This is an internal probe / doneness reading (e.g. 200°F), not the oven baking temperature
            continue;
          }

          // Oven baking temperature checking
          if (foundVal >= 250 && foundVal <= 550) {
            if (Math.abs(foundVal - lockedTemp) > 15) {
              issues.push({
                type: 'TEMPERATURE_CONSISTENCY',
                severity: 'HIGH',
                section: sec.name,
                message: `Generated prose in ${sec.name} specifies baking at ${matchStr}, which contradicts the locked temperature of ${locked.temperature}.`,
                expected: locked.temperature,
                found: matchStr
              });
            }
          } else if (foundVal >= 120 && foundVal <= 260 && !isExplicitF) {
            // Check Celsius temperature only if not explicitly Fahrenheit
            if (!isEquivalentCelsius(lockedTemp, foundVal)) {
              issues.push({
                type: 'TEMPERATURE_CONSISTENCY',
                severity: 'HIGH',
                section: sec.name,
                message: `Generated temperature ${matchStr} in ${sec.name} does not equal the locked temperature of ${locked.temperature} (${Math.round((lockedTemp - 32) * 5 / 9)}°C).`,
                expected: `${locked.temperature} (approx. ${Math.round((lockedTemp - 32) * 5 / 9)}°C)`,
                found: matchStr
              });
            }
          }
        }
      }
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 3. COOKING TIME CONTRADICTION CHECK
  // ─────────────────────────────────────────────────────────────
  if (locked.cookTimeMinutes && locked.cookTimeMinutes > 0) {
    const allGuidance = [
      ...(Array.isArray(content.cookingGuidance) ? content.cookingGuidance : [String(content.cookingGuidance || '')]),
      ...(Array.isArray(content.tips) ? content.tips : [String(content.tips || '')])
    ].join(' ');

    // Match patterns like "bake for 25 minutes", "cook for 30 min", "bakes in 20 minutes"
    const timeMatches = typeof allGuidance.matchAll === 'function' 
      ? allGuidance.matchAll(/(?:bake|cook|bake for|bakes in)\s+(\d{1,3})\s*(?:minutes|mins|min)/gi)
      : [];
    for (const match of timeMatches) {
      const foundMinutes = parseInt(match[1], 10);
      if (Math.abs(foundMinutes - locked.cookTimeMinutes) > 15) {
        issues.push({
          type: 'TIME_CONSISTENCY',
          severity: 'HIGH',
          message: `Generated text claims a cooking time of ${foundMinutes} minutes, contradicting the locked cook time of ${locked.cookTimeMinutes} minutes.`,
          expected: `${locked.cookTimeMinutes} minutes`,
          found: `${foundMinutes} minutes`
        });
      }
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 4. QUANTITY CONTRADICTION CHECK
  // ─────────────────────────────────────────────────────────────
  for (const ing of locked.ingredients) {
    if (!ing.quantity || !ing.name || ing.name.length < 3) continue;

    const ingNoun = ing.name.toLowerCase().split(/\s+/).pop() || ing.name.toLowerCase();
    const qtyRegex = new RegExp(`(\\d+(?:\\/\\d+|\\.\\d+)?)\\s*(?:cups?|tbsp|tsp|tablespoons?|teaspoons?|lbs?|ounces?|grams?)?\\s*(?:of\\s+)?(?:${ingNoun})`, 'gi');

    const proseText = [
      typeof content.introduction === 'string' ? content.introduction : String(content.introduction || ''),
      ...(Array.isArray(content.cookingGuidance) ? content.cookingGuidance : [String(content.cookingGuidance || '')]),
      ...(Array.isArray(content.tips) ? content.tips : [String(content.tips || '')])
    ].join(' ');

    const foundQuantities = typeof proseText.matchAll === 'function' ? proseText.matchAll(qtyRegex) : [];
    for (const match of foundQuantities) {
      const foundQtyStr = match[1];
      if (foundQtyStr !== ing.quantity && !ing.quantity.includes(foundQtyStr)) {
        // High severity if it states a clearly conflicting amount (e.g. 3 cups flour when locked is 2 cups)
        issues.push({
          type: 'QUANTITY_CONSISTENCY',
          severity: 'HIGH',
          message: `Generated text claims "${match[0]}", contradicting the locked ingredient quantity of "${ing.quantity} ${ing.unit || ''} ${ing.name}".`,
          expected: `${ing.quantity} ${ing.unit || ''} ${ing.name}`,
          found: match[0]
        });
      }
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 5. YIELD / SERVINGS CONTRADICTION CHECK
  // ─────────────────────────────────────────────────────────────
  if (locked.servings) {
    const yieldMatch = locked.servings.match(/(\d+)\s*(?:loaf|loaves|slices|servings|muffins|cookies|portions)?/i);
    if (yieldMatch) {
      const lockedYieldNum = parseInt(yieldMatch[1], 10);
      const yieldText = [
        typeof content.introduction === 'string' ? content.introduction : String(content.introduction || ''),
        typeof content.servingSuggestions === 'string' ? content.servingSuggestions : String(content.servingSuggestions || '')
      ].join(' ');

      const claimMatches = typeof yieldText.matchAll === 'function' 
        ? yieldText.matchAll(/(?:makes|yields)\s+(\d+)\s*(?:loaves|loaf|servings|portions)/gi)
        : [];
      for (const m of claimMatches) {
        const foundYieldNum = parseInt(m[1], 10);
        if (foundYieldNum !== lockedYieldNum && !yieldText.toLowerCase().includes('double') && !yieldText.toLowerCase().includes('batch')) {
          issues.push({
            type: 'YIELD_CONSISTENCY',
            severity: 'MEDIUM',
            message: `Generated text states "${m[0]}", which differs from the locked recipe yield of "${locked.servings}".`,
            expected: locked.servings,
            found: m[0]
          });
        }
      }
    }
  }

  return issues;
}
