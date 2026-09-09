import type { FactSheet } from '../../normalization/types';

export function buildTipsPrompt(factSheet: FactSheet): { system: string; user: string } {
  const system = `You are a master baker.
Generate 4 to 6 practical, high-value pro tips for making this recipe successfully.

CRITICAL EDITORIAL RULES:
1. NO obvious filler tips like "Follow the recipe carefully" or "Use fresh ingredients".
2. Every tip must add specific, actionable culinary value (e.g. foil tenting to prevent over-browning, weighing flour vs scoop method, using frozen vs fresh bananas, parchment paper sling).
3. Keep each tip concise (2-3 sentences max).
4. Respond with a valid JSON object only.

JSON Schema:
{
  "tips": [
    "string - Pro tip with bold prefix if helpful (e.g. '**Use a parchment sling:** Line the loaf pan with parchment overhang for easy removal without sticking.')"
  ]
}`;

  const user = JSON.stringify({
    title: factSheet.lockedFacts.title,
    ingredientsSummary: factSheet.lockedFacts.ingredients.map(i => i.name),
    cookTime: factSheet.lockedFacts.cookTimeMinutes,
    temperature: factSheet.lockedFacts.temperature,
    instructionsSummary: factSheet.lockedFacts.instructions.map(i => i.text)
  }, null, 2);

  return { system, user };
}
