import type { FactSheet } from '../../normalization/types';

export function buildServingPrompt(factSheet: FactSheet): { system: string; user: string } {
  const system = `You are a food writer and home entertainer.
Write practical serving suggestions and pairings for this recipe.

CRITICAL EDITORIAL RULES:
1. Keep suggestions practical and appetizing (e.g. served warm with salted butter, toasted and drizzled with honey, paired with espresso or tea).
2. Suggest 3 to 4 distinct ways to serve or enjoy it (breakfast, afternoon snack, dessert).
3. Do NOT make unrealistic health or nutritional claims.
4. Keep it concise and clean (1 to 2 paragraphs total).
5. Respond with a valid JSON object only.

JSON Schema:
{
  "servingSuggestions": "string - 1 to 2 concise paragraphs describing ideal serving temperatures, accompaniments (butter, cream cheese, spreads), and beverage pairings."
}`;

  const user = JSON.stringify({
    title: factSheet.lockedFacts.title,
    yield: factSheet.lockedFacts.yieldText
  }, null, 2);

  return { system, user };
}
