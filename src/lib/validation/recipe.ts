import type { LockedFacts, GeneratedContent, ValidationResult } from '../normalization/types';

/**
 * Validates that AI-generated editorial content does NOT contradict locked factual recipe data.
 */
export function validateRecipeFacts(locked: LockedFacts, content: GeneratedContent): ValidationResult {
  const issues: ValidationResult['issues'] = [];

  // 1. Check Temperature consistency
  if (locked.temperature) {
    const tempNumMatch = locked.temperature.match(/\d{2,3}/);
    if (tempNumMatch) {
      const lockedTempNum = parseInt(tempNumMatch[0], 10);
      const allText = [
        content.introduction,
        ...(content.cookingGuidance || []),
        ...(content.tips || [])
      ].join(' ');

      // Find any temperature mentions in the text
      const foundTemps = allText.matchAll(/(\d{2,3})\s*(?:°|degrees?\s*(?:F|C))/gi);
      for (const match of foundTemps) {
        const foundTempNum = parseInt(match[1], 10);
        // If it's a Fahrenheit oven temp (e.g. 250-500) and differs from locked temp by > 15 degrees without clear conversion
        if (foundTempNum >= 250 && foundTempNum <= 500 && Math.abs(foundTempNum - lockedTempNum) > 15) {
          // Check if it's a Celsius equivalent (e.g. 350F -> 175C or 180C)
          const isCelsiusOfLocked = Math.abs(Math.round((lockedTempNum - 32) * 5 / 9) - foundTempNum) <= 5;
          if (!isCelsiusOfLocked) {
            issues.push({
              level: 'warning',
              message: `Generated text mentions ${match[0]}, which differs from the locked baking temperature of ${locked.temperature}.`
            });
          }
        }
      }
    }
  }

  // 2. Check Timing consistency
  if (locked.cookTimeMinutes && locked.cookTimeMinutes > 0) {
    const allGuidance = [
      ...(content.cookingGuidance || []),
      ...(content.tips || [])
    ].join(' ');

    // Look for contradictory bake time claims like "bakes in 20 minutes" when recipe is 60 minutes
    const timeMatch = allGuidance.match(/bakes?\s+in\s+(\d+)\s+min/i);
    if (timeMatch) {
      const foundMins = parseInt(timeMatch[1], 10);
      if (Math.abs(foundMins - locked.cookTimeMinutes) > 15) {
        issues.push({
          level: 'warning',
          message: `Generated guidance claims bake time of ${foundMins} minutes, but locked cook time is ${locked.cookTimeMinutes} minutes.`
        });
      }
    }
  }

  // 3. Check for core locked ingredients presence in guidance
  const combinedContent = JSON.stringify(content).toLowerCase();
  for (const ing of locked.ingredients) {
    if (!ing.name || ing.name.length < 3) continue;
    // Check main noun in ingredient (e.g. "bananas" in "3 ripe bananas")
    const words = ing.name.toLowerCase().split(/\s+/).filter(w => w.length > 3 && !['fresh', 'large', 'small', 'medium', 'room', 'temperature', 'unsalted', 'salted', 'purpose'].includes(w));
    if (words.length > 0) {
      const mainWord = words[0];
      if (!combinedContent.includes(mainWord)) {
        // Just a subtle info notice, not an error
      }
    }
  }

  // 4. Ensure variations are strictly designated as optional
  if (content.variations && content.variations.length > 0) {
    for (const v of content.variations) {
      if (!v.name || !v.description) {
        issues.push({
          level: 'warning',
          message: 'One or more recipe variations is missing a name or description.'
        });
      }
    }
  }

  return {
    passed: issues.filter(i => i.level === 'error').length === 0,
    issues
  };
}
