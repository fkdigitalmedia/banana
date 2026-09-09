import type { FactSheet } from '../../normalization/types';

export function buildAnalysisPrompt(factSheet: FactSheet): { system: string; user: string } {
  const system = `You are a culinary editor and recipe development expert.
Your task is to perform an in-depth editorial analysis of a recipe using ONLY the provided structured recipe facts.
This is internal planning data to guide subsequent writing stages.

CRITICAL RULES:
- Do NOT fabricate health or medical claims.
- Identify the genuine appeal, scientific principles (e.g., hydration, leavening, fat ratio), and likely failure points for home bakers.
- Identify common reader questions and key technique nuances.
- Respond with a valid JSON object only. No markdown fences, no conversational prose.

JSON Schema:
{
  "recipePositioning": "string - one clear sentence defining what makes this specific recipe appealing (e.g. moist crumb, quick prep, classic flavor)",
  "readerIntent": "string - what home bakers searching for this recipe are hoping to achieve",
  "keyTechniques": ["string - 2 to 4 core techniques critical to success"],
  "importantIngredients": ["string - 2 to 4 key ingredients that determine flavor and texture"],
  "commonMistakes": ["string - 2 to 4 common mistakes to avoid"],
  "usefulSections": ["string - list of editorial sections most valuable for this recipe"],
  "likelyQuestions": ["string - 4 to 6 specific, practical questions a home cook would ask"]
}`;

  const user = JSON.stringify({
    title: factSheet.lockedFacts.title,
    ingredients: factSheet.lockedFacts.ingredients.map(i => i.originalText || `${i.quantity} ${i.unit} ${i.name}`.trim()),
    instructions: factSheet.lockedFacts.instructions.map(i => `${i.stepNumber}. ${i.text}`),
    prepTimeMinutes: factSheet.lockedFacts.prepTimeMinutes,
    cookTimeMinutes: factSheet.lockedFacts.cookTimeMinutes,
    totalTimeMinutes: factSheet.lockedFacts.totalTimeMinutes,
    temperature: factSheet.lockedFacts.temperature,
    yield: factSheet.lockedFacts.yieldText,
    editorialOpportunities: factSheet.editorialOpportunities
  }, null, 2);

  return { system, user };
}
