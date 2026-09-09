import type { FactSheet } from '../../normalization/types';

export function buildCookingPrompt(factSheet: FactSheet, analysis: any): { system: string; user: string } {
  const system = `You are a culinary instructor explaining baking techniques.
Write practical cooking/baking guidance for this recipe.

CRITICAL EDITORIAL RULES:
1. Explain the KEY TECHNIQUES (e.g. pan preparation, folding vs beating, checking doneness, cooling).
2. The advice MUST remain strictly consistent with the locked instructions and temperature.
3. Do NOT contradict or alter any step in the locked recipe instructions.
4. Highlight sensory cues (e.g., golden brown edges, springy center, aroma, toothpick testing).
5. Address common mistakes identified in analysis (e.g., overmixing, underbaking in the center, slicing while hot).
6. Respond with a valid JSON object only.

JSON Schema:
{
  "cookingGuidance": [
    "string - 3 to 5 distinct paragraphs or bullet points covering key phases of preparation, baking, doneness testing, and cooling."
  ]
}`;

  const user = JSON.stringify({
    lockedInstructions: factSheet.lockedFacts.instructions,
    lockedTemperature: factSheet.lockedFacts.temperature,
    lockedCookTime: factSheet.lockedFacts.cookTimeMinutes,
    keyTechniques: analysis?.keyTechniques,
    commonMistakes: analysis?.commonMistakes
  }, null, 2);

  return { system, user };
}
