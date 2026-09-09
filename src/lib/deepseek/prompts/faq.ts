import type { FactSheet } from '../../normalization/types';

export function buildFaqPrompt(factSheet: FactSheet, likelyQuestions: string[]): { system: string; user: string } {
  const system = `You are an expert recipe developer answering reader questions.
Generate 4 to 6 genuinely helpful, recipe-specific Frequently Asked Questions (FAQ) with clear, authoritative answers.

CRITICAL EDITORIAL RULES:
1. ONLY include questions that home cooks actually ask about this recipe (e.g. "Can I use frozen bananas?", "Why is my banana bread dry or gummy?", "How do I ripen bananas quickly?", "Can I make this into muffins?", "Why did the top crack?").
2. NO filler questions just to pad length (e.g. "Is this recipe good?", "Can I eat this?").
3. Answers must be direct, helpful, and concise (2-4 sentences each).
4. Answers must remain strictly consistent with the recipe's locked facts, ingredients, and instructions.
5. DO NOT claim the recipe is gluten-free, dairy-free, or vegan unless the locked ingredients explicitly support it. When answering substitution questions (e.g. "Can I make this gluten-free?"), frame them accurately as custom adaptations that alter baking chemistry.
6. Respond with a valid JSON object only.

JSON Schema:
{
  "faq": [
    {
      "question": "string - specific reader question",
      "answer": "string - clear, direct, practical answer"
    }
  ]
}`;

  const user = JSON.stringify({
    title: factSheet.lockedFacts.title,
    ingredientsSummary: factSheet.lockedFacts.ingredients.map(i => i.name),
    cookTime: factSheet.lockedFacts.cookTimeMinutes,
    temperature: factSheet.lockedFacts.temperature,
    likelyQuestionsFromAnalysis: likelyQuestions || []
  }, null, 2);

  return { system, user };
}
