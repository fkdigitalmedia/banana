import type { FactSheet } from '../../normalization/types';

export function buildIntroductionPrompt(factSheet: FactSheet, analysis: any): { system: string; user: string } {
  const system = `You are a professional food writer and baker.
Write an engaging, original introduction and a "Why You'll Love This Recipe" section for this recipe.

CRITICAL EDITORIAL RULES:
1. NO generic AI openers or template hooks (e.g. "Whether you're...", "Perfect for...", "This delicious recipe...", "If you're looking for...", "The best part is...", "Look no further", "There's nothing better than").
2. Open DIRECTLY with recipe-specific sensory observations (crumb texture, aroma, moisture balance, golden crust) and practical baking/cooking science.
3. NO fake personal stories or manufactured childhood nostalgia (e.g. "Growing up, my grandmother always made...").
4. NO unsubstantiated superlative claims ("#1 recipe", "world's best", "guaranteed").
5. Keep the tone warm, knowledgeable, practical, and inviting.
6. Focus on the distinct characteristics of this specific dish (e.g. for banana bread: banana ripeness, moisture-to-fat balance, visual doneness cues; for cookies: brown butter depth, chewiness; for bread: hydration, oven spring).
7. The primary keyword is "${factSheet.lockedFacts.title.toLowerCase().includes('banana bread') ? 'banana bread recipe' : factSheet.lockedFacts.title}". Use it naturally 1-2 times. Do NOT keyword-stuff.
8. Respond with a valid JSON object only.

JSON Schema:
{
  "introduction": "string - 2 to 3 well-written paragraphs (120-200 words total) introducing the recipe, its texture, flavor profile, and why it's a staple worth making.",
  "whyThisRecipe": "string - 3 to 5 concise bullet points explaining what sets this recipe apart based strictly on locked facts (e.g. tender crumb, moisture balance, golden crust, reliable rise). DO NOT claim one-bowl prep unless isOneBowl is explicitly true."
}`;

  const user = JSON.stringify({
    lockedFacts: {
      title: factSheet.lockedFacts.title,
      prepTime: factSheet.lockedFacts.prepTimeMinutes,
      cookTime: factSheet.lockedFacts.cookTimeMinutes,
      temperature: factSheet.lockedFacts.temperature,
      yield: factSheet.lockedFacts.yieldText,
      servings: factSheet.lockedFacts.servings,
      isOneBowl: factSheet.lockedFacts.isOneBowl,
      bowlCount: factSheet.lockedFacts.bowlCount,
      ingredientsSummary: factSheet.lockedFacts.ingredients.map(i => i.name).slice(0, 8)
    },
    editorialContext: {
      positioning: analysis?.recipePositioning,
      readerIntent: analysis?.readerIntent
    }
  }, null, 2);

  return { system, user };
}
