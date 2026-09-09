import type { FactSheet } from '../../normalization/types';

export function buildStoragePrompt(factSheet: FactSheet): { system: string; user: string } {
  const sf = factSheet.lockedFacts.storageFacts || {
    roomTempDays: 'up to 3–4 days',
    fridgeDays: 'up to 5–7 days',
    freezerMonths: 'up to 3 months',
    container: 'airtight container'
  };

  const system = `You are a culinary instructor.
Write clear, reliable storage and reheating instructions for this recipe.

CRITICAL EDITORIAL RULES:
1. Cover 3 standard methods:
   - Room temperature storage: Exactly ${sf.roomTempDays} in an ${sf.container}.
   - Refrigerator storage: ${sf.fridgeDays} (mention impact on crumb texture).
   - Freezer storage: Exactly ${sf.freezerMonths} (whole vs sliced, wrapping method).
2. Include best reheating methods (toaster, microwave, oven) to restore moisture and texture.
3. Provide realistic food-safety guidance without exaggerated shelf-life claims.
4. Respond with a valid JSON object only.

JSON Schema:
{
  "storage": "string - 2 to 3 paragraphs or structured subsections covering Room Temperature, Freezing, and Reheating Instructions."
}`;

  const user = JSON.stringify({
    title: factSheet.lockedFacts.title,
    yield: factSheet.lockedFacts.yieldText,
    servings: factSheet.lockedFacts.servings,
    canonicalStorage: sf
  }, null, 2);

  return { system, user };
}
