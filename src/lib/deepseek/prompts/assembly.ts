import type { FactSheet, GeneratedContent } from '../../normalization/types';

export function buildAssemblyPrompt(factSheet: FactSheet, content: Partial<GeneratedContent>): { system: string; user: string } {
  const system = `You are a senior food editor assembling an editorial recipe article.
Your task is to review the drafted sections and weave them into a comprehensive, beautifully structured Markdown article.

CRITICAL EDITORIAL RULES:
1. Use semantic Markdown headings (H1 for title, H2 for major sections, H3 for sub-sections).
2. Ensure seamless, natural transitions between sections.
3. Eliminate any redundant phrasing or repetitive introductions between sections.
4. Ingredients and Instructions must match the locked recipe facts EXACTLY.
5. Do NOT include generic filler.
6. The article should read like a premium, tested recipe publication article.
7. Respond with a valid JSON object only.

JSON Schema:
{
  "fullArticle": "string - Complete markdown formatted article ready for publication"
}`;

  const user = JSON.stringify({
    lockedFacts: {
      title: factSheet.lockedFacts.title,
      prepTime: factSheet.lockedFacts.prepTimeMinutes,
      cookTime: factSheet.lockedFacts.cookTimeMinutes,
      temperature: factSheet.lockedFacts.temperature,
      yield: factSheet.lockedFacts.yieldText,
      ingredients: factSheet.lockedFacts.ingredients,
      instructions: factSheet.lockedFacts.instructions
    },
    draftedSections: {
      introduction: content.introduction,
      whyThisRecipe: content.whyThisRecipe,
      ingredientGuidance: content.ingredientGuidance,
      cookingGuidance: content.cookingGuidance,
      tips: content.tips,
      variations: content.variations,
      servingSuggestions: content.servingSuggestions,
      storage: content.storage,
      faq: content.faq
    }
  }, null, 2);

  return { system, user };
}
